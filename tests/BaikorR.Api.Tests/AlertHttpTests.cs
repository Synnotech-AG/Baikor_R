using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using BaikorR.Core.Features.Alerts;
using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Core.Persistence.Entities;
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

public sealed class AlertHttpTests
{
    [Fact]
    public async Task EditorCanReadSupersededHistoryButCannotHandleIt()
    {
        var session = new MemoryAlertsSession();
        session.Record.SupersededByAlertId = Guid.NewGuid();
        await using var factory = CreateFactory(session);
        using var client = Client(factory, "baikor_editor");

        using var detail = JsonDocument.Parse(await client.GetStringAsync($"/api/alerts/{session.Record.Id}"));
        Assert.Equal(session.Record.SupersededByAlertId, detail.RootElement.GetProperty("supersededByAlertId").GetGuid());
        using var evidence = await client.GetAsync($"/api/alerts/{session.Record.Id}/evidence/1");
        Assert.Equal(HttpStatusCode.OK, evidence.StatusCode);
        using var denied = await SendMutation(client, HttpMethod.Post, $"/api/alerts/{session.Record.Id}/handling",
            new { handling = "handled", evidenceRevision = 1, version = 0 });
        Assert.Equal(HttpStatusCode.Conflict, denied.StatusCode);
        Assert.Equal(AlertHandling.Open, session.Record.Handling);
    }

    [Fact]
    public async Task ViewerReadsRetainedEvidenceAndMissingRevisionReturnsNotFound()
    {
        var session = new MemoryAlertsSession();
        var candidate = new RouteConflictDetector().Evaluate(new AlertRule(), RouteConflictDetectorTests.Route(), RouteConflictDetectorTests.Site(1)).Candidate!;
        new AlertReconciler().Reconcile(session.Record, candidate, DateTimeOffset.UtcNow);
        await using var factory = CreateFactory(session);
        using var viewer = Client(factory, "baikor_viewer");
        using var historical = await viewer.GetAsync($"/api/alerts/{session.Record.Id}/evidence/1");
        Assert.Equal(HttpStatusCode.OK, historical.StatusCode);
        using var document = JsonDocument.Parse(await historical.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("evidenceRevision").GetInt32());
        Assert.Equal("Route", document.RootElement.GetProperty("details").GetProperty("routeTitle").GetString());
        Assert.False(document.RootElement.TryGetProperty("handling", out _));
        using var missing = await viewer.GetAsync($"/api/alerts/{session.Record.Id}/evidence/99");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        using var importer = Client(factory, "baikor_importer");
        using var denied = await importer.GetAsync($"/api/alerts/{session.Record.Id}/evidence/1");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        using var anonymous = factory.CreateClient(new() { BaseAddress = new("https://localhost"), AllowAutoRedirect = false });
        using var unauthenticated = await anonymous.GetAsync($"/api/alerts/{session.Record.Id}/evidence/1");
        Assert.Equal(HttpStatusCode.Found, unauthenticated.StatusCode);
        Assert.StartsWith("https://identity.example.invalid/authorize", unauthenticated.Headers.Location!.AbsoluteUri);
    }

    [Fact]
    public async Task ViewerReadsGenericAlertsAndTypedEvidenceButCannotHandle()
    {
        var session = new MemoryAlertsSession();
        await using var factory = CreateFactory(session);
        using var client = Client(factory, "baikor_viewer");
        using var list = await client.GetAsync("/api/alerts?condition=Present&handling=Open");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        Assert.Equal("application/json", list.Content.Headers.ContentType?.MediaType);
        using var detail = JsonDocument.Parse(await client.GetStringAsync($"/api/alerts/{session.Record.Id}"));
        Assert.Equal("routeConflict", detail.RootElement.GetProperty("type").GetString());
        Assert.Equal("open", detail.RootElement.GetProperty("handling").GetString());
        Assert.Equal("Route", detail.RootElement.GetProperty("details").GetProperty("routeTitle").GetString());
        using var denied = await SendMutation(client, HttpMethod.Post, $"/api/alerts/{session.Record.Id}/handling", new { handling = "handled", evidenceRevision = 1, version = 0 });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
    }

    [Fact]
    public async Task EditorRequiresCsrfAndExpectedEvidenceBeforeHandling()
    {
        var session = new MemoryAlertsSession();
        await using var factory = CreateFactory(session);
        using var client = Client(factory, "baikor_editor");
        using var noToken = await client.PostAsJsonAsync($"/api/alerts/{session.Record.Id}/handling", new { handling = "handled", evidenceRevision = 1, version = 0 });
        Assert.Equal(HttpStatusCode.BadRequest, noToken.StatusCode);
        using var stale = await SendMutation(client, HttpMethod.Post, $"/api/alerts/{session.Record.Id}/handling", new { handling = "handled", evidenceRevision = 0, version = 0 });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using var handled = await SendMutation(client, HttpMethod.Post, $"/api/alerts/{session.Record.Id}/handling", new { handling = "handled", note = "Reviewed", evidenceRevision = 1, version = 0 });
        Assert.Equal(HttpStatusCode.OK, handled.StatusCode);
        using var detail = JsonDocument.Parse(await handled.Content.ReadAsStringAsync());
        Assert.Equal("test-subject", detail.RootElement.GetProperty("handlingActor").GetString());
    }

    [Fact]
    public async Task MaterialChangeBetweenReadAndDecisionRejectsTheObservedHttpEvidence()
    {
        var session = new MemoryAlertsSession();
        await using var factory = CreateFactory(session);
        using var client = Client(factory, "baikor_editor");
        using var read = JsonDocument.Parse(await client.GetStringAsync($"/api/alerts/{session.Record.Id}"));
        var candidate = new RouteConflictDetector().Evaluate(new AlertRule(), RouteConflictDetectorTests.Route(), RouteConflictDetectorTests.Site(1)).Candidate!;
        new AlertReconciler().Reconcile(session.Record, candidate, DateTimeOffset.UtcNow);

        using var response = await SendMutation(client, HttpMethod.Post, $"/api/alerts/{session.Record.Id}/handling", new
        {
            handling = "handled", evidenceRevision = read.RootElement.GetProperty("evidenceRevision").GetInt32(),
            version = read.RootElement.GetProperty("version").GetUInt32()
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(AlertHandling.Open, session.Record.Handling);
        Assert.Equal(2, session.Record.EvidenceRevision);
        Assert.Equal(2, session.Record.Events.Count);
    }

    [Theory]
    [InlineData("baikor_editor", HttpStatusCode.Forbidden)]
    [InlineData("baikor_admin", HttpStatusCode.OK)]
    public async Task OnlyAdministratorCanChangeRules(string role, HttpStatusCode expected)
    {
        await using var factory = CreateFactory(new MemoryAlertsSession());
        using var client = Client(factory, role);
        using var result = await SendMutation(client, HttpMethod.Put, "/api/alerts/rules/route-conflict", new { enabled = true, sensitivityMetres = 15, eligibleStatuses = new[] { "planned" }, version = 0 });
        Assert.Equal(expected, result.StatusCode);
    }

    [Theory]
    [InlineData("/api/alerts")]
    [InlineData("/api/alerts/rules/route-conflict")]
    public async Task ImporterHasNoAlertReadPermission(string path)
    {
        await using var factory = CreateFactory(new MemoryAlertsSession());
        using var client = Client(factory, "baikor_importer");
        using var result = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.Forbidden, result.StatusCode);
    }

    private static async Task<HttpResponseMessage> SendMutation(HttpClient client, HttpMethod method, string path, object body)
    {
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        using var message = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        message.Headers.Add("X-CSRF-TOKEN", token!.Token);
        return await client.SendAsync(message);
    }

    private static WebApplicationFactory<Host.Program> CreateFactory(MemoryAlertsSession session) =>
        new WebApplicationFactory<Host.Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Authentication:Enabled", "true");
            builder.UseSetting("Authentication:Authority", "https://identity.example.invalid/realms/test");
            builder.UseSetting("Authentication:ClientId", "baikor-r");
            builder.UseSetting("Authentication:ClientSecret", "test-only-not-a-real-secret");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IAlertsSession>();
                services.AddSingleton<IAlertsSession>(session);
                services.AddSingleton<AlertReconciler>();
                services.AddScoped<IAlertQueryService, AlertQueryService>();
                services.AddScoped<IAlertHandlingService, AlertHandlingService>();
                services.AddScoped<IAlertRuleService, AlertRuleService>();
                services.Configure<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme, options =>
                    options.Configuration = new OpenIdConnectConfiguration
                    {
                        Issuer = "https://identity.example.invalid/realms/test",
                        AuthorizationEndpoint = "https://identity.example.invalid/authorize",
                        TokenEndpoint = "https://identity.example.invalid/token"
                    });
            });
        });

    private static HttpClient Client(WebApplicationFactory<Host.Program> factory, string role)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new("https://localhost"), AllowAutoRedirect = false });
        var scheme = CookieAuthenticationDefaults.AuthenticationScheme;
        var options = factory.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(scheme);
        var identity = new ClaimsIdentity([new Claim("sub", "test-subject"), new Claim("preferred_username", "Test"), new Claim("roles", role)], scheme, "preferred_username", "roles");
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), scheme);
        client.DefaultRequestHeaders.Add("Cookie", options.Cookie.Name + "=" + options.TicketDataFormat.Protect(ticket));
        return client;
    }
}
