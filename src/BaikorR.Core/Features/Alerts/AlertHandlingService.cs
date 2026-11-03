using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Sessions;
using FluentResults;

namespace BaikorR.Core.Features.Alerts;

public interface IAlertHandlingService
{
    Task<Result<AlertDetailsResponse>> ExecuteAsync(Guid id, AlertHandlingRequest request, string actor, CancellationToken cancellationToken);
}

public sealed class AlertHandlingService(IAlertsSession session, AlertReconciler reconciler, TimeProvider clock) : IAlertHandlingService
{
    public async Task<Result<AlertDetailsResponse>> ExecuteAsync(Guid id, AlertHandlingRequest request, string actor, CancellationToken cancellationToken)
    {
        await using var transaction = await session.BeginWriteAsync(cancellationToken);
        var alert = await session.GetAsync(id, true, cancellationToken);
        if (alert is null)
        {
            return AlertErrors.NotFound<AlertDetailsResponse>();
        }
        var result = reconciler.Handle(alert, request.Handling, request.Note, actor, request.EvidenceRevision, request.Version, clock.GetUtcNow());
        if (result.IsFailed)
        {
            return Result.Fail<AlertDetailsResponse>(result.Errors);
        }
        session.SetExpectedVersion(alert, request.Version);
        if (!await session.SaveChangesAsync(cancellationToken))
        {
            return AlertErrors.Conflict<AlertDetailsResponse>();
        }
        await transaction.CommitAsync(cancellationToken);
        var related = await session.ListRelatedAsync(alert.Id, alert.Id, cancellationToken);
        return Result.Ok(new AlertDetailsResponse(alert, related));
    }
}
