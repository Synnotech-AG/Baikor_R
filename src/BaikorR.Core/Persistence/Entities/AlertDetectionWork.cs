namespace BaikorR.Core.Persistence.Entities;

/// <summary>Durable invalidation persisted atomically with the source change.</summary>
public sealed class AlertDetectionWork
{
    public long Id { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string? DetectorType { get; set; }
    public Guid SubjectId { get; set; }
    public Guid? ScanRunId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset AvailableAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset? EvaluatedAt { get; set; }
    public int Attempts { get; set; }
    public string? FailureCode { get; set; }
}
