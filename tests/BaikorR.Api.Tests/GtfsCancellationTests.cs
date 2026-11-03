using BaikorR.Core.Importers.Gtfs;

namespace BaikorR.Api.Tests;

public sealed class GtfsCancellationTests
{
    [Fact]
    public void CancelledParserStopsBeforeInterpretingTheArchive()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        var exception = Assert.Throws<OperationCanceledException>(() =>
            new GtfsScheduleParser().Parse([], cancellation.Token));

        Assert.Equal(cancellation.Token, exception.CancellationToken);
    }

    [Fact]
    public async Task CancelledImportDoesNotValidateOrMutateExistingRoutesAndSourceBindings()
    {
        var session = new InMemoryRoutePathsSession();
        var importer = new GtfsRoutesImporter(session, TimeProvider.System, new GtfsScheduleParser());
        Assert.True((await importer.ExecuteAsync(new(GtfsRouteTests.Archive()), default)).IsSuccess);
        var parent = Assert.Single(session.Routes);
        var path = Assert.Single(parent.Paths);
        var version = Assert.Single(path.Versions);
        var binding = Assert.Single(session.ImportSources);
        var saves = session.SaveCount;
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        var exception = await Assert.ThrowsAsync<OperationCanceledException>(() =>
            importer.ExecuteAsync(new([]), cancellation.Token));

        Assert.Equal(cancellation.Token, exception.CancellationToken);
        Assert.Same(parent, Assert.Single(session.Routes));
        Assert.Same(path, Assert.Single(parent.Paths));
        Assert.Same(version, Assert.Single(path.Versions));
        Assert.Same(binding, Assert.Single(session.ImportSources));
        Assert.Equal(saves, session.SaveCount);
    }
}
