using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using BaikorR.Core.Features.Routes;
using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Core.Importers.Gtfs;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Host.Controllers.Api.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace BaikorR.Api.Tests;

public sealed class RoutePathsHttpTests
{
    [Fact]
    public async Task PathDeleteRequiresEditorCsrfParentVersionAndOwnershipAndReturnsActiveParent()
    {
        var database = new InMemoryRoutePathsSession();
        var service = new RoutePathsService(database, TimeProvider.System);
        var route = (await service.CreateAsync(Request(), default)).Value;
        var other = (await service.CreateAsync(Request(), default)).Value;
        var parent = database.Routes.Single(item => item.Id == route.Id);
        var path = Assert.Single(parent.Paths);
        parent.Version = 7;
        var endpoint = $"/api/routes/{route.Id}/paths/{path.Id}";
        await using var factory = Factory(database);
        using var anonymous = factory.CreateClient(new() { BaseAddress = new("https://localhost"), AllowAutoRedirect = false });
        using var unauthenticated = await DeleteJsonAsync(anonymous, endpoint, new { version = 7 });
        Assert.Equal(HttpStatusCode.Found, unauthenticated.StatusCode);
        foreach (var role in new[] { "baikor_viewer", "baikor_importer" })
        {
            using var viewer = Client(factory, role);
            var viewerToken = await viewer.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
            viewer.DefaultRequestHeaders.Add("X-CSRF-TOKEN", viewerToken!.Token);
            using var forbidden = await DeleteJsonAsync(viewer, endpoint, new { version = 7 });
            Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        }
        using var editor = Client(factory, "baikor_editor");
        using var csrf = await DeleteJsonAsync(editor, endpoint, new { version = 7 });
        Assert.Equal(HttpStatusCode.BadRequest, csrf.StatusCode);
        var token = await editor.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        editor.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!.Token);
        using var stale = await DeleteJsonAsync(editor, endpoint, new { version = 6 });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using var missing = await DeleteJsonAsync(editor, endpoint, new { });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        using var foreign = await DeleteJsonAsync(editor, $"/api/routes/{route.Id}/paths/{other.Paths[0].Id}", new { version = 7 });
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        using var unknown = await DeleteJsonAsync(editor, $"/api/routes/{Guid.NewGuid()}/paths/{path.Id}", new { version = 7 });
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        parent.IsSuppressed = true;
        using var hidden = await DeleteJsonAsync(editor, endpoint, new { version = 7 });
        Assert.Equal(HttpStatusCode.Conflict, hidden.StatusCode);
        Assert.False(path.IsSuppressed);
        parent.IsSuppressed = false;
        using var deleted = await DeleteJsonAsync(editor, endpoint, new { version = 7 });
        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
        var response = (await deleted.Content.ReadFromJsonAsync<RoutePathResponse>())!;
        Assert.Equal(route.Id, response.Id);
        Assert.False(response.IsSuppressed);
        Assert.True(Assert.Single(response.Paths).IsSuppressed);
        Assert.False(Assert.Single((await editor.GetFromJsonAsync<RoutePathsPage>("/api/routes"))!.Items, item => item.Id == route.Id).IsSuppressed);
        Assert.False(database.Routes.Single(item => item.Id == other.Id).Paths[0].IsSuppressed);
        var saves = database.SaveCount;
        using var repeated = await DeleteJsonAsync(editor, endpoint, new { version = 7 });
        Assert.Equal(HttpStatusCode.OK, repeated.StatusCode);
        Assert.Equal(saves, database.SaveCount);
    }

    [Fact]
    public async Task PathRestoreRequiresEditorCsrfParentVersionAndOwnership()
    {
        var database = new InMemoryRoutePathsSession();
        var service = new RoutePathsService(database, TimeProvider.System);
        var route = (await service.CreateAsync(Request(), default)).Value;
        var parent = Assert.Single(database.Routes);
        var path = Assert.Single(parent.Paths);
        path.IsSuppressed = true;
        await using var factory = Factory(database);
        using var viewer = Client(factory, "baikor_viewer");
        var viewerToken = await viewer.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        viewer.DefaultRequestHeaders.Add("X-CSRF-TOKEN", viewerToken!.Token);
        var endpoint = $"/api/routes/{route.Id}/paths/{path.Id}/restore";
        using var forbidden = await viewer.PostAsJsonAsync(endpoint, new { version = 0 });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        using var editor = Client(factory, "baikor_editor");
        using var csrf = await editor.PostAsJsonAsync(endpoint, new { version = 0 });
        Assert.Equal(HttpStatusCode.BadRequest, csrf.StatusCode);
        var token = await editor.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        editor.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!.Token);
        using var stale = await editor.PostAsJsonAsync(endpoint, new { version = 1 });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using var missing = await editor.PostAsJsonAsync(endpoint, new { });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        using var foreign = await editor.PostAsJsonAsync($"/api/routes/{route.Id}/paths/{Guid.NewGuid()}/restore", new { version = 0 });
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        parent.IsSuppressed = true;
        using var hidden = await editor.PostAsJsonAsync(endpoint, new { version = 0 });
        Assert.Equal(HttpStatusCode.Conflict, hidden.StatusCode);
        Assert.True(path.IsSuppressed);
        parent.IsSuppressed = false;
        using var restore = await editor.PostAsJsonAsync(endpoint, new { version = 0 });
        Assert.Equal(HttpStatusCode.OK, restore.StatusCode);
        Assert.False(Assert.Single((await restore.Content.ReadFromJsonAsync<RoutePathResponse>())!.Paths).IsSuppressed);
        Assert.False(path.IsSuppressed);
        Assert.Equal(0u, database.ExpectedVersion);
    }

    [Fact]
    public async Task EditorCreatesNamedPathsAndRejectsForeignPathUpdateWithCsrf()
    {
        var database = new InMemoryRoutePathsSession();
        await using var factory = Factory(database);
        using var client = Client(factory, "baikor_editor");
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!.Token);
        var input = new RoutePathWriteRequest("Grouped", Paths:
        [
            new(null, "Outbound", null, null, Request().Geometry!),
            new(null, "Inbound", null, null, new("MultiLineString", [[[700100, 5400100], [700000, 5400000]]]))
        ]);
        using var create = await client.PostAsJsonAsync("/api/routes", input);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var route = (await create.Content.ReadFromJsonAsync<RoutePathResponse>())!;
        Assert.Equal(2, route.Paths.Count);
        var legacyLink = await client.GetFromJsonAsync<RoutePathResponse>($"/api/routes/{route.Paths[0].Id}");
        Assert.Equal(route.Id, legacyLink!.Id);
        using var bad = await client.PutAsJsonAsync($"/api/routes/{route.Id}", input with
        {
            Version = 0, Paths = [input.Paths![0] with { Id = Guid.NewGuid() }]
        });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Equal(2, (await client.GetFromJsonAsync<RoutePathResponse>($"/api/routes/{route.Id}"))!.Paths.Count);
    }

    [Fact]
    public async Task RestoreRequiresEditorCsrfAndCurrentVersion()
    {
        var database = new InMemoryRoutePathsSession();
        var service = new RoutePathsService(database, TimeProvider.System);
        var route = (await service.CreateAsync(Request(), default)).Value;
        await service.SuppressAsync(route.Id, default);
        await using var factory = Factory(database);
        using var anonymous = factory.CreateClient(new() { BaseAddress = new("https://localhost"), AllowAutoRedirect = false });
        using var unauthenticated = await anonymous.PostAsJsonAsync($"/api/routes/{route.Id}/restore", new { version = 0 });
        Assert.Equal(HttpStatusCode.Found, unauthenticated.StatusCode);
        Assert.StartsWith("https://identity.example.invalid/authorize", unauthenticated.Headers.Location!.AbsoluteUri);
        using var viewer = Client(factory, "baikor_viewer");
        var viewerToken = await viewer.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        viewer.DefaultRequestHeaders.Add("X-CSRF-TOKEN", viewerToken!.Token);
        using var forbidden = await viewer.PostAsJsonAsync($"/api/routes/{route.Id}/restore", new { version = 0 });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        using var editor = Client(factory, "baikor_editor");
        using var csrf = await editor.PostAsJsonAsync($"/api/routes/{route.Id}/restore", new { version = 0 });
        Assert.Equal(HttpStatusCode.BadRequest, csrf.StatusCode);
        var token = await editor.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        editor.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!.Token);
        using var stale = await editor.PostAsJsonAsync($"/api/routes/{route.Id}/restore", new { version = 1 });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.True(database.Routes.Single().IsSuppressed);
        using var missing = await editor.PostAsJsonAsync($"/api/routes/{route.Id}/restore", new { });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        using var restored = await editor.PostAsJsonAsync($"/api/routes/{route.Id}/restore", new { version = 0 });
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
        Assert.False((await restored.Content.ReadFromJsonAsync<RoutePathResponse>())!.IsSuppressed);
    }

    [Fact]
    public async Task EditorCreatesListsAndSuppressesRouteWithCookieCsrf()
    {
        var database = new InMemoryRoutePathsSession();
        await using var factory = Factory(database);
        using var client = Client(factory, "baikor_editor");
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        Assert.NotNull(token);
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token.Token);
        using var created = await client.PostAsJsonAsync("/api/routes", Request());
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var route = await created.Content.ReadFromJsonAsync<RoutePathResponse>();
        Assert.NotNull(route);
        var list = await client.GetFromJsonAsync<RoutePathsPage>("/api/routes?page=1&pageSize=10");
        Assert.Equal(route.Id, Assert.Single(list!.Items).Id);
        using var suppressed = await client.DeleteAsync($"/api/routes/{route.Id}");
        Assert.Equal(HttpStatusCode.NoContent, suppressed.StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<RoutePathsPage>("/api/routes"))!.Items);
        using var hidden = await client.GetAsync($"/api/routes/{route.Id}");
        Assert.Equal(HttpStatusCode.NotFound, hidden.StatusCode);
        Assert.True((await client.GetFromJsonAsync<RoutePathResponse>($"/api/routes/{route.Id}?includeSuppressed=true"))!.IsSuppressed);
        Assert.Single((await client.GetFromJsonAsync<RoutePathsPage>("/api/routes?includeSuppressed=true"))!.Items);
    }

    [Theory]
    [InlineData("baikor_viewer", "POST")]
    [InlineData("baikor_importer", "GET")]
    [InlineData("baikor_importer", "POST")]
    public async Task ViewerAndImportOnlyAccountsAreDeniedRouteWritesOrReads(string role, string method)
    {
        var database = new InMemoryRoutePathsSession();
        await using var factory = Factory(database);
        using var client = Client(factory, role);
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        using var request = new HttpRequestMessage(new HttpMethod(method), "/api/routes");
        request.Headers.Add("X-CSRF-TOKEN", token!.Token);
        if (method == "POST")
        {
            request.Content = JsonContent.Create(Request());
        }
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Empty(database.Routes);
    }

    [Fact]
    public async Task EditorCookieCannotCreateOrImportWithoutCsrf()
    {
        var database = new InMemoryRoutePathsSession();
        await using var factory = Factory(database);
        using var client = Client(factory, "baikor_editor");
        using var create = await client.PostAsJsonAsync("/api/routes", Request());
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
        using var body = new MultipartFormDataContent();
        body.Add(new ByteArrayContent(GtfsRouteTests.Archive()), "file", "feed.zip");
        body.Add(new StringContent("provider"), "sourceId");
        using var import = await client.PostAsync("/api/routes/imports/gtfs", body);
        Assert.Equal(HttpStatusCode.BadRequest, import.StatusCode);
        Assert.Empty(database.Routes);
    }

    [Fact]
    public async Task ExplicitGtfsSourceRemainsSupportedForPreview()
    {
        var database = new InMemoryRoutePathsSession();
        await using var factory = Factory(database);
        using var client = Client(factory, "baikor_editor");
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!.Token);
        using var body = new MultipartFormDataContent();
        body.Add(new ByteArrayContent(GtfsRouteTests.Archive()), "file", "untrusted-filename.zip");
        body.Add(new StringContent("provider"), "sourceId");
        body.Add(new StringContent("true"), "preview");
        using var preview = await client.PostAsync("/api/routes/imports/gtfs", body);
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        Assert.Equal(1, (await preview.Content.ReadFromJsonAsync<GtfsRoutesImportResponse>())!.CreatedCount);
        Assert.Empty(database.Routes);
    }

    [Fact]
    public async Task SourceCanBeOmittedAndFilenameDoesNotChangeTheProviderBinding()
    {
        var database = new InMemoryRoutePathsSession();
        await using var factory = Factory(database);
        using var client = Client(factory, "baikor_editor");
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!.Token);
        string? source = null;
        Guid? routeId = null;
        foreach (var filename in new[] { "first.zip", "different-name.zip" })
        {
            using var body = new MultipartFormDataContent();
            body.Add(new ByteArrayContent(GtfsRouteTests.Archive()), "file", filename);
            using var response = await client.PostAsync("/api/routes/imports/gtfs", body);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var imported = (await response.Content.ReadFromJsonAsync<GtfsRoutesImportResponse>())!;
            Assert.Equal(source ?? imported.SourceId, imported.SourceId);
            source = imported.SourceId;
            var parent = Assert.Single(database.Routes);
            Assert.Equal(routeId ?? parent.Id, parent.Id);
            routeId = parent.Id;
        }
        Assert.Single(database.ImportSources);
        Assert.Equal(1, database.SaveCount);
    }

    [Theory]
    [InlineData("")]
    [InlineData("Invalid Source")]
    public async Task SuppliedInvalidSourcesCannotFallBackToAutomaticMode(string source)
    {
        var database = new InMemoryRoutePathsSession();
        await using var factory = Factory(database);
        using var client = Client(factory, "baikor_editor");
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token!.Token);
        using var body = new MultipartFormDataContent();
        body.Add(new ByteArrayContent(GtfsRouteTests.Archive()), "file", "feed.zip");
        body.Add(new StringContent(source), "sourceId");
        using var response = await client.PostAsync("/api/routes/imports/gtfs", body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(database.ImportSources);
        Assert.Empty(database.Routes);
    }

    private static async Task<HttpResponseMessage> DeleteJsonAsync(HttpClient client, string endpoint, object body)
    {
        using var request = new HttpRequestMessage(HttpMethod.Delete, endpoint) { Content = JsonContent.Create(body) };
        return await client.SendAsync(request);
    }

    private static WebApplicationFactory<Host.Program> Factory(InMemoryRoutePathsSession database) =>
        new WebApplicationFactory<Host.Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Authentication:Enabled", "true");
            builder.UseSetting("Authentication:Authority", "https://identity.example.invalid/realms/test");
            builder.UseSetting("Authentication:ClientId", "baikor-r");
            builder.UseSetting("Authentication:ClientSecret", "test-only-not-a-real-secret");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IRoutePathsSession>();
                services.AddSingleton<IRoutePathsSession>(database);
                services.AddScoped<IRoutePathsService, RoutePathsService>();
                services.AddScoped<IGtfsRoutesImporter, GtfsRoutesImporter>();
                services.AddSingleton<GtfsScheduleParser>();
                services.Configure<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme, options =>
                    options.Configuration = new OpenIdConnectConfiguration
                    {
                        Issuer = "https://identity.example.invalid/realms/test", AuthorizationEndpoint = "https://identity.example.invalid/authorize",
                        TokenEndpoint = "https://identity.example.invalid/token", EndSessionEndpoint = "https://identity.example.invalid/logout"
                    });
            });
        });

    private static HttpClient Client(WebApplicationFactory<Host.Program> factory, string role)
    {
        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        var scheme = CookieAuthenticationDefaults.AuthenticationScheme;
        var options = factory.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(scheme);
        var identity = new ClaimsIdentity([new Claim("sub", "route-editor"), new Claim("preferred_username", "Test"), new Claim("roles", role)], scheme, "preferred_username", "roles");
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), scheme);
        client.DefaultRequestHeaders.Add("Cookie", options.Cookie.Name + "=" + options.TicketDataFormat.Protect(ticket));
        return client;
    }

    private static RoutePathWriteRequest Request() => new("Manual route", null, null, null,
        new("MultiLineString", [[[700000, 5400000], [700100, 5400100]]]));
}
