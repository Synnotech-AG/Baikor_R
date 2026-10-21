using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Host.Controllers.Api.Antiforgery;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BaikorR.Api.Tests;

public sealed class ErrorContractHttpTests
{
    [Fact]
    public async Task NotFoundResponseContainsAStableErrorKey()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/construction-sites/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(
            "constructionSites.get.notFound",
            body.RootElement.GetProperty("errorKey").GetString());
    }

    [Fact]
    public async Task ValidationResponseContainsFieldErrorKeys()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        Assert.NotNull(token);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/construction-sites")
        {
            Content = JsonContent.Create(new
            {
                title = "",
                status = "draft",
                plannedStart = (DateOnly?)null,
                plannedEnd = (DateOnly?)null,
                areas = Array.Empty<object>()
            })
        };
        request.Headers.Add("X-CSRF-TOKEN", token.Token);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("api.validation.failed", body.RootElement.GetProperty("errorKey").GetString());
        Assert.Equal(
            "constructionSites.validation.title.required",
            body.RootElement
                .GetProperty("errorKeys")
                .GetProperty("title")[0]
                .GetString());
    }

    private static WebApplicationFactory<Host.Program> CreateFactory()
    {
        var session = new InMemoryConstructionSitesSession();
        return new WebApplicationFactory<Host.Program>()
            .WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            {
                services.RemoveAll<IConstructionSitesSession>();
                services.AddSingleton<IConstructionSitesSession>(session);
            }));
    }
}
