using BaikorR.Core.Features.Routes;
using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Core.Importers.Gtfs;

namespace BaikorR.Api.Tests;

public sealed class RoutePathsServiceTests
{
    [Fact]
    public async Task ManualEditRetainsOmittedDeletedPathAndItsCalendarForExplicitRestore()
    {
        var session = new InMemoryRoutePathsSession();
        var service = new RoutePathsService(session, TimeProvider.System);
        var created = (await service.CreateAsync(AggregateRequest(), default)).Value;
        var parent = Assert.Single(session.Routes);
        var deletedPath = parent.Paths.Single(path => path.Title == "Weekday");
        var activePathId = created.Paths.Single(path => path.Title == "Weekend").Id;
        var originalVersion = Assert.Single(deletedPath.Versions);
        originalVersion.HasOperatingCalendar = true;
        originalVersion.ServiceDayCalendarJson = "{\"2026-10-26\":[0]}";
        originalVersion.Periods.Add(new()
        {
            Id = Guid.NewGuid(), RoutePathVersionId = originalVersion.Id, RoutePathVersion = originalVersion,
            From = new(2026, 10, 26), To = new(2026, 10, 26)
        });
        var originalPeriodId = Assert.Single(originalVersion.Periods).Id;
        Assert.True((await service.SuppressPathAsync(parent.Id, deletedPath.Id, new(0), default)).IsSuccess);

        var edited = await service.UpdateAsync(parent.Id, AggregateRequest() with
        {
            Title = "Renamed parent", Version = 0,
            Paths = [AggregateRequest().Paths![1] with { Id = activePathId, Title = "Edited active path" }]
        }, default);

        Assert.True(edited.IsSuccess);
        Assert.Equal("Renamed parent", edited.Value.Title);
        Assert.Equal(2, edited.Value.Paths.Count);
        Assert.Contains(edited.Value.Paths, path => path.Id == activePathId && path.Title == "Edited active path" && !path.IsSuppressed);
        var retained = edited.Value.Paths.Single(path => path.Id == deletedPath.Id);
        Assert.True(retained.IsSuppressed);
        Assert.Equal("Weekday", retained.Title);
        var version = Assert.Single(retained.Versions);
        Assert.Equal(originalVersion.Id, version.Id);
        Assert.True(version.HasOperatingCalendar);
        Assert.Equal(new DateOnly(2026, 10, 26), Assert.Single(version.Periods).From);
        Assert.Equal(new DateOnly(2026, 10, 26), Assert.Single(version.Periods).To);
        Assert.Equal(700100, version.Geometry.Coordinates[0][1][0]);
        var persisted = Assert.Single(parent.Paths.Single(path => path.Id == deletedPath.Id).Versions);
        Assert.Equal("{\"2026-10-26\":[0]}", persisted.ServiceDayCalendarJson);
        Assert.Equal(originalPeriodId, Assert.Single(persisted.Periods).Id);
        var restored = await service.RestorePathAsync(parent.Id, deletedPath.Id, new(0), default);
        Assert.True(restored.IsSuccess);
        Assert.False(restored.Value.Paths.Single(path => path.Id == deletedPath.Id).IsSuppressed);
        Assert.Equal(originalVersion.Id, Assert.Single(restored.Value.Paths.Single(path => path.Id == deletedPath.Id).Versions).Id);
    }

    [Fact]
    public async Task IndividualPathDeleteRetainsSourceIdentityCalendarsAndSibling()
    {
        var session = new InMemoryRoutePathsSession();
        await Importer(session).ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive(), "provider"), default);
        var parent = Assert.Single(session.Routes);
        var path = parent.Paths[0];
        var sibling = parent.Paths[1];
        var versions = path.Versions.Select(version => version.Id).ToArray();
        var periods = path.Versions.SelectMany(version => version.Periods).Select(period => (period.From, period.To)).ToArray();
        parent.Version = 7;
        var service = new RoutePathsService(session, TimeProvider.System);

        var deleted = await service.SuppressPathAsync(parent.Id, path.Id, new(7), default);

        Assert.True(deleted.IsSuccess);
        Assert.Equal(parent.Id, deleted.Value.Id);
        Assert.False(deleted.Value.IsSuppressed);
        Assert.Equal("provider", deleted.Value.SourceId);
        Assert.True(deleted.Value.Paths.Single(item => item.Id == path.Id).IsSuppressed);
        Assert.False(deleted.Value.Paths.Single(item => item.Id == sibling.Id).IsSuppressed);
        Assert.Equal(versions, path.Versions.Select(version => version.Id));
        Assert.Equal(periods, path.Versions.SelectMany(version => version.Periods).Select(period => (period.From, period.To)));
        Assert.Equal(7u, session.ExpectedVersion);
        var repeat = await Importer(session).ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive(), "provider"), default);
        Assert.Equal(1, repeat.Value.SuppressedPathCount);
        Assert.Equal(1, repeat.Value.UnchangedPathCount);
        Assert.True(path.IsSuppressed);
        Assert.Equal(2, parent.Paths.Count);
    }

    [Fact]
    public async Task LastPathDeleteKeepsParentActiveAndCanBeRepeatedOrExplicitlyRestored()
    {
        var session = new InMemoryRoutePathsSession();
        var service = new RoutePathsService(session, TimeProvider.System);
        var created = (await service.CreateAsync(Request(), default)).Value;
        var pathId = Assert.Single(created.Paths).Id;
        Assert.True((await service.SuppressPathAsync(created.Id, pathId, new(0), default)).IsSuccess);
        var saves = session.SaveCount;

        var repeated = await service.SuppressPathAsync(created.Id, pathId, new(0), default);

        Assert.True(repeated.IsSuccess);
        Assert.False(repeated.Value.IsSuppressed);
        Assert.True(Assert.Single(repeated.Value.Paths).IsSuppressed);
        Assert.Equal(saves, session.SaveCount);
        Assert.Equal(created.Id, Assert.Single((await service.ListAsync(null, false, 1, 20, default)).Value.Items).Id);
        var restored = await service.RestorePathAsync(created.Id, pathId, new(0), default);
        Assert.True(restored.IsSuccess);
        Assert.False(Assert.Single(restored.Value.Paths).IsSuppressed);
        Assert.Equal(pathId, Assert.Single(restored.Value.Paths).Id);
    }

    [Fact]
    public async Task PathDeleteRejectsMissingOrStaleVersionForeignPathAndSuppressedParentWithoutMutation()
    {
        var session = new InMemoryRoutePathsSession();
        var service = new RoutePathsService(session, TimeProvider.System);
        var created = (await service.CreateAsync(Request(), default)).Value;
        var other = (await service.CreateAsync(Request(), default)).Value;
        var parent = session.Routes.Single(route => route.Id == created.Id);
        var pathId = Assert.Single(created.Paths).Id;
        parent.Version = 7;
        var saves = session.SaveCount;

        var missing = await service.SuppressPathAsync(parent.Id, pathId, new(null), default);
        Assert.Equal("routes.version.required", Assert.Single(missing.Errors).Metadata["Key"]);
        var stale = await service.SuppressPathAsync(parent.Id, pathId, new(6), default);
        Assert.Equal("routes.conflict", Assert.Single(stale.Errors).Metadata["Key"]);
        var foreign = await service.SuppressPathAsync(parent.Id, other.Paths[0].Id, new(7), default);
        Assert.Equal("routes.paths.notFound", Assert.Single(foreign.Errors).Metadata["Key"]);
        var unknown = await service.SuppressPathAsync(Guid.NewGuid(), pathId, new(7), default);
        Assert.Equal("routes.paths.notFound", Assert.Single(unknown.Errors).Metadata["Key"]);
        parent.IsSuppressed = true;
        var hidden = await service.SuppressPathAsync(parent.Id, pathId, new(7), default);
        Assert.Equal("routes.suppressed", Assert.Single(hidden.Errors).Metadata["Key"]);
        Assert.All(session.Routes.SelectMany(route => route.Paths), path => Assert.False(path.IsSuppressed));
        Assert.Equal(saves, session.SaveCount);
        parent.IsSuppressed = false;
        Assert.True((await service.SuppressPathAsync(parent.Id, pathId, new(7), default)).IsSuccess);
        parent.Version = 8;
        Assert.True((await service.SuppressPathAsync(parent.Id, pathId, new(7), default)).IsFailed);
        Assert.Equal(saves + 1, session.SaveCount);
    }

    [Fact]
    public async Task TwoShapesOfOneSourceRouteAreOneListedRouteWithSeparatePaths()
    {
        var session = new InMemoryRoutePathsSession();
        var result = await Importer(session).ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive(), "provider"), default);
        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.CreatedCount);
        Assert.Equal(2, result.Value.CreatedPathCount);
        Assert.Equal(1, result.Value.RouteCount);
        Assert.Equal(2, result.Value.PathCount);
        var list = await new RoutePathsService(session, TimeProvider.System).ListAsync(null, false, 1, 20, default);
        Assert.Equal(1, list.Value.TotalCount);
        Assert.Equal(2, Assert.Single(list.Value.Items).Paths.Count);
    }

    [Fact]
    public async Task ManualAggregatePreservesSuppliedPathIdsAndReplacesOnlyItsOwnPaths()
    {
        var session = new InMemoryRoutePathsSession();
        var service = new RoutePathsService(session, TimeProvider.System);
        var created = await service.CreateAsync(AggregateRequest(), default);
        Assert.True(created.IsSuccess);
        Assert.Equal(2, created.Value.Paths.Count);
        var weekday = created.Value.Paths.Single(path => path.Title == "Weekday");
        var weekend = created.Value.Paths.Single(path => path.Title == "Weekend");
        Assert.Equal(new DateOnly(2026, 10, 30), Assert.Single(weekday.Versions).ValidTo);
        Assert.Equal(new DateOnly(2026, 10, 31), Assert.Single(weekend.Versions).ValidFrom);
        var updated = await service.UpdateAsync(created.Value.Id, AggregateRequest() with
        {
            Version = 8,
            Paths = [AggregateRequest().Paths![0] with { Id = weekday.Id, Title = "Changed weekday" }, AggregateRequest().Paths![1] with { Title = "New variant" }]
        }, default);
        Assert.True(updated.IsSuccess);
        Assert.Equal(8u, session.ExpectedVersion);
        Assert.Contains(updated.Value.Paths, path => path.Id == weekday.Id && path.Title == "Changed weekday");
        Assert.DoesNotContain(updated.Value.Paths, path => path.Id == weekend.Id);
        Assert.Equal(2, updated.Value.Paths.Count);
    }

    [Fact]
    public async Task ForeignAndDuplicatePathIdsCannotMutateEitherAggregate()
    {
        var session = new InMemoryRoutePathsSession();
        var service = new RoutePathsService(session, TimeProvider.System);
        var route = (await service.CreateAsync(AggregateRequest(), default)).Value;
        var other = (await service.CreateAsync(AggregateRequest(), default)).Value;
        var firstPath = route.Paths[0].Id;
        var originalVersionIds = session.Routes.SelectMany(item => item.Paths).SelectMany(path => path.Versions).Select(version => version.Id).ToArray();
        var input = AggregateRequest().Paths![0];
        Assert.True((await service.UpdateAsync(route.Id, AggregateRequest() with { Version = 1, Paths = [input with { Id = other.Paths[0].Id }] }, default)).IsFailed);
        Assert.True((await service.UpdateAsync(route.Id, AggregateRequest() with { Version = 1, Paths = [input with { Id = firstPath }, input with { Id = firstPath }] }, default)).IsFailed);
        Assert.Equal(originalVersionIds, session.Routes.SelectMany(item => item.Paths).SelectMany(path => path.Versions).Select(version => version.Id));
        Assert.Equal(2, session.SaveCount);
        Assert.True((await service.CreateAsync(AggregateRequest() with { Paths = [input with { Id = firstPath }] }, default)).IsFailed);
    }

    [Fact]
    public async Task LegacyFlatEditCannotSilentlyRemoveMultiplePaths()
    {
        var session = new InMemoryRoutePathsSession();
        var service = new RoutePathsService(session, TimeProvider.System);
        var route = (await service.CreateAsync(AggregateRequest(), default)).Value;
        Assert.True((await service.UpdateAsync(route.Id, Request() with { Version = 1 }, default)).IsFailed);
        Assert.Equal(2, (await service.GetAsync(route.Id, default)).Value.Paths.Count);
        Assert.Equal(route.Id, (await service.GetAsync(route.Paths[0].Id, default)).Value.Id);
        Assert.True((await service.UpdateAsync(route.Paths[0].Id, Request() with { Version = 1 }, default)).IsFailed);
    }

    [Fact]
    public async Task ParentRestoreRetainsIndividualPathSuppressionAndEveryCalendar()
    {
        var session = new InMemoryRoutePathsSession();
        await Importer(session).ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive(), "provider"), default);
        var parent = Assert.Single(session.Routes);
        parent.Paths[0].IsSuppressed = true;
        var versions = parent.Paths.SelectMany(path => path.Versions).Select(version => version.Id).ToArray();
        var service = new RoutePathsService(session, TimeProvider.System);
        await service.SuppressAsync(parent.Id, default);
        Assert.True(parent.Paths[0].IsSuppressed);
        Assert.False(parent.Paths[1].IsSuppressed);
        var restored = await service.RestoreAsync(parent.Id, new(0), default);
        Assert.True(restored.IsSuccess);
        Assert.False(parent.IsSuppressed);
        Assert.True(parent.Paths[0].IsSuppressed);
        Assert.False(parent.Paths[1].IsSuppressed);
        Assert.Equal(versions, parent.Paths.SelectMany(path => path.Versions).Select(version => version.Id));
        var imported = await Importer(session).ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive(), "provider"), default);
        Assert.Equal(1, imported.Value.UnchangedCount);
        Assert.Equal(1, imported.Value.UnchangedPathCount);
        Assert.Equal(1, imported.Value.SuppressedPathCount);
        Assert.Equal(3, session.SaveCount);
    }

    [Fact]
    public async Task SourceAndRouteIdsKeepSameNamedRoutesSeparate()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = Importer(session);
        var feed = GtfsRouteTests.Rewrite(GtfsRouteTests.TwoPathsArchive(), "routes.txt", "route_id,route_short_name\nR1,42\nR2,42\n");
        feed = GtfsRouteTests.Rewrite(feed, "trips.txt", "route_id,service_id,trip_id,shape_id,direction_id\nR1,D1,T1,S1,0\nR2,D1,T2,S2,0\n");
        Assert.Equal(2, (await importer.ExecuteAsync(new(feed, "provider-one"), default)).Value.CreatedCount);
        Assert.Equal(1, (await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "provider-two"), default)).Value.CreatedCount);
        Assert.Equal(3, session.Routes.Count);
        Assert.All(session.Routes, route => Assert.Single(route.Paths));
        Assert.All(session.Routes, route => Assert.Equal("42", route.Title));
    }

    [Fact]
    public async Task RegeneratedShapeAddsAPathToStableParentWithoutStealingOriginalIdentity()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = Importer(session);
        await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "provider"), default);
        var parent = Assert.Single(session.Routes);
        var original = Assert.Single(parent.Paths);
        var originalVersion = Assert.Single(original.Versions).Id;
        var feed = GtfsRouteTests.Rewrite(GtfsRouteTests.Archive(), "trips.txt", "route_id,service_id,trip_id,shape_id\nR1,D1,T1,S9\n");
        feed = GtfsRouteTests.Rewrite(feed, "shapes.txt", "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nS9,49,12.1,1\nS9,49.01,12.11,2\n");
        var preview = await importer.ExecuteAsync(new(feed, "provider", true), default);
        Assert.Equal(0, preview.Value.CreatedCount);
        Assert.Equal(1, preview.Value.UpdatedCount);
        Assert.Equal(1, preview.Value.CreatedPathCount);
        Assert.Single(parent.Paths);
        var imported = await importer.ExecuteAsync(new(feed, "provider"), default);
        Assert.Equal(1, imported.Value.UpdatedCount);
        Assert.Equal(parent.Id, Assert.Single(session.Routes).Id);
        Assert.Equal(2, parent.Paths.Count);
        Assert.Equal(originalVersion, Assert.Single(original.Versions).Id);
        Assert.Contains(parent.Paths, path => path.Id == original.Id && path.ExternalShapeId == "S1");
        Assert.Equal(1, (await importer.ExecuteAsync(new(feed, "provider"), default)).Value.UnchangedPathCount);
        Assert.Equal(2, session.SaveCount);
    }

    [Fact]
    public async Task ExplicitRestoreRetainsSourceIdentityAndRejectsStaleOrMissingVersion()
    {
        var session = new InMemoryRoutePathsSession();
        await Importer(session).ExecuteAsync(new(GtfsRouteTests.Archive(), "provider"), default);
        var route = Assert.Single(session.Routes);
        var service = new RoutePathsService(session, TimeProvider.System);
        await service.SuppressAsync(route.Id, default);
        route.Version = 7;
        var versions = route.Paths.Single().Versions.Select(item => item.Id).ToArray();
        Assert.True((await service.RestoreAsync(route.Id, new(null), default)).IsFailed);
        Assert.True((await service.RestoreAsync(route.Id, new(6), default)).IsFailed);
        Assert.True(route.IsSuppressed);
        var restored = await service.RestoreAsync(route.Id, new(7), default);
        Assert.True(restored.IsSuccess);
        Assert.False(restored.Value.IsSuppressed);
        Assert.Equal(route.Id, restored.Value.Id);
        Assert.Equal("provider", restored.Value.SourceId);
        Assert.Equal(versions, restored.Value.Paths.Single().Versions.Select(item => item.Id));
        Assert.Equal(7u, session.ExpectedVersion);
    }

    [Fact]
    public async Task SourceIdentityRejectsTrailingNewlineInsteadOfCreatingInvisibleNamespace()
    {
        var session = new InMemoryRoutePathsSession();
        var result = await Importer(session).ExecuteAsync(new(GtfsRouteTests.Archive(), "provider\n"), default);
        Assert.True(result.IsFailed);
        Assert.Empty(session.Routes);
    }

    [Fact]
    public async Task ManualRouteAcceptsUnboundedDatesAndDisconnectedComponents()
    {
        var session = new InMemoryRoutePathsSession();
        var service = new RoutePathsService(session, TimeProvider.System);
        var result = await service.CreateAsync(Request(), default);
        Assert.True(result.IsSuccess);
        var version = Assert.Single(result.Value.Paths.Single().Versions);
        Assert.False(version.HasOperatingCalendar);
        Assert.Null(version.ValidFrom);
        Assert.Null(version.ValidTo);
        Assert.Equal(2, version.Geometry.Coordinates.Length);
        Assert.Single(session.Routes);
    }

    [Fact]
    public async Task ReversedBoundsAndGeographicCoordinatesNeverPersist()
    {
        var session = new InMemoryRoutePathsSession();
        var service = new RoutePathsService(session, TimeProvider.System);
        Assert.True((await service.CreateAsync(Request() with { ValidFrom = new DateOnly(2027, 1, 2), ValidTo = new DateOnly(2027, 1, 1) }, default)).IsFailed);
        Assert.True((await service.CreateAsync(Request() with { Geometry = new("MultiLineString", [[[12, 49], [12.1, 49.1]]]) }, default)).IsFailed);
        Assert.Empty(session.Routes);
        Assert.Equal(0, session.SaveCount);
    }

    [Fact]
    public async Task UpdateRequiresVersionAndRejectsImportedSourceFields()
    {
        var session = new InMemoryRoutePathsSession();
        var service = new RoutePathsService(session, TimeProvider.System);
        var manual = (await service.CreateAsync(Request(), default)).Value;
        Assert.True((await service.UpdateAsync(manual.Id, Request(), default)).IsFailed);
        Assert.True((await service.UpdateAsync(manual.Id, Request() with { Version = 7 }, default)).IsSuccess);
        Assert.Equal(7u, session.ExpectedVersion);
        session.Routes[0].SourceId = "provider";
        Assert.True((await service.UpdateAsync(manual.Id, Request() with { Version = 7 }, default)).IsFailed);
    }

    [Fact]
    public async Task ReimportIsNoOpAndDirectionChangesRetainIdentity()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = Importer(session);
        var first = await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "provider"), default);
        Assert.True(first.IsSuccess);
        var id = Assert.Single(session.Routes).Id;
        var second = await importer.ExecuteAsync(new(GtfsRouteTests.Archive(direction: "1", reversePoints: true), "provider"), default);
        Assert.True(second.IsSuccess);
        Assert.Equal(1, second.Value.UnchangedCount);
        Assert.Equal(id, Assert.Single(session.Routes).Id);
        Assert.Equal(1, session.SaveCount);
    }

    [Fact]
    public async Task ChangedGeometryUpdatesExistingRouteAndSuppressionSurvives()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = Importer(session);
        await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "provider"), default);
        var route = Assert.Single(session.Routes);
        var id = route.Id;
        var changed = await importer.ExecuteAsync(new(GtfsRouteTests.Archive(longitude: "12.12"), "provider"), default);
        Assert.Equal(1, changed.Value.UpdatedCount);
        Assert.Equal(id, Assert.Single(session.Routes).Id);
        await new RoutePathsService(session, TimeProvider.System).SuppressAsync(id, default);
        var after = await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "provider"), default);
        Assert.Equal(1, after.Value.SuppressedCount);
        Assert.True(route.IsSuppressed);
    }

    [Fact]
    public async Task PreviewAndInvalidFeedNeverWrite()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = Importer(session);
        var preview = await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "provider", true), default);
        Assert.Equal(1, preview.Value.CreatedCount);
        Assert.Empty(session.Routes);
        Assert.True((await importer.ExecuteAsync(new(GtfsRouteTests.Archive(shapes: false), "provider"), default)).IsFailed);
        Assert.Empty(session.Routes);
        Assert.Equal(0, session.SaveCount);
    }

    [Fact]
    public async Task NonoverlappingCoverageRemainsSeparateAndOverlapReplacesOnlyCoveredServiceDays()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = Importer(session);
        await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "provider"), default);
        await importer.ExecuteAsync(new(GtfsRouteTests.Archive(addedDate: "20261110", coverageStart: "20261110", coverageEnd: "20261110", calendar: false), "provider"), default);
        Assert.Equal(2, Assert.Single(session.Routes).Paths.Single().Versions.Count);
        await importer.ExecuteAsync(new(GtfsRouteTests.Archive(addedDate: "20261027", coverageStart: "20261027", coverageEnd: "20261027", calendar: false, longitude: "12.12"), "provider"), default);
        var route = Assert.Single(session.Routes);
        Assert.Equal(3, route.Paths.Single().Versions.Count);
        Assert.Contains(route.Paths.Single().Versions, version => version.SourceCoverageStart == new DateOnly(2026, 10, 24) && version.SourceCoverageEnd == new DateOnly(2026, 10, 26)
            && version.Periods.Single().To == new DateOnly(2026, 10, 25));
        Assert.Contains(route.Paths.Single().Versions, version => version.SourceCoverageStart == new DateOnly(2026, 11, 10));
    }

    private static GtfsRoutesImporter Importer(InMemoryRoutePathsSession session) => new(session, TimeProvider.System, new GtfsScheduleParser());
    private static RoutePathWriteRequest Request() => new("Test", null, null, null,
        new("MultiLineString", [[[700000, 5400000], [700100, 5400100]], [[701000, 5401000], [701100, 5401100]]]));
    private static RoutePathWriteRequest AggregateRequest() => new("Two paths", Paths:
    [
        new(null, "Weekday", new DateOnly(2026, 10, 26), new DateOnly(2026, 10, 30), new("MultiLineString", [[[700000, 5400000], [700100, 5400100]]])),
        new(null, "Weekend", new DateOnly(2026, 10, 31), new DateOnly(2026, 11, 1), new("MultiLineString", [[[701000, 5401000], [701100, 5401100]]]))
    ]);
}
