using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Persistence.Detection;

internal static class DetectionScanScheduler
{
    public static AlertScanRun Create(BaikorRDbContext context,
        IEnumerable<IAlertDetectionHandler> handlers, DateTimeOffset now)
    {
        var types = handlers.Select(handler => handler.Type).Distinct(StringComparer.Ordinal).ToArray();
        var run = new AlertScanRun
        {
            Id = Guid.NewGuid(), CreatedAt = now, State = types.Length == 0 ? "completed" : "scanning",
            PendingScanners = types.Length, CompletedAt = types.Length == 0 ? now : null
        };
        context.AlertScanRuns.Add(run);
        foreach (var type in types)
        {
            context.AlertDetectionWork.Add(new()
            {
                Kind = "scan", DetectorType = type, ScanRunId = run.Id,
                CreatedAt = now, AvailableAt = now
            });
        }
        return run;
    }

    public static void UpdateState(AlertScanRun run, DateTimeOffset now)
    {
        if (run.State == "failed" && run.CompletedAt is not null)
        {
            return;
        }
        if (run.PendingScanners == 0 && run.CompletedCount + run.FailedCount >= run.TotalCount)
        {
            run.State = run.FailedCount == 0 ? "completed" : "failed";
            run.CompletedAt = now;
        }
        else
        {
            run.State = run.PendingScanners > 0 ? "scanning" : "running";
        }
    }
}
