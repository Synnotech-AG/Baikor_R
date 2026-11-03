namespace BaikorR.Core.Persistence.Entities;

public sealed class RouteConflictEvidence
{
    public Guid AlertId { get; set; }
    public RouteConflictAlert RouteConflict { get; set; } = null!;
    public int Revision { get; set; }
    public string MaterialHash { get; set; } = string.Empty;
    public string SnapshotJson { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}
