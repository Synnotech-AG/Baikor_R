using BaikorR.Core.Persistence.Sessions;
using BaikorR.Core.Shared.Results;
using FluentResults;

namespace BaikorR.Core.Features.Alerts;

public interface IAlertQueryService
{
    Task<Result<AlertPageResponse>> ListAsync(AlertListQuery query, CancellationToken cancellationToken);
    Task<Result<AlertDetailsResponse>> GetAsync(Guid id, CancellationToken cancellationToken);
    Task<Result<AlertEvidenceResponse>> GetEvidenceAsync(Guid id, int revision, CancellationToken cancellationToken);
}

public sealed class AlertQueryService(IAlertsSession session, TimeProvider? clock = null) : IAlertQueryService
{
    public async Task<Result<AlertPageResponse>> ListAsync(AlertListQuery query, CancellationToken cancellationToken)
    {
        if (query.Page < 1 || query.Page > int.MaxValue / 100 || query.PageSize is < 1 or > 100
            || query.Search?.Length > 500 || query.Type?.Length > 100
            || query.Period is not (null or "" or "current" or "upcoming" or "past")
            || query.From.HasValue && query.To.HasValue && query.From > query.To
            || query.Condition.HasValue && !Enum.IsDefined(query.Condition.Value)
            || query.Handling.HasValue && !Enum.IsDefined(query.Handling.Value))
        {
            return Result.Fail<AlertPageResponse>(ApiError.Validation("alerts.list.invalid", "Use a valid filter and a page size from 1 to 100.", "page"));
        }
        query.AsOfDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime((clock ?? TimeProvider.System).GetUtcNow(),
            TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin")).DateTime);
        var (items, total) = await session.ListAsync(query, cancellationToken);
        return Result.Ok(new AlertPageResponse(items.Select(AlertResponse.Create).ToArray(), total, query.Page, query.PageSize));
    }

    public async Task<Result<AlertDetailsResponse>> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var alert = await session.GetAsync(id, false, cancellationToken);
        if (alert is null)
        {
            return AlertErrors.NotFound<AlertDetailsResponse>();
        }
        var related = await session.ListRelatedAsync(alert.Id, alert.SupersededByAlertId ?? alert.Id, cancellationToken);
        return Result.Ok(new AlertDetailsResponse(alert, related));
    }

    public async Task<Result<AlertEvidenceResponse>> GetEvidenceAsync(Guid id, int revision, CancellationToken cancellationToken)
    {
        var alert = await session.GetAsync(id, false, cancellationToken);
        var evidence = alert?.Type == Persistence.Entities.AlertRule.RouteConflictType
            ? alert.RouteConflict?.Evidence.SingleOrDefault(item => item.Revision == revision) : null;
        return alert is null || evidence is null
            ? AlertErrors.NotFound<AlertEvidenceResponse>()
            : Result.Ok(AlertEvidenceResponse.Create(alert, evidence));
    }
}

internal static class AlertErrors
{
    public static Result<T> NotFound<T>() => Result.Fail<T>(ApiError.NotFound("alerts.notFound", "The alert could not be found."));
    public static Result<T> Conflict<T>() => Result.Fail<T>(ApiError.Conflict("alerts.conflict", "The alert changed. Reload it before recording a decision."));
}
