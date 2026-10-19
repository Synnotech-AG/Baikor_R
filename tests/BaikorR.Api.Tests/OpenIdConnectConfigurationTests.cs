using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace BaikorR.Api.Tests;

public sealed class OpenIdConnectConfigurationTests
{
    [Fact]
    public void AuthenticationTicketKeepsTokensRequiredForKeycloakLogout()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Authentication:Enabled", "true");
            builder.UseSetting("Authentication:Authority", "https://identity.example.invalid/realms/test");
            builder.UseSetting("Authentication:ClientId", "baikor-r");
            builder.UseSetting("Authentication:ClientSecret", "test-only-not-a-real-secret");
        });

        var options = factory.Services
            .GetRequiredService<IOptionsMonitor<OpenIdConnectOptions>>()
            .Get(OpenIdConnectDefaults.AuthenticationScheme);

        Assert.True(options.SaveTokens);
    }
}
