using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BaikorR.Core.Importers.Rkom;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Host.Controllers.Api.Antiforgery;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using NetTopologySuite.Features;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO.Esri;

namespace BaikorR.Api.Tests;

public sealed class ImportOpenApiContractTests
{
    private const string ImportPath = "/api/construction-sites/imports/trenches";

    [Fact]
    public async Task DocumentedSuccessExampleMatchesARealShapefileImport()
    {
        using var specification = ReadSpecification();
        var session = new InMemoryConstructionSitesSession();
        await using var factory = CreateFactory(session);
        using var client = factory.CreateClient();

        using var response = await Upload(client, CreateArchive());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(Guid.TryParse(body.RootElement.GetProperty("batchId").GetString(), out var batchId));
        Assert.NotEqual(Guid.Empty, batchId);
        AssertExample(specification, "200", "application/json", "imported", body.RootElement, "batchId");
        var schema = specification.RootElement.GetProperty("components").GetProperty("schemas")
            .GetProperty("TrenchImportResponse");
        Assert.Equal(
            schema.GetProperty("properties").EnumerateObject().Select(property => property.Name).Order(),
            body.RootElement.EnumerateObject().Select(property => property.Name).Order());
        var site = Assert.Single(await session.ListAsync(10, CancellationToken.None));
        Assert.Equal("1", site.Metadata["geometry.bufferMetres"]);
        Assert.All(site.Areas, area => Assert.Equal(25832, area.Geometry.SRID));
    }

    [Theory]
    [InlineData("bufferInvalid", "trenches.zip", "0")]
    [InlineData("fileTypeInvalid", "trenches.dxf", "1")]
    [InlineData("fileInvalid", "trenches.zip", "1")]
    public async Task DocumentedValidationExamplesMatchImporterErrors(string example, string fileName, string buffer)
    {
        using var specification = ReadSpecification();
        await using var factory = CreateFactory(new InMemoryConstructionSitesSession());
        using var client = factory.CreateClient();
        using var archive = new MemoryStream();
        using (new ZipArchive(archive, ZipArchiveMode.Create, leaveOpen: true)) { }

        using var response = await Upload(client, archive.ToArray(), fileName, buffer);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        AssertExample(specification, "400", "application/problem+json", example, body.RootElement);
    }

    [Fact]
    public async Task DocumentedDuplicateExampleMatchesARepeatedUpload()
    {
        using var specification = ReadSpecification();
        await using var factory = CreateFactory(new InMemoryConstructionSitesSession());
        using var client = factory.CreateClient();
        var archive = CreateArchive();
        using var first = await Upload(client, archive);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        using var response = await Upload(client, archive);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        AssertExample(specification, "409", "application/problem+json", "duplicate", body.RootElement);
    }

    [Fact]
    public async Task DocumentedBufferBoundariesMatchValidation()
    {
        using var specification = ReadSpecification();
        var buffer = specification.RootElement.GetProperty("paths").GetProperty(ImportPath).GetProperty("post")
            .GetProperty("requestBody").GetProperty("content").GetProperty("multipart/form-data")
            .GetProperty("schema").GetProperty("properties").GetProperty("bufferMetres");
        var validator = new RkomTrenchesImportRequest.Validator();
        foreach (var value in new[] { buffer.GetProperty("minimum").GetDouble(), buffer.GetProperty("maximum").GetDouble() })
        {
            var accepted = await validator.ValidateAsync(new RkomTrenchesImportRequest("trenches.zip", [1], value));
            Assert.True(accepted.IsValid);
        }
        foreach (var value in new[] { buffer.GetProperty("minimum").GetDouble() - 0.01, buffer.GetProperty("maximum").GetDouble() + 0.01 })
        {
            var rejected = await validator.ValidateAsync(new RkomTrenchesImportRequest("trenches.zip", [1], value));
            Assert.Contains(rejected.Errors, error => error.ErrorCode == "constructionSites.import.bufferInvalid");
        }
    }

    [Fact]
    public async Task DocumentedFileSizeBoundaryMatchesValidation()
    {
        using var specification = ReadSpecification();
        var file = specification.RootElement.GetProperty("paths").GetProperty(ImportPath).GetProperty("post")
            .GetProperty("requestBody").GetProperty("content").GetProperty("multipart/form-data")
            .GetProperty("schema").GetProperty("properties").GetProperty("file");
        var maximum = file.GetProperty("x-max-file-bytes").GetInt32();
        var validator = new RkomTrenchesImportRequest.Validator();
        var accepted = await validator.ValidateAsync(new RkomTrenchesImportRequest("trenches.zip", new byte[maximum]));
        Assert.True(accepted.IsValid);
        var rejected = await validator.ValidateAsync(new RkomTrenchesImportRequest("trenches.zip", new byte[maximum + 1]));
        Assert.Contains(rejected.Errors, error => error.ErrorCode == "constructionSites.import.fileTooLarge");
    }

    [Fact]
    public async Task InvalidBearerUsesTheDocumentedOpenIdConnectRedirect()
    {
        const string issuer = "https://identity.example.invalid/realms/test";
        using var specification = ReadSpecification();
        await using var factory = CreateFactory(new InMemoryConstructionSitesSession())
            .WithWebHostBuilder(builder =>
            {
                builder.UseSetting("Authentication:Enabled", "true");
                builder.UseSetting("Authentication:Authority", issuer);
                builder.UseSetting("Authentication:ClientId", "baikor-r");
                builder.UseSetting("Authentication:ClientSecret", "test-only");
                builder.ConfigureServices(services =>
                {
                    services.Configure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
                        options.Configuration = new OpenIdConnectConfiguration { Issuer = issuer });
                    services.Configure<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme, options =>
                        options.Configuration = new OpenIdConnectConfiguration
                        {
                            Issuer = issuer, AuthorizationEndpoint = issuer + "/protocol/openid-connect/auth"
                        });
                });
            });
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false
        });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "invalid-token");

        using var response = await client.PostAsync(ImportPath, new MultipartFormDataContent());

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.StartsWith(issuer + "/protocol/openid-connect/auth?", response.Headers.Location?.AbsoluteUri);
        Assert.True(specification.RootElement.GetProperty("paths").GetProperty(ImportPath).GetProperty("post")
            .GetProperty("responses").TryGetProperty("302", out _));
    }

    private static WebApplicationFactory<Host.Program> CreateFactory(InMemoryConstructionSitesSession session) =>
        new WebApplicationFactory<Host.Program>().WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IConstructionSitesSession>();
                services.AddSingleton<IConstructionSitesSession>(session);
            }));

    private static async Task<HttpResponseMessage> Upload(
        HttpClient client, byte[] archive, string fileName = "DEMO-100_Trenches.zip", string? buffer = null)
    {
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/antiforgery");
        Assert.NotNull(token);
        using var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent(archive), "file", fileName);
        if (buffer is not null)
        {
            content.Add(new StringContent(buffer), "bufferMetres");
        }
        using var request = new HttpRequestMessage(HttpMethod.Post, ImportPath) { Content = content };
        request.Headers.Add("X-CSRF-TOKEN", token.Token);
        return await client.SendAsync(request);
    }

    private static JsonDocument ReadSpecification()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var path = Path.Combine(directory.FullName, "docs", "openapi", "geodata-import.openapi.json");
            if (File.Exists(path))
            {
                return JsonDocument.Parse(File.ReadAllText(path));
            }
            directory = directory.Parent;
        }
        throw new FileNotFoundException("Cannot locate docs/openapi/geodata-import.openapi.json.");
    }

    private static void AssertExample(
        JsonDocument specification, string status, string mediaType, string example, JsonElement actual, string? ignored = null)
    {
        var expected = specification.RootElement.GetProperty("paths").GetProperty(ImportPath).GetProperty("post")
            .GetProperty("responses").GetProperty(status).GetProperty("content").GetProperty(mediaType)
            .GetProperty("examples").GetProperty(example).GetProperty("value");
        foreach (var property in expected.EnumerateObject().Where(property => property.Name != ignored))
        {
            Assert.True(actual.TryGetProperty(property.Name, out var value), $"Missing response property {property.Name}");
            Assert.True(JsonElement.DeepEquals(property.Value, value), $"Documented {example}.{property.Name} differs: {value}");
        }
    }

    private static byte[] CreateArchive()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"baikor-openapi-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        try
        {
            var shapePath = Path.Combine(directory, "DEMO-100_Trenches.shp");
            Shapefile.WriteAllFeatures(new IFeature[]
            {
                new Feature(new LineString([new Coordinate(12.1, 49.01), new Coordinate(12.1001, 49.01)]),
                    new AttributesTable { { "executio_1", "Plan released" }, { "name", "Asphalt" }, { "externalID", "segment-1" } }),
                new Feature(new LineString([new Coordinate(12.1, 49.01), new Coordinate(12.1, 49.0101)]),
                    new AttributesTable { { "executio_1", "Executed" }, { "name", "Hausanschluss" }, { "externalID", "house-1" } })
            }, shapePath);
            File.WriteAllText(Path.ChangeExtension(shapePath, ".prj"),
                "GEOGCS[\"GCS_WGS_1984\",DATUM[\"D_WGS_1984\",SPHEROID[\"WGS_1984\",6378137,298.257223563]],PRIMEM[\"Greenwich\",0],UNIT[\"Degree\",0.0174532925199433]]");
            using var archive = new MemoryStream();
            ZipFile.CreateFromDirectory(directory, archive);
            return archive.ToArray();
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}
