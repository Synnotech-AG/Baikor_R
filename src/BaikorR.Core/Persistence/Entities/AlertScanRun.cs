namespace BaikorR.Core.Persistence.Entities;

public sealed class AlertScanRun
{
    public Guid Id { get; set; }
    public string State { get; set; } = "pending";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public int TotalCount { get; set; }
    public int CompletedCount { get; set; }
    public int FailedCount { get; set; }
    public int PendingScanners { get; set; }
}
