using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Host.Controllers.Api.Antiforgery;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BaikorR.Api.Tests;

public sealed class ConstructionSiteHttpTests
{
    [Fact]
    public async Task CreatePersistsTheRequestedStatus()
    {
        var session = new InMemoryConstructionSitesSession();
        await using var factory = new WebApplicationFactory<Host.Program>()
            .WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            {
                services.RemoveAll<IConstructionSitesSession>();
                services.AddSingleton<IConstructionSitesSession>(session);
            }));
        using var client = factory.CreateClient();
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        Assert.NotNull(token);

        using var message = new HttpRequestMessage(HttpMethod.Post, "/api/construction-sites")
        {
            Content = JsonContent.Create(new
            {
                title = "Approved construction site",
                status = "approved",
                plannedStart = new DateOnly(2026, 8, 20),
                plannedEnd = new DateOnly(2026, 8, 30),
                areas = new[]
                {
                    new
                    {
                        id = (Guid?)null,
                        name = "Area 1",
                        geometry = new
                        {
                            type = "Polygon",
                            coordinates = new[]
                            {
                                new[]
                                {
                                    new[] { 725000d, 5432000d },
                                    new[] { 725100d, 5432000d },
                                    new[] { 725100d, 5432100d },
                                    new[] { 725000d, 5432100d },
                                    new[] { 725000d, 5432000d }
                                }
                            }
                        }
                    }
                }
            })
        };
        message.Headers.Add("X-CSRF-TOKEN", token.Token);

        var response = await client.SendAsync(message);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var responseBody = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("approved", responseBody.RootElement.GetProperty("status").GetString());
        Assert.Equal(
            ConstructionSiteStatus.Approved,
            (await session.ListAsync(10, CancellationToken.None)).Single().Status);
    }

    [Fact]
    public async Task CreateRoundTripsMetadata()
    {
        var session = new InMemoryConstructionSitesSession();
        await using var factory = new WebApplicationFactory<Host.Program>()
            .WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            {
                services.RemoveAll<IConstructionSitesSession>();
                services.AddSingleton<IConstructionSitesSession>(session);
            }));
        using var client = factory.CreateClient();
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        Assert.NotNull(token);

        using var message = new HttpRequestMessage(HttpMethod.Post, "/api/construction-sites")
        {
            Content = JsonContent.Create(new
            {
                title = "Imported construction site",
                status = "draft",
                plannedStart = (DateOnly?)null,
                plannedEnd = (DateOnly?)null,
                areas = Array.Empty<object>(),
                metadata = new Dictionary<string, string>
                {
                    ["source.projectId"] = "R-10002",
                    ["source.format"] = "shapefile"
                }
            })
        };
        message.Headers.Add("X-CSRF-TOKEN", token.Token);

        var response = await client.SendAsync(message);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var responseBody = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(
            "R-10002",
            responseBody.RootElement.GetProperty("metadata").GetProperty("source.projectId").GetString());
        var persisted = (await session.ListAsync(10, CancellationToken.None)).Single();
        Assert.Equal("shapefile", persisted.Metadata["source.format"]);
    }
}
