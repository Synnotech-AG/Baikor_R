using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Host.Controllers.Api.Antiforgery;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BaikorR.Api.Tests;

public sealed class ConstructionSiteArchiveHttpTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    [Fact]
    public async Task ArchiveKeepsUuidReadableAndIsIdempotent()
    {
        var session = new InMemoryConstructionSitesSession();
        var site = Seed(session);
        await using var factory = CreateFactory(session);
        using var client = factory.CreateClient();
        for (var attempt = 0; attempt < 2; attempt++)
        {
            using var archived = await SendMutation(client, HttpMethod.Delete, $"/api/construction-sites/{site.Id}");
            Assert.Equal(HttpStatusCode.NoContent, archived.StatusCode);
        }

        var response = await client.GetFromJsonAsync<ConstructionSiteResponse>($"/api/construction-sites/{site.Id}", JsonOptions);
        Assert.NotNull(response);
        Assert.True(response.IsDeleted);
        Assert.Equal("source-123", response.Metadata["source.id"]);
        Assert.Equal("History", response.Communications.Single().Note);
        Assert.Equal("Ada", response.Contacts.Single().FirstName);
    }

    [Fact]
    public async Task ArchiveFiltersAreExplicitAndDefaultToActive()
    {
        var session = new InMemoryConstructionSitesSession();
        var active = Seed(session);
        var archived = Seed(session);
        archived.IsDeleted = true;
        await using var factory = CreateFactory(session);
        using var client = factory.CreateClient();

        Assert.Equal(active.Id, Assert.Single((await client.GetFromJsonAsync<ConstructionSiteResponse[]>("/api/construction-sites", JsonOptions))!).Id);
        Assert.Equal(archived.Id, Assert.Single((await client.GetFromJsonAsync<ConstructionSiteResponse[]>("/api/construction-sites?archive=archived", JsonOptions))!).Id);
        Assert.Equal(2, (await client.GetFromJsonAsync<ConstructionSiteResponse[]>("/api/construction-sites?archive=all", JsonOptions))!.Length);
        using var invalid = await client.GetAsync("/api/construction-sites?archive=invalid");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task RestorePreservesDataAndRequiresTheCurrentVersion()
    {
        var session = new InMemoryConstructionSitesSession();
        var site = Seed(session);
        site.IsDeleted = true;
        site.Version = 42;
        await using var factory = CreateFactory(session);
        using var client = factory.CreateClient();

        using var stale = await SendMutation(client, HttpMethod.Post, $"/api/construction-sites/{site.Id}/restore", new { version = 41 });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.True(site.IsDeleted);
        for (var attempt = 0; attempt < 2; attempt++)
        {
            using var restored = await SendMutation(client, HttpMethod.Post, $"/api/construction-sites/{site.Id}/restore", new { version = 42 });
            Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
            var response = await restored.Content.ReadFromJsonAsync<ConstructionSiteResponse>(JsonOptions);
            Assert.NotNull(response);
            Assert.False(response.IsDeleted);
            Assert.Equal("source-123", response.Metadata["source.id"]);
        }
    }

    [Fact]
    public async Task RestoreRejectsMissingVersionAndMissingSite()
    {
        var session = new InMemoryConstructionSitesSession();
        var site = Seed(session);
        site.IsDeleted = true;
        await using var factory = CreateFactory(session);
        using var client = factory.CreateClient();

        using var missingVersion = await SendMutation(client, HttpMethod.Post, $"/api/construction-sites/{site.Id}/restore", new { });
        using var missingSite = await SendMutation(client, HttpMethod.Post, $"/api/construction-sites/{Guid.NewGuid()}/restore", new { version = 0 });

        Assert.Equal(HttpStatusCode.BadRequest, missingVersion.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missingSite.StatusCode);
        Assert.True(site.IsDeleted);
    }

    [Fact]
    public async Task BulkArchivePreservesRowsAndCanBeRepeated()
    {
        var session = new InMemoryConstructionSitesSession();
        var first = Seed(session);
        var second = Seed(session);
        await using var factory = CreateFactory(session);
        using var client = factory.CreateClient();
        for (var attempt = 0; attempt < 2; attempt++)
        {
            using var response = await SendMutation(client, HttpMethod.Post, "/api/construction-sites/bulk-delete", new { ids = new[] { first.Id, second.Id } });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var result = await response.Content.ReadFromJsonAsync<BaikorR.Core.Features.ConstructionSites.BulkDelete.BulkDeleteConstructionSitesResponse>();
            Assert.Equal(2, result!.DeletedCount);
        }

        Assert.True(first.IsDeleted);
        Assert.True(second.IsDeleted);
        Assert.Same(first, await session.GetAsync(first.Id, CancellationToken.None));
        Assert.Same(second, await session.GetAsync(second.Id, CancellationToken.None));
    }

    [Theory]
    [InlineData("update")]
    [InlineData("status")]
    public async Task ArchivedSitesRejectMutations(string operation)
    {
        var session = new InMemoryConstructionSitesSession();
        var site = Seed(session);
        site.IsDeleted = true;
        await using var factory = CreateFactory(session);
        using var client = factory.CreateClient();
        using var response = operation == "status"
            ? await SendMutation(client, HttpMethod.Post, $"/api/construction-sites/{site.Id}/status", new { status = "active" })
            : await SendMutation(client, HttpMethod.Put, $"/api/construction-sites/{site.Id}", new
            {
                title = "Changed", status = "active", areas = Array.Empty<object>(), version = site.Version
            });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("constructionSites.archived", await response.Content.ReadAsStringAsync());
        Assert.Equal("Archived history", site.Title);
        Assert.Equal(ConstructionSiteStatus.Approved, site.Status);
    }

    [Theory]
    [InlineData("delete")]
    [InlineData("bulk-delete")]
    [InlineData("restore")]
    public async Task ArchiveAndRestoreRequireCsrfForCookieSessions(string operation)
    {
        var session = new InMemoryConstructionSitesSession();
        var site = Seed(session);
        site.IsDeleted = operation == "restore";
        await using var factory = CreateFactory(session);
        using var client = factory.CreateClient();
        using var response = operation switch
        {
            "delete" => await client.DeleteAsync($"/api/construction-sites/{site.Id}"),
            "bulk-delete" => await client.PostAsJsonAsync("/api/construction-sites/bulk-delete", new { ids = new[] { site.Id } }),
            _ => await client.PostAsJsonAsync($"/api/construction-sites/{site.Id}/restore", new { version = site.Version })
        };

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(operation == "restore", site.IsDeleted);
    }

    private static ConstructionSite Seed(InMemoryConstructionSitesSession session)
    {
        var site = new ConstructionSite
        {
            Id = Guid.NewGuid(), Title = "Archived history", Status = ConstructionSiteStatus.Approved,
            Metadata = new Dictionary<string, string> { ["source.id"] = "source-123" },
            Contacts = [new ConstructionSiteContact { Id = Guid.NewGuid(), FirstName = "Ada", LastName = "Lovelace", Role = "Owner" }],
            Communications = [new ConstructionSiteCommunication { Id = Guid.NewGuid(), Type = "Notice", Note = "History" }]
        };
        session.Add(site);
        return site;
    }

    private static WebApplicationFactory<Host.Program> CreateFactory(InMemoryConstructionSitesSession session) =>
        new WebApplicationFactory<Host.Program>().WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IConstructionSitesSession>();
            services.AddSingleton<IConstructionSitesSession>(session);
        }));

    private static async Task<HttpResponseMessage> SendMutation(HttpClient client, HttpMethod method, string path, object? body = null)
    {
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        using var request = new HttpRequestMessage(method, path);
        if (body is not null)
        {
            request.Content = JsonContent.Create(body);
        }
        request.Headers.Add("X-CSRF-TOKEN", token!.Token);
        return await client.SendAsync(request);
    }
}
