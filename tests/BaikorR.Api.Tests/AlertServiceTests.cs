using BaikorR.Core.Features.Alerts;
using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;

namespace BaikorR.Api.Tests;

public sealed class AlertServiceTests
{
    [Fact]
    public async Task RetainedCaseDetailExposesItsCanonicalTargetAndHistoryLinks()
    {
        var session = new MemoryAlertsSession();
        session.Record.SupersededByAlertId = Guid.NewGuid();
        var result = await new AlertQueryService(session).GetAsync(session.Record.Id, default);
        Assert.Equal(session.Record.SupersededByAlertId, result.Value.SupersededByAlertId);
        Assert.Empty(result.Value.RelatedAlerts);
        Assert.True((await new AlertQueryService(session).GetEvidenceAsync(session.Record.Id, 1, default)).IsSuccess);
    }

    [Fact]
    public void SupersededCaseCannotReceiveAHandlingDecision()
    {
        var retained = new AlertRecord { Id = Guid.NewGuid(), SupersededByAlertId = Guid.NewGuid(),
            EvidenceRevision = 2, Handling = AlertHandling.Acknowledged };

        var result = new AlertReconciler().Handle(retained, AlertHandling.Handled, "Changed", "reviewer", 2, 0, DateTimeOffset.UtcNow);

        Assert.True(result.IsFailed);
        Assert.Equal(AlertHandling.Acknowledged, retained.Handling);
        Assert.Empty(retained.Events);
    }

    [Fact]
    public async Task HistoricalEvidenceRemainsImmutableAfterMaterialChangeAndClearance()
    {
        var session = new MemoryAlertsSession();
        var first = session.Record.RouteConflict!.Evidence.Single().SnapshotJson;
        var candidate = new RouteConflictDetector().Evaluate(new AlertRule(), RouteConflictDetectorTests.Route(), RouteConflictDetectorTests.Site(1)).Candidate!;
        var reconciler = new AlertReconciler();
        reconciler.Reconcile(session.Record, candidate, DateTimeOffset.UtcNow);
        reconciler.Clear(session.Record, DateTimeOffset.UtcNow, "Source removed");
        var service = new AlertQueryService(session);
        var history = await service.GetEvidenceAsync(session.Record.Id, 1, default);
        Assert.True(history.IsSuccess);
        Assert.Equal(1, history.Value.EvidenceRevision);
        Assert.Equal(session.Record.Id, history.Value.AlertId);
        Assert.Equal("routeConflict", history.Value.Type);
        Assert.Equal(System.Text.Json.JsonSerializer.Deserialize<RouteConflictSnapshot>(first)!.DistanceMetres, history.Value.Details!.DistanceMetres);
        Assert.NotNull(history.Value.Location);
        Assert.NotNull(history.Value.FocusEnvelope);
        Assert.Equal(2, session.Record.EvidenceRevision);
        Assert.Equal(AlertCondition.Cleared, session.Record.Condition);
        Assert.True((await service.GetEvidenceAsync(session.Record.Id, 99, default)).IsFailed);
        Assert.True((await service.GetEvidenceAsync(Guid.NewGuid(), 1, default)).IsFailed);
        session.Record.Type = "futureType";
        session.Record.RouteConflict = null;
        Assert.True((await service.GetEvidenceAsync(session.Record.Id, 1, default)).IsFailed);
    }

    [Fact]
    public async Task HandlingRejectsStaleEvidenceWithoutChangingTheDecision()
    {
        var session = new MemoryAlertsSession();
        var service = new AlertHandlingService(session, new AlertReconciler(), TimeProvider.System);

        var result = await service.ExecuteAsync(session.Record.Id, new(AlertHandling.Handled, null, 0, 0), "reviewer", default);

        Assert.True(result.IsFailed);
        Assert.Equal(AlertHandling.Open, session.Record.Handling);
        Assert.Single(session.Record.Events);
    }

    [Fact]
    public async Task HandlingRecordsAuthenticatedActorAndReturnsEvidenceDetail()
    {
        var session = new MemoryAlertsSession();
        var service = new AlertHandlingService(session, new AlertReconciler(), TimeProvider.System);

        var result = await service.ExecuteAsync(session.Record.Id, new(AlertHandling.Handled, "Reviewed locally", 1, 0), "reviewer", default);

        Assert.True(result.IsSuccess);
        Assert.Equal("reviewer", result.Value.HandlingActor);
        Assert.Equal("Reviewed locally", result.Value.HandlingNote);
        Assert.NotNull(result.Value.Details);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(1000.01)]
    [InlineData(double.NaN)]
    public async Task RuleRejectsOutOfRangeSensitivity(double sensitivity)
    {
        var session = new MemoryAlertsSession();
        var result = await new AlertRuleService(session).UpdateAsync(new(true, sensitivity, [ConstructionSiteStatus.Planned], 0), default);

        Assert.True(result.IsFailed);
        Assert.Equal(10, session.Rule.SensitivityMetres);
    }

    [Fact]
    public async Task RuleUsesExpectedVersionAndNormalizesStatuses()
    {
        var session = new MemoryAlertsSession();
        var service = new AlertRuleService(session);
        Assert.True((await service.UpdateAsync(new(true, 20, [ConstructionSiteStatus.Active], 1), default)).IsFailed);

        var result = await service.UpdateAsync(new(true, 20, [ConstructionSiteStatus.Active, ConstructionSiteStatus.Planned, ConstructionSiteStatus.Active], 0), default);

        Assert.True(result.IsSuccess);
        Assert.Equal([ConstructionSiteStatus.Planned, ConstructionSiteStatus.Active], session.Rule.EligibleStatuses);
    }

    [Fact]
    public async Task AlertQueryRejectsUnboundedPagesAndUnknownFilters()
    {
        var service = new AlertQueryService(new MemoryAlertsSession());

        Assert.True((await service.ListAsync(new AlertListQuery { PageSize = 101 }, default)).IsFailed);
        Assert.True((await service.ListAsync(new AlertListQuery { Condition = (AlertCondition)99 }, default)).IsFailed);
        Assert.True((await service.ListAsync(new AlertListQuery { Period = "unknown" }, default)).IsFailed);
        Assert.True((await service.ListAsync(new AlertListQuery { From = new(2040, 2, 1), To = new(2040, 1, 1) }, default)).IsFailed);
    }

    [Fact]
    public void GenericSummaryCarriesAffectedPeriodsWithoutTypedSubjectFields()
    {
        var record = new AlertRecord { AffectedPeriodsJson = "[{\"From\":\"2040-01-01\",\"To\":null}]" };
        var response = AlertResponse.Create(record);
        Assert.Equal(new AlertPeriod(new(2040, 1, 1), null), Assert.Single(response.Periods));
    }
}

internal sealed class MemoryAlertsSession : IAlertsSession
{
    public AlertRecord Record { get; } = new AlertReconciler().Reconcile(null,
        new RouteConflictDetector().Evaluate(new AlertRule(), RouteConflictDetectorTests.Route(), RouteConflictDetectorTests.Site()).Candidate!, DateTimeOffset.UtcNow);
    public AlertRule Rule { get; } = new();
    public Task<AlertRecord?> GetAsync(Guid id, bool forUpdate, CancellationToken cancellationToken) => Task.FromResult<AlertRecord?>(id == Record.Id ? Record : null);
    public Task<IReadOnlyList<AlertRecord>> ListRelatedAsync(Guid id, Guid canonicalId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<AlertRecord>>([]);
    public Task<AlertRule?> GetRuleAsync(Guid id, bool forUpdate, CancellationToken cancellationToken) => Task.FromResult<AlertRule?>(Rule);
    public Task<(IReadOnlyList<AlertRecord> Items, int TotalCount)> ListAsync(AlertListQuery query, CancellationToken cancellationToken) => Task.FromResult<(IReadOnlyList<AlertRecord>, int)>(([Record], 1));
    public void SetExpectedVersion(AlertRecord alert, uint version) { }
    public void SetExpectedVersion(AlertRule rule, uint version) { }
    public Task<bool> SaveChangesAsync(CancellationToken cancellationToken) => Task.FromResult(true);
    public Task<IAlertWriteScope> BeginWriteAsync(CancellationToken cancellationToken) => Task.FromResult<IAlertWriteScope>(new Scope());
    private sealed class Scope : IAlertWriteScope
    {
        public Task CommitAsync(CancellationToken cancellationToken) => Task.CompletedTask;
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
