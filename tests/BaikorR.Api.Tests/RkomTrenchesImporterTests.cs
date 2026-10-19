using System.IO.Compression;
using BaikorR.Api.Importers.Rkom;
using BaikorR.Api.Persistence.Entities;
using NetTopologySuite.Features;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO.Esri;

namespace BaikorR.Api.Tests;

public sealed class RkomTrenchesImporterTests
{
    [Fact]
    public async Task ImportCreatesOneSitePerPublicSegmentAndSkipsHouseConnections()
    {
        var session = new InMemoryConstructionSitesSession();
        var importer = new RkomTrenchesImporter(
            session,
            new FixedTimeProvider(new DateTimeOffset(2026, 9, 2, 8, 0, 0, TimeSpan.Zero)),
            new RkomTrenchesShapefileParser(),
            new RkomTrenchesImportRequest.Validator());
        var content = CreateArchive();

        var result = await importer.ExecuteAsync(
            new RkomTrenchesImportRequest("R-10002_Trenches.zip", content),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(5, result.Value.FeatureCount);
        Assert.Equal(1, result.Value.SkippedCount);
        Assert.Equal(4, result.Value.CreatedCount);
        Assert.Equal(3, result.Value.CreatedBySourceStatus["Plan released"]);
        var constructionSites = await session.ListAsync(10, CancellationToken.None);
        Assert.Equal(4, constructionSites.Count);
        Assert.Contains(constructionSites, site =>
            site.Title == "R-10002 – 31_RP3S: Asphalt Str. – Abschnitt 001");
        Assert.Contains(constructionSites, site =>
            site.Title == "R-10002 – 31_RP3S: Asphalt Str. – Abschnitt 002");
        Assert.All(constructionSites, site =>
        {
            Assert.Equal("R-10002", site.Metadata["source.projectId"]);
            Assert.Equal("1", site.Metadata["source.featureCount"]);
            Assert.NotEmpty(site.Metadata["source.externalId"]);
            Assert.NotEqual("Hausanschluss", site.Metadata["source.type"]);
            Assert.True(double.Parse(
                site.Metadata["source.lengthMetres"],
                System.Globalization.CultureInfo.InvariantCulture) > 0);
            Assert.Equal(result.Value.BatchId.ToString("D"), site.Metadata["import.batchId"]);
            Assert.NotEmpty(site.Areas);
            Assert.All(site.Areas, area =>
            {
                Assert.Equal(25832, area.Geometry.SRID);
                Assert.True(area.Geometry.Area > 0);
            });
        });
        Assert.All(
            constructionSites.Where(site => site.Metadata["source.status"] == "Plan released"),
            site => Assert.Equal(ConstructionSiteStatus.Approved, site.Status));
        Assert.Equal(
            ConstructionSiteStatus.Planned,
            constructionSites.Single(site => site.Metadata["source.status"] == "Assigned").Status);
    }

    [Fact]
    public async Task ImportRejectsTheSameFileTwice()
    {
        var session = new InMemoryConstructionSitesSession();
        var importer = new RkomTrenchesImporter(
            session,
            TimeProvider.System,
            new RkomTrenchesShapefileParser(),
            new RkomTrenchesImportRequest.Validator());
        var request = new RkomTrenchesImportRequest("R-10002_Trenches.zip", CreateArchive());

        Assert.True((await importer.ExecuteAsync(request, CancellationToken.None)).IsSuccess);
        var duplicate = await importer.ExecuteAsync(request, CancellationToken.None);

        Assert.True(duplicate.IsFailed);
        Assert.Contains(duplicate.Errors, error =>
            error.Metadata.TryGetValue("Key", out var key)
            && Equals(key, RkomTrenchesImportResults.DuplicateErrorKey));
    }

    private static byte[] CreateArchive()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"baikor-r-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        try
        {
            var shapePath = Path.Combine(directory, "R-10002_Trenches.shp");
            var features = new IFeature[]
            {
                CreateFeature("Plan released", "31_RP3S: Asphalt Str.", "segment-1", 12.1000, 49.0100, 12.1001, 49.0100),
                CreateFeature("Plan released", "31_RP3S: Asphalt Str.", "segment-2", 12.1001, 49.0100, 12.1002, 49.0100),
                CreateFeature("Plan released", "22_RP2AG: Asphalt Gehweg", "segment-3", 12.1100, 49.0200, 12.1101, 49.0200),
                CreateFeature("Assigned", "21_RP2PG: Platten Gehweg", "segment-4", 12.1002, 49.0100, 12.1003, 49.0100),
                CreateFeature("Executed", "Hausanschluss", "house-1", 12.1003, 49.0100, 12.1004, 49.0100)
            };
            Shapefile.WriteAllFeatures(features, shapePath);
            File.WriteAllText(
                Path.ChangeExtension(shapePath, ".prj"),
                "GEOGCS[\"GCS_WGS_1984\",DATUM[\"D_WGS_1984\",SPHEROID[\"WGS_1984\",6378137,298.257223563]],PRIMEM[\"Greenwich\",0],UNIT[\"Degree\",0.0174532925199433]]");
            var archivePath = Path.Combine(Path.GetTempPath(), $"baikor-r-test-{Guid.NewGuid():N}.zip");
            ZipFile.CreateFromDirectory(directory, archivePath);
            try
            {
                return File.ReadAllBytes(archivePath);
            }
            finally
            {
                File.Delete(archivePath);
            }
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    private static IFeature CreateFeature(
        string status,
        string sourceType,
        string externalId,
        double startX,
        double startY,
        double endX,
        double endY) =>
        new Feature(
            new MultiLineString([
                new LineString([new Coordinate(startX, startY), new Coordinate(endX, endY)])
            ]),
            new AttributesTable
            {
                { "executio_1", status },
                { "name", sourceType },
                { "externalID", externalId }
            });
}
