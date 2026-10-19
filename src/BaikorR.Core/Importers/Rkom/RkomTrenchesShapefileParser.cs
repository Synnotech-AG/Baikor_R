using System.Globalization;
using System.IO.Compression;
using System.Text;
using NetTopologySuite;
using NetTopologySuite.Features;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO.Esri;
using NetTopologySuite.IO.Esri.Shapefiles.Readers;
using ProjNet.CoordinateSystems;
using ProjNet.CoordinateSystems.Transformations;

namespace BaikorR.Api.Importers.Rkom;

public sealed class RkomTrenchesShapefileParser
{
    private static readonly string[] StatusAttributeNames = ["executio_1", "execution_status", "status"];
    private static readonly string[] TypeAttributeNames = ["name", "kmlType", "masterItem"];
    private static readonly string[] ExternalIdAttributeNames = ["externalID", "external_id"];
    private const string HouseConnectionType = "Hausanschluss";

    internal ParsedRkomTrenches Parse(byte[] content, double bufferMetres)
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        using var archiveStream = new MemoryStream(content, writable: false);
        using var archive = new ZipArchive(archiveStream, ZipArchiveMode.Read);
        var shapeEntries = archive.Entries.Where(entry =>
            string.Equals(Path.GetExtension(entry.Name), ".shp", StringComparison.OrdinalIgnoreCase)).ToArray();
        if (shapeEntries.Length != 1)
        {
            throw new InvalidDataException("The ZIP archive must contain exactly one SHP file.");
        }

        var shapeEntry = shapeEntries[0];
        var stem = Path.GetFileNameWithoutExtension(shapeEntry.Name);
        var dbfEntry = FindCompanionEntry(archive, stem, ".dbf");
        var projectionEntry = FindCompanionEntry(archive, stem, ".prj");
        ValidateProjection(projectionEntry);

        using var shapeStream = CopyToMemory(shapeEntry);
        using var dbfStream = CopyToMemory(dbfEntry);
        var options = new ShapefileReaderOptions
        {
            Encoding = Encoding.GetEncoding(1252),
            Factory = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4326)
        };

        var features = Shapefile.ReadAllFeatures(shapeStream, dbfStream, options)
            .Select((feature, index) => CreateSourceFeature(feature, index))
            .ToArray();
        if (features.Length == 0)
        {
            throw new InvalidDataException("The shapefile does not contain any trench features.");
        }

        var publicSpaceFeatures = features
            .Where(feature => !string.Equals(
                feature.SourceType,
                HouseConnectionType,
                StringComparison.OrdinalIgnoreCase))
            .ToArray();
        if (publicSpaceFeatures.Length == 0)
        {
            throw new InvalidDataException("The shapefile does not contain any public-space trench features.");
        }

        var projectedFeatures = ProjectToUtm32(publicSpaceFeatures);
        var components = projectedFeatures
            .Select(feature => CreateComponent(feature, bufferMetres))
            .OrderBy(component => component.SourceType, StringComparer.OrdinalIgnoreCase)
            .ThenBy(component => component.Envelope.MinY)
            .ThenBy(component => component.Envelope.MinX)
            .ThenBy(component => component.SourceExternalId, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return new ParsedRkomTrenches(
            DeriveProjectId(stem),
            features.Length,
            features.Length - publicSpaceFeatures.Length,
            components);
    }

    private static ZipArchiveEntry FindCompanionEntry(ZipArchive archive, string stem, string extension)
    {
        var entries = archive.Entries.Where(entry =>
            string.Equals(Path.GetFileNameWithoutExtension(entry.Name), stem, StringComparison.OrdinalIgnoreCase)
            && string.Equals(Path.GetExtension(entry.Name), extension, StringComparison.OrdinalIgnoreCase)).ToArray();
        if (entries.Length != 1)
        {
            throw new InvalidDataException(
                $"The ZIP archive must contain exactly one {extension.ToUpperInvariant()} file for {stem}.");
        }

        return entries[0];
    }

    private static MemoryStream CopyToMemory(ZipArchiveEntry entry)
    {
        var result = new MemoryStream();
        using var source = entry.Open();
        source.CopyTo(result);
        result.Position = 0;
        return result;
    }

    private static void ValidateProjection(ZipArchiveEntry projectionEntry)
    {
        using var reader = new StreamReader(projectionEntry.Open(), Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        var projection = reader.ReadToEnd();
        if (!projection.Contains("WGS_1984", StringComparison.OrdinalIgnoreCase)
            && !projection.Contains("WGS 84", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("Only shapefiles using WGS 84 coordinates are currently supported.");
        }
    }

    private static RkomTrenchSourceFeature CreateSourceFeature(IFeature feature, int index)
    {
        if (feature.Geometry is not LineString and not MultiLineString)
        {
            throw new InvalidDataException($"Feature {index + 1} is not a line geometry.");
        }

        var status = ReadAttribute(feature, StatusAttributeNames);
        if (string.IsNullOrWhiteSpace(status))
        {
            throw new InvalidDataException(
                $"Feature {index + 1} does not contain a supported execution-status attribute.");
        }

        var sourceType = ReadAttribute(feature, TypeAttributeNames);
        if (string.IsNullOrWhiteSpace(sourceType))
        {
            throw new InvalidDataException(
                $"Feature {index + 1} does not contain a supported trench-type attribute.");
        }

        var externalId = ReadAttribute(feature, ExternalIdAttributeNames) ?? $"feature-{index + 1}";
        return new RkomTrenchSourceFeature(index, status, sourceType, externalId, 0, feature.Geometry);
    }

    private static string? ReadAttribute(IFeature feature, IEnumerable<string> names) =>
        names
            .Where(feature.Attributes.Exists)
            .Select(name => Convert.ToString(feature.Attributes[name], CultureInfo.InvariantCulture)?.Trim())
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));

    private static IReadOnlyList<RkomTrenchSourceFeature> ProjectToUtm32(
        IReadOnlyList<RkomTrenchSourceFeature> features)
    {
        var transformation = new CoordinateTransformationFactory().CreateFromCoordinateSystems(
            GeographicCoordinateSystem.WGS84,
            ProjectedCoordinateSystem.WGS84_UTM(32, true));

        return features.Select(feature =>
        {
            var geometry = feature.Geometry.Copy();
            geometry.Apply(new CoordinateTransformFilter(transformation.MathTransform));
            geometry.SRID = 25832;
            return feature with
            {
                SourceLengthMetres = geometry.Length,
                Geometry = geometry
            };
        }).ToArray();
    }

    private static RkomTrenchComponent CreateComponent(
        RkomTrenchSourceFeature feature,
        double bufferMetres)
    {
        var buffered = feature.Geometry.Buffer(bufferMetres);
        buffered.SRID = 25832;
        var areas = ExtractPolygons(buffered)
            .OrderBy(area => area.EnvelopeInternal.MinY)
            .ThenBy(area => area.EnvelopeInternal.MinX)
            .ToArray();
        if (areas.Length == 0)
        {
            throw new InvalidDataException("A trench group could not be converted to an area.");
        }

        return new RkomTrenchComponent(
            feature.SourceStatus,
            feature.SourceType,
            feature.SourceExternalId,
            feature.SourceLengthMetres,
            [feature.SourceIndex],
            areas,
            buffered.EnvelopeInternal);
    }

    private static IEnumerable<Polygon> ExtractPolygons(Geometry geometry)
    {
        if (geometry is Polygon polygon)
        {
            polygon.SRID = 25832;
            yield return polygon;
            yield break;
        }

        for (var index = 0; index < geometry.NumGeometries; index++)
        {
            foreach (var child in ExtractPolygons(geometry.GetGeometryN(index)))
            {
                yield return child;
            }
        }
    }

    private static string DeriveProjectId(string stem)
    {
        const string suffix = "_Trenches";
        return stem.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)
            ? stem[..^suffix.Length]
            : stem;
    }
}
