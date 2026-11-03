using NetTopologySuite.Geometries;

namespace BaikorR.Core.Persistence.Entities;

public sealed class RoutePathVersion
{
    public Guid Id { get; set; }
    public Guid RoutePathId { get; set; }
    public RoutePath RoutePath { get; set; } = null!;
    public MultiLineString Geometry { get; set; } = null!;
    public DateOnly? ValidFrom { get; set; }
    public DateOnly? ValidTo { get; set; }
    public DateOnly? SourceCoverageStart { get; set; }
    public DateOnly? SourceCoverageEnd { get; set; }
    public bool HasOperatingCalendar { get; set; }
    // Service-day provenance is private import state. It preserves overnight dates when source windows are replaced partially.
    public string? ServiceDayCalendarJson { get; set; }
    public List<RouteOperatingPeriod> Periods { get; set; } = [];
}
