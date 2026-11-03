namespace BaikorR.Core.Persistence.Entities;

public sealed class RouteConflictAlert
{
    public Guid AlertId { get; set; }
    public AlertRecord Alert { get; set; } = null!;
    // Historical scalar identities deliberately have no source foreign keys.
    public Guid RouteId { get; set; }
    public Guid ConstructionSiteId { get; set; }
    public List<RouteConflictEvidence> Evidence { get; set; } = [];
}
