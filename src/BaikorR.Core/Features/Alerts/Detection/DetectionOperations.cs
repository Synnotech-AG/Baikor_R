using FluentResults;

namespace BaikorR.Core.Features.Alerts.Detection;

public sealed record AlertScanResponse(Guid Id, string State, int TotalCount, int CompletedCount,
    int FailedCount, DateTimeOffset CreatedAt, DateTimeOffset? CompletedAt);
public sealed record DetectionStatusResponse(int PendingCount, int FailedCount,
    DateTimeOffset? LastEvaluatedAt, AlertScanResponse? LatestScan, int UnassessableSiteCount,
    IReadOnlyList<string> PausedTypes);

public interface IDetectionOperations
{
    Task<DetectionStatusResponse> GetStatusAsync(CancellationToken cancellationToken);
    Task<AlertScanResponse> RequestScanAsync(CancellationToken cancellationToken);
    Task<Result<AlertScanResponse>> GetScanAsync(Guid id, CancellationToken cancellationToken);
}

public interface IAlertDetectionProcessor
{
    Task<bool> ProcessNextAsync(CancellationToken cancellationToken);
}
