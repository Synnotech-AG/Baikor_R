using BaikorR.Core.Importers.Gtfs;

namespace BaikorR.Api.Tests;

public sealed class GtfsSourceResolutionTests
{
    [Fact]
    public async Task MissingSourceIdCreatesAndReusesAProviderNamespace()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = new GtfsRoutesImporter(session, TimeProvider.System, new());
        var first = await importer.ExecuteAsync(new(GtfsRouteTests.TwoPathsArchive()), default);
        Assert.True(first.IsSuccess, string.Join("; ", first.Errors));
        Assert.StartsWith("gtfs-", first.Value.SourceId);
        var routeId = Assert.Single(session.Routes).Id;
        var pathIds = session.Routes.Single().Paths.Select(path => path.Id).Order().ToArray();
        var changed = GtfsRouteTests.Rewrite(GtfsRouteTests.TwoPathsArchive(), "routes.txt",
            "route_id,agency_id,route_short_name,route_long_name,route_type\nR1,A1,Changed,Test route,3\n");
        changed = GtfsRouteTests.Rewrite(changed, "shapes.txt",
            "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nS1,49.0,12.1001,1\nS1,49.01,12.11,2\nS2,49.0,12.1,1\nS2,49.02,12.12,2\n");
        var second = await importer.ExecuteAsync(new(changed), default);
        Assert.True(second.IsSuccess, string.Join("; ", second.Errors));
        Assert.Equal(first.Value.SourceId, second.Value.SourceId);
        Assert.Equal(1, second.Value.UpdatedCount);
        Assert.Equal(routeId, Assert.Single(session.Routes).Id);
        Assert.Equal(pathIds, session.Routes.Single().Paths.Select(path => path.Id).Order());
        Assert.Single(session.ImportSources);
        Assert.Equal(1, second.Value.UpdatedPathCount);
    }

    [Fact]
    public async Task PreviewAndInvalidAutomaticMetadataNeverCreateBindingsOrRoutes()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = new GtfsRoutesImporter(session, TimeProvider.System, new());
        var preview = await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), Preview: true), default);
        Assert.True(preview.IsSuccess);
        Assert.Empty(session.ImportSources);
        Assert.Empty(session.Routes);
        Assert.Equal(0, session.SaveCount);

        var missing = GtfsRouteTests.Rewrite(GtfsRouteTests.Archive(), "agency.txt", "agency_timezone\nEurope/Berlin\n");
        var failed = await importer.ExecuteAsync(new(missing), default);
        Assert.True(failed.IsFailed);
        Assert.Equal("routes.import.sourceIdentity.missing", Assert.Single(failed.Errors).Metadata["Key"]);
        Assert.Empty(session.ImportSources);
        Assert.Empty(session.Routes);
        Assert.Equal(0, session.SaveCount);
        Assert.True((await importer.ExecuteAsync(new(missing, "explicit-source"), default)).IsSuccess);
    }

    [Fact]
    public void CanonicalProviderMetadataIgnoresNamesVersionsDatesAndRowOrder()
    {
        var original = GtfsRouteTests.Rewrite(GtfsRouteTests.Archive(), "agency.txt",
            "agency_id,agency_name,agency_url,agency_timezone\nA1,First,http://www.example.invalid/,Europe/Berlin\nA2,Second,https://agency.invalid/,Europe/Berlin\n");
        var changed = GtfsRouteTests.Rewrite(original, "agency.txt",
            "agency_id,agency_name,agency_url,agency_timezone\nA2,Renamed,https://agency.invalid,Europe/Berlin\nA1,Other,https://example.invalid,Europe/Berlin\n");
        changed = GtfsRouteTests.Rewrite(changed, "feed_info.txt",
            "feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version\nRenamed publisher,http://www.example.invalid/,en,20261020,20261030,NEW-VERSION\n");
        var parser = new GtfsScheduleParser();
        Assert.NotNull(parser.Parse(original).SourceIdentity);
        Assert.Equal(parser.Parse(original).SourceIdentity, parser.Parse(changed).SourceIdentity);
    }

    [Fact]
    public async Task OptionalPublisherMetadataAndAgencyIdsCannotCreateDuplicateNamespaces()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = new GtfsRoutesImporter(session, TimeProvider.System, new());
        var original = GtfsRouteTests.Rewrite(GtfsRouteTests.Archive(), "feed_info.txt",
            "feed_publisher_name,feed_publisher_url,feed_lang\n");
        original = GtfsRouteTests.Rewrite(original, "agency.txt",
            "agency_name,agency_url,agency_timezone\nFirst,https://example.invalid,Europe/Berlin\n");
        var first = await importer.ExecuteAsync(new(original), default);
        Assert.True(first.IsSuccess);
        var routeId = Assert.Single(session.Routes).Id;
        var changed = GtfsRouteTests.Rewrite(GtfsRouteTests.Archive(), "feed_info.txt",
            "feed_publisher_name,feed_publisher_url,feed_lang\nA new publisher,https://other-publisher.invalid,en\n");
        var second = await importer.ExecuteAsync(new(changed), default);
        Assert.True(second.IsSuccess);
        Assert.Equal(first.Value.SourceId, second.Value.SourceId);
        Assert.Equal(routeId, Assert.Single(session.Routes).Id);
        Assert.Equal(0, second.Value.CreatedCount);
        Assert.Single(session.ImportSources);
    }

    [Fact]
    public async Task UniqueExactLegacyBindingIsAdoptedWithoutChangingIdsOrCalendarVersions()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = new GtfsRoutesImporter(session, TimeProvider.System, new());
        var feed = GtfsRouteTests.TwoPathsArchive();
        await importer.ExecuteAsync(new(feed, "legacy-provider"), default);
        session.ImportSources.Clear(); // Existing data from before provider bindings were stored.
        var parent = Assert.Single(session.Routes);
        var paths = parent.Paths.Select(path => path.Id).Order().ToArray();
        var versions = parent.Paths.SelectMany(path => path.Versions).Select(version => version.Id).Order().ToArray();
        parent.Paths[0].IsSuppressed = true;
        var preview = await importer.ExecuteAsync(new(feed, Preview: true), default);
        Assert.True(preview.IsSuccess);
        Assert.Equal("legacy-provider", preview.Value.SourceId);
        Assert.Empty(session.ImportSources);
        Assert.Equal(1, session.SaveCount);

        var result = await importer.ExecuteAsync(new(feed), default);
        Assert.True(result.IsSuccess);
        Assert.Equal("legacy-provider", result.Value.SourceId);
        Assert.Equal(parent.Id, Assert.Single(session.Routes).Id);
        Assert.Equal(paths, parent.Paths.Select(path => path.Id).Order());
        Assert.Equal(versions, parent.Paths.SelectMany(path => path.Versions).Select(version => version.Id).Order());
        Assert.True(parent.Paths[0].IsSuppressed);
        Assert.Equal("legacy-provider", Assert.Single(session.ImportSources).SourceId);
        Assert.Equal(2, session.SaveCount);
    }

    [Fact]
    public async Task AmbiguousLegacyBindingsFailWithoutGuessingOrWriting()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = new GtfsRoutesImporter(session, TimeProvider.System, new());
        await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "first"), default);
        await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "second"), default);
        session.ImportSources.Clear();
        var ids = session.Routes.Select(route => route.Id).Order().ToArray();
        var result = await importer.ExecuteAsync(new(GtfsRouteTests.Archive()), default);
        Assert.True(result.IsFailed);
        Assert.Equal("routes.import.sourceIdentity.ambiguous", Assert.Single(result.Errors).Metadata["Key"]);
        Assert.Empty(session.ImportSources);
        Assert.Equal(ids, session.Routes.Select(route => route.Id).Order());
        Assert.Equal(2, session.SaveCount);
    }

    [Fact]
    public async Task UnrelatedProviderWithSameExternalIdsCannotAdoptDifferentGeometry()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = new GtfsRoutesImporter(session, TimeProvider.System, new());
        await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "existing"), default);
        session.ImportSources.Clear();
        var old = Assert.Single(session.Routes);
        var incoming = GtfsRouteTests.Rewrite(GtfsRouteTests.Archive(longitude: "12.2"), "agency.txt",
            "agency_id,agency_url,agency_timezone\nA1,https://other.invalid,Europe/Berlin\n");
        var result = await importer.ExecuteAsync(new(incoming), default);
        Assert.True(result.IsSuccess);
        Assert.NotEqual("existing", result.Value.SourceId);
        Assert.Equal(1, result.Value.CreatedCount);
        Assert.Equal(2, session.Routes.Count);
        Assert.Same(old, session.Routes.Single(route => route.SourceId == "existing"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("Provider Name")]
    [InlineData("../provider")]
    public async Task ExplicitInvalidSourceIdsRemainRejected(string sourceId)
    {
        var session = new InMemoryRoutePathsSession();
        var result = await new GtfsRoutesImporter(session, TimeProvider.System, new())
            .ExecuteAsync(new(GtfsRouteTests.Archive(), sourceId), default);
        Assert.True(result.IsFailed);
        Assert.Equal("routes.import.sourceId.invalid", Assert.Single(result.Errors).Metadata["Key"]);
        Assert.Empty(session.Routes);
        Assert.Empty(session.ImportSources);
    }

    [Fact]
    public async Task ExplicitSourceCanResolveAmbiguousLegacyDataWithoutRebindingAnotherNamespace()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = new GtfsRoutesImporter(session, TimeProvider.System, new());
        await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "first"), default);
        await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "second"), default);
        session.ImportSources.Clear();
        var choice = await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "second"), default);
        Assert.True(choice.IsSuccess);
        Assert.Equal("second", Assert.Single(session.ImportSources).SourceId);
        Assert.Equal("second", (await importer.ExecuteAsync(new(GtfsRouteTests.Archive()), default)).Value.SourceId);
        var explicitOther = await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "first"), default);
        Assert.True(explicitOther.IsSuccess);
        Assert.Equal("first", explicitOther.Value.SourceId);
        Assert.Equal("second", Assert.Single(session.ImportSources).SourceId);
    }

    [Fact]
    public async Task FailedValidationAndCancellationCannotPersistAProposedBinding()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = new GtfsRoutesImporter(session, TimeProvider.System, new());
        await importer.ExecuteAsync(new(GtfsRouteTests.Archive(), "legacy"), default);
        session.ImportSources.Clear();
        session.Routes.Single().Paths.Single().Versions.Single().ServiceDayCalendarJson = null;
        var failed = await importer.ExecuteAsync(new(GtfsRouteTests.Archive()), default);
        Assert.True(failed.IsFailed);
        Assert.Empty(session.ImportSources);
        Assert.Equal(1, session.SaveCount);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            importer.ExecuteAsync(new(GtfsRouteTests.Archive()), cancellation.Token));
        Assert.Empty(session.ImportSources);
        Assert.Equal(1, session.SaveCount);
    }

    [Fact]
    public void ValidFeedsDoNotReturnGenericPrecisionProseAsImportWarnings()
    {
        var parsed = new GtfsScheduleParser().Parse(GtfsRouteTests.Archive());
        Assert.DoesNotContain(parsed.Warnings, message => message.Contains("Date-level potential overlap", StringComparison.Ordinal));
    }
}
