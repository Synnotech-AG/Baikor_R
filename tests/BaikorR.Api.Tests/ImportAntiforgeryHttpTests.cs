using System.Net;
using System.Net.Http.Json;
using BaikorR.Core.Importers.Rkom;
using BaikorR.Host.Controllers.Api.Antiforgery;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BaikorR.Api.Tests;

public sealed class ImportAntiforgeryHttpTests
{
    [Fact]
    public async Task CookieAuthenticatedImportRequiresAntiforgeryToken()
    {
        var importer = new RecordingRkomTrenchesImporter();
        await using var factory = CreateFactory(importer);
        using var client = factory.CreateClient();
        using var response = await client.PostAsync(
            "/api/construction-sites/imports/trenches",
            CreateUpload());

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(importer.WasCalled);
    }

    [Fact]
    public async Task CookieAuthenticatedImportAcceptsAntiforgeryToken()
    {
        var importer = new RecordingRkomTrenchesImporter();
        await using var factory = CreateFactory(importer);
        using var client = factory.CreateClient();
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        Assert.NotNull(token);
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            "/api/construction-sites/imports/trenches")
        {
            Content = CreateUpload()
        };
        request.Headers.Add("X-CSRF-TOKEN", token.Token);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(importer.WasCalled);
    }

    private static MultipartFormDataContent CreateUpload()
    {
        var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent([1, 2, 3]), "file", "trenches.zip");
        return content;
    }

    private static WebApplicationFactory<Host.Program> CreateFactory(RecordingRkomTrenchesImporter importer) =>
        new WebApplicationFactory<Host.Program>()
            .WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            {
                services.RemoveAll<IRkomTrenchesImporter>();
                services.AddSingleton<IRkomTrenchesImporter>(importer);
            }));
}
