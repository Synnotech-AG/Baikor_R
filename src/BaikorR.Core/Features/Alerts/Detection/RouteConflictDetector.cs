using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Shared.Spatial;
using NetTopologySuite.Geometries;
using NetTopologySuite.Operation.Distance;
using NetTopologySuite.Simplify;

namespace BaikorR.Core.Features.Alerts.Detection;

public sealed class RouteConflictDetector : IRouteConflictDetector
{
    public string Type => AlertRule.RouteConflictType;
    public IReadOnlyCollection<string> SupportedTriggerKinds => ["routeDefinition", "route", "site", "routeVersion"];

    public RouteConflictEvaluation Evaluate(AlertRule rule, RouteConflictRoute route, RouteConflictSite site)
    {
        if (!rule.Enabled)
        {
            return new(false, null, "The rule is disabled; prior results are retained.");
        }
        if (route.IsSuppressed || !rule.EligibleStatuses.Contains(site.Status))
        {
            return new(true, null);
        }
        if (!double.IsFinite(rule.SensitivityMetres) || rule.SensitivityMetres is < 0 or > 1000
            || !ValidInterval(site.PlannedStart, site.PlannedEnd)
            || route.Paths.Count == 0 || site.Areas.Count == 0
            || route.Paths.Any(path => !Usable(path.Geometry) || path.Geometry.Length <= 0
                || !ValidInterval(path.ValidFrom, path.ValidTo)
                || path.Periods.Any(period => !ValidInterval(period.From, period.To)))
            || site.Areas.Any(area => !Usable(area.Geometry)))
        {
            return new(false, null, "Geometry, availability or rule inputs cannot be assessed.");
        }

        var matches = new List<Match>();
        foreach (var path in route.Paths)
        {
            var availability = path.HasOperatingCalendar ? path.Periods : [new RouteConflictPeriod(path.ValidFrom, path.ValidTo)];
            var periods = Merge(availability.Select(period => Intersect(period,
                    new(path.ValidFrom, path.ValidTo), new(site.PlannedStart, site.PlannedEnd)))
                .OfType<RouteConflictPeriod>());
            if (periods.Count == 0)
            {
                continue;
            }
            foreach (var area in site.Areas)
            {
                var distance = path.Geometry.Distance(area.Geometry);
                if (distance <= rule.SensitivityMetres)
                {
                    var closest = DistanceOp.NearestPoints(path.Geometry, area.Geometry);
                    matches.Add(new(path, area, periods, distance, closest[0], closest[1]));
                }
            }
        }
        if (matches.Count == 0)
        {
            return new(true, null);
        }

        var ordered = matches.OrderBy(match => match.Distance).ThenBy(match => match.Area.Id)
            .ThenBy(match => CanonicalGeometry(match.Path.Geometry), StringComparer.Ordinal).ToArray();
        var representative = ordered[0];
        var point = representative.Path.Geometry.Factory.CreatePoint(representative.RoutePoint.Copy());
        var focus = Focus(representative, rule.SensitivityMetres);
        var paths = matches.Select(match => match.Path).Distinct().OrderBy(path => path.PathId)
            .ThenBy(path => CanonicalGeometry(path.Geometry), StringComparer.Ordinal).ToArray();
        var areas = ordered.DistinctBy(match => match.Area.Id).OrderBy(match => match.Area.Id).Select(match =>
            new RouteConflictAreaSnapshot(match.Area.Id, match.Area.Name, Epsg25832PolygonConverter.ToDto(match.Area.Geometry),
                new("Point", [match.RoutePoint.X, match.RoutePoint.Y]), EnvelopeCoordinates(Focus(match, rule.SensitivityMetres).EnvelopeInternal))).ToArray();
        var periodsAll = Merge(matches.SelectMany(match => match.Periods));
        var snapshot = new RouteConflictSnapshot(route.Id, route.Title, site.Id, site.Title, representative.Distance,
            rule.SensitivityMetres, periodsAll, areas, Lines(paths.SelectMany(path => path.Geometry.Geometries.Cast<LineString>())),
            areas.Select(area => area.Geometry).ToArray(), paths.Select(path => new RouteConflictPathSnapshot(
                Lines(path.Geometry.Geometries.Cast<LineString>()), path.ValidFrom, path.ValidTo, path.HasOperatingCalendar,
                Merge(path.Periods), path.SourceCoverageStart, path.SourceCoverageEnd, path.PathId, path.PathTitle)).ToArray(), site.PlannedStart, site.PlannedEnd);

        var material = rule.SensitivityMetres.ToString("R", CultureInfo.InvariantCulture) + "\n" + string.Join("\n", matches
            .GroupBy(match => $"{match.Path.PathId?.ToString("D") ?? ""}|{RelevantPathGeometry(match, rule.SensitivityMetres)}|{match.Area.Id:D}|{CanonicalGeometry(match.Area.Geometry)}", StringComparer.Ordinal)
            .Select(group => $"{group.Key}|{string.Join(';', Merge(group.SelectMany(match => match.Periods)).Select(PeriodKey))}")
            .Order(StringComparer.Ordinal));
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(material)));
        return new(true, new(rule.Id, $"{route.Id:D}/{site.Id:D}", hash, snapshot, point, focus));
    }

    private static bool Usable(Geometry? geometry) => geometry is { IsEmpty: false, IsValid: true, SRID: 25832 }
        && geometry.Coordinates.All(coordinate => double.IsFinite(coordinate.X) && double.IsFinite(coordinate.Y));

    private static bool ValidInterval(DateOnly? from, DateOnly? to) => from is null || to is null || from <= to;

    private static RouteConflictPeriod? Intersect(params RouteConflictPeriod[] periods)
    {
        var from = periods.Max(period => period.From);
        var to = periods.Where(period => period.To.HasValue).Select(period => period.To).DefaultIfEmpty(null).Min();
        return ValidInterval(from, to) ? new(from, to) : null;
    }

    public static IReadOnlyList<RouteConflictPeriod> Merge(IEnumerable<RouteConflictPeriod> periods)
    {
        var merged = new List<RouteConflictPeriod>();
        foreach (var period in periods.OrderBy(period => period.From).ThenBy(period => period.To ?? DateOnly.MaxValue))
        {
            if (merged.Count == 0)
            {
                merged.Add(period);
                continue;
            }
            var previous = merged[^1];
            if (previous.To is null || period.From is null || period.From.Value.DayNumber <= previous.To.Value.DayNumber + 1)
            {
                merged[^1] = new(previous.From, previous.To is null || period.To is null ? null : new DateOnly?(previous.To > period.To ? previous.To.Value : period.To.Value));
            }
            else
            {
                merged.Add(period);
            }
        }
        return merged;
    }

    private static string CanonicalGeometry(Geometry geometry)
    {
        var canonical = DouglasPeuckerSimplifier.Simplify(geometry, 0);
        canonical.Normalize();
        return canonical.AsText();
    }
    private static string RelevantPathGeometry(Match match, double sensitivity)
    {
        // Any route point within the threshold is inside this expanded area envelope.
        // Distant edits outside it cannot affect this pair's spatial evidence.
        var envelope = new Envelope(match.Area.Geometry.EnvelopeInternal);
        envelope.ExpandBy(sensitivity);
        return CanonicalGeometry(match.Path.Geometry.Intersection(match.Path.Geometry.Factory.ToGeometry(envelope)));
    }
    private static string PeriodKey(RouteConflictPeriod period) => $"{period.From?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "-infinity"}/{period.To?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "+infinity"}";
    private static AlertLineDto Lines(IEnumerable<LineString> lines) => new("MultiLineString", lines.Select(line =>
        line.Coordinates.Select(coordinate => new[] { coordinate.X, coordinate.Y }).ToArray()).ToArray());
    private static Polygon Focus(Match match, double sensitivity)
    {
        var envelope = new Envelope(match.RoutePoint, match.AreaPoint);
        envelope.ExpandBy(Math.Max(20, sensitivity));
        return (Polygon)match.Path.Geometry.Factory.ToGeometry(envelope);
    }
    private static double[] EnvelopeCoordinates(Envelope envelope) => [envelope.MinX, envelope.MinY, envelope.MaxX, envelope.MaxY];
    private sealed record Match(RouteConflictPath Path, RouteConflictArea Area, IReadOnlyList<RouteConflictPeriod> Periods,
        double Distance, Coordinate RoutePoint, Coordinate AreaPoint);
}
