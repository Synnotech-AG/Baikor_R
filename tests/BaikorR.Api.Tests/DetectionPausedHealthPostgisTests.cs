using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence;
using BaikorR.Core.Persistence.Detection;
using BaikorR.Core.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;

namespace BaikorR.Api.Tests;

public sealed class DetectionPausedHealthPostgisTests
{
    [PostgisFact]
    public async Task IncompleteCoverageExcludesArchivedSitesAndIncludesThemAgainOnRestore()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var active = new ConstructionSite { Id = Guid.NewGuid(), Title = "Missing geometry", Status = ConstructionSiteStatus.Planned };
        context.ConstructionSites.AddRange(active,
            new ConstructionSite { Id = Guid.NewGuid(), Title = "Archived missing geometry", Status = ConstructionSiteStatus.Planned, IsDeleted = true },
            new ConstructionSite { Id = Guid.NewGuid(), Title = "Ineligible missing geometry", Status = ConstructionSiteStatus.Draft });
        await context.SaveChangesAsync();

        Assert.Equal(1, (await Operations(context).GetStatusAsync(default)).UnassessableSiteCount);
        active.IsDeleted = true;
        await context.SaveChangesAsync();
        Assert.Equal(0, (await Operations(context).GetStatusAsync(default)).UnassessableSiteCount);
        active.IsDeleted = false;
        await context.SaveChangesAsync();
        Assert.Equal(1, (await Operations(context).GetStatusAsync(default)).UnassessableSiteCount);
    }

    [PostgisFact]
    public async Task DisabledRuleTypesAreExplicitAndQueueCompletionDoesNotImplyEvaluation()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        Assert.Equal(1, await context.AlertDetectionWork.CountAsync(work => work.Kind == "rule" && work.CompletedAt == null));
        var rule = await context.AlertRules.SingleAsync();
        rule.Enabled = false;
        context.AlertRules.Add(new AlertRule { Id = Guid.NewGuid(), Type = "otherType", Name = "Other paused rule", Enabled = false });
        context.AlertDetectionWork.Add(new AlertDetectionWork
        {
            Kind = "route", SubjectId = Guid.NewGuid(), CreatedAt = DateTimeOffset.UtcNow,
            AvailableAt = DateTimeOffset.UtcNow, CompletedAt = DateTimeOffset.UtcNow
        });
        await context.SaveChangesAsync();

        var status = await Operations(context).GetStatusAsync(default);

        Assert.Equal(["otherType", "routeConflict"], status.PausedTypes);
        Assert.Null(status.LastEvaluatedAt);
    }

    [PostgisFact]
    public async Task ProcessingPausedWorkPreservesLastActualEvaluation()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var now = new DateTimeOffset(2040, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var actual = now.AddDays(-1);
        context.AlertDetectionWork.Add(new AlertDetectionWork
        {
            Kind = "route", SubjectId = Guid.NewGuid(), CreatedAt = actual, AvailableAt = actual,
            CompletedAt = actual, EvaluatedAt = actual
        });
        (await context.AlertRules.SingleAsync()).Enabled = false;
        var skipped = new AlertDetectionWork { Kind = "route", SubjectId = Guid.NewGuid(), CreatedAt = now, AvailableAt = now };
        context.AlertDetectionWork.Add(skipped);
        await context.SaveChangesAsync();
        var clock = new FixedTimeProvider(now);
        var processor = new AlertDetectionProcessor(context, [Handler(context)], clock);
        for (var remaining = 100; remaining > 0 && await processor.ProcessNextAsync(default); remaining--)
        {
        }

        var status = await Operations(context, clock).GetStatusAsync(default);

        Assert.NotNull(skipped.CompletedAt);
        Assert.Null(skipped.EvaluatedAt);
        Assert.Equal(actual, status.LastEvaluatedAt);
        Assert.Equal(["routeConflict"], status.PausedTypes);
    }

    [PostgisFact]
    public async Task SuccessfulNoMatchPartitionRecordsActualEvaluationWithoutCreatingAnAlert()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var factory = new GeometryFactory(new PrecisionModel(), 25832);
        var route = new RoutePath { Id = Guid.NewGuid(), Title = "No nearby sites" };
        route.Versions.Add(new RoutePathVersion
        {
            Id = Guid.NewGuid(), RoutePathId = route.Id, RoutePath = route,
            Geometry = factory.CreateMultiLineString([factory.CreateLineString([new Coordinate(725000, 5432000), new Coordinate(725100, 5432000)])])
        });
        context.RouteDefinitions.Add(AlertRouteFixtures.Parent(route));
        await context.SaveChangesAsync();
        var now = new DateTimeOffset(2040, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var clock = new FixedTimeProvider(now);
        var processor = new AlertDetectionProcessor(context, [Handler(context)], clock);
        for (var remaining = 100; remaining > 0 && await processor.ProcessNextAsync(default); remaining--)
        {
        }

        var status = await Operations(context, clock).GetStatusAsync(default);

        Assert.Empty(await context.Alerts.ToArrayAsync());
        Assert.Equal(now, status.LastEvaluatedAt);
        Assert.Empty(status.PausedTypes);
        Assert.True(await context.AlertDetectionWork.AnyAsync(work => work.Kind == "routeDefinition" && work.EvaluatedAt == now));
    }

    [PostgisFact]
    public async Task PausedSourceAndScanCompletionsDoNotRetirePriorEvaluationFailures()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var now = new DateTimeOffset(2040, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var routeId = Guid.NewGuid();
        var oldRun = new AlertScanRun { Id = Guid.NewGuid(), CreatedAt = now.AddDays(-1), CompletedAt = now.AddDays(-1),
            State = "failed", FailedCount = 1 };
        context.AlertScanRuns.Add(oldRun);
        var sourceFailure = new AlertDetectionWork { Kind = "route", DetectorType = AlertRule.RouteConflictType,
            SubjectId = routeId, CreatedAt = now.AddDays(-1), AvailableAt = now.AddDays(-1), Attempts = 5, FailureCode = "evaluationFailed" };
        var scanFailure = new AlertDetectionWork { Kind = "scan", DetectorType = AlertRule.RouteConflictType,
            SubjectId = Guid.Empty, ScanRunId = oldRun.Id, CreatedAt = now.AddDays(-1), AvailableAt = now.AddDays(-1),
            Attempts = 5, FailureCode = "evaluationFailed" };
        context.AlertDetectionWork.AddRange(sourceFailure, scanFailure);
        (await context.AlertRules.SingleAsync()).Enabled = false;
        await context.SaveChangesAsync();
        var newer = new AlertDetectionWork { Kind = "route", DetectorType = AlertRule.RouteConflictType,
            SubjectId = routeId, CreatedAt = now, AvailableAt = now };
        context.AlertDetectionWork.Add(newer);
        await context.SaveChangesAsync();
        var processor = new AlertDetectionProcessor(context, [Handler(context)], new FixedTimeProvider(now));
        for (var remaining = 100; remaining > 0 && await processor.ProcessNextAsync(default); remaining--)
        {
        }

        Assert.NotNull(newer.CompletedAt);
        Assert.Null(newer.EvaluatedAt);
        Assert.Null(sourceFailure.CompletedAt);
        Assert.Equal("evaluationFailed", sourceFailure.FailureCode);
        Assert.Null(scanFailure.CompletedAt);
        Assert.Equal("evaluationFailed", scanFailure.FailureCode);
        Assert.Equal("failed", oldRun.State);
    }

    [PostgisFact]
    public async Task EvaluationTrackingUpgradeQueuesFreshWorkWithoutInferringHistoricalTimestamps()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        await context.GetService<IMigrator>().MigrateAsync("20261028123758_AddRoutesAndAlerts");
        await context.Database.ExecuteSqlRawAsync("UPDATE baikor.alert_detection_work SET \"CompletedAt\" = CURRENT_TIMESTAMP;");

        await context.Database.MigrateAsync();

        Assert.Equal(1, await context.AlertDetectionWork.CountAsync(work => work.Kind == "rule" && work.CompletedAt == null));
        Assert.Equal(1, await context.AlertDetectionWork.CountAsync(work => work.Kind == "rule" && work.CompletedAt != null));
        Assert.False(await context.AlertDetectionWork.AnyAsync(work => work.EvaluatedAt != null));
    }

    private static RouteConflictDetectionHandler Handler(BaikorRDbContext context) => new(context, new RouteConflictDetector(), new AlertReconciler());
    private static DetectionOperationsDbSession Operations(BaikorRDbContext context, TimeProvider? clock = null) =>
        new(context, [Handler(context)], clock ?? TimeProvider.System);
}
