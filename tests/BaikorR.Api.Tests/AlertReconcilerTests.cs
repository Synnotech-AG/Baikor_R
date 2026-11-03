using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Api.Tests;

public sealed class AlertReconcilerTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 28, 12, 0, 0, TimeSpan.Zero);
    private readonly AlertReconciler reconciler = new();

    [Fact]
    public void FirstObservationCreatesGenericCaseTypedEvidenceAndJournal()
    {
        var record = reconciler.Reconcile(null, Candidate(), Now);

        Assert.Equal(AlertCondition.Present, record.Condition);
        Assert.Equal(AlertHandling.Open, record.Handling);
        Assert.Equal(1, record.Occurrence);
        Assert.Equal(1, record.EvidenceRevision);
        Assert.Single(record.Events);
        Assert.Single(record.RouteConflict!.Evidence);
    }

    [Theory]
    [InlineData(AlertHandling.Acknowledged)]
    [InlineData(AlertHandling.Handled)]
    public void UnchangedObservationsRetainReviewAndDoNotAddHistory(AlertHandling handling)
    {
        var record = reconciler.Reconcile(null, Candidate(), Now);
        Assert.True(reconciler.Handle(record, handling, "Reviewed", "actor", 1, record.Version, Now).IsSuccess);
        var events = record.Events.Count;

        reconciler.Reconcile(record, Candidate(), Now.AddMinutes(1));

        Assert.Equal(handling, record.Handling);
        Assert.Equal(1, record.EvidenceRevision);
        Assert.Equal(events, record.Events.Count);
        Assert.Equal(Now.AddMinutes(1), record.LastEvaluatedAt);
    }

    [Fact]
    public void MaterialChangeReopensAndKeepsReviewedRevisionAndImmutableSnapshot()
    {
        var record = reconciler.Reconcile(null, Candidate(), Now);
        reconciler.Handle(record, AlertHandling.Handled, "Reviewed", "actor", 1, record.Version, Now);
        var original = record.RouteConflict!.Evidence[0].SnapshotJson;

        reconciler.Reconcile(record, Candidate(1), Now.AddMinutes(1));

        Assert.Equal(AlertHandling.Open, record.Handling);
        Assert.Equal(2, record.EvidenceRevision);
        Assert.Equal(1, record.ReviewedEvidenceRevision);
        Assert.Equal(original, record.RouteConflict.Evidence[0].SnapshotJson);
        Assert.Equal(2, record.RouteConflict.Evidence.Count);
    }

    [Fact]
    public void ClearPreservesHandlingAndRecurrenceUsesSameCaseWithNewOccurrence()
    {
        var record = reconciler.Reconcile(null, Candidate(), Now);
        reconciler.Handle(record, AlertHandling.Handled, null, "actor", 1, record.Version, Now);
        reconciler.Clear(record, Now.AddMinutes(1), "Subject removed.");
        Assert.Equal(AlertCondition.Cleared, record.Condition);
        Assert.Equal(AlertHandling.Handled, record.Handling);
        var id = record.Id;

        reconciler.Reconcile(record, Candidate(), Now.AddMinutes(2));

        Assert.Equal(id, record.Id);
        Assert.Equal(2, record.Occurrence);
        Assert.Equal(2, record.EvidenceRevision);
        Assert.Equal(AlertHandling.Open, record.Handling);
    }

    [Fact]
    public void StaleEvidenceOrVersionCannotHandleUnseenEvidence()
    {
        var record = reconciler.Reconcile(null, Candidate(), Now);
        Assert.True(reconciler.Handle(record, AlertHandling.Handled, null, "actor", 0, record.Version, Now).IsFailed);
        Assert.True(reconciler.Handle(record, AlertHandling.Handled, null, "actor", 1, record.Version + 1, Now).IsFailed);
        Assert.Equal(AlertHandling.Open, record.Handling);
        Assert.Single(record.Events);
    }

    private static RouteConflictCandidate Candidate(double gap = 0) =>
        new RouteConflictDetector().Evaluate(new AlertRule(), RouteConflictDetectorTests.Route(), RouteConflictDetectorTests.Site(gap)).Candidate!;
}
