using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace BaikorR.Api.Tests;

public sealed class SignedOutPageTests
{
    [Fact]
    public async Task PublicSignedOutPageDoesNotStartAnotherOidcRoundTrip()
    {
        var webRoot = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "../../../../../src/baikor-r-web/public"));
        await using var factory = new WebApplicationFactory<Host.Program>()
            .WithWebHostBuilder(builder => builder.UseWebRoot(webRoot));
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        using var response = await client.GetAsync("/signed-out.html");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(response.Headers.Location);
        Assert.Contains("Erfolgreich abgemeldet", await response.Content.ReadAsStringAsync());
    }
}
