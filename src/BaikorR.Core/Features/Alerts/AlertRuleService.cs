using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Core.Shared.Results;
using FluentResults;

namespace BaikorR.Core.Features.Alerts;

public interface IAlertRuleService
{
    Task<Result<AlertRuleResponse>> GetAsync(CancellationToken cancellationToken);
    Task<Result<AlertRuleResponse>> UpdateAsync(AlertRuleUpdateRequest request, CancellationToken cancellationToken);
}

public sealed class AlertRuleService(IAlertsSession session) : IAlertRuleService
{
    public async Task<Result<AlertRuleResponse>> GetAsync(CancellationToken cancellationToken)
    {
        var rule = await session.GetRuleAsync(AlertRule.RouteConflictRuleId, false, cancellationToken);
        return rule is null ? Missing() : Result.Ok(AlertRuleResponse.Create(rule));
    }

    public async Task<Result<AlertRuleResponse>> UpdateAsync(AlertRuleUpdateRequest request, CancellationToken cancellationToken)
    {
        if (!double.IsFinite(request.SensitivityMetres) || request.SensitivityMetres is < 0 or > 1000
            || request.EligibleStatuses is null || request.EligibleStatuses.Length > 100
            || request.EligibleStatuses.Any(status => !Enum.IsDefined(status)))
        {
            return Result.Fail<AlertRuleResponse>(ApiError.Validation("alerts.rules.invalid", "Sensitivity must be from 0 to 1000 metres and statuses must be valid.", "sensitivityMetres"));
        }
        await using var transaction = await session.BeginWriteAsync(cancellationToken);
        var rule = await session.GetRuleAsync(AlertRule.RouteConflictRuleId, true, cancellationToken);
        if (rule is null)
        {
            return Missing();
        }
        if (rule.Version != request.Version)
        {
            return Conflict();
        }
        rule.Enabled = request.Enabled;
        rule.SensitivityMetres = request.SensitivityMetres;
        rule.EligibleStatuses = request.EligibleStatuses.Distinct().Order().ToArray();
        session.SetExpectedVersion(rule, request.Version);
        if (!await session.SaveChangesAsync(cancellationToken))
        {
            return Conflict();
        }
        await transaction.CommitAsync(cancellationToken);
        return Result.Ok(AlertRuleResponse.Create(rule));
    }

    private static Result<AlertRuleResponse> Missing() => Result.Fail<AlertRuleResponse>(ApiError.NotFound("alerts.rules.notFound", "The rule is not configured."));
    private static Result<AlertRuleResponse> Conflict() => Result.Fail<AlertRuleResponse>(ApiError.Conflict("alerts.rules.conflict", "The rule changed. Reload its settings before saving."));
}
