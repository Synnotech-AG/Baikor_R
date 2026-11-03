using BaikorR.Core.Features.Routes;
using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Core.Persistence;
using BaikorR.Core.Persistence.Sessions;

namespace BaikorR.Api.Tests;

public sealed class RouteSearchPostgisTests
{
    [PostgisFact]
    public async Task SearchFindsParentDescriptionAndChildNamesWithoutCaseSensitivity()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var route = await AddAsync(context, "Linie 18", "Hauptbahnhof → Prüfening", "Verbindung zur Universität");
        await AddAsync(context, "42", "Ostbahnhof → Gewerbepark");
        var session = new RoutePathsDbSession(context);

        foreach (var term in new[] { "18", "LINIE 18", " hauptBAHNHOF ", "PRÜFENING", "universität" })
        {
            var result = await session.ListAsync(term, false, 1, 25, default);
            Assert.Equal(1, result.TotalCount);
            Assert.Equal(route.Id, Assert.Single(result.Items).Id);
        }
    }

    [PostgisFact]
    public async Task SearchTreatsWildcardCharactersLiterallyAndPreservesInactiveFilteringAndPagination()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var literal = await AddAsync(context, "10", "100%_Nord\\Ost");
        await AddAsync(context, "11", "100xANord Ost");
        var inactive = await AddAsync(context, "12", "100%_Nord\\Ost");
        var service = new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System);
        Assert.True((await service.SuppressAsync(inactive.Id, default)).IsSuccess);
        var session = new RoutePathsDbSession(context);

        foreach (var term in new[] { "100%", "_Nord", "\\Ost" })
        {
            var active = await session.ListAsync(term, false, 1, 25, default);
            Assert.Equal(1, active.TotalCount);
            Assert.Equal(literal.Id, Assert.Single(active.Items).Id);
            var withInactive = await session.ListAsync(term, true, 2, 1, default);
            Assert.Equal(2, withInactive.TotalCount);
            Assert.Equal(inactive.Id, Assert.Single(withInactive.Items).Id);
        }
    }

    private static async Task<RoutePathResponse> AddAsync(BaikorRDbContext context, string title, string pathTitle, string? description = null)
    {
        var request = new RoutePathWriteRequest(title, Description: description, Paths:
        [new(null, pathTitle, null, null, new("MultiLineString", [[[700000, 5400000], [700100, 5400100]]]))]);
        var result = await new RoutePathsService(new RoutePathsDbSession(context), TimeProvider.System).CreateAsync(request, default);
        Assert.True(result.IsSuccess);
        return result.Value;
    }
}
