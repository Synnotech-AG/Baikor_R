using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Core.Importers.Gtfs;
using BaikorR.Core.Persistence;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Api.Tests;

public sealed class RoutePathsPostgisTests
{
    [PostgisFact]
    public async Task EditingOnlyActiveChildRetainsSuppressedChildGeometryCalendarsAndRestoreIdentity()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var input = new BaikorR.Core.Features.Routes.RoutePathWriteRequest("Manual", Paths:
        [new(null, "Outbound", new(2030, 1, 1), new(2030, 1, 31), new("MultiLineString", [[[700000, 5400000], [700100, 5400100]]])),
         new(null, "Inbound", null, null, new("MultiLineString", [[[700000, 5400000], [700200, 5400200]]]))]);
        Guid parentId;
        Guid suppressedId;
        Guid activeId;
        RoutePathVersion original;
        uint suppressedVersion;
        await using (var context = database.CreateContext())
        {
            var service = new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System);
            var created = await service.CreateAsync(input, default);
            Assert.True(created.IsSuccess);
            parentId = created.Value.Id;
            suppressedId = created.Value.Paths.Single(path => path.Title == "Outbound").Id;
            activeId = created.Value.Paths.Single(path => path.Title == "Inbound").Id;
            original = await context.RoutePathVersions.SingleAsync(version => version.RoutePathId == suppressedId);
            original.HasOperatingCalendar = true;
            original.SourceCoverageStart = new(2030, 1, 1);
            original.SourceCoverageEnd = new(2030, 1, 31);
            original.ServiceDayCalendarJson = "{\"2030-01-10\":[0,1,2]}";
            original.Periods.Add(new()
            {
                Id = Guid.NewGuid(), RoutePathVersionId = original.Id, RoutePathVersion = original,
                From = new(2030, 1, 10), To = new(2030, 1, 12)
            });
            context.RouteOperatingPeriods.AddRange(original.Periods);
            await context.SaveChangesAsync();
            var version = (await context.RouteDefinitions.SingleAsync()).Version;
            var suppressed = await service.SuppressPathAsync(parentId, suppressedId, new(version), default);
            Assert.True(suppressed.IsSuccess);
            suppressedVersion = suppressed.Value.Version;
        }
        uint editedVersion;
        await using (var context = database.CreateContext())
        {
            var edited = await new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System)
                .UpdateAsync(parentId, input with
                {
                    Title = "Renamed manual route", Version = suppressedVersion,
                    Paths = [input.Paths![1] with
                    {
                        Id = activeId, Title = "Edited inbound",
                        Geometry = new("MultiLineString", [[[700000, 5400000], [700300, 5400300]]])
                    }]
                }, default);
            Assert.True(edited.IsSuccess);
            editedVersion = edited.Value.Version;
            Assert.NotEqual(suppressedVersion, editedVersion);
        }
        await using (var context = database.CreateContext())
        {
            var parent = await context.RouteDefinitions.Include(route => route.Paths).ThenInclude(path => path.Versions)
                .ThenInclude(version => version.Periods).SingleAsync();
            Assert.Equal("Renamed manual route", parent.Title);
            Assert.False(parent.IsSuppressed);
            Assert.Equal(2, parent.Paths.Count);
            var retained = parent.Paths.Single(path => path.Id == suppressedId);
            Assert.True(retained.IsSuppressed);
            Assert.Equal("Outbound", retained.Title);
            var retainedVersion = Assert.Single(retained.Versions);
            Assert.Equal(original.Id, retainedVersion.Id);
            Assert.Equal(original.Geometry.AsText(), retainedVersion.Geometry.AsText());
            Assert.Equal(original.ValidFrom, retainedVersion.ValidFrom);
            Assert.Equal(original.ValidTo, retainedVersion.ValidTo);
            Assert.True(retainedVersion.HasOperatingCalendar);
            Assert.Equal(original.SourceCoverageStart, retainedVersion.SourceCoverageStart);
            Assert.Equal(original.SourceCoverageEnd, retainedVersion.SourceCoverageEnd);
            Assert.True(System.Text.Json.Nodes.JsonNode.DeepEquals(
                System.Text.Json.Nodes.JsonNode.Parse(original.ServiceDayCalendarJson!),
                System.Text.Json.Nodes.JsonNode.Parse(retainedVersion.ServiceDayCalendarJson!)));
            Assert.Equal(original.Periods.Select(period => (period.Id, period.From, period.To)),
                retainedVersion.Periods.Select(period => (period.Id, period.From, period.To)));
            var active = parent.Paths.Single(path => path.Id == activeId);
            Assert.False(active.IsSuppressed);
            Assert.Equal("Edited inbound", active.Title);
            Assert.Equal(700300, Assert.Single(active.Versions).Geometry.Coordinates[^1].X);
            var restored = await new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System)
                .RestorePathAsync(parentId, suppressedId, new(editedVersion), default);
            Assert.True(restored.IsSuccess);
            Assert.NotEqual(editedVersion, restored.Value.Version);
            Assert.False(restored.Value.Paths.Single(path => path.Id == suppressedId).IsSuppressed);
        }
        await using var verify = database.CreateContext();
        Assert.Equal(2, await verify.RoutePaths.CountAsync(path => !path.IsSuppressed));
        Assert.Equal(2, await verify.RoutePathVersions.CountAsync());
        Assert.Equal(original.Id, await verify.RoutePathVersions.Where(version => version.RoutePathId == suppressedId)
            .Select(version => version.Id).SingleAsync());
        Assert.Equal(Assert.Single(original.Periods).Id, await verify.RouteOperatingPeriods.Select(period => period.Id).SingleAsync());
    }

    [PostgisFact]
    public async Task ChildSuppressionAdvancesParentCasWithFixedClockAndKeepsLastChildParentActive()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var clock = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 10, 0, 0, TimeSpan.Zero));
        var input = new BaikorR.Core.Features.Routes.RoutePathWriteRequest("Manual", Paths:
        [new(null, "Outbound", null, null, new("MultiLineString", [[[700000, 5400000], [700100, 5400100]]])),
         new(null, "Inbound", null, null, new("MultiLineString", [[[700000, 5400000], [700200, 5400200]]]))]);
        Guid parentId;
        Guid firstPathId;
        Guid lastPathId;
        Guid[] versionIds;
        uint originalVersion;
        uint suppressedVersion;
        await using (var context = database.CreateContext())
        {
            var created = await new RoutePathsService(new RoutePathsDbSession(context), clock).CreateAsync(input, default);
            Assert.True(created.IsSuccess);
            parentId = created.Value.Id;
            firstPathId = created.Value.Paths.Single(path => path.Title == "Outbound").Id;
            lastPathId = created.Value.Paths.Single(path => path.Title == "Inbound").Id;
            originalVersion = created.Value.Version;
            versionIds = created.Value.Paths.SelectMany(path => path.Versions).Select(version => version.Id).Order().ToArray();
        }
        await using (var context = database.CreateContext())
        {
            var service = new RoutePathsService(new RoutePathsDbSession(context), clock);
            var suppressed = await service.SuppressPathAsync(parentId, firstPathId, new(originalVersion), default);
            Assert.True(suppressed.IsSuccess);
            suppressedVersion = suppressed.Value.Version;
            Assert.NotEqual(originalVersion, suppressedVersion);
            Assert.True(suppressed.Value.Paths.Single(path => path.Id == firstPathId).IsSuppressed);
            Assert.False(suppressed.Value.Paths.Single(path => path.Id == lastPathId).IsSuppressed);
            Assert.Equal(clock.GetUtcNow(), (await context.RouteDefinitions.SingleAsync()).UpdatedAt);
        }
        await using (var context = database.CreateContext())
        {
            var service = new RoutePathsService(new RoutePathsDbSession(context), clock);
            Assert.True((await service.SuppressPathAsync(parentId, lastPathId, new(originalVersion), default)).IsFailed);
            var repeat = await service.SuppressPathAsync(parentId, firstPathId, new(suppressedVersion), default);
            Assert.True(repeat.IsSuccess);
            Assert.Equal(suppressedVersion, repeat.Value.Version);
            Assert.Equal(2, await context.AlertDetectionWork.CountAsync(work => work.Kind == "routeDefinition" && work.SubjectId == parentId));
            var last = await service.SuppressPathAsync(parentId, lastPathId, new(suppressedVersion), default);
            Assert.True(last.IsSuccess);
            Assert.False(last.Value.IsSuppressed);
            Assert.All(last.Value.Paths, path => Assert.True(path.IsSuppressed));
            Assert.NotEqual(suppressedVersion, last.Value.Version);
        }
        await using var verify = database.CreateContext();
        var active = await new RoutePathsService(new RoutePathsDbSession(verify), clock).ListAsync(null, false, 1, 100, default);
        Assert.Equal(parentId, Assert.Single(active.Value.Items).Id);
        Assert.False((await verify.RouteDefinitions.SingleAsync()).IsSuppressed);
        Assert.Equal(2, await verify.RoutePaths.CountAsync(path => path.IsSuppressed));
        Assert.Equal(versionIds, await verify.RoutePathVersions.Select(version => version.Id).OrderBy(id => id).ToArrayAsync());
        Assert.Equal(3, await verify.AlertDetectionWork.CountAsync(work => work.Kind == "routeDefinition" && work.SubjectId == parentId));
    }

    [PostgisFact]
    public async Task ConcurrentChildSuppressionsUseOneParentCasAndPersistOnlyTheWinner()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        Guid parentId;
        Guid[] pathIds;
        uint version;
        await using (var context = database.CreateContext())
        {
            Assert.True((await Importer(context).ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive(), "provider"), default)).IsSuccess);
            var parent = await context.RouteDefinitions.Include(route => route.Paths).SingleAsync();
            parentId = parent.Id;
            version = parent.Version;
            pathIds = parent.Paths.Select(path => path.Id).ToArray();
        }
        await using var firstContext = database.CreateContext();
        await using var secondContext = database.CreateContext();
        var results = await Task.WhenAll(
            new RoutePathsService(new RoutePathsDbSession(firstContext), TimeProvider.System)
                .SuppressPathAsync(parentId, pathIds[0], new(version), default),
            new RoutePathsService(new RoutePathsDbSession(secondContext), TimeProvider.System)
                .SuppressPathAsync(parentId, pathIds[1], new(version), default));
        var winner = Assert.Single(results, result => result.IsSuccess);
        Assert.Single(results, result => result.IsFailed);
        var winnerId = Assert.Single(winner.Value.Paths, path => path.IsSuppressed).Id;
        await using var verify = database.CreateContext();
        Assert.Equal(winnerId, await verify.RoutePaths.Where(path => path.IsSuppressed).Select(path => path.Id).SingleAsync());
        Assert.False((await verify.RouteDefinitions.SingleAsync()).IsSuppressed);
        Assert.Equal(winner.Value.Version, (await verify.RouteDefinitions.SingleAsync()).Version);
        Assert.Equal(2, await verify.RoutePathVersions.CountAsync());
        Assert.Equal(2, await verify.AlertDetectionWork.CountAsync(work => work.Kind == "routeDefinition" && work.SubjectId == parentId));
    }

    [PostgisFact]
    public async Task SuppressedChildRetainsSourceGeometryAndCalendarsAcrossRepeatAndChangedFeeds()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        Guid parentId;
        Guid[] pathIds;
        RoutePath originalSuppressed;
        Guid originalSiblingVersion;
        uint suppressedVersion;
        await using (var context = database.CreateContext())
        {
            Assert.True((await Importer(context).ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive(), "provider"), default)).IsSuccess);
            var parent = await context.RouteDefinitions.Include(route => route.Paths).ThenInclude(path => path.Versions)
                .ThenInclude(version => version.Periods).SingleAsync();
            parentId = parent.Id;
            pathIds = parent.Paths.Select(path => path.Id).Order().ToArray();
            originalSuppressed = parent.Paths.Single(path => path.ExternalShapeId == "S1");
            originalSiblingVersion = parent.Paths.Single(path => path.ExternalShapeId == "S2").Versions.Single().Id;
            var suppressed = await new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System)
                .SuppressPathAsync(parentId, originalSuppressed.Id, new(parent.Version), default);
            Assert.True(suppressed.IsSuccess);
            suppressedVersion = suppressed.Value.Version;
        }
        await using (var context = database.CreateContext())
        {
            var repeat = await Importer(context).ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive(), "provider"), default);
            Assert.True(repeat.IsSuccess);
            Assert.Equal(1, repeat.Value.UnchangedCount);
            Assert.Equal(1, repeat.Value.UnchangedPathCount);
            Assert.Equal(1, repeat.Value.SuppressedPathCount);
            Assert.Equal(suppressedVersion, (await context.RouteDefinitions.SingleAsync()).Version);
            Assert.Equal(2, await context.AlertDetectionWork.CountAsync(work => work.Kind == "routeDefinition" && work.SubjectId == parentId));
        }
        var changedFeed = GtfsRouteTests.Rewrite(GtfsRouteTests.TwoPathsArchive(), "shapes.txt",
            "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nS1,49.0,12.2,1\nS1,49.01,12.21,2\nS2,49.0,12.15,1\nS2,49.02,12.12,2\n");
        changedFeed = GtfsRouteTests.Rewrite(changedFeed, "calendar_dates.txt", "service_id,date,exception_type\nD1,20261026,1\n");
        await using (var context = database.CreateContext())
        {
            var changed = await Importer(context).ExecuteAsync(new(changedFeed, "provider"), default);
            Assert.True(changed.IsSuccess);
            Assert.Equal(1, changed.Value.UpdatedCount);
            Assert.Equal(1, changed.Value.UpdatedPathCount);
            Assert.Equal(1, changed.Value.SuppressedPathCount);
        }
        await using var verify = database.CreateContext();
        var persisted = await verify.RouteDefinitions.Include(route => route.Paths).ThenInclude(path => path.Versions)
            .ThenInclude(version => version.Periods).SingleAsync();
        Assert.Equal(parentId, persisted.Id);
        Assert.Equal("provider", persisted.SourceId);
        Assert.Equal("R1", persisted.ExternalRouteId);
        Assert.False(persisted.IsSuppressed);
        Assert.Equal(pathIds, persisted.Paths.Select(path => path.Id).Order().ToArray());
        var retained = persisted.Paths.Single(path => path.Id == originalSuppressed.Id);
        Assert.True(retained.IsSuppressed);
        Assert.Equal(originalSuppressed.SourceId, retained.SourceId);
        Assert.Equal(originalSuppressed.ExternalRouteId, retained.ExternalRouteId);
        Assert.Equal(originalSuppressed.ExternalShapeId, retained.ExternalShapeId);
        var original = Assert.Single(originalSuppressed.Versions);
        var current = Assert.Single(retained.Versions);
        Assert.Equal(original.Id, current.Id);
        Assert.Equal(original.Geometry.AsText(), current.Geometry.AsText());
        Assert.True(System.Text.Json.Nodes.JsonNode.DeepEquals(
            System.Text.Json.Nodes.JsonNode.Parse(original.ServiceDayCalendarJson!),
            System.Text.Json.Nodes.JsonNode.Parse(current.ServiceDayCalendarJson!)));
        Assert.Equal(original.SourceCoverageStart, current.SourceCoverageStart);
        Assert.Equal(original.SourceCoverageEnd, current.SourceCoverageEnd);
        Assert.Equal(original.Periods.Select(period => (period.Id, period.From, period.To)).OrderBy(period => period.Id),
            current.Periods.Select(period => (period.Id, period.From, period.To)).OrderBy(period => period.Id));
        var sibling = persisted.Paths.Single(path => path.Id != retained.Id);
        Assert.False(sibling.IsSuppressed);
        Assert.NotEqual(originalSiblingVersion, Assert.Single(sibling.Versions).Id);
        Assert.Contains(sibling.Versions.Single().Periods, period => period.From == new DateOnly(2026, 10, 26));
        Assert.Equal(3, await verify.AlertDetectionWork.CountAsync(work => work.Kind == "routeDefinition" && work.SubjectId == parentId));
    }

    [PostgisFact]
    public async Task ExplicitChildRestoreAdvancesParentCasAndRetainsGeometryAndOtherSuppressions()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        Guid parentId;
        Guid restoredPathId;
        uint parentVersion;
        Guid[] versions;
        await using (var context = database.CreateContext())
        {
            await Importer(context).ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive(), "provider"), default);
            var parent = await context.RouteDefinitions.Include(route => route.Paths).ThenInclude(path => path.Versions).SingleAsync();
            parentId = parent.Id;
            restoredPathId = parent.Paths[0].Id;
            parentVersion = parent.Version;
            foreach (var path in parent.Paths)
            {
                path.IsSuppressed = true;
            }
            await context.SaveChangesAsync();
            versions = parent.Paths.SelectMany(path => path.Versions).Select(version => version.Id).Order().ToArray();
        }
        await using (var context = database.CreateContext())
        {
            var result = await new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System).RestorePathAsync(parentId, restoredPathId, new(parentVersion), default);
            Assert.True(result.IsSuccess);
            Assert.NotEqual(parentVersion, result.Value.Version);
            Assert.False(result.Value.Paths.Single(path => path.Id == restoredPathId).IsSuppressed);
            Assert.True(result.Value.Paths.Single(path => path.Id != restoredPathId).IsSuppressed);
        }
        await using (var context = database.CreateContext())
        {
            var stale = await new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System).RestorePathAsync(parentId, restoredPathId, new(parentVersion), default);
            Assert.True(stale.IsFailed);
            Assert.Equal(versions, await context.RoutePathVersions.Select(version => version.Id).OrderBy(id => id).ToArrayAsync());
            Assert.Equal(3, await context.AlertDetectionWork.CountAsync(work => work.Kind == "routeDefinition" && work.SubjectId == parentId));
        }
    }

    [PostgisFact]
    public async Task GroupedRepeatImportRetainsParentChildrenAndSeparateCalendarsWithoutNewWork()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        Guid parentId;
        Guid[] childIds;
        Guid[] versionIds;
        uint parentVersion;
        int workCount;
        await using (var context = database.CreateContext())
        {
            var result = await Importer(context).ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive(), "provider"), default);
            Assert.True(result.IsSuccess);
            Assert.Equal(1, result.Value.CreatedCount);
            Assert.Equal(2, result.Value.CreatedPathCount);
            var parent = await context.RouteDefinitions.Include(route => route.Paths).ThenInclude(path => path.Versions).ThenInclude(version => version.Periods).SingleAsync();
            parentId = parent.Id;
            parentVersion = parent.Version;
            childIds = parent.Paths.Select(path => path.Id).Order().ToArray();
            versionIds = parent.Paths.SelectMany(path => path.Versions).Select(version => version.Id).Order().ToArray();
            Assert.Equal(2, parent.Paths.Count);
            Assert.Contains(parent.Paths, path => path.ExternalShapeId == "S1" && path.Versions.Single().Periods.Any(period => period.To == new DateOnly(2026, 10, 28)));
            Assert.Contains(parent.Paths, path => path.ExternalShapeId == "S2" && path.Versions.Single().Periods.Any(period => period.To == new DateOnly(2026, 10, 27)));
            workCount = await context.AlertDetectionWork.CountAsync();
        }
        await using var verify = database.CreateContext();
        var repeat = await Importer(verify).ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive(), "provider"), default);
        Assert.Equal(1, repeat.Value.UnchangedCount);
        Assert.Equal(2, repeat.Value.UnchangedPathCount);
        Assert.Equal(parentId, await verify.RouteDefinitions.Select(route => route.Id).SingleAsync());
        Assert.Equal(parentVersion, await verify.RouteDefinitions.Select(route => route.Version).SingleAsync());
        Assert.Equal(childIds, await verify.RoutePaths.Select(path => path.Id).OrderBy(id => id).ToArrayAsync());
        Assert.Equal(versionIds, await verify.RoutePathVersions.Select(version => version.Id).OrderBy(id => id).ToArrayAsync());
        Assert.Equal(workCount, await verify.AlertDetectionWork.CountAsync());
    }

    [PostgisFact]
    public async Task ChildOnlyEditAndReplacementUseParentCasEvenWithFixedClock()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var clock = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 10, 0, 0, TimeSpan.Zero));
        var input = new BaikorR.Core.Features.Routes.RoutePathWriteRequest("Manual", Paths:
        [new(null, "Outbound", null, null, new("MultiLineString", [[[700000, 5400000], [700100, 5400100]]]))]);
        Guid id;
        Guid childId;
        uint version;
        await using (var context = database.CreateContext())
        {
            var created = await new RoutePathsService(new RoutePathsDbSession(context), clock).CreateAsync(input, default);
            Assert.True(created.IsSuccess);
            id = created.Value.Id;
            childId = Assert.Single(created.Value.Paths).Id;
            version = created.Value.Version;
        }
        await using (var context = database.CreateContext())
        {
            var result = await new RoutePathsService(new RoutePathsDbSession(context), clock).UpdateAsync(id, input with
            {
                Version = version, Paths = [input.Paths![0] with { Id = childId, Geometry = new("MultiLineString", [[[700000, 5400000], [700200, 5400200]]]) }]
            }, default);
            Assert.True(result.IsSuccess);
            Assert.NotEqual(version, result.Value.Version);
            Assert.Equal(childId, Assert.Single(result.Value.Paths).Id);
        }
        await using (var context = database.CreateContext())
        {
            var stale = await new RoutePathsService(new RoutePathsDbSession(context), clock).UpdateAsync(id, input with { Version = version }, default);
            Assert.True(stale.IsFailed);
        }
        await using var verify = database.CreateContext();
        Assert.Equal(childId, await verify.RoutePaths.Select(path => path.Id).SingleAsync());
        Assert.Equal(700200, (await verify.RoutePathVersions.SingleAsync()).Geometry.Coordinates[^1].X);
        Assert.Equal(2, await verify.AlertDetectionWork.CountAsync(item => item.Kind == "routeDefinition" && item.SubjectId == id));
    }

    [PostgisFact]
    public async Task RestoreKeepsBindingAndVersionsAndQueuesDetectionWithCas()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        Guid id;
        uint suppressedVersion;
        Guid[] pathIds;
        await using (var context = database.CreateContext())
        {
            await Importer(context).ExecuteAsync(new(GtfsRouteTests.Archive(), "provider"), default);
            id = await context.RouteDefinitions.Select(item => item.Id).SingleAsync();
            await new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System).SuppressAsync(id, default);
            suppressedVersion = (await context.RouteDefinitions.SingleAsync()).Version;
            pathIds = await context.RoutePathVersions.Select(item => item.Id).ToArrayAsync();
        }
        await using (var context = database.CreateContext())
        {
            var service = new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System);
            Assert.True((await service.RestoreAsync(id, new(suppressedVersion - 1), default)).IsFailed);
            var restored = await service.RestoreAsync(id, new(suppressedVersion), default);
            Assert.True(restored.IsSuccess);
            Assert.Equal("provider", restored.Value.SourceId);
            Assert.Equal(pathIds, restored.Value.Paths.Single().Versions.Select(item => item.Id));
            Assert.False(restored.Value.IsSuppressed);
            Assert.NotEqual(suppressedVersion, restored.Value.Version);
        }
        await using var verify = database.CreateContext();
        Assert.Equal(3, await verify.AlertDetectionWork.CountAsync(item => item.Kind == "routeDefinition" && item.SubjectId == id));
        Assert.Equal(id, await verify.RouteDefinitions.Select(item => item.Id).SingleAsync());
        Assert.Equal(1, await verify.RoutePathVersions.CountAsync());
    }

    [PostgisFact]
    public async Task GeometryOnlyUpdatesAdvanceConcurrencyEvenWhenClockHasNotAdvanced()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var clock = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 10, 0, 0, TimeSpan.Zero));
        var request = new BaikorR.Core.Features.Routes.RoutePathWriteRequest("Manual", null, null, null,
            new("MultiLineString", [[[700000, 5400000], [700100, 5400100]]]));
        Guid id;
        uint version;
        await using (var context = database.CreateContext())
        {
            var created = await new RoutePathsService(new RoutePathsDbSession(context), clock).CreateAsync(request, default);
            id = created.Value.Id;
            version = created.Value.Version;
        }
        await using (var context = database.CreateContext())
        {
            var updated = await new RoutePathsService(new RoutePathsDbSession(context), clock).UpdateAsync(id,
                request with { Version = version, Geometry = new("MultiLineString", [[[700000, 5400000], [700200, 5400200]]]) }, default);
            Assert.True(updated.IsSuccess);
            Assert.NotEqual(version, updated.Value.Version);
        }
    }

    [PostgisFact]
    public async Task ReleasedMigrationChainSupportsIdempotentImportAndSuppression()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        Guid routeId;
        uint version;
        await using (var context = database.CreateContext())
        {
            var result = await Importer(context).ExecuteAsync(new(GtfsRouteTests.Archive(), "provider"), default);
            Assert.True(result.IsSuccess, string.Join("; ", result.Errors.Select(error => error.Message)));
            Assert.Equal(1, result.Value.CreatedCount);
            var route = await context.RouteDefinitions.SingleAsync();
            routeId = route.Id;
            version = route.Version;
            Assert.Equal(1, await context.AlertDetectionWork.CountAsync(item => item.Kind == "routeDefinition" && item.SubjectId == routeId));
        }
        await using (var context = database.CreateContext())
        {
            var result = await Importer(context).ExecuteAsync(new(GtfsRouteTests.Archive(direction: "1", reversePoints: true), "provider"), default);
            Assert.True(result.IsSuccess);
            Assert.Equal(1, result.Value.UnchangedCount);
            var route = await context.RouteDefinitions.SingleAsync();
            Assert.Equal(routeId, route.Id);
            Assert.Equal(version, route.Version);
            Assert.Equal(1, await context.RoutePathVersions.CountAsync());
            Assert.Equal(1, await context.AlertDetectionWork.CountAsync(item => item.Kind == "routeDefinition" && item.SubjectId == routeId));
            var point = (await context.RoutePathVersions.SingleAsync()).Geometry.Factory.CreatePoint((await context.RoutePathVersions.SingleAsync()).Geometry.Coordinates[0]);
            Assert.Equal(1, await context.RoutePathVersions.CountAsync(item => item.Geometry.IsWithinDistance(point, 0)));
            Assert.True((await new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System).SuppressAsync(routeId, default)).IsSuccess);
        }
        await using (var context = database.CreateContext())
        {
            var result = await Importer(context).ExecuteAsync(new(GtfsRouteTests.Archive(longitude: "12.12"), "provider"), default);
            Assert.Equal(1, result.Value.SuppressedCount);
            Assert.True((await context.RouteDefinitions.SingleAsync()).IsSuppressed);
            Assert.Equal(routeId, (await context.RouteDefinitions.SingleAsync()).Id);
        }
    }

    [PostgisFact]
    public async Task StaleConcurrentManualUpdateCannotOverwriteNewerGeometryOrCreateAnotherJob()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        Guid id;
        uint version;
        var request = new BaikorR.Core.Features.Routes.RoutePathWriteRequest("Manual", null, null, null,
            new("MultiLineString", [[[700000, 5400000], [700100, 5400100]]]));
        await using (var context = database.CreateContext())
        {
            var created = await new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System).CreateAsync(request, default);
            Assert.True(created.IsSuccess);
            id = created.Value.Id;
            version = created.Value.Version;
        }
        await using var firstContext = database.CreateContext();
        await using var secondContext = database.CreateContext();
        var first = new RoutePathsService(new RoutePathsDbSession(firstContext), TimeProvider.System);
        var second = new RoutePathsService(new RoutePathsDbSession(secondContext), TimeProvider.System);
        var results = await Task.WhenAll(first.UpdateAsync(id, request with { Title = "First", Version = version }, default),
            second.UpdateAsync(id, request with { Title = "Second", Version = version }, default));
        Assert.Single(results, result => result.IsSuccess);
        Assert.Single(results, result => result.IsFailed);
        await using var verify = database.CreateContext();
        Assert.Equal(1, await verify.RoutePathVersions.CountAsync());
        Assert.Equal(2, await verify.AlertDetectionWork.CountAsync(item => item.Kind == "routeDefinition" && item.SubjectId == id));
    }

    [PostgisFact]
    public async Task ConcurrentImportsSerializeBeforeSourceBindingLookup()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var content = GtfsRouteTests.Archive();
        await using var firstContext = database.CreateContext();
        await using var secondContext = database.CreateContext();
        var results = await Task.WhenAll(
            Importer(firstContext).ExecuteAsync(new(content, "provider"), default),
            Importer(secondContext).ExecuteAsync(new(content, "provider"), default));
        Assert.All(results, result => Assert.True(result.IsSuccess, string.Join("; ", result.Errors.Select(error => error.Message))));
        Assert.Equal(1, results.Sum(result => result.Value.CreatedCount));
        Assert.Equal(1, results.Sum(result => result.Value.UnchangedCount));
        await using var verify = database.CreateContext();
        Assert.Equal(1, await verify.RoutePaths.CountAsync());
        Assert.Equal(1, await verify.RoutePathVersions.CountAsync());
    }

    [PostgisFact]
    public async Task OverlapReplacementRetainsServiceDayProvenanceAndRejectsWholeBadFeed()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        Guid id;
        await using (var context = database.CreateContext())
        {
            Assert.True((await Importer(context).ExecuteAsync(new(GtfsRouteTests.Archive(), "provider"), default)).IsSuccess);
            id = await context.RoutePaths.Select(route => route.Id).SingleAsync();
        }
        await using (var context = database.CreateContext())
        {
            var changed = await Importer(context).ExecuteAsync(new(GtfsRouteTests.Archive(calendar: false, longitude: "12.12", coverageStart: "20261027", coverageEnd: "20261027"), "provider"), default);
            Assert.Equal(1, changed.Value.UpdatedCount);
            Assert.Equal(id, await context.RoutePaths.Select(route => route.Id).SingleAsync());
        }
        await using (var context = database.CreateContext())
        {
            var versions = await context.RoutePathVersions.Include(version => version.Periods).OrderBy(version => version.SourceCoverageStart).ToArrayAsync();
            Assert.Equal(2, versions.Length);
            Assert.Equal(new DateOnly(2026, 10, 26), versions[0].SourceCoverageEnd);
            Assert.Equal(new DateOnly(2026, 10, 25), Assert.Single(versions[0].Periods).To);
            Assert.Equal(new DateOnly(2026, 10, 28), Assert.Single(versions[1].Periods).To);
            var unchanged = await Importer(context).ExecuteAsync(new(GtfsRouteTests.Archive(calendar: false, longitude: "12.12", coverageStart: "20261027", coverageEnd: "20261027"), "provider"), default);
            Assert.Equal(1, unchanged.Value.UnchangedCount);
            Assert.True((await Importer(context).ExecuteAsync(new(GtfsRouteTests.Archive(shapes: false), "provider"), default)).IsFailed);
            Assert.Equal(2, await context.RoutePathVersions.CountAsync());
            Assert.Equal(id, await context.RoutePaths.Select(route => route.Id).SingleAsync());
        }
    }

    private static GtfsRoutesImporter Importer(BaikorRDbContext context) => new(new RoutePathsDbSession(context), TimeProvider.System, new GtfsScheduleParser());
}
