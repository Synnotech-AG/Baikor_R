using System.Net;
using System.Net.Http.Json;
using BaikorR.Host.Controllers.Api.Me;
using BaikorR.Host.Controllers.Api.Version;
using Microsoft.AspNetCore.Mvc.Testing;

namespace BaikorR.Api.Tests;

public sealed class ApplicationTests : IClassFixture<WebApplicationFactory<Host.Program>>
{
    private readonly HttpClient _client;

    public ApplicationTests(WebApplicationFactory<Host.Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Theory]
    [InlineData("/health/live")]
    public async Task HealthEndpointsReturnOk(string path)
    {
        var response = await _client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task VersionEndpointDescribesTheService()
    {
        var response = await _client.GetFromJsonAsync<ServiceVersionResponse>("/api/version");

        Assert.NotNull(response);
        Assert.Equal("Baikor_R", response.Application);
        Assert.False(string.IsNullOrWhiteSpace(response.Version));
        Assert.Equal("Development", response.Environment);
    }

    [Fact]
    public async Task DevelopmentSessionHasBaikorRoles()
    {
        var response = await _client.GetFromJsonAsync<UserSessionResponse>("/api/me");

        Assert.NotNull(response);
        Assert.Equal("Local Editor", response.Name);
        Assert.Contains("baikor_editor", response.Roles);
        Assert.Contains("baikor_approver", response.Roles);
    }

}
