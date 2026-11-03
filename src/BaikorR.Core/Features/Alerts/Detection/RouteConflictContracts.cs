using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Shared.Spatial;
using NetTopologySuite.Geometries;

namespace BaikorR.Core.Features.Alerts.Detection;

public sealed record RouteConflictPeriod(DateOnly? From, DateOnly? To);
public sealed record RouteConflictPath(MultiLineString Geometry, DateOnly? ValidFrom, DateOnly? ValidTo,
    bool HasOperatingCalendar, IReadOnlyList<RouteConflictPeriod> Periods,
    DateOnly? SourceCoverageStart = null, DateOnly? SourceCoverageEnd = null,
    Guid? PathId = null, string? PathTitle = null);
public sealed record RouteConflictRoute(Guid Id, string Title, bool IsSuppressed, IReadOnlyList<RouteConflictPath> Paths);
public sealed record RouteConflictArea(Guid Id, string Name, Polygon Geometry);
public sealed record RouteConflictSite(Guid Id, string Title, ConstructionSiteStatus Status,
    DateOnly? PlannedStart, DateOnly? PlannedEnd, IReadOnlyList<RouteConflictArea> Areas);
public sealed record AlertPointDto(string Type, double[] Coordinates);
public sealed record AlertLineDto(string Type, double[][][] Coordinates);
public sealed record RouteConflictAreaSnapshot(Guid Id, string Name, PolygonDto Geometry,
    AlertPointDto Location, double[] FocusEnvelope);
public sealed record RouteConflictPathSnapshot(AlertLineDto Geometry, DateOnly? ValidFrom, DateOnly? ValidTo,
    bool HasOperatingCalendar, IReadOnlyList<RouteConflictPeriod> Periods,
    DateOnly? SourceCoverageStart, DateOnly? SourceCoverageEnd,
    Guid? PathId = null, string? PathTitle = null);
public sealed record RouteConflictSnapshot(Guid RouteId, string RouteTitle, Guid ConstructionSiteId,
    string ConstructionSiteTitle, double DistanceMetres, double SensitivityMetres,
    IReadOnlyList<RouteConflictPeriod> Periods, IReadOnlyList<RouteConflictAreaSnapshot> Areas,
    AlertLineDto RouteGeometry, IReadOnlyList<PolygonDto> SiteGeometries,
    IReadOnlyList<RouteConflictPathSnapshot> Paths, DateOnly? SitePlannedStart, DateOnly? SitePlannedEnd,
    string Precision = "dateLevelPotentialOverlap");
public sealed record RouteConflictCandidate(Guid RuleId, string IdentityKey, string MaterialHash,
    RouteConflictSnapshot Snapshot, Point Location, Polygon FocusEnvelope);
public sealed record RouteConflictEvaluation(bool Assessable, RouteConflictCandidate? Candidate, string? FailureReason = null);

public interface IAlertDetector
{
    string Type { get; }
    IReadOnlyCollection<string> SupportedTriggerKinds { get; }
}

public interface IRouteConflictDetector : IAlertDetector
{
    RouteConflictEvaluation Evaluate(AlertRule rule, RouteConflictRoute route, RouteConflictSite site);
}
