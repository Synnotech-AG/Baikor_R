using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Shared.Results;
using FluentResults;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Core.Persistence.Detection;

public sealed class DetectionOperationsDbSession(BaikorRDbContext context,
    IEnumerable<IAlertDetectionHandler> handlers, TimeProvider clock) : IDetectionOperations
{
    public async Task<DetectionStatusResponse> GetStatusAsync(CancellationToken cancellationToken)
    {
        var pending = await context.AlertDetectionWork.CountAsync(item => item.CompletedAt == null
            && item.Attempts < 5, cancellationToken);
        var failed = await context.AlertDetectionWork.CountAsync(item => item.CompletedAt == null
            && item.FailureCode != null, cancellationToken);
        var last = await context.AlertDetectionWork.MaxAsync(item => item.EvaluatedAt, cancellationToken);
        var pausedTypes = await context.AlertRules.AsNoTracking().Where(rule => !rule.Enabled)
            .Select(rule => rule.Type).Distinct().OrderBy(type => type).ToArrayAsync(cancellationToken);
        var latest = await context.AlertScanRuns.AsNoTracking().OrderByDescending(run => run.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        var rule = await context.AlertRules.AsNoTracking().SingleOrDefaultAsync(
            item => item.Id == AlertRule.RouteConflictRuleId, cancellationToken);
        var statuses = rule?.EligibleStatuses ?? [];
        var unassessable = await context.ConstructionSites.CountAsync(site =>
            !site.IsDeleted && statuses.Contains(site.Status) && !site.Areas.Any(), cancellationToken);
        return new(pending, failed, last, latest is null ? null : ToResponse(latest), unassessable, pausedTypes);
    }

    public async Task<AlertScanResponse> RequestScanAsync(CancellationToken cancellationToken)
    {
        await using var transaction = await DetectionTransaction.EnterAsync(context, cancellationToken);
        var active = await context.AlertScanRuns.OrderByDescending(run => run.CreatedAt)
            .FirstOrDefaultAsync(run => run.State == "pending" || run.State == "scanning"
                || run.State == "running", cancellationToken);
        var run = active ?? DetectionScanScheduler.Create(context, handlers, clock.GetUtcNow());
        await context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ToResponse(run);
    }

    public async Task<Result<AlertScanResponse>> GetScanAsync(Guid id, CancellationToken cancellationToken)
    {
        var run = await context.AlertScanRuns.AsNoTracking().SingleOrDefaultAsync(
            item => item.Id == id, cancellationToken);
        return run is null
            ? Result.Fail<AlertScanResponse>(ApiError.NotFound("alerts.scan.notFound", "The scan was not found."))
            : Result.Ok(ToResponse(run));
    }

    internal static AlertScanResponse ToResponse(AlertScanRun run) => new(run.Id, run.State,
        run.TotalCount, run.CompletedCount, run.FailedCount, run.CreatedAt, run.CompletedAt);
}
