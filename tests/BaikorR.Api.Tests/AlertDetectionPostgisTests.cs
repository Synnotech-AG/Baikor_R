using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Core.Persistence;
using BaikorR.Core.Persistence.Detection;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;

namespace BaikorR.Api.Tests;

public sealed class AlertDetectionPostgisTests
{
    [PostgisFact]
    public async Task MaterialChangeAppendsWithoutLoadingOrReplacingRetainedHistory()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var (routeId, siteId) = await SeedAsync(database);
        await DrainAsync(database);
        string originalSnapshot;
        Guid originalEventId;
        Guid alertId;
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            alertId = alert.Id;
            originalSnapshot = Assert.Single(alert.RouteConflict!.Evidence).SnapshotJson;
            originalEventId = Assert.Single(alert.Events).Id;
            var site = await context.ConstructionSites.SingleAsync(item => item.Id == siteId);
            site.PlannedEnd = new(2030, 1, 13);
            await context.SaveChangesAsync();
        }
        await using (var context = database.CreateContext())
        {
            await using var transaction = await DetectionTransaction.EnterAsync(context, default);
            var outcome = await Handler(context).ProcessAsync(new AlertDetectionWork
            {
                Kind = "routeDefinition", SubjectId = routeId
            }, DateTimeOffset.UtcNow, default);

            Assert.True(outcome.Evaluated);
            var alert = Assert.Single(context.Alerts.Local);
            Assert.Equal(2, Assert.Single(alert.RouteConflict!.Evidence).Revision);
            Assert.Equal("materialChange", Assert.Single(alert.Events).Kind);
            Assert.False(context.Entry(alert.RouteConflict).Collection(item => item.Evidence).IsLoaded);
            Assert.False(context.Entry(alert).Collection(item => item.Events).IsLoaded);
            await context.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        await using var verify = database.CreateContext();
        var updated = await ReadAlert(verify, routeId, siteId);
        Assert.Equal(alertId, updated.Id);
        Assert.Equal(2, updated.EvidenceRevision);
        Assert.Equal(2, updated.RouteConflict!.Evidence.Count);
        Assert.Equal(originalSnapshot, updated.RouteConflict.Evidence.Single(item => item.Revision == 1).SnapshotJson);
        Assert.Equal(2, updated.Events.Count);
        Assert.Contains(updated.Events, item => item.Id == originalEventId && item.Kind == "detected");
        Assert.Contains(updated.Events, item => item.Kind == "materialChange" && item.EvidenceRevision == 2);
    }

    [PostgisFact]
    public async Task ArchivingClearsTheCurrentConflictAndRestoringReusesRetainedEvidence()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var (routeId, siteId) = await SeedAsync(database);
        await DrainAsync(database);
        Guid alertId;
        string originalSnapshot;
        int revision;
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            alertId = alert.Id;
            revision = alert.EvidenceRevision;
            originalSnapshot = Assert.Single(alert.RouteConflict!.Evidence).SnapshotJson;
            Assert.True(new AlertReconciler().Handle(alert, AlertHandling.Handled,
                "Retain this review", "reviewer", revision, alert.Version, DateTimeOffset.UtcNow).IsSuccess);
            var site = await context.ConstructionSites.SingleAsync(item => item.Id == siteId);
            site.IsDeleted = true;
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            Assert.Equal(alertId, alert.Id);
            Assert.Equal(AlertCondition.Cleared, alert.Condition);
            Assert.Equal(AlertHandling.Handled, alert.Handling);
            Assert.Equal("Retain this review", alert.HandlingNote);
            Assert.Equal(revision, alert.EvidenceRevision);
            Assert.Equal(originalSnapshot, Assert.Single(alert.RouteConflict!.Evidence).SnapshotJson);
            Assert.Contains(alert.Events, item => item.Kind == "cleared");
            Assert.Single(await context.ConstructionSiteAreas.ToArrayAsync());
            await Operations(context).RequestScanAsync(CancellationToken.None);
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            Assert.Equal(AlertCondition.Cleared, (await ReadAlert(context, routeId, siteId)).Condition);
            var site = await context.ConstructionSites.SingleAsync(item => item.Id == siteId);
            site.IsDeleted = false;
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using var verify = database.CreateContext();
        var restored = await ReadAlert(verify, routeId, siteId);
        Assert.Equal(alertId, restored.Id);
        Assert.Equal(AlertCondition.Present, restored.Condition);
        Assert.Equal(2, restored.Occurrence);
        Assert.Equal(originalSnapshot, restored.RouteConflict!.Evidence.Single(item => item.Revision == revision).SnapshotJson);
        Assert.Contains(restored.Events, item => item.Kind == "recurrence");
        Assert.Equal(1, await verify.Alerts.CountAsync());
    }

    [PostgisFact]
    public async Task AnAlreadyArchivedSiteCannotCreateAConflictDuringInvalidationOrRepairScan()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var (_, siteId) = await SeedAsync(database);
        await using (var context = database.CreateContext())
        {
            var site = await context.ConstructionSites.SingleAsync(item => item.Id == siteId);
            site.IsDeleted = true;
            await context.SaveChangesAsync();
            await Operations(context).RequestScanAsync(CancellationToken.None);
        }
        await DrainAsync(database);
        await using var verify = database.CreateContext();
        Assert.Empty(await verify.Alerts.ToArrayAsync());
        Assert.Single(await verify.ConstructionSiteAreas.ToArrayAsync());
    }

    [PostgisFact]
    public async Task IndividualChildSuppressionReconcilesMatchingEvidenceAndClearsOnlyAfterLastPath()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var (routeId, siteId) = await SeedAsync(database);
        Guid siblingId;
        Guid[] versionIds;
        await using (var context = database.CreateContext())
        {
            var parent = await context.RouteDefinitions.Include(route => route.Paths).ThenInclude(path => path.Versions)
                .SingleAsync(route => route.Id == routeId);
            var sibling = new RoutePath
            {
                Id = Guid.NewGuid(), RouteDefinitionId = routeId, Title = "Second matching path",
                CreatedAt = parent.CreatedAt, UpdatedAt = parent.UpdatedAt,
                Versions = [new() { Id = Guid.NewGuid(), Geometry = Line(2), ValidFrom = new(2030, 1, 1), ValidTo = new(2030, 1, 31) }]
            };
            siblingId = sibling.Id;
            parent.Paths.Add(sibling);
            context.RoutePaths.Add(sibling);
            await context.SaveChangesAsync();
            versionIds = await context.RoutePathVersions.Select(version => version.Id).OrderBy(id => id).ToArrayAsync();
        }
        await DrainAsync(database);
        Guid alertId;
        int originalRevision;
        string originalSnapshot;
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            alertId = alert.Id;
            originalRevision = alert.EvidenceRevision;
            originalSnapshot = Assert.Single(alert.RouteConflict!.Evidence).SnapshotJson;
            var snapshot = System.Text.Json.JsonSerializer.Deserialize<RouteConflictSnapshot>(originalSnapshot)!;
            Assert.Equal(new Guid?[] { routeId, siblingId }.Order(), snapshot.Paths.Select(path => path.PathId).Order());
            Assert.True(new AlertReconciler().Handle(alert, AlertHandling.Handled, "Both paths reviewed", "reviewer",
                alert.EvidenceRevision, alert.Version, DateTimeOffset.UtcNow).IsSuccess);
            await context.SaveChangesAsync();
            var parentVersion = await context.RouteDefinitions.Select(route => route.Version).SingleAsync();
            var suppressed = await new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System)
                .SuppressPathAsync(routeId, routeId, new(parentVersion), default);
            Assert.True(suppressed.IsSuccess);
        }
        await DrainAsync(database);
        int remainingRevision;
        string remainingSnapshot;
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            Assert.Equal(alertId, alert.Id);
            Assert.Equal(AlertCondition.Present, alert.Condition);
            Assert.Equal(AlertHandling.Open, alert.Handling);
            Assert.Equal(originalRevision + 1, alert.EvidenceRevision);
            Assert.Contains(alert.Events, item => item.Kind == "materialChange");
            Assert.Equal(originalSnapshot, alert.RouteConflict!.Evidence.Single(item => item.Revision == originalRevision).SnapshotJson);
            remainingRevision = alert.EvidenceRevision;
            remainingSnapshot = alert.RouteConflict.Evidence.Single(item => item.Revision == remainingRevision).SnapshotJson;
            var snapshot = System.Text.Json.JsonSerializer.Deserialize<RouteConflictSnapshot>(remainingSnapshot)!;
            Assert.Equal(siblingId, Assert.Single(snapshot.Paths).PathId);
            Assert.True(new AlertReconciler().Handle(alert, AlertHandling.Handled, "Remaining path reviewed", "reviewer",
                alert.EvidenceRevision, alert.Version, DateTimeOffset.UtcNow).IsSuccess);
            await context.SaveChangesAsync();
            var parentVersion = await context.RouteDefinitions.Select(route => route.Version).SingleAsync();
            var last = await new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System)
                .SuppressPathAsync(routeId, siblingId, new(parentVersion), default);
            Assert.True(last.IsSuccess);
            Assert.False(last.Value.IsSuppressed);
        }
        await DrainAsync(database);
        await using var verify = database.CreateContext();
        var cleared = await ReadAlert(verify, routeId, siteId);
        Assert.Equal(alertId, cleared.Id);
        Assert.Equal(1, await verify.Alerts.CountAsync());
        Assert.Equal(AlertCondition.Cleared, cleared.Condition);
        Assert.Equal(AlertHandling.Handled, cleared.Handling);
        Assert.Equal("Remaining path reviewed", cleared.HandlingNote);
        Assert.Equal(remainingRevision, cleared.EvidenceRevision);
        Assert.Contains(cleared.Events, item => item.Kind == "cleared");
        Assert.Equal(2, cleared.RouteConflict!.Evidence.Count);
        Assert.Equal(originalSnapshot, cleared.RouteConflict.Evidence.Single(item => item.Revision == originalRevision).SnapshotJson);
        Assert.Equal(remainingSnapshot, cleared.RouteConflict.Evidence.Single(item => item.Revision == remainingRevision).SnapshotJson);
        Assert.False((await verify.RouteDefinitions.SingleAsync()).IsSuppressed);
        Assert.Equal(2, await verify.RoutePaths.CountAsync(path => path.IsSuppressed));
        Assert.Equal(versionIds, await verify.RoutePathVersions.Select(version => version.Id).OrderBy(id => id).ToArrayAsync());
    }

    [PostgisFact]
    public async Task ParentSuppressionLeavesRetainedHistoryUntouchedAndDoesNotRestoreHiddenChildren()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var (routeId, siteId) = await SeedAsync(database);
        await DrainAsync(database);
        Guid retainedId;
        string snapshot;
        await using (var context = database.CreateContext())
        {
            var current = await ReadAlert(context, routeId, siteId);
            var retained = new MemoryAlertsSession().Record;
            retained.IdentityKey = "legacy/" + retained.Id;
            retained.RouteConflict!.RouteId = routeId;
            retained.RouteConflict.ConstructionSiteId = siteId;
            Assert.True(new AlertReconciler().Handle(retained, AlertHandling.Handled, "Original decision", "reviewer", 1, 0, DateTimeOffset.UtcNow).IsSuccess);
            retained.SupersededByAlertId = current.Id;
            retainedId = retained.Id;
            snapshot = retained.RouteConflict.Evidence.Single().SnapshotJson;
            context.Alerts.Add(retained);
            var parent = await context.RouteDefinitions.SingleAsync(item => item.Id == routeId);
            parent.IsSuppressed = true;
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            var current = await context.Alerts.SingleAsync(item => item.SupersededByAlertId == null);
            Assert.Equal(AlertCondition.Cleared, current.Condition);
            var retained = await context.Alerts.Include(item => item.RouteConflict!).ThenInclude(item => item.Evidence)
                .Include(item => item.Events).SingleAsync(item => item.Id == retainedId);
            Assert.Equal(AlertCondition.Present, retained.Condition);
            Assert.Equal(AlertHandling.Handled, retained.Handling);
            Assert.Equal(2, retained.Events.Count);
            Assert.True(System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(snapshot),
                System.Text.Json.Nodes.JsonNode.Parse(retained.RouteConflict!.Evidence.Single().SnapshotJson)));
            var parent = await context.RouteDefinitions.Include(item => item.Paths).SingleAsync(item => item.Id == routeId);
            parent.IsSuppressed = false;
            parent.Paths.Single().IsSuppressed = true;
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using var verify = database.CreateContext();
        Assert.Equal(AlertCondition.Cleared, (await verify.Alerts.SingleAsync(item => item.SupersededByAlertId == null)).Condition);
        Assert.Equal(AlertCondition.Present, (await verify.Alerts.SingleAsync(item => item.Id == retainedId)).Condition);
    }

    [PostgisFact]
    public async Task ParentScanAndLegacyChildInvalidationsProduceOneCaseWithMatchingChildren()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var (routeId, siteId) = await SeedAsync(database);
        Guid weekdayId;
        Guid weekendId;
        await using (var context = database.CreateContext())
        {
            var parent = await context.RouteDefinitions.Include(item => item.Paths).ThenInclude(path => path.Versions)
                .SingleAsync(item => item.Id == routeId);
            var weekday = parent.Paths.Single();
            weekdayId = weekday.Id;
            var weekdayVersion = weekday.Versions.Single();
            weekday.Title = "Weekday";
            weekdayVersion.HasOperatingCalendar = true;
            weekdayVersion.Periods = [new() { Id = Guid.NewGuid(), From = new(2030, 1, 10), To = new(2030, 1, 10) }];
            context.RouteOperatingPeriods.AddRange(weekdayVersion.Periods);
            var weekend = new RoutePath
            {
                Id = Guid.NewGuid(), RouteDefinitionId = routeId, Title = "Weekend",
                Versions = [new() { Id = Guid.NewGuid(), Geometry = Line(0), HasOperatingCalendar = true,
                    Periods = [new() { Id = Guid.NewGuid(), From = new(2030, 1, 12), To = new(2030, 1, 12) }] }]
            };
            weekendId = weekend.Id;
            parent.Paths.Add(weekend);
            context.RoutePaths.Add(weekend);
            var site = await context.ConstructionSites.SingleAsync(item => item.Id == siteId);
            site.PlannedEnd = site.PlannedStart;
            await context.SaveChangesAsync();
            await context.AlertDetectionWork.ExecuteDeleteAsync();
            var page = await Handler(context).ScanPageAsync(Guid.Empty, 100, default);
            Assert.Equal(new DetectionSubject("routeDefinition", routeId), Assert.Single(page.Subjects));
            context.AlertDetectionWork.Add(new() { Kind = "route", SubjectId = weekendId,
                CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow });
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            var snapshot = System.Text.Json.JsonSerializer.Deserialize<RouteConflictSnapshot>(alert.RouteConflict!.Evidence.Single().SnapshotJson)!;
            Assert.Equal(weekdayId, Assert.Single(snapshot.Paths).PathId);
            Assert.Equal("Weekday", Assert.Single(snapshot.Paths).PathTitle);
            Assert.Equal($"{routeId:D}/{siteId:D}", alert.IdentityKey);
            var site = await context.ConstructionSites.SingleAsync(item => item.Id == siteId);
            site.PlannedStart = new(2030, 1, 12);
            site.PlannedEnd = site.PlannedStart;
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using var verify = database.CreateContext();
        var combined = await ReadAlert(verify, routeId, siteId);
        Assert.Equal(1, await verify.Alerts.CountAsync());
        Assert.Equal(2, combined.EvidenceRevision);
        var current = System.Text.Json.JsonSerializer.Deserialize<RouteConflictSnapshot>(combined.RouteConflict!.Evidence.Single(item => item.Revision == 2).SnapshotJson)!;
        Assert.Equal(weekendId, Assert.Single(current.Paths).PathId);
        var versionId = await verify.RoutePathVersions.Where(item => item.RoutePathId == weekendId).Select(item => item.Id).SingleAsync();
        var outcome = await Handler(verify).ProcessAsync(new() { Kind = "routeVersion", SubjectId = versionId }, DateTimeOffset.UtcNow, default);
        Assert.True(outcome.Evaluated);
        Assert.Equal(2, combined.EvidenceRevision);
    }

    [PostgisFact]
    public async Task SourceChangesDetectFutureConflictsAndPreserveReviewAcrossRescans()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var (routeId, siteId) = await SeedAsync(database);
        await DrainAsync(database);
        Guid alertId;
        int firstRevision;
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            alertId = alert.Id;
            firstRevision = alert.EvidenceRevision;
            Assert.Equal(AlertCondition.Present, alert.Condition);
            Assert.NotNull(alert.Location);
            Assert.Single(alert.RouteConflict!.Evidence);
            var result = new AlertReconciler().Handle(alert, AlertHandling.Handled, "Diversion arranged",
                "test-reviewer", alert.EvidenceRevision, alert.Version, DateTimeOffset.UtcNow);
            Assert.True(result.IsSuccess);
            await context.SaveChangesAsync();
            await Operations(context).RequestScanAsync(CancellationToken.None);
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            Assert.Equal(alertId, alert.Id);
            Assert.Equal(AlertHandling.Handled, alert.Handling);
            Assert.Equal(firstRevision, alert.EvidenceRevision);
            var site = await context.ConstructionSites.SingleAsync(item => item.Id == siteId);
            site.Title = "Renamed only";
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            Assert.Equal(AlertHandling.Handled, alert.Handling);
            var path = await context.RoutePathVersions.SingleAsync(item => item.RoutePathId == routeId);
            path.Geometry = Line(2);
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            Assert.Equal(alertId, alert.Id);
            Assert.Equal(AlertHandling.Open, alert.Handling);
            Assert.True(alert.EvidenceRevision > firstRevision);
            Assert.Contains(alert.Events, item => item.Kind == "materialChange");
            var area = await context.ConstructionSiteAreas.SingleAsync(item => item.ConstructionSiteId == siteId);
            area.Geometry = Polygon(200);
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            Assert.Equal(AlertCondition.Cleared, alert.Condition);
            Assert.True(alert.RouteConflict!.Evidence.Count >= 2);
            var area = await context.ConstructionSiteAreas.SingleAsync(item => item.ConstructionSiteId == siteId);
            area.Geometry = Polygon(0);
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            Assert.Equal(alertId, alert.Id);
            Assert.Equal(2, alert.Occurrence);
            context.ConstructionSites.Remove(await context.ConstructionSites.SingleAsync(item => item.Id == siteId));
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            var alert = await ReadAlert(context, routeId, siteId);
            Assert.Equal(AlertCondition.Cleared, alert.Condition);
            Assert.Contains(alert.Events, item => item.Kind == "recurrence");
            Assert.Contains(alert.RouteConflict!.Evidence, item => item.Revision == firstRevision);
        }
    }

    [PostgisFact]
    public async Task FailedPartitionRetainsTheLastEvidenceAndCanRecoverAfterRestart()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var (routeId, siteId) = await SeedAsync(database);
        await DrainAsync(database);
        int revision;
        await using (var context = database.CreateContext())
        {
            revision = (await ReadAlert(context, routeId, siteId)).EvidenceRevision;
            var path = await context.RoutePathVersions.SingleAsync(item => item.RoutePathId == routeId);
            path.Geometry = Line(3);
            await context.SaveChangesAsync();
        }
        await using (var context = database.CreateContext())
        {
            var handlers = new IAlertDetectionHandler[] { Handler(context), new FailingHandler() };
            Assert.True(await new AlertDetectionProcessor(context, handlers, TimeProvider.System)
                .ProcessNextAsync(CancellationToken.None));
        }
        await using (var context = database.CreateContext())
        {
            Assert.Equal(revision, (await ReadAlert(context, routeId, siteId)).EvidenceRevision);
            Assert.True((await Operations(context).GetStatusAsync(CancellationToken.None)).FailedCount > 0);
            await context.AlertDetectionWork.Where(work => work.CompletedAt == null)
                .ExecuteUpdateAsync(update => update.SetProperty(work => work.AvailableAt, DateTimeOffset.UtcNow));
        }
        // A fresh context/processor represents recovery after a process restart.
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            Assert.True((await ReadAlert(context, routeId, siteId)).EvidenceRevision > revision);
            Assert.Equal(0, (await Operations(context).GetStatusAsync(CancellationToken.None)).FailedCount);
        }
    }

    [PostgisFact]
    public async Task FullScanFindsSitesBeyondTheUiListingLimitAndCoalescesRequests()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var (routeId, targetId) = await SeedAsync(database);
        Guid scanId;
        await using (var context = database.CreateContext())
        {
            var target = await context.ConstructionSites.SingleAsync(item => item.Id == targetId);
            target.CreatedAt = DateTimeOffset.UtcNow.AddYears(-1);
            for (var index = 0; index < 2001; index++)
            {
                context.ConstructionSites.Add(new()
                {
                    Id = Guid.NewGuid(), Title = $"Unrelated draft {index}", Status = ConstructionSiteStatus.Draft,
                    CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
                });
            }
            await context.SaveChangesAsync();
            // This test-owned database intentionally leaves discovery to the explicit repair scan.
            await context.AlertDetectionWork.ExecuteDeleteAsync();
            var first = await Operations(context).RequestScanAsync(CancellationToken.None);
            var second = await Operations(context).RequestScanAsync(CancellationToken.None);
            Assert.Equal(first.Id, second.Id);
            scanId = first.Id;
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            Assert.Equal(AlertCondition.Present, (await ReadAlert(context, routeId, targetId)).Condition);
            var run = await context.AlertScanRuns.SingleAsync(run => run.Id == scanId);
            Assert.Equal("completed", run.State);
            Assert.Equal(1, run.TotalCount);
            Assert.Equal(run.TotalCount, run.CompletedCount);
        }
    }

    [PostgisFact]
    public async Task RuleStatusAndSensitivityChangesReconcileExistingCases()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var (routeId, siteId) = await SeedAsync(database);
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            var rule = await context.AlertRules.SingleAsync();
            rule.EligibleStatuses = [ConstructionSiteStatus.Approved];
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            Assert.Equal(AlertCondition.Cleared, (await ReadAlert(context, routeId, siteId)).Condition);
            var site = await context.ConstructionSites.SingleAsync(site => site.Id == siteId);
            site.Status = ConstructionSiteStatus.Approved;
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            Assert.Equal(AlertCondition.Present, (await ReadAlert(context, routeId, siteId)).Condition);
            var rule = await context.AlertRules.SingleAsync();
            rule.Enabled = false;
            await context.SaveChangesAsync();
        }
        await DrainAsync(database);
        await using (var context = database.CreateContext())
        {
            Assert.Equal(AlertCondition.Present, (await ReadAlert(context, routeId, siteId)).Condition);
        }
    }

    private static RouteConflictDetectionHandler Handler(BaikorRDbContext context) =>
        new(context, new RouteConflictDetector(), new AlertReconciler());

    private static DetectionOperationsDbSession Operations(BaikorRDbContext context) =>
        new(context, [Handler(context)], TimeProvider.System);

    private static async Task DrainAsync(PostgisTestDatabase database)
    {
        for (var iteration = 0; iteration < 1000; iteration++)
        {
            await using var context = database.CreateContext();
            var processor = new AlertDetectionProcessor(context, [Handler(context)], TimeProvider.System);
            if (!await processor.ProcessNextAsync(CancellationToken.None))
            {
                var failures = await context.AlertDetectionWork.CountAsync(item => item.CompletedAt == null);
                Assert.Equal(0, failures);
                return;
            }
        }
        Assert.Fail("The detection queue did not drain.");
    }

    private static Task<AlertRecord> ReadAlert(BaikorRDbContext context, Guid routeId, Guid siteId) =>
        context.Alerts.Include(item => item.RouteConflict!).ThenInclude(item => item.Evidence)
            .Include(item => item.Events).AsSplitQuery().SingleAsync(item => item.RouteConflict != null
                && item.RouteConflict.RouteId == routeId && item.RouteConflict.ConstructionSiteId == siteId);

    private static async Task<(Guid RouteId, Guid SiteId)> SeedAsync(PostgisTestDatabase database)
    {
        await using var context = database.CreateContext();
        var route = new RoutePath
        {
            Id = Guid.NewGuid(), Title = "Future route", CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
            Versions = [new() { Id = Guid.NewGuid(), Geometry = Line(0), ValidFrom = new(2030, 1, 1), ValidTo = new(2030, 1, 31) }]
        };
        var site = new ConstructionSite
        {
            Id = Guid.NewGuid(), Title = "Future site", Status = ConstructionSiteStatus.Planned,
            PlannedStart = new(2030, 1, 10), PlannedEnd = new(2030, 1, 12),
            CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            Areas = [new() { Id = Guid.NewGuid(), Name = "Road works", Geometry = Polygon(0) }]
        };
        var parent = new RouteDefinition { Id = route.Id, Title = route.Title, Paths = [route],
            CreatedAt = route.CreatedAt, UpdatedAt = route.UpdatedAt };
        route.RouteDefinitionId = parent.Id;
        context.AddRange(parent, site);
        await context.SaveChangesAsync();
        return (route.Id, site.Id);
    }

    private static readonly GeometryFactory Factory = new(new PrecisionModel(), 25832);
    private static MultiLineString Line(double offset) => Factory.CreateMultiLineString([
        Factory.CreateLineString([new Coordinate(725000, 5432000 + offset), new Coordinate(725100, 5432000 + offset)])]);
    private static Polygon Polygon(double offset) => Factory.CreatePolygon([
        new Coordinate(725040, 5431990 + offset), new Coordinate(725060, 5431990 + offset),
        new Coordinate(725060, 5432010 + offset), new Coordinate(725040, 5432010 + offset),
        new Coordinate(725040, 5431990 + offset)]);

    private sealed class FailingHandler : IAlertDetectionHandler
    {
        public string Type => "testFailure";
        public IReadOnlyCollection<string> SupportedTriggerKinds => ["route"];
        public Task<DetectionProcessOutcome> ProcessAsync(AlertDetectionWork work, DateTimeOffset now, CancellationToken token) =>
            throw new InvalidDataException("Controlled failure after a detector mutated tracked evidence.");
        public Task<DetectionScanPage> ScanPageAsync(Guid cursor, int pageSize, CancellationToken token) =>
            Task.FromResult(new DetectionScanPage([], null));
    }
}

internal static class AlertRouteFixtures
{
    public static RouteDefinition Parent(RoutePath path)
    {
        var parent = new RouteDefinition
        {
            Id = path.Id, Title = path.Title, Description = path.Description, SourceId = path.SourceId,
            ExternalRouteId = path.ExternalRouteId, CreatedAt = path.CreatedAt, UpdatedAt = path.UpdatedAt,
            Paths = [path]
        };
        path.RouteDefinition = parent;
        path.RouteDefinitionId = parent.Id;
        return parent;
    }
}
