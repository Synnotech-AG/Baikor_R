using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace BaikorR.Core.Persistence.Detection;

/// <summary>One durable partition is committed with its results, or rolled back in full.</summary>
public sealed class AlertDetectionProcessor(BaikorRDbContext context,
    IEnumerable<IAlertDetectionHandler> handlers, TimeProvider clock,
    ILogger<AlertDetectionProcessor>? logger = null) : IAlertDetectionProcessor
{
    public async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
    {
        long? claimedId = null;
        try
        {
            await using var transaction = await DetectionTransaction.EnterAsync(context, cancellationToken);
            var now = clock.GetUtcNow();
            var work = await context.AlertDetectionWork
                .Where(item => item.CompletedAt == null && item.Attempts < 5 && item.AvailableAt <= now)
                .OrderBy(item => item.Id).FirstOrDefaultAsync(cancellationToken);
            if (work is null)
            {
                return false;
            }
            claimedId = work.Id;
            var registered = handlers.ToArray();
            var evaluated = false;
            var processed = false;
            var allProcessed = false;
            AlertScanRun? completedRun = null;
            if (work.Kind == "scan")
            {
                completedRun = await ExpandScanAsync(work, registered, now, cancellationToken);
            }
            else if (work.Kind == "rule")
            {
                var rule = await context.AlertRules.AsNoTracking().SingleOrDefaultAsync(
                    rule => rule.Id == work.SubjectId, cancellationToken)
                    ?? throw new InvalidOperationException("The queued rule is missing.");
                if (rule.Enabled)
                {
                    var ruleHandlers = registered.Where(handler => handler.Type == rule.Type).ToArray();
                    if (ruleHandlers.Length == 0)
                    {
                        throw new InvalidOperationException("The queued rule detector is not registered.");
                    }
                    DetectionScanScheduler.Create(context, ruleHandlers, now);
                    processed = allProcessed = true;
                }
            }
            else
            {
                var selected = registered.Where(handler => handler.SupportedTriggerKinds.Contains(work.Kind)
                    && (work.DetectorType == null || work.DetectorType == handler.Type)).ToArray();
                if (selected.Length == 0)
                {
                    throw new InvalidOperationException("No detector handles the queued work.");
                }
                allProcessed = true;
                foreach (var handler in selected)
                {
                    var outcome = await handler.ProcessAsync(work, now, cancellationToken);
                    evaluated |= outcome.Evaluated;
                    processed |= outcome.Processed;
                    allProcessed &= outcome.Processed;
                }
                if (work.ScanRunId is Guid runId)
                {
                    var run = await context.AlertScanRuns.SingleAsync(run => run.Id == runId, cancellationToken);
                    run.CompletedCount++;
                    DetectionScanScheduler.UpdateState(run, now);
                    completedRun = run;
                }
            }
            work.CompletedAt = now;
            work.EvaluatedAt = evaluated ? now : null;
            work.FailureCode = null;
            // A later successful change/full scan repairs older failed work for this same subject.
            var recovered = processed ? await context.AlertDetectionWork.Where(item => item.Id < work.Id
                && item.Kind == work.Kind && item.SubjectId == work.SubjectId
                && (item.DetectorType == work.DetectorType || (item.DetectorType == null && work.DetectorType != null)) && item.CompletedAt == null
                && item.FailureCode != null
                && (item.ScanRunId == null || context.AlertScanRuns.Any(run => run.Id == item.ScanRunId && run.State == "failed")))
                .ToListAsync(cancellationToken) : [];
            foreach (var item in recovered)
            {
                if (item.DetectorType is null && !allProcessed)
                {
                    continue;
                }
                if (item.DetectorType is null && work.DetectorType is not null)
                {
                    // A typed scan repaired one detector only. Retry the broadcast so every other
                    // registered detector must succeed before its shared failure can be retired.
                    item.Attempts = 0;
                    item.AvailableAt = now;
                }
                else
                {
                    item.CompletedAt = now;
                }
                item.FailureCode = null;
            }
            await context.SaveChangesAsync(cancellationToken);
            if (completedRun?.State == "completed"
                && await RetireSupersededFailuresAsync(completedRun, registered, now, cancellationToken))
            {
                await context.SaveChangesAsync(cancellationToken);
            }
            await transaction.CommitAsync(cancellationToken);
            return true;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception) when (claimedId.HasValue)
        {
            context.ChangeTracker.Clear();
            await using var transaction = await DetectionTransaction.EnterAsync(context, cancellationToken);
            var work = await context.AlertDetectionWork.SingleAsync(item => item.Id == claimedId.Value,
                cancellationToken);
            if (work.CompletedAt is not null || work.Attempts >= 5)
            {
                // Another worker may have acquired the gate after rollback and already completed
                // this same job (or recorded its terminal failure). Never overwrite that result.
                return true;
            }
            work.Attempts++;
            work.FailureCode = exception is InvalidDataException ? "unassessableEvidence" : "evaluationFailed";
            work.AvailableAt = clock.GetUtcNow().AddSeconds(Math.Min(300, Math.Pow(2, work.Attempts)));
            if (work.Attempts == 5 && work.ScanRunId is Guid runId)
            {
                var run = await context.AlertScanRuns.SingleAsync(run => run.Id == runId, cancellationToken);
                if (work.Kind == "scan")
                {
                    run.PendingScanners--;
                    // Enumeration failed: its unvisited scope is unknown and must be visible as a failed run.
                    run.State = "failed";
                    run.CompletedAt = clock.GetUtcNow();
                }
                else
                {
                    run.FailedCount++;
                    DetectionScanScheduler.UpdateState(run, clock.GetUtcNow());
                }
            }
            await context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            logger?.Log(work.Attempts == 5 ? LogLevel.Warning : LogLevel.Information,
                "Alert detection work {WorkId} ({WorkKind}, detector {DetectorType}) failed on attempt {Attempt} ({FailureType}).",
                work.Id, work.Kind, work.DetectorType, work.Attempts, exception.GetType().Name);
            return true;
        }
    }

    private async Task<AlertScanRun> ExpandScanAsync(AlertDetectionWork work, IAlertDetectionHandler[] registered,
        DateTimeOffset now, CancellationToken cancellationToken)
    {
        var handler = registered.SingleOrDefault(handler => handler.Type == work.DetectorType)
            ?? throw new InvalidOperationException("The scan detector is not registered.");
        var run = await context.AlertScanRuns.SingleAsync(run => run.Id == work.ScanRunId, cancellationToken);
        var page = await handler.ScanPageAsync(work.SubjectId, 100, cancellationToken);
        foreach (var subject in page.Subjects)
        {
            context.AlertDetectionWork.Add(new()
            {
                Kind = subject.Kind, SubjectId = subject.Id, DetectorType = handler.Type,
                ScanRunId = run.Id, CreatedAt = now, AvailableAt = now
            });
        }
        run.TotalCount += page.Subjects.Count;
        if (page.NextCursor is Guid cursor)
        {
            context.AlertDetectionWork.Add(new()
            {
                Kind = "scan", SubjectId = cursor, DetectorType = handler.Type,
                ScanRunId = run.Id, CreatedAt = now, AvailableAt = now
            });
        }
        else
        {
            run.PendingScanners--;
        }
        DetectionScanScheduler.UpdateState(run, now);
        return run;
    }

    private async Task<bool> RetireSupersededFailuresAsync(AlertScanRun completedRun,
        IAlertDetectionHandler[] registered, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var types = await context.AlertDetectionWork.Where(item => item.ScanRunId == completedRun.Id
            && item.Kind == "scan" && item.DetectorType != null)
            .Select(item => item.DetectorType!).Distinct().ToListAsync(cancellationToken);
        var pausedTypes = await context.AlertRules.Where(rule => !rule.Enabled)
            .Select(rule => rule.Type).Distinct().ToArrayAsync(cancellationToken);
        var skippedTypes = await context.AlertDetectionWork.Where(item => item.ScanRunId == completedRun.Id
            && item.Kind != "scan" && item.Kind != "rule" && item.EvaluatedAt == null)
            .Select(item => item.DetectorType).Distinct().ToArrayAsync(cancellationToken);
        types.RemoveAll(type => pausedTypes.Contains(type) || skippedTypes.Contains(type));
        if (types.Count == 0)
        {
            return false;
        }

        // Queue identities order run creation even when the configured clock has not advanced.
        var firstWorkId = await context.AlertDetectionWork.Where(item => item.ScanRunId == completedRun.Id)
            .MinAsync(item => item.Id, cancellationToken);
        var olderRuns = context.AlertDetectionWork.Where(anchor => anchor.Kind == "scan"
            && anchor.ScanRunId != null && anchor.ScanRunId != completedRun.Id && anchor.Id < firstWorkId)
            .Select(anchor => anchor.ScanRunId);
        var superseded = await context.AlertDetectionWork.Where(item => item.Kind == "scan"
            && item.CompletedAt == null && item.FailureCode != null && item.DetectorType != null
            && types.Contains(item.DetectorType) && olderRuns.Contains(item.ScanRunId)
            && context.AlertScanRuns.Any(run => run.Id == item.ScanRunId && run.State == "failed"))
            .ToListAsync(cancellationToken);
        foreach (var item in superseded)
        {
            // Current health is repaired; historical scan state and counters describe the original run.
            item.CompletedAt = now;
            item.FailureCode = null;
        }
        var controlKinds = registered.Where(handler => types.Contains(handler.Type))
            .SelectMany(handler => handler.SupportedTriggerKinds).Distinct().ToArray();
        var coveredRules = await context.AlertRules.Where(rule => rule.Enabled && types.Contains(rule.Type))
            .Select(rule => rule.Id).ToArrayAsync(cancellationToken);
        var broadcasts = await context.AlertDetectionWork.Where(item => item.Id < firstWorkId
            && item.ScanRunId == null && item.DetectorType == null && item.CompletedAt == null
            && item.Attempts >= 5 && item.FailureCode != null
            && (controlKinds.Contains(item.Kind) || (item.Kind == "rule" && coveredRules.Contains(item.SubjectId))))
            .ToListAsync(cancellationToken);
        foreach (var item in broadcasts)
        {
            // A complete typed scan can retry its failed source-control pipeline, but every
            // registered handler still has to run before this broadcast becomes healthy.
            item.Attempts = 0;
            item.AvailableAt = now;
            item.FailureCode = null;
        }
        return superseded.Count > 0 || broadcasts.Count > 0;
    }
}
