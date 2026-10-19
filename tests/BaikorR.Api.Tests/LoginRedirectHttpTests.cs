using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace BaikorR.Api.Tests;

public sealed class LoginRedirectHttpTests
{
    [Theory]
    [InlineData(null, "/")]
    [InlineData("", "/")]
    [InlineData("/", "/")]
    [InlineData("/construction-sites?filter=mine", "/construction-sites?filter=mine")]
    [InlineData("~/construction-sites", "/construction-sites")]
    [InlineData("relative-path", "/")]
    [InlineData("https://example.invalid", "/")]
    [InlineData("//example.invalid", "/")]
    [InlineData("/\\example.invalid", "/")]
    [InlineData("/\\\\example.invalid/path", "/")]
    [InlineData("/safe\r\nLocation: https://example.invalid", "/")]
    [InlineData("/safe\tpath", "/")]
    public async Task LoginOnlyRedirectsToLocalPaths(string? returnUrl, string expectedLocation)
    {
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.UseSetting("Authentication:Enabled", "false"));
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });
        // Encoding matches a real query parameter: MVC decodes the value before
        // validating it, including encoded slash/backslash and control characters.
        var path = returnUrl is null
            ? "/auth/login"
            : "/auth/login?returnUrl=" + Uri.EscapeDataString(returnUrl);

        using var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal(expectedLocation, response.Headers.Location?.OriginalString);
    }
}
