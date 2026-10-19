using NetTopologySuite.Geometries;

namespace BaikorR.Api.Shared.Spatial;

internal static class Epsg25832PolygonConverter
{
    private const int SpatialReferenceId = 25832;
    private static readonly GeometryFactory Factory =
        NetTopologySuite.NtsGeometryServices.Instance.CreateGeometryFactory(srid: SpatialReferenceId);

    public static bool TryCreate(
        PolygonDto? dto,
        out Polygon? geometry,
        out string? error)
    {
        geometry = null;
        error = null;

        if (dto is null || !string.Equals(dto.Type, "Polygon", StringComparison.OrdinalIgnoreCase))
        {
            error = "Geometry must be a GeoJSON-style Polygon.";
            return false;
        }

        if (dto.Coordinates is not { Length: > 0 })
        {
            error = "A polygon must contain an exterior ring.";
            return false;
        }

        try
        {
            var shell = CreateRing(dto.Coordinates[0]);
            var holes = dto.Coordinates.Skip(1).Select(CreateRing).ToArray();
            geometry = Factory.CreatePolygon(shell, holes);

            if (geometry.IsEmpty || !geometry.IsValid)
            {
                error = "The polygon geometry is empty or topologically invalid.";
                geometry = null;
                return false;
            }

            return true;
        }
        catch (ArgumentException exception)
        {
            error = exception.Message;
            return false;
        }
    }

    public static PolygonDto ToDto(Polygon geometry)
    {
        var rings = new List<double[][]>
        {
            ToCoordinates(geometry.ExteriorRing)
        };

        rings.AddRange(Enumerable.Range(0, geometry.NumInteriorRings)
            .Select(index => ToCoordinates(geometry.GetInteriorRingN(index))));

        return new PolygonDto("Polygon", rings.ToArray());
    }

    private static LinearRing CreateRing(double[][] positions)
    {
        if (positions is not { Length: >= 3 })
        {
            throw new ArgumentException("Each ring must contain at least three positions.");
        }

        var coordinates = positions.Select(ToCoordinate).ToList();
        if (!coordinates[0].Equals2D(coordinates[^1]))
        {
            coordinates.Add(coordinates[0].Copy());
        }

        if (coordinates.Count < 4)
        {
            throw new ArgumentException("Each closed ring must contain at least four positions.");
        }

        return Factory.CreateLinearRing(coordinates.ToArray());
    }

    private static Coordinate ToCoordinate(double[] position)
    {
        if (position is not { Length: >= 2 }
            || !double.IsFinite(position[0])
            || !double.IsFinite(position[1]))
        {
            throw new ArgumentException("Every position must contain finite X and Y coordinates.");
        }

        return new Coordinate(position[0], position[1]);
    }

    private static double[][] ToCoordinates(LineString ring) =>
        ring.Coordinates.Select(coordinate => new[] { coordinate.X, coordinate.Y }).ToArray();
}
