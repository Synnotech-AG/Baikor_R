using BaikorR.Api.Features.ConstructionSites.BulkDelete;
using BaikorR.Api.Persistence.Entities;

namespace BaikorR.Api.Tests;

public sealed class BulkDeleteConstructionSitesServiceTests
{
    [Fact]
    public async Task BulkDeleteRemovesAllSelectedConstructionSitesAtomically()
    {
        var session = new InMemoryConstructionSitesSession();
        var first = CreateConstructionSite("First");
        var second = CreateConstructionSite("Second");
        var retained = CreateConstructionSite("Retained");
        session.Add(first);
        session.Add(second);
        session.Add(retained);
        var service = new BulkDeleteConstructionSitesService(
            session,
            new BulkDeleteConstructionSitesRequest.Validator());

        var result = await service.ExecuteAsync(
            new BulkDeleteConstructionSitesRequest([first.Id, second.Id]),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value.DeletedCount);
        Assert.Equal(retained.Id, (await session.ListAsync(10, CancellationToken.None)).Single().Id);
    }

    [Fact]
    public async Task BulkDeleteDoesNotDeleteAnythingWhenOneIdentifierIsMissing()
    {
        var session = new InMemoryConstructionSitesSession();
        var existing = CreateConstructionSite("Existing");
        session.Add(existing);
        var service = new BulkDeleteConstructionSitesService(
            session,
            new BulkDeleteConstructionSitesRequest.Validator());

        var result = await service.ExecuteAsync(
            new BulkDeleteConstructionSitesRequest([existing.Id, Guid.NewGuid()]),
            CancellationToken.None);

        Assert.True(result.IsFailed);
        Assert.Single(await session.ListAsync(10, CancellationToken.None));
    }

    [Fact]
    public async Task BulkDeleteAcceptsMoreThanFiveHundredConstructionSites()
    {
        var session = new InMemoryConstructionSitesSession();
        var constructionSites = Enumerable.Range(1, 501)
            .Select(index => CreateConstructionSite($"Site {index}"))
            .ToArray();
        foreach (var constructionSite in constructionSites)
        {
            session.Add(constructionSite);
        }

        var service = new BulkDeleteConstructionSitesService(
            session,
            new BulkDeleteConstructionSitesRequest.Validator());

        var result = await service.ExecuteAsync(
            new BulkDeleteConstructionSitesRequest(constructionSites.Select(item => item.Id).ToArray()),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(501, result.Value.DeletedCount);
        Assert.Empty(await session.ListAsync(1, CancellationToken.None));
    }

    private static ConstructionSite CreateConstructionSite(string title) => new()
    {
        Id = Guid.NewGuid(),
        Title = title,
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow
    };
}
