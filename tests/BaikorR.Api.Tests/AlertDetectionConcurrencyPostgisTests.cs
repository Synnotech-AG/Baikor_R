using BaikorR.Core.Persistence;
using BaikorR.Core.Persistence.Detection;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Features.Alerts.Detection;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NetTopologySuite.Geometries;

namespace BaikorR.Api.Tests;

public sealed class AlertDetectionConcurrencyPostgisTests
{
    [PostgisFact]
    public async Task SuccessfulSiteDiscoveryRepairsControlFailureWithoutStampingEvaluation()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var subject = Guid.NewGuid();
        long failedId;
        await using (var context = database.CreateContext())
        {
            await context.AlertDetectionWork.ExecuteDeleteAsync();
            var failed = new AlertDetectionWork { Kind = "site", SubjectId = subject, CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow, Attempts = 5, FailureCode = "evaluationFailed" };
            context.AlertDetectionWork.Add(failed);
            await context.SaveChangesAsync();
            failedId = failed.Id;
        }
        await using (var context = database.CreateContext())
        {
            var fresh = new AlertDetectionWork { Kind = "site", SubjectId = subject, CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow };
            context.AlertDetectionWork.Add(fresh);
            await context.SaveChangesAsync();
            var handler = new RouteConflictDetectionHandler(context, new RouteConflictDetector(), new AlertReconciler());
            Assert.True(await new AlertDetectionProcessor(context, [handler], TimeProvider.System).ProcessNextAsync(default));
            Assert.Null(fresh.EvaluatedAt);
        }
        await using var verify = database.CreateContext();
        Assert.NotNull((await verify.AlertDetectionWork.SingleAsync(work => work.Id == failedId)).CompletedAt);
        Assert.Null((await verify.AlertDetectionWork.SingleAsync(work => work.Id == failedId)).FailureCode);
    }

    [PostgisFact]
    public async Task SuccessfulEnabledRuleSchedulingRepairsControlFailureWithoutStampingEvaluation()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        long failedId;
        await using (var context = database.CreateContext())
        {
            await context.AlertDetectionWork.ExecuteDeleteAsync();
            var failed = new AlertDetectionWork { Kind = "rule", SubjectId = AlertRule.RouteConflictRuleId, CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow, Attempts = 5, FailureCode = "evaluationFailed" };
            context.AlertDetectionWork.Add(failed);
            await context.SaveChangesAsync();
            failedId = failed.Id;
        }
        await using (var context = database.CreateContext())
        {
            var fresh = new AlertDetectionWork { Kind = "rule", SubjectId = AlertRule.RouteConflictRuleId, CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow };
            context.AlertDetectionWork.Add(fresh);
            await context.SaveChangesAsync();
            var handler = new RouteConflictDetectionHandler(context, new RouteConflictDetector(), new AlertReconciler());
            Assert.True(await new AlertDetectionProcessor(context, [handler], TimeProvider.System).ProcessNextAsync(default));
            Assert.Null(fresh.EvaluatedAt);
        }
        await using var verify = database.CreateContext();
        Assert.NotNull((await verify.AlertDetectionWork.SingleAsync(work => work.Id == failedId)).CompletedAt);
        Assert.Null((await verify.AlertDetectionWork.SingleAsync(work => work.Id == failedId)).FailureCode);
        Assert.True(await verify.AlertDetectionWork.AnyAsync(work => work.Kind == "scan" && work.CompletedAt == null));
    }

    [PostgisFact]
    public async Task CompletedScopeRetriesOldSiteAndRuleBroadcastsThroughAllHandlers()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        long siteFailureId;
        long ruleFailureId;
        await using (var context = database.CreateContext())
        {
            await context.AlertDetectionWork.ExecuteDeleteAsync();
            var site = new AlertDetectionWork { Kind = "site", SubjectId = Guid.NewGuid(), CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow, Attempts = 5, FailureCode = "evaluationFailed" };
            context.AlertDetectionWork.Add(site);
            await context.SaveChangesAsync();
            siteFailureId = site.Id;
            var rule = new AlertDetectionWork { Kind = "rule", SubjectId = AlertRule.RouteConflictRuleId, CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow, Attempts = 5, FailureCode = "evaluationFailed" };
            context.AlertDetectionWork.Add(rule);
            await context.SaveChangesAsync();
            ruleFailureId = rule.Id;
        }
        var covered = new TestHandler("routeConflict", ["site", "testSubject"], scan: (_, _, _) => Task.FromResult(new DetectionScanPage([new("testSubject", Guid.NewGuid())], null)));
        var other = new TestHandler("anotherDetector", ["site"], (_, _, _) => throw new InvalidDataException("An independent detector remains broken."));
        await using (var context = database.CreateContext())
        {
            await new DetectionOperationsDbSession(context, [covered], TimeProvider.System).RequestScanAsync(default);
            var processor = new AlertDetectionProcessor(context, [covered, other], TimeProvider.System);
            Assert.True(await processor.ProcessNextAsync(default));
            Assert.True(await processor.ProcessNextAsync(default));
        }
        await using (var context = database.CreateContext())
        {
            var site = await context.AlertDetectionWork.SingleAsync(work => work.Id == siteFailureId);
            var rule = await context.AlertDetectionWork.SingleAsync(work => work.Id == ruleFailureId);
            Assert.Equal(0, site.Attempts);
            Assert.Null(site.CompletedAt);
            Assert.Null(site.FailureCode);
            Assert.Equal(0, rule.Attempts);
            Assert.Null(rule.CompletedAt);
            Assert.True(await new AlertDetectionProcessor(context, [covered, other], TimeProvider.System).ProcessNextAsync(default));
        }
        await using var verify = database.CreateContext();
        var retried = await verify.AlertDetectionWork.SingleAsync(work => work.Id == siteFailureId);
        Assert.Equal(1, retried.Attempts);
        Assert.Null(retried.CompletedAt);
        Assert.NotNull(retried.FailureCode);
    }

    [PostgisFact]
    public async Task ActiveScanFailureKeepsItsOwnRetryAndCompletionAccounting()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var runId = Guid.NewGuid();
        var subject = Guid.NewGuid();
        long failedId;
        await using (var context = database.CreateContext())
        {
            await context.AlertDetectionWork.ExecuteDeleteAsync();
            context.AlertScanRuns.Add(new() { Id = runId, State = "running", CreatedAt = DateTimeOffset.UtcNow, TotalCount = 1 });
            var failed = new AlertDetectionWork { Kind = "testSubject", SubjectId = subject, DetectorType = "testDetector", ScanRunId = runId, CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow.AddHours(1), Attempts = 1, FailureCode = "evaluationFailed" };
            context.AlertDetectionWork.Add(failed);
            await context.SaveChangesAsync();
            failedId = failed.Id;
        }
        var handler = new TestHandler("testDetector", ["testSubject"]);
        await using (var context = database.CreateContext())
        {
            context.AlertDetectionWork.Add(new() { Kind = "testSubject", SubjectId = subject, DetectorType = "testDetector", CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow });
            await context.SaveChangesAsync();
            Assert.True(await new AlertDetectionProcessor(context, [handler], TimeProvider.System).ProcessNextAsync(default));
        }
        await using (var context = database.CreateContext())
        {
            Assert.Null((await context.AlertDetectionWork.SingleAsync(work => work.Id == failedId)).CompletedAt);
            Assert.Equal("running", (await context.AlertScanRuns.SingleAsync(run => run.Id == runId)).State);
            await context.AlertDetectionWork.Where(work => work.Id == failedId).ExecuteUpdateAsync(update => update.SetProperty(work => work.AvailableAt, DateTimeOffset.UtcNow));
            Assert.True(await new AlertDetectionProcessor(context, [handler], TimeProvider.System).ProcessNextAsync(default));
        }
        await using var verify = database.CreateContext();
        var completed = await verify.AlertScanRuns.SingleAsync(run => run.Id == runId);
        Assert.Equal("completed", completed.State);
        Assert.Equal(1, completed.CompletedCount);
    }

    [PostgisFact]
    public async Task SuccessfulPartitionRepairsHistoricalScanFailureWithoutRewritingRunHistory()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var subject = Guid.NewGuid();
        var oldRunId = Guid.NewGuid();
        long failedId;
        await using (var context = database.CreateContext())
        {
            await context.AlertDetectionWork.ExecuteDeleteAsync();
            context.AlertScanRuns.Add(new() { Id = oldRunId, State = "failed", CreatedAt = DateTimeOffset.UtcNow, CompletedAt = DateTimeOffset.UtcNow, TotalCount = 1, FailedCount = 1 });
            var failed = new AlertDetectionWork
            {
                Kind = "testSubject", SubjectId = subject, DetectorType = "testDetector", ScanRunId = oldRunId,
                CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow, Attempts = 5, FailureCode = "evaluationFailed"
            };
            context.AlertDetectionWork.Add(failed);
            await context.SaveChangesAsync();
            failedId = failed.Id;
        }
        await using (var context = database.CreateContext())
        {
            context.AlertDetectionWork.Add(new() { Kind = "testSubject", SubjectId = subject, DetectorType = "testDetector", CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow });
            await context.SaveChangesAsync();
            Assert.True(await new AlertDetectionProcessor(context, [new TestHandler("testDetector", ["testSubject"])], TimeProvider.System).ProcessNextAsync(default));
        }
        await using var verify = database.CreateContext();
        var oldWork = await verify.AlertDetectionWork.SingleAsync(work => work.Id == failedId);
        Assert.NotNull(oldWork.CompletedAt);
        Assert.Null(oldWork.FailureCode);
        var history = await verify.AlertScanRuns.SingleAsync(run => run.Id == oldRunId);
        Assert.Equal("failed", history.State);
        Assert.Equal(1, history.FailedCount);
        Assert.Equal(0, history.CompletedCount);
    }

    [PostgisFact]
    public async Task OnlyCompletedNewScanCanRetireOlderEnumerationFailureOfTheSameType()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var oldRunId = Guid.NewGuid();
        long failedScannerId;
        long otherScannerId;
        await using (var context = database.CreateContext())
        {
            await context.AlertDetectionWork.ExecuteDeleteAsync();
            context.AlertScanRuns.Add(new() { Id = oldRunId, State = "failed", CreatedAt = DateTimeOffset.UtcNow, CompletedAt = DateTimeOffset.UtcNow });
            var failed = new AlertDetectionWork { Kind = "scan", DetectorType = "testDetector", ScanRunId = oldRunId, CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow, Attempts = 5, FailureCode = "evaluationFailed" };
            var other = new AlertDetectionWork { Kind = "scan", DetectorType = "anotherDetector", ScanRunId = oldRunId, CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow, Attempts = 5, FailureCode = "evaluationFailed" };
            context.AlertDetectionWork.AddRange(failed, other);
            await context.SaveChangesAsync();
            failedScannerId = failed.Id;
            otherScannerId = other.Id;
        }
        var handler = new TestHandler("testDetector", ["testSubject"], scan: (_, _, _) => Task.FromResult(new DetectionScanPage([new("testSubject", Guid.NewGuid())], null)));
        Guid newRunId;
        await using (var context = database.CreateContext())
        {
            newRunId = (await new DetectionOperationsDbSession(context, [handler], TimeProvider.System).RequestScanAsync(default)).Id;
            Assert.True(await new AlertDetectionProcessor(context, [handler], TimeProvider.System).ProcessNextAsync(default));
        }
        await using (var context = database.CreateContext())
        {
            Assert.Null((await context.AlertDetectionWork.SingleAsync(work => work.Id == failedScannerId)).CompletedAt);
            Assert.Equal("running", (await context.AlertScanRuns.SingleAsync(run => run.Id == newRunId)).State);
            Assert.True(await new AlertDetectionProcessor(context, [handler], TimeProvider.System).ProcessNextAsync(default));
        }
        await using var verify = database.CreateContext();
        Assert.Equal("completed", (await verify.AlertScanRuns.SingleAsync(run => run.Id == newRunId)).State);
        Assert.NotNull((await verify.AlertDetectionWork.SingleAsync(work => work.Id == failedScannerId)).CompletedAt);
        Assert.Null((await verify.AlertDetectionWork.SingleAsync(work => work.Id == failedScannerId)).FailureCode);
        Assert.Null((await verify.AlertDetectionWork.SingleAsync(work => work.Id == otherScannerId)).CompletedAt);
        Assert.Equal("failed", (await verify.AlertScanRuns.SingleAsync(run => run.Id == oldRunId)).State);
    }

    [PostgisFact]
    public async Task RouteScanCursorEnumeratesEveryPageWithoutDuplicatingOrOmittingIds()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var expected = Enumerable.Range(0, 205).Select(_ => Guid.NewGuid()).ToHashSet();
        await using var context = database.CreateContext();
        context.RouteDefinitions.AddRange(expected.Select(id => AlertRouteFixtures.Parent(new RoutePath
        {
            Id = id, Title = "Paged route", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
        })));
        await context.SaveChangesAsync();
        var handler = new RouteConflictDetectionHandler(context, new RouteConflictDetector(), new AlertReconciler());
        var found = new List<Guid>();
        var cursor = Guid.Empty;
        for (var page = 0; page < 3; page++)
        {
            var result = await handler.ScanPageAsync(cursor, 100, default);
            found.AddRange(result.Subjects.Select(subject => subject.Id));
            if (result.NextCursor is not Guid next)
            {
                Assert.Equal(2, page);
                break;
            }
            cursor = next;
        }
        Assert.Equal(205, found.Count);
        Assert.Equal(205, found.Distinct().Count());
        Assert.True(expected.SetEquals(found));
    }

    [PostgisFact]
    public async Task SourceCommitWaitsForEvaluatingPartitionAndRetainsItsFollowUpWork()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var factory = new GeometryFactory(new PrecisionModel(), 25832);
        var routeId = Guid.NewGuid();
        await using (var context = database.CreateContext())
        {
            context.RouteDefinitions.Add(AlertRouteFixtures.Parent(new()
            {
                Id = routeId, Title = "Concurrent route", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
                Versions = [new() { Id = Guid.NewGuid(), Geometry = factory.CreateMultiLineString([factory.CreateLineString([new(700000, 5400000), new(700100, 5400000)])]) }]
            }));
            context.ConstructionSites.Add(new()
            {
                Id = Guid.NewGuid(), Title = "Concurrent site", Status = ConstructionSiteStatus.Planned,
                CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
                Areas = [new() { Id = Guid.NewGuid(), Name = "Road", Geometry = factory.CreatePolygon([new(700040, 5399990), new(700060, 5399990), new(700060, 5400010), new(700040, 5400010), new(700040, 5399990)]) }]
            });
            await context.SaveChangesAsync();
        }
        await DrainRouteWorkAsync(database);
        await using (var context = database.CreateContext())
        {
            Assert.Equal(AlertCondition.Present, (await context.Alerts.SingleAsync()).Condition);
            context.AlertDetectionWork.Add(new() { Kind = "route", SubjectId = routeId, CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow });
            await context.SaveChangesAsync();
        }
        await using var sourceContext = database.CreateContext();
        await sourceContext.Database.OpenConnectionAsync();
        var sourcePid = ((NpgsqlConnection)sourceContext.Database.GetDbConnection()).ProcessID;
        var path = await sourceContext.RoutePathVersions.SingleAsync();
        path.Geometry = factory.CreateMultiLineString([factory.CreateLineString([new(700000, 5400100), new(700100, 5400100)])]);
        await using var workerContext = database.CreateContext();
        var realHandler = new RouteConflictDetectionHandler(workerContext, new RouteConflictDetector(), new AlertReconciler());
        var evaluated = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var paused = new TestHandler(realHandler.Type, realHandler.SupportedTriggerKinds, async (work, now, token) =>
        {
            await realHandler.ProcessAsync(work, now, token);
            evaluated.SetResult();
            await release.Task.WaitAsync(token);
        });
        var worker = new AlertDetectionProcessor(workerContext, [paused], TimeProvider.System).ProcessNextAsync(default);
        await evaluated.Task.WaitAsync(TimeSpan.FromSeconds(10));
        var sourceSave = sourceContext.SaveChangesAsync();
        try
        {
            await WaitForAdvisoryWaitAsync(database.ConnectionString, sourcePid);
        }
        finally
        {
            release.TrySetResult();
        }
        Assert.True(await worker);
        Assert.True(await sourceSave > 0);
        await DrainRouteWorkAsync(database);
        await using var verify = database.CreateContext();
        Assert.Equal(AlertCondition.Cleared, (await verify.Alerts.SingleAsync()).Condition);
        Assert.Equal(0, await verify.AlertDetectionWork.CountAsync(work => work.CompletedAt == null));
    }

    [PostgisFact]
    public async Task FailureRecordingCannotOverwriteAJobCompletedByAnotherWorker()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var runId = Guid.NewGuid();
        long workId;
        await using (var context = database.CreateContext())
        {
            await context.AlertDetectionWork.ExecuteDeleteAsync();
            context.AlertScanRuns.Add(new() { Id = runId, State = "running", CreatedAt = DateTimeOffset.UtcNow, TotalCount = 1 });
            var work = new AlertDetectionWork
            {
                Kind = "testRace", DetectorType = "testRace", SubjectId = Guid.NewGuid(), ScanRunId = runId,
                CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow, Attempts = 4
            };
            context.AlertDetectionWork.Add(work);
            await context.SaveChangesAsync();
            workId = work.Id;
        }
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var firstContext = database.CreateContext();
        await using var secondContext = database.CreateContext();
        await secondContext.Database.OpenConnectionAsync();
        var secondPid = ((NpgsqlConnection)secondContext.Database.GetDbConnection()).ProcessID;
        var failing = new TestHandler("testRace", ["testRace"], async (_, _, token) =>
        {
            entered.SetResult();
            await release.Task.WaitAsync(token);
            throw new InvalidDataException("Controlled failure before failure-recording reacquires the gate.");
        });
        var success = new TestHandler("testRace", ["testRace"]);
        var first = new AlertDetectionProcessor(firstContext, [failing], TimeProvider.System).ProcessNextAsync(default);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        var second = new AlertDetectionProcessor(secondContext, [success], TimeProvider.System).ProcessNextAsync(default);
        try
        {
            // PostgreSQL queues this worker before the first worker's catch can reacquire the gate.
            await WaitForAdvisoryWaitAsync(database.ConnectionString, secondPid);
        }
        finally
        {
            release.TrySetResult();
        }
        Assert.All(await Task.WhenAll(first, second), Assert.True);
        await using var verify = database.CreateContext();
        var finalRun = await verify.AlertScanRuns.SingleAsync(run => run.Id == runId);
        Assert.Equal("completed", finalRun.State);
        Assert.Equal(1, finalRun.CompletedCount);
        Assert.Equal(0, finalRun.FailedCount);
        var finalWork = await verify.AlertDetectionWork.SingleAsync(work => work.Id == workId);
        Assert.NotNull(finalWork.CompletedAt);
        Assert.Null(finalWork.FailureCode);
    }

    [PostgisFact]
    public async Task DirectCalendarPeriodEditWithUnloadedNavigationQueuesItsVersion()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        Guid versionId;
        await using (var context = database.CreateContext())
        {
            var geometry = new GeometryFactory(new PrecisionModel(), 25832);
            var version = new RoutePathVersion
            {
                Id = Guid.NewGuid(), HasOperatingCalendar = true,
                Geometry = geometry.CreateMultiLineString([geometry.CreateLineString([new(700000, 5400000), new(700100, 5400100)])]),
                Periods = [new() { Id = Guid.NewGuid(), From = new(2030, 1, 1), To = new(2030, 1, 3) }]
            };
            context.RouteDefinitions.Add(AlertRouteFixtures.Parent(new() { Id = Guid.NewGuid(), Title = "Calendar route", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow, Versions = [version] }));
            await context.SaveChangesAsync();
            versionId = version.Id;
            await context.AlertDetectionWork.ExecuteDeleteAsync();
        }
        await using (var context = database.CreateContext())
        {
            var period = await context.RouteOperatingPeriods.SingleAsync();
            Assert.Null(period.RoutePathVersion);
            period.To = new(2030, 1, 5);
            await context.SaveChangesAsync();
        }
        await using var verify = database.CreateContext();
        Assert.True(await verify.AlertDetectionWork.AnyAsync(work => work.Kind == "routeVersion" && work.SubjectId == versionId));
    }

    [PostgisFact]
    public async Task TypedSuccessfulScanReschedulesFailedBroadcastForAllDetectors()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var subject = Guid.NewGuid();
        long broadcastId;
        await using (var context = database.CreateContext())
        {
            await context.AlertDetectionWork.ExecuteDeleteAsync();
            var broadcast = new AlertDetectionWork
            {
                Kind = "testSubject", SubjectId = subject, Attempts = 5, FailureCode = "evaluationFailed",
                CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow
            };
            context.AlertDetectionWork.AddRange(broadcast, new()
            {
                Kind = "testSubject", SubjectId = subject, DetectorType = "firstDetector", CreatedAt = DateTimeOffset.UtcNow,
                AvailableAt = DateTimeOffset.UtcNow
            });
            await context.SaveChangesAsync();
            broadcastId = broadcast.Id;
        }
        var otherCalls = 0;
        var firstHandler = new TestHandler("firstDetector", ["testSubject"]);
        var secondHandler = new TestHandler("secondDetector", ["testSubject"], (_, _, _) => { otherCalls++; return Task.CompletedTask; });
        await using (var context = database.CreateContext())
        {
            Assert.True(await new AlertDetectionProcessor(context, [firstHandler, secondHandler], TimeProvider.System).ProcessNextAsync(default));
        }
        await using (var context = database.CreateContext())
        {
            var broadcast = await context.AlertDetectionWork.SingleAsync(work => work.Id == broadcastId);
            Assert.Null(broadcast.CompletedAt);
            Assert.Equal(0, broadcast.Attempts);
            Assert.Null(broadcast.FailureCode);
            Assert.True(await new AlertDetectionProcessor(context, [firstHandler, secondHandler], TimeProvider.System).ProcessNextAsync(default));
        }
        Assert.Equal(1, otherCalls);
        await using var verify = database.CreateContext();
        Assert.NotNull((await verify.AlertDetectionWork.SingleAsync(work => work.Id == broadcastId)).CompletedAt);
    }

    [PostgisFact]
    public async Task FailedLaterScanPageCannotReportCompletedAfterEarlierPartitionsSucceeded()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var next = Guid.NewGuid();
        var handler = new TestHandler("failingScanner", ["testSubject"], scan: (cursor, _, _) => cursor == Guid.Empty
            ? Task.FromResult(new DetectionScanPage([new("testSubject", Guid.NewGuid())], next))
            : throw new InvalidDataException("Controlled failure after the first enumerated page."));
        Guid scanId;
        await using (var context = database.CreateContext())
        {
            await context.AlertDetectionWork.ExecuteDeleteAsync();
            scanId = (await new DetectionOperationsDbSession(context, [handler], TimeProvider.System).RequestScanAsync(default)).Id;
        }
        for (var attempt = 0; attempt < 8; attempt++)
        {
            await using var context = database.CreateContext();
            await context.AlertDetectionWork.Where(work => work.CompletedAt == null && work.Attempts < 5)
                .ExecuteUpdateAsync(update => update.SetProperty(work => work.AvailableAt, DateTimeOffset.UtcNow));
            if (!await new AlertDetectionProcessor(context, [handler], TimeProvider.System).ProcessNextAsync(default))
            {
                break;
            }
        }
        await using var verify = database.CreateContext();
        var scan = await verify.AlertScanRuns.SingleAsync(run => run.Id == scanId);
        Assert.Equal("failed", scan.State);
        Assert.Equal(1, scan.CompletedCount);
        Assert.NotNull(scan.CompletedAt);
        Assert.Equal(1, await verify.AlertDetectionWork.CountAsync(work => work.ScanRunId == scanId && work.CompletedAt == null && work.Attempts == 5));
    }

    private static async Task WaitForAdvisoryWaitAsync(string connectionString, int processId)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        while (true)
        {
            await using var command = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = @pid AND locktype = 'advisory' AND NOT granted)", connection);
            command.Parameters.AddWithValue("pid", processId);
            if (await command.ExecuteScalarAsync(timeout.Token) is true)
            {
                return;
            }
            await Task.Delay(10, timeout.Token);
        }
    }

    private static async Task DrainRouteWorkAsync(PostgisTestDatabase database)
    {
        for (var iteration = 0; iteration < 30; iteration++)
        {
            await using var context = database.CreateContext();
            var handler = new RouteConflictDetectionHandler(context, new RouteConflictDetector(), new AlertReconciler());
            if (!await new AlertDetectionProcessor(context, [handler], TimeProvider.System).ProcessNextAsync(default))
            {
                Assert.Equal(0, await context.AlertDetectionWork.CountAsync(work => work.CompletedAt == null));
                return;
            }
        }
        Assert.Fail("The test's route queue did not drain.");
    }

    private sealed class TestHandler(string type, IReadOnlyCollection<string> triggers,
        Func<AlertDetectionWork, DateTimeOffset, CancellationToken, Task>? process = null,
        Func<Guid, int, CancellationToken, Task<DetectionScanPage>>? scan = null) : IAlertDetectionHandler
    {
        public string Type => type;
        public IReadOnlyCollection<string> SupportedTriggerKinds => triggers;
        public async Task<DetectionProcessOutcome> ProcessAsync(AlertDetectionWork work, DateTimeOffset now, CancellationToken cancellationToken)
        {
            if (process is not null)
            {
                await process(work, now, cancellationToken);
            }
            return new(true);
        }
        public Task<DetectionScanPage> ScanPageAsync(Guid cursor, int pageSize, CancellationToken cancellationToken) => scan?.Invoke(cursor, pageSize, cancellationToken) ?? Task.FromResult(new DetectionScanPage([], null));
    }
}
