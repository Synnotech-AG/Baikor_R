using BaikorR.Core.Features.Alerts;
using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;

namespace BaikorR.Api.Tests;

public sealed class AlertQueryPostgisTests
{
    [PostgisFact]
    public async Task SupersededHistoryIsLinkedReadableAndExcludedFromDefaultAndPeriodLists()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var canonical = new MemoryAlertsSession().Record;
        var retained = new MemoryAlertsSession().Record;
        retained.IdentityKey = "retained/" + retained.Id;
        new AlertReconciler().Handle(retained, AlertHandling.Handled, "Retained decision", "reviewer", retained.EvidenceRevision, retained.Version, DateTimeOffset.UtcNow);
        retained.SupersededByAlertId = canonical.Id;
        var original = retained.RouteConflict!.Evidence.Single().SnapshotJson;
        await using (var context = database.CreateContext())
        {
            context.Alerts.AddRange(canonical, retained);
            await context.SaveChangesAsync();
        }
        await using var read = database.CreateContext();
        var service = new AlertQueryService(new AlertsDbSession(read));

        Assert.Equal(canonical.Id, Assert.Single((await service.ListAsync(new(), default)).Value.Items).Id);
        Assert.Equal(canonical.Id, Assert.Single((await service.ListAsync(new() { Period = "current" }, default)).Value.Items).Id);
        var current = (await service.GetAsync(canonical.Id, default)).Value;
        var previous = (await service.GetAsync(retained.Id, default)).Value;
        Assert.Equal(retained.Id, Assert.Single(current.RelatedAlerts).Id);
        Assert.Equal(AlertHandling.Handled, Assert.Single(current.RelatedAlerts).Handling);
        Assert.Equal(canonical.Id, previous.SupersededByAlertId);
        Assert.Equal(canonical.Id, Assert.Single(previous.RelatedAlerts).Id);
        Assert.True((await service.GetEvidenceAsync(retained.Id, 1, default)).IsSuccess);
        var result = await new AlertHandlingService(new AlertsDbSession(read), new AlertReconciler(), TimeProvider.System)
            .ExecuteAsync(retained.Id, new(AlertHandling.Open, null, 1, previous.Version), "editor", default);
        Assert.True(result.IsFailed);
        read.ChangeTracker.Clear();
        var unchanged = (await new AlertsDbSession(read).GetAsync(retained.Id, false, default))!;
        Assert.True(System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(original),
            System.Text.Json.Nodes.JsonNode.Parse(unchanged.RouteConflict!.Evidence.Single().SnapshotJson)));
        Assert.Equal(AlertHandling.Handled, unchanged.Handling);
        Assert.Equal("Retained decision", unchanged.HandlingNote);
        Assert.Equal(2, unchanged.Events.Count);
    }

    [PostgisFact]
    public async Task RetainedRevisionCanBeReadAfterReloadWithoutSourcesOrCurrentGeometry()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var record = new MemoryAlertsSession().Record;
        var first = System.Text.Json.JsonSerializer.Deserialize<RouteConflictSnapshot>(record.RouteConflict!.Evidence.Single().SnapshotJson)!;
        var reconciler = new AlertReconciler();
        var changed = new RouteConflictDetector().Evaluate(new AlertRule(), RouteConflictDetectorTests.Route(), RouteConflictDetectorTests.Site(1)).Candidate!;
        reconciler.Reconcile(record, changed, DateTimeOffset.UtcNow);
        reconciler.Clear(record, DateTimeOffset.UtcNow, "Sources removed");
        record.Location = null;
        record.FocusEnvelope = null;
        await using (var context = database.CreateContext())
        {
            context.Alerts.Add(record);
            await context.SaveChangesAsync();
        }
        await using var read = database.CreateContext();
        var service = new AlertQueryService(new AlertsDbSession(read));
        var result = await service.GetEvidenceAsync(record.Id, 1, default);
        Assert.True(result.IsSuccess);
        Assert.Equal(first.DistanceMetres, result.Value.Details!.DistanceMetres);
        Assert.Equal(first.Areas[0].Geometry.Coordinates, result.Value.Details.Areas[0].Geometry.Coordinates);
        Assert.Equal(first.Areas[0].Location.Coordinates, result.Value.Location!.Coordinates);
        var current = await service.GetAsync(record.Id, default);
        Assert.Equal(2, current.Value.EvidenceRevision);
        Assert.Equal([1, 2], current.Value.EvidenceRevisions);
        Assert.Null(current.Value.Location);
        Assert.Equal(AlertCondition.Cleared, current.Value.Condition);
    }

    [PostgisFact]
    public async Task PeriodQueriesPreserveGapsAndUseBerlinCivilDateAtUtcMidnightBoundary()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var now = new DateTimeOffset(2026, 10, 28, 23, 30, 0, TimeSpan.Zero);
        var records = new[]
        {
            Record("current", "[{\"From\":null,\"To\":\"2026-10-29\"}]"),
            Record("gap", "[{\"From\":\"2026-10-28\",\"To\":\"2026-10-28\"},{\"From\":\"2026-10-30\",\"To\":\"2026-10-30\"}]"),
            Record("future", "[{\"From\":\"2026-10-30\",\"To\":null}]"),
            Record("past", "[{\"From\":null,\"To\":\"2026-10-28\"}]")
        };
        context.Alerts.AddRange(records);
        await context.SaveChangesAsync();
        var service = new AlertQueryService(new AlertsDbSession(context), new FixedTimeProvider(now));

        var current = await service.ListAsync(new() { Period = "current" }, default);
        Assert.Equal(["current"], current.Value.Items.Select(item => item.Summary).Order());
        var upcoming = await service.ListAsync(new() { Period = "upcoming" }, default);
        Assert.Equal(["future", "gap"], upcoming.Value.Items.Select(item => item.Summary).Order());
        var past = await service.ListAsync(new() { Period = "past" }, default);
        Assert.Equal(["gap", "past"], past.Value.Items.Select(item => item.Summary).Order());
        var exact = await service.ListAsync(new() { From = new(2026, 10, 29), To = new(2026, 10, 29) }, default);
        Assert.Equal(["current"], exact.Value.Items.Select(item => item.Summary).Order());

        AlertRecord Record(string name, string periods) => new()
        {
            Id = Guid.NewGuid(), RuleId = AlertRule.RouteConflictRuleId, IdentityKey = name,
            Type = "availabilityTest", Summary = name, AffectedPeriodsJson = periods,
            CreatedAt = now, UpdatedAt = now, FirstDetectedAt = now, LastDetectedAt = now, LastEvaluatedAt = now
        };
    }

    [PostgisFact]
    public async Task GenericAlertWithoutPeriodRemainsReadableAndDiffersFromUnboundedAvailability()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var generic = new AlertRecord { Id = Guid.NewGuid(), RuleId = AlertRule.RouteConflictRuleId,
            Type = "genericTest", IdentityKey = "noPeriod", Summary = "No temporal evidence" };
        var unbounded = new AlertRecord { Id = Guid.NewGuid(), RuleId = AlertRule.RouteConflictRuleId,
            Type = "genericTest", IdentityKey = "unbounded", Summary = "Unbounded evidence",
            AffectedPeriodsJson = "[{\"From\":null,\"To\":null}]" };
        context.Alerts.AddRange(generic, unbounded);
        await context.SaveChangesAsync();
        var service = new AlertQueryService(new AlertsDbSession(context));

        var all = await service.ListAsync(new(), default);
        Assert.Equal(2, all.Value.TotalCount);
        var current = await service.ListAsync(new() { Period = "current" }, default);
        Assert.Equal(unbounded.Id, Assert.Single(current.Value.Items).Id);
        var details = await service.GetAsync(generic.Id, default);
        Assert.True(details.IsSuccess);
        Assert.Null(details.Value.Details);
        Assert.Null(details.Value.Location);
        Assert.Empty(details.Value.Periods);
    }
}
