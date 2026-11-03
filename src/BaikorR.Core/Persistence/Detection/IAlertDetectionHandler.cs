using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Persistence.Detection;

public sealed record DetectionSubject(string Kind, Guid Id);
public sealed record DetectionScanPage(IReadOnlyList<DetectionSubject> Subjects, Guid? NextCursor);
public readonly record struct DetectionProcessOutcome(bool Evaluated, bool Processed = true);

/// <summary>Each alert type supplies candidate queries and its own full-scan subjects.</summary>
public interface IAlertDetectionHandler
{
    string Type { get; }
    IReadOnlyCollection<string> SupportedTriggerKinds { get; }
    Task<DetectionProcessOutcome> ProcessAsync(AlertDetectionWork work, DateTimeOffset now, CancellationToken cancellationToken);
    Task<DetectionScanPage> ScanPageAsync(Guid cursor, int pageSize, CancellationToken cancellationToken);
}
