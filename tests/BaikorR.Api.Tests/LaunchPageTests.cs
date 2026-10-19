using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace BaikorR.Api.Tests;

public sealed class LaunchPageTests
{
    [Fact]
    public async Task PublicLaunchPageReturnsHtmlWithoutStartingAnOidcRoundTrip()
    {
        var webRoot = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "../../../../../src/baikor-r-web/public"));
        await using var factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder => builder.UseWebRoot(webRoot));
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        using var response = await client.GetAsync("/launch.html");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(response.Headers.Location);
        Assert.Contains("/launch.js", await response.Content.ReadAsStringAsync());
        var script = await client.GetStringAsync("/launch.js");
        Assert.Contains("window.location.replace(\"/\")", script);
    }
}
