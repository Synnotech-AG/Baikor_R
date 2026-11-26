using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.RegularExpressions;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Host.Controllers.Api.Antiforgery;
using BaikorR.Host.Controllers.Api.Me;
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

public sealed class AuthorizationHttpTests
{
    private static readonly DateTimeOffset SessionTestTime = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData("GET", "/api/me")]
    [InlineData("POST", "/api/construction-sites")]
    public async Task ExpiredBrowserSessionReturnsUnauthorizedBeforeControllerRuns(string method, string path)
    {
        await using var factory = CreateFactory(clock: new FixedTimeProvider(SessionTestTime));
        using var client = CreateAuthenticatedClient(factory, ["baikor_editor"], "expired", new AuthenticationProperties
        {
            IssuedUtc = SessionTestTime.AddHours(-8),
            ExpiresUtc = SessionTestTime.AddSeconds(-1)
        });
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        request.Headers.Add("X-Baikor-Session", "1");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.False(response.Headers.Contains("Set-Cookie"));
    }

    [Theory]
    [InlineData("/api/me", true, true, "30", false)]
    [InlineData("/api/construction-sites", true, true, "30", false)]
    [InlineData("/api/me", false, true, "120", true)]
    [InlineData("/api/me", false, false, "30", false)]
    public async Task BrowserSessionReportsEffectiveCookieLifetime(
        string path, bool passive, bool allowRefresh, string expectedSeconds, bool renewed)
    {
        await using var factory = CreateFactory(clock: new FixedTimeProvider(SessionTestTime));
        using var client = CreateAuthenticatedClient(factory, ["baikor_viewer"], "viewer", new AuthenticationProperties
        {
            IssuedUtc = SessionTestTime.AddSeconds(-90),
            ExpiresUtc = SessionTestTime.AddSeconds(30),
            AllowRefresh = allowRefresh
        });
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add("X-Baikor-Session", "1");
        if (passive)
        {
            request.Headers.Add("X-Baikor-Session-Probe", "1");
        }

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(expectedSeconds, Assert.Single(response.Headers.GetValues("X-Baikor-Session-Remaining")));
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(renewed, response.Headers.TryGetValues("Set-Cookie", out var cookies)
            && cookies.Any(cookie => cookie.StartsWith("__Host-BaikorR.Auth=")));
    }

    [Fact]
    public async Task BrowserSessionRoleFailureRemainsForbidden()
    {
        await using var factory = CreateFactory();
        using var client = CreateAuthenticatedClient(factory, "baikor_viewer");
        client.DefaultRequestHeaders.Add("X-Baikor-Session", "1");

        using var response = await client.GetAsync("/api/settings/mail-import");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public void BrowserSessionLifetimeCanBeConfigured()
    {
        using var factory = CreateFactory().WithWebHostBuilder(
            builder => builder.UseSetting("Authentication:BrowserSessionLifetime", "00:00:20"));
        var cookie = factory.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(CookieAuthenticationDefaults.AuthenticationScheme);

        Assert.Equal(TimeSpan.FromSeconds(20), cookie.ExpireTimeSpan);
    }

    [Fact]
    public void BrowserSessionRejectsNonPositiveLifetime()
    {
        using var factory = CreateFactory().WithWebHostBuilder(
            builder => builder.UseSetting("Authentication:BrowserSessionLifetime", "00:00:00"));

        Assert.Contains("BrowserSessionLifetime", Assert.Throws<InvalidOperationException>(() => factory.Services).Message);
    }

    [Theory]
    [InlineData("baikor_viewer")]
    [InlineData("baikor_editor")]
    [InlineData("baikor_approver")]
    [InlineData("baikor_importer")]
    public async Task EveryMailImportEndpointRequiresAdministrator(string role)
    {
        await using var factory = CreateFactory();
        using var client = CreateAuthenticatedClient(factory, role);
        foreach (var (method, path) in new[]
        {
            ("GET", ""), ("PUT", ""), ("POST", "/test"), ("POST", "/check"),
            ("GET", "/status"), ("GET", "/history"), ("POST", $"/history/{Guid.NewGuid()}/retry")
        })
        {
            using var request = new HttpRequestMessage(new HttpMethod(method), "/api/settings/mail-import" + path);
            using var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }
    }

    [Theory]
    [InlineData("PUT", "")]
    [InlineData("POST", "/test")]
    [InlineData("POST", "/check")]
    [InlineData("POST", "/history/00000000-0000-0000-0000-000000000001/retry")]
    public async Task MailImportCookieMutationsRequireAntiforgery(string method, string path)
    {
        await using var factory = CreateFactory();
        using var client = CreateAuthenticatedClient(factory, "baikor_admin");
        using var request = new HttpRequestMessage(new HttpMethod(method), "/api/settings/mail-import" + path)
        {
            Content = JsonContent.Create(new { })
        };
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/construction-sites")]
    [InlineData("/index.html")]
    public async Task AppShellCannotBeStoredAcrossLoginAndLogout(string path)
    {
        var webRoot = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "../../../../../src/baikor-r-web"));
        await using var factory = CreateFactory(webRoot: webRoot);
        using var client = CreateAuthenticatedClient(factory, "baikor_viewer");

        using var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("<div id=\"root\"></div>", await response.Content.ReadAsStringAsync());
        Assert.True(response.Headers.CacheControl?.NoStore);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/construction-sites")]
    public async Task RevalidatingAppShellAfterLogoutRequiresLogin(string path)
    {
        var webRoot = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "../../../../../src/baikor-r-web"));
        await using var factory = CreateFactory(webRoot: webRoot);
        using var client = CreateAuthenticatedClient(factory, "baikor_viewer");
        using var authenticated = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, authenticated.StatusCode);
        Assert.NotNull(authenticated.Headers.ETag);
        Assert.NotNull(authenticated.Content.Headers.LastModified);
        client.DefaultRequestHeaders.Remove("Cookie");
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.IfNoneMatch.Add(authenticated.Headers.ETag);
        request.Headers.IfModifiedSince = authenticated.Content.Headers.LastModified;

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("https://identity.example.invalid/authorize", response.Headers.Location?.GetLeftPart(UriPartial.Path));
    }

    [Fact]
    public async Task SignedOutPageOffersAnExplicitLoginChallenge()
    {
        var webRoot = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "../../../../../src/baikor-r-web/public"));
        await using var factory = CreateFactory(webRoot: webRoot);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });
        using var signedOut = await client.GetAsync("/signed-out.html");
        Assert.Equal(HttpStatusCode.OK, signedOut.StatusCode);
        var html = await signedOut.Content.ReadAsStringAsync();
        var link = Regex.Match(html, "<a href=\"([^\"]+)\"");
        Assert.True(link.Success);
        Assert.Equal("/auth/login", link.Groups[1].Value);

        using var login = await client.GetAsync(link.Groups[1].Value);

        Assert.Equal(HttpStatusCode.Redirect, login.StatusCode);
        Assert.Equal("https://identity.example.invalid/authorize", login.Headers.Location?.GetLeftPart(UriPartial.Path));
        var parameters = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(login.Headers.Location!.Query);
        Assert.Equal("login", parameters["prompt"].ToString());
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/Account/AccessDenied")]
    [InlineData("/api/me")]
    [InlineData("/api/construction-sites")]
    public async Task AuthenticatedUserWithoutRoleIsForbiddenWithoutRedirect(string path)
    {
        await using var factory = CreateFactory();
        using var client = CreateAuthenticatedClient(factory);

        using var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Null(response.Headers.Location);
        if (path == "/")
        {
            Assert.Contains("Baikor-Rolle", await response.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task AuthenticatedViewerCanReadSession()
    {
        await using var factory = CreateFactory();
        using var client = CreateAuthenticatedClient(factory, "baikor_viewer");

        using var response = await client.GetAsync("/api/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("baikor_viewer")]
    [InlineData("baikor_editor")]
    [InlineData("baikor_approver")]
    [InlineData("baikor_admin")]
    public async Task EachRoleCanReadWithItsOwnAccountIdentity(string role)
    {
        await using var factory = CreateFactory();
        using var client = CreateAuthenticatedClient(factory, role);

        var session = await client.GetFromJsonAsync<UserSessionResponse>("/api/me");
        using var list = await client.GetAsync("/api/construction-sites");

        Assert.NotNull(session);
        Assert.Equal("Test", session.Name);
        Assert.Equal([role], session.Roles);
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
    }

    [Fact]
    public async Task AuthenticatedUserWithoutRoleCanObtainTokenForLogout()
    {
        await using var factory = CreateFactory();
        using var client = CreateAuthenticatedClient(factory);

        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        using var protectedApi = await client.GetAsync("/api/me");

        Assert.NotNull(token);
        Assert.False(string.IsNullOrWhiteSpace(token.Token));
        Assert.Equal(HttpStatusCode.Forbidden, protectedApi.StatusCode);
    }

    [Fact]
    public async Task DeniedAccountCanLogoutFromBrowserRecoveryPage()
    {
        await using var factory = CreateFactory();
        using var client = CreateAuthenticatedClient(factory);
        client.DefaultRequestHeaders.Accept.ParseAdd("text/html");

        using var denied = await client.GetAsync("/");
        var html = await denied.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal("text/html", denied.Content.Headers.ContentType?.MediaType);
        Assert.True(denied.Headers.CacheControl?.NoStore);
        Assert.Contains("<form method=\"post\" action=\"/auth/logout\">", html);
        var token = Regex.Match(html, "name=\"__RequestVerificationToken\" value=\"([^\"]+)\"");
        Assert.True(token.Success);
        using var logout = await client.PostAsync("/auth/logout", new FormUrlEncodedContent(
            [new KeyValuePair<string, string>("__RequestVerificationToken", WebUtility.HtmlDecode(token.Groups[1].Value))]));

        Assert.Equal(HttpStatusCode.Redirect, logout.StatusCode);
        Assert.Equal("https://identity.example.invalid/logout", logout.Headers.Location?.GetLeftPart(UriPartial.Path));
        Assert.Contains(logout.Headers.GetValues("Set-Cookie"),
            cookie => cookie.StartsWith("__Host-BaikorR.Auth=;", StringComparison.Ordinal));
    }

    [Fact]
    public async Task DeniedAccountCannotLogoutWithoutAntiforgeryToken()
    {
        await using var factory = CreateFactory();
        using var client = CreateAuthenticatedClient(factory);

        using var response = await client.PostAsync("/auth/logout", new FormUrlEncodedContent([]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task AnonymousAccountCannotObtainAntiforgeryToken()
    {
        await using var factory = CreateFactory();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

        using var response = await client.GetAsync("/api/antiforgery");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("https://identity.example.invalid/authorize", response.Headers.Location?.GetLeftPart(UriPartial.Path));
        Assert.DoesNotContain(response.Headers.GetValues("Set-Cookie"),
            cookie => cookie.StartsWith("__Host-BaikorR.Antiforgery=", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("create")]
    [InlineData("update")]
    [InlineData("delete")]
    [InlineData("bulk-delete")]
    [InlineData("status")]
    public async Task ViewerCannotModifySharedConstructionSites(string operation)
    {
        var database = new InMemoryConstructionSitesSession();
        var site = SeedSite(database);
        await using var factory = CreateFactory(database);
        using var client = CreateAuthenticatedClient(factory, "baikor_viewer");
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        Assert.NotNull(token);
        using var request = operation switch
        {
            "create" => new HttpRequestMessage(HttpMethod.Post, "/api/construction-sites")
            {
                Content = SiteContent("Viewer attempt", "approved")
            },
            "update" => new HttpRequestMessage(HttpMethod.Put, $"/api/construction-sites/{site.Id}")
            {
                Content = SiteContent("Viewer attempt", "approved")
            },
            "delete" => new HttpRequestMessage(HttpMethod.Delete, $"/api/construction-sites/{site.Id}"),
            "bulk-delete" => new HttpRequestMessage(HttpMethod.Post, "/api/construction-sites/bulk-delete")
            {
                Content = JsonContent.Create(new { ids = new[] { site.Id } })
            },
            _ => new HttpRequestMessage(HttpMethod.Post, $"/api/construction-sites/{site.Id}/status")
            {
                Content = JsonContent.Create(new { status = "approved" })
            }
        };
        request.Headers.Add("X-CSRF-TOKEN", token.Token);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Null(response.Headers.Location);
        var persisted = Assert.Single(await database.ListAsync(10, CancellationToken.None));
        Assert.Equal("Existing site", persisted.Title);
        Assert.Equal(ConstructionSiteStatus.Draft, persisted.Status);
    }

    [Theory]
    [InlineData("baikor_editor")]
    [InlineData("baikor_approver")]
    [InlineData("baikor_admin")]
    public async Task EditingRolesCanCreateAndSaveStatusThroughGeneralEditor(string role)
    {
        var database = new InMemoryConstructionSitesSession();
        await using var factory = CreateFactory(database);
        using var client = CreateAuthenticatedClient(factory, role);
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        Assert.NotNull(token);
        using var create = new HttpRequestMessage(HttpMethod.Post, "/api/construction-sites")
        {
            Content = SiteContent("Created by another account", "approved")
        };
        create.Headers.Add("X-CSRF-TOKEN", token.Token);

        using var created = await client.SendAsync(create);

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var site = Assert.Single(await database.ListAsync(10, CancellationToken.None));
        Assert.Equal(ConstructionSiteStatus.Approved, site.Status);
        using var update = new HttpRequestMessage(HttpMethod.Put, $"/api/construction-sites/{site.Id}")
        {
            Content = SiteContent("Saved by another account", "active")
        };
        update.Headers.Add("X-CSRF-TOKEN", token.Token);

        using var updated = await client.SendAsync(update);

        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal("Saved by another account", site.Title);
        Assert.Equal(ConstructionSiteStatus.Active, site.Status);
    }

    [Theory]
    [InlineData("baikor_viewer", HttpStatusCode.Forbidden)]
    [InlineData("baikor_editor", HttpStatusCode.Forbidden)]
    [InlineData("baikor_approver", HttpStatusCode.OK)]
    [InlineData("baikor_admin", HttpStatusCode.OK)]
    public async Task DedicatedStatusEndpointRequiresApproverRole(string role, HttpStatusCode expected)
    {
        var database = new InMemoryConstructionSitesSession();
        var site = SeedSite(database);
        await using var factory = CreateFactory(database);
        using var client = CreateAuthenticatedClient(factory, role);
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        Assert.NotNull(token);
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/construction-sites/{site.Id}/status")
        {
            Content = JsonContent.Create(new { status = "approved" })
        };
        request.Headers.Add("X-CSRF-TOKEN", token.Token);

        using var response = await client.SendAsync(request);

        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(expected == HttpStatusCode.OK ? ConstructionSiteStatus.Approved : ConstructionSiteStatus.Draft,
            site.Status);
    }

    [Fact]
    public async Task AdministratorCanBulkDeleteSharedConstructionSites()
    {
        var database = new InMemoryConstructionSitesSession();
        var site = SeedSite(database);
        await using var factory = CreateFactory(database);
        using var client = CreateAuthenticatedClient(factory, "baikor_admin");
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        Assert.NotNull(token);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/construction-sites/bulk-delete")
        {
            Content = JsonContent.Create(new { ids = new[] { site.Id } })
        };
        request.Headers.Add("X-CSRF-TOKEN", token.Token);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(await database.ListAsync(10, CancellationToken.None));
    }

    [Theory]
    [InlineData("baikor_viewer", false)]
    [InlineData("baikor_importer", false)]
    [InlineData("baikor_editor", true)]
    [InlineData("baikor_approver", true)]
    [InlineData("baikor_admin", true)]
    public async Task ArchiveAndRestoreUseTheExistingEditorPermission(string role, bool allowed)
    {
        foreach (var operation in new[] { "delete", "bulk-delete", "restore" })
        {
            var database = new InMemoryConstructionSitesSession();
            var site = SeedSite(database);
            site.IsDeleted = operation == "restore";
            await using var factory = CreateFactory(database);
            using var client = CreateAuthenticatedClient(factory, role);
            var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
            Assert.NotNull(token);
            using var request = operation switch
            {
                "delete" => new HttpRequestMessage(HttpMethod.Delete, $"/api/construction-sites/{site.Id}"),
                "bulk-delete" => new HttpRequestMessage(HttpMethod.Post, "/api/construction-sites/bulk-delete")
                {
                    Content = JsonContent.Create(new { ids = new[] { site.Id } })
                },
                _ => new HttpRequestMessage(HttpMethod.Post, $"/api/construction-sites/{site.Id}/restore")
                {
                    Content = JsonContent.Create(new { version = site.Version })
                }
            };
            request.Headers.Add("X-CSRF-TOKEN", token.Token);

            using var response = await client.SendAsync(request);

            Assert.Equal(allowed
                ? operation == "delete" ? HttpStatusCode.NoContent : HttpStatusCode.OK
                : HttpStatusCode.Forbidden, response.StatusCode);
            Assert.Same(site, await database.GetAsync(site.Id, CancellationToken.None));
            Assert.Equal(allowed ? operation != "restore" : operation == "restore", site.IsDeleted);
        }
    }

    [Fact]
    public async Task ViewerCanReadArchivedDetailsAndArchiveLists()
    {
        var database = new InMemoryConstructionSitesSession();
        var site = SeedSite(database);
        site.IsDeleted = true;
        await using var factory = CreateFactory(database);
        using var client = CreateAuthenticatedClient(factory, "baikor_viewer");

        using var details = await client.GetAsync($"/api/construction-sites/{site.Id}");
        using var list = await client.GetAsync("/api/construction-sites?archive=archived");

        Assert.Equal(HttpStatusCode.OK, details.StatusCode);
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        Assert.Contains(site.Id.ToString(), await list.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AntiforgeryTokenCannotBeReusedAfterSwitchingAccounts()
    {
        var database = new InMemoryConstructionSitesSession();
        await using var factory = CreateFactory(database);
        using var first = CreateAuthenticatedClient(factory, ["baikor_editor"], "first-user");
        using var second = CreateAuthenticatedClient(factory, ["baikor_editor"], "second-user");
        using var tokenResponse = await first.GetAsync("/api/antiforgery");
        tokenResponse.EnsureSuccessStatusCode();
        var token = await tokenResponse.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>();
        Assert.NotNull(token);
        var antiforgeryCookie = Assert.Single(tokenResponse.Headers.GetValues("Set-Cookie"),
            cookie => cookie.StartsWith("__Host-BaikorR.Antiforgery=", StringComparison.Ordinal));
        var cookie = second.DefaultRequestHeaders.GetValues("Cookie").Single();
        second.DefaultRequestHeaders.Remove("Cookie");
        second.DefaultRequestHeaders.Add("Cookie", cookie + "; " + antiforgeryCookie.Split(';')[0]);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/construction-sites")
        {
            Content = SiteContent("Wrong account token", "draft")
        };
        request.Headers.Add("X-CSRF-TOKEN", token.Token);

        using var response = await second.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(await database.ListAsync(10, CancellationToken.None));
    }

    private static ConstructionSite SeedSite(InMemoryConstructionSitesSession database)
    {
        var site = new ConstructionSite
        {
            Id = Guid.NewGuid(),
            Title = "Existing site",
            Status = ConstructionSiteStatus.Draft
        };
        database.Add(site);
        return site;
    }

    private static JsonContent SiteContent(string title, string status) => JsonContent.Create(new
    {
        title,
        status,
        plannedStart = (DateOnly?)null,
        plannedEnd = (DateOnly?)null,
        areas = Array.Empty<object>(),
        version = 0u
    });

    private static WebApplicationFactory<Host.Program> CreateFactory(
        InMemoryConstructionSitesSession? database = null, string? webRoot = null, TimeProvider? clock = null) =>
        new WebApplicationFactory<Host.Program>().WithWebHostBuilder(builder =>
        {
            if (webRoot is not null)
            {
                builder.UseWebRoot(webRoot);
            }
            builder.UseSetting("Authentication:Enabled", "true");
            builder.UseSetting("Authentication:Authority", "https://identity.example.invalid/realms/test");
            builder.UseSetting("Authentication:ClientId", "baikor-r");
            builder.UseSetting("Authentication:ClientSecret", "test-only-not-a-real-secret");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IConstructionSitesSession>();
                services.AddSingleton<IConstructionSitesSession>(database ?? new InMemoryConstructionSitesSession());
                if (clock is not null)
                {
                    services.Configure<CookieAuthenticationOptions>(CookieAuthenticationDefaults.AuthenticationScheme,
                        options => options.TimeProvider = clock);
                }
                services.Configure<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme, options =>
                    options.Configuration = new OpenIdConnectConfiguration
                    {
                        Issuer = "https://identity.example.invalid/realms/test",
                        AuthorizationEndpoint = "https://identity.example.invalid/authorize",
                        TokenEndpoint = "https://identity.example.invalid/token",
                        EndSessionEndpoint = "https://identity.example.invalid/logout"
                    });
            });
        });

    private static HttpClient CreateAuthenticatedClient(
        WebApplicationFactory<Host.Program> factory, params string[] roles) =>
        CreateAuthenticatedClient(factory, roles, "test-user");

    private static HttpClient CreateAuthenticatedClient(
        WebApplicationFactory<Host.Program> factory, string[] roles, string userId,
        AuthenticationProperties? properties = null)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });
        var scheme = CookieAuthenticationDefaults.AuthenticationScheme;
        var options = factory.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(scheme);
        var identity = new ClaimsIdentity(
            [new Claim("sub", userId), new Claim("preferred_username", "Test")],
            scheme, "preferred_username", "roles");
        identity.AddClaims(roles.Select(role => new Claim("roles", role)));
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), properties, scheme);
        client.DefaultRequestHeaders.Add("Cookie", options.Cookie.Name + "=" + options.TicketDataFormat.Protect(ticket));
        return client;
    }
}
