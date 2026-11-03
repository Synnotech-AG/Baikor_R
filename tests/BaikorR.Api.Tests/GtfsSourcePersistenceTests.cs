using BaikorR.Core.Importers.Gtfs;
using BaikorR.Core.Persistence.Sessions;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Api.Tests;

public sealed class GtfsSourcePersistenceTests
{
    [PostgisFact]
    public async Task LegacyAdoptionPersistsOnlyTheBindingAndRetainsAllSubjectIdsWithoutNewDetectionWork()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        Guid routeId;
        Guid[] pathIds;
        Guid[] versionIds;
        int workCount;
        await using (var context = database.CreateContext())
        {
            var imported = await new GtfsRoutesImporter(new RoutePathsDbSession(context), TimeProvider.System, new())
                .ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive(), "legacy-provider"), default);
            Assert.True(imported.IsSuccess);
            context.GtfsImportSources.RemoveRange(context.GtfsImportSources);
            await context.SaveChangesAsync(); // Simulate data imported before source mappings existed.
            routeId = (await context.RouteDefinitions.SingleAsync()).Id;
            pathIds = await context.RoutePaths.Select(path => path.Id).OrderBy(id => id).ToArrayAsync();
            versionIds = await context.RoutePathVersions.Select(version => version.Id).OrderBy(id => id).ToArrayAsync();
            workCount = await context.AlertDetectionWork.CountAsync();
        }
        await using (var context = database.CreateContext())
        {
            var imported = await new GtfsRoutesImporter(new RoutePathsDbSession(context), TimeProvider.System, new())
                .ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive()), default);
            Assert.True(imported.IsSuccess);
            Assert.Equal("legacy-provider", imported.Value.SourceId);
            Assert.Equal(0, imported.Value.CreatedCount);
            Assert.Equal(0, imported.Value.UpdatedCount);
            Assert.Equal(1, imported.Value.UnchangedCount);
        }
        await using (var context = database.CreateContext())
        {
            Assert.Equal("legacy-provider", (await context.GtfsImportSources.SingleAsync()).SourceId);
            Assert.Equal(routeId, (await context.RouteDefinitions.SingleAsync()).Id);
            Assert.Equal(pathIds, await context.RoutePaths.Select(path => path.Id).OrderBy(id => id).ToArrayAsync());
            Assert.Equal(versionIds, await context.RoutePathVersions.Select(version => version.Id).OrderBy(id => id).ToArrayAsync());
            Assert.Equal(workCount, await context.AlertDetectionWork.CountAsync());
        }
    }

    [PostgisFact]
    public async Task BindingSurvivesFreshSessionsAndPreviewWritesNothing()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        Guid routeId;
        string sourceId;
        await using (var context = database.CreateContext())
        {
            var initialWork = await context.AlertDetectionWork.CountAsync();
            var preview = await new GtfsRoutesImporter(new RoutePathsDbSession(context), TimeProvider.System, new())
                .ExecuteAsync(new(GtfsRouteTests.Archive(), Preview: true), default);
            Assert.True(preview.IsSuccess);
            Assert.False(await context.GtfsImportSources.AnyAsync());
            Assert.False(await context.RouteDefinitions.AnyAsync());
            Assert.Equal(initialWork, await context.AlertDetectionWork.CountAsync());
        }
        await using (var context = database.CreateContext())
        {
            var imported = await new GtfsRoutesImporter(new RoutePathsDbSession(context), TimeProvider.System, new())
                .ExecuteAsync(new(GtfsRouteTests.Archive()), default);
            Assert.True(imported.IsSuccess);
            routeId = (await context.RouteDefinitions.SingleAsync()).Id;
            sourceId = imported.Value.SourceId;
        }
        await using (var context = database.CreateContext())
        {
            Assert.Equal(sourceId, (await context.GtfsImportSources.SingleAsync()).SourceId);
            var result = await new GtfsRoutesImporter(new RoutePathsDbSession(context), TimeProvider.System, new())
                .ExecuteAsync(new(GtfsRouteTests.Archive(longitude: "12.1001")), default);
            Assert.True(result.IsSuccess);
            Assert.Equal(sourceId, result.Value.SourceId);
            Assert.Equal(routeId, (await context.RouteDefinitions.SingleAsync()).Id);
            Assert.Equal(1, result.Value.UpdatedCount);
            Assert.Equal(1, result.Value.UpdatedPathCount);
            Assert.Equal(1, await context.GtfsImportSources.CountAsync());
            Assert.Equal(2, await context.AlertDetectionWork.CountAsync(work => work.Kind == "routeDefinition"));
        }
    }
}
