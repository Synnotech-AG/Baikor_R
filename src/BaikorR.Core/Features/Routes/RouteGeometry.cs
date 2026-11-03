using NetTopologySuite.Geometries;

namespace BaikorR.Core.Features.Routes;

internal static class RouteGeometry
{
    private static readonly GeometryFactory Factory = new(new PrecisionModel(), 25832);
    public static bool TryCreate(RouteLineGeometry? dto, out MultiLineString? geometry)
    {
        geometry = null;
        if (dto?.Type != "MultiLineString" || dto.Coordinates is not { Length: > 0 } || dto.Coordinates.Length > 1000)
        {
            return false;
        }
        var count = 0;
        var lines = new List<LineString>();
        foreach (var line in dto.Coordinates)
        {
            if (line is not { Length: >= 2 })
            {
                return false;
            }
            count += line.Length;
            if (count > 100000 || line.Any(point => point is not { Length: 2 } || !double.IsFinite(point[0]) || !double.IsFinite(point[1])
                || point[0] < 100000 || point[0] > 1000000 || point[1] < 3800000 || point[1] > 9400000))
            {
                return false;
            }
            var component = Factory.CreateLineString(line.Select(point => new Coordinate(point[0], point[1])).ToArray());
            if (component.Length <= 0)
            {
                return false;
            }
            lines.Add(component);
        }
        geometry = Factory.CreateMultiLineString(lines.ToArray());
        return geometry.IsValid && double.IsFinite(geometry.Length);
    }

    public static RouteLineGeometry ToDto(MultiLineString geometry) => new("MultiLineString",
        geometry.Geometries.Cast<LineString>().Select(line => line.Coordinates.Select(point => new[] { point.X, point.Y }).ToArray()).ToArray());
}
