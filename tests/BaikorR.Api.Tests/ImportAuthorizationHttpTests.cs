using System.IdentityModel.Tokens.Jwt;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using BaikorR.Api.Importers.Rkom;
using BaikorR.Api.Persistence.Entities;
using BaikorR.Api.Persistence.Sessions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using NetTopologySuite.Features;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO.Esri;

namespace BaikorR.Api.Tests;

public sealed class ImportAuthorizationHttpTests
{
    private const string Issuer = "https://identity.example.invalid/realms/test";
    private static readonly SymmetricSecurityKey SigningKey = new(
        System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));

    [Theory]
    [InlineData("baikor_importer", HttpStatusCode.OK)]
    [InlineData("baikor_editor", HttpStatusCode.OK)]
    [InlineData("baikor_approver", HttpStatusCode.OK)]
    [InlineData("baikor_admin", HttpStatusCode.OK)]
    [InlineData("baikor_viewer", HttpStatusCode.Forbidden)]
    [InlineData("", HttpStatusCode.Forbidden)]
    public async Task ImportAllowsDedicatedRoleAndExistingEditingRoles(string role, HttpStatusCode expected)
    {
        var database = new InMemoryConstructionSitesSession();
        await using var factory = CreateFactory(database);
        using var client = CreateBearerClient(factory, role);
        using var upload = new MultipartFormDataContent();
        upload.Add(new ByteArrayContent(CreateArchive()), "file", "R-TEST_Trenches.zip");

        using var response = await client.PostAsync("/api/construction-sites/imports/trenches", upload);

        Assert.Equal(expected, response.StatusCode);
        var sites = await database.ListAsync(10, CancellationToken.None);
        if (expected == HttpStatusCode.OK)
        {
            var result = await response.Content.ReadFromJsonAsync<RkomTrenchesImportResponse>();
            Assert.NotNull(result);
            Assert.Equal(1, result.CreatedCount);
            Assert.Single(sites);
        }
        else
        {
            Assert.Empty(sites);
        }
    }

    [Theory]
    [InlineData("GET", "/api/construction-sites")]
    [InlineData("GET", "/api/me")]
    [InlineData("GET", "/")]
    [InlineData("POST", "/api/construction-sites")]
    [InlineData("PUT", "/api/construction-sites/{id}")]
    [InlineData("DELETE", "/api/construction-sites/{id}")]
    [InlineData("POST", "/api/construction-sites/bulk-delete")]
    [InlineData("POST", "/api/construction-sites/{id}/status")]
    [InlineData("POST", "/api/construction-sites/{id}/attachments")]
    [InlineData("DELETE", "/api/construction-sites/{id}/attachments/{id}")]
    public async Task ImporterCannotUseGeneralApplicationRoutes(string method, string path)
    {
        var database = new InMemoryConstructionSitesSession();
        var site = new ConstructionSite { Id = Guid.NewGuid(), Title = "Protected site" };
        database.Add(site);
        await using var factory = CreateFactory(database);
        using var client = CreateBearerClient(factory, "baikor_importer");
        using var request = new HttpRequestMessage(new HttpMethod(method), path.Replace("{id}", site.Id.ToString()));

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var persisted = Assert.Single(await database.ListAsync(10, CancellationToken.None));
        Assert.Equal("Protected site", persisted.Title);
    }

    private static WebApplicationFactory<Program> CreateFactory(InMemoryConstructionSitesSession database) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Authentication:Enabled", "true");
            builder.UseSetting("Authentication:Authority", Issuer);
            builder.UseSetting("Authentication:ClientId", "baikor-r");
            builder.UseSetting("Authentication:ClientSecret", "test-only");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IConstructionSitesSession>();
                services.AddSingleton<IConstructionSitesSession>(database);
                services.Configure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
                {
                    options.Configuration = new OpenIdConnectConfiguration { Issuer = Issuer };
                    options.Configuration.SigningKeys.Add(SigningKey);
                });
            });
        });

    private static HttpClient CreateBearerClient(WebApplicationFactory<Program> factory, string role)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false
        });
        var token = new JwtSecurityToken(Issuer, "baikor-r",
            [new Claim("sub", "service-account-test"), new Claim("roles", role)],
            expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: new SigningCredentials(SigningKey, SecurityAlgorithms.HmacSha256));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", new JwtSecurityTokenHandler().WriteToken(token));
        return client;
    }

    private static byte[] CreateArchive()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"baikor-auth-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        try
        {
            var path = Path.Combine(directory, "R-TEST_Trenches.shp");
            Shapefile.WriteAllFeatures([new Feature(
                new MultiLineString([new LineString([new Coordinate(12.1, 49.01), new Coordinate(12.1001, 49.01)])]),
                new AttributesTable
                {
                    { "executio_1", "Plan released" }, { "name", "Asphalt Str." }, { "externalID", "segment-1" }
                })], path);
            File.WriteAllText(Path.ChangeExtension(path, ".prj"),
                "GEOGCS[\"GCS_WGS_1984\",DATUM[\"D_WGS_1984\",SPHEROID[\"WGS_1984\",6378137,298.257223563]],PRIMEM[\"Greenwich\",0],UNIT[\"Degree\",0.0174532925199433]]");
            using var output = new MemoryStream();
            ZipFile.CreateFromDirectory(directory, output);
            return output.ToArray();
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}
