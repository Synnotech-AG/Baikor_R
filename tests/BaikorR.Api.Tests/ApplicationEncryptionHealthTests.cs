using System.Net;
using System.Security.Cryptography;
using BaikorR.Core.Features.MailImports;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BaikorR.Api.Tests;

public sealed class ApplicationEncryptionHealthTests
{
    private static readonly string Fingerprint = Convert.ToHexString(SHA256.HashData(
        Convert.FromBase64String(MailImportSecretProtectorTests.FixtureKey)));

    [Fact]
    public void LegacyOnlyApplicationConfigurationStillReadsAnExistingPassword()
    {
        using var factory = new WebApplicationFactory<Host.Program>().WithWebHostBuilder(builder =>
            builder.UseSetting("MailImports:EncryptionKey", MailImportSecretProtectorTests.FixtureKey));
        var passwords = factory.Services.GetRequiredService<IMailImportSecretProtector>();
        Assert.Equal("saved-before-upgrade", passwords.Unprotect(MailImportSecretProtectorTests.LegacyCiphertext));
    }

    [Fact]
    public async Task StandaloneDeploymentWithoutAKeyHasNoRequiredKeyProbe()
    {
        using var factory = new WebApplicationFactory<Host.Program>();
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/health/ready/encryption.v1")).StatusCode);
    }

    [PostgisFact]
    public async Task RequiredKeyAndDeploymentFingerprintGateReadinessButNotLiveness()
    {
        await using var db = await PostgisTestDatabase.CreateAsync();
        foreach (var key in new[] { "", "not-base64", Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)) })
        {
            using var factory = App(db, key);
            using var client = factory.CreateClient();
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
            Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health/ready")).StatusCode);
            Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health/ready/encryption.v1")).StatusCode);
        }
    }

    [PostgisFact]
    public async Task ReadinessVerifiesRetainedCiphertextEvenWhenImportIsDisabledAndRetriesAfterRepair()
    {
        await using var db = await PostgisTestDatabase.CreateAsync();
        await using var context = db.CreateContext();
        var config = await context.MailImportConfigurations.SingleAsync();
        Assert.False(config.Enabled);
        config.EncryptedPassword = "old-ciphertext-corrupted";
        await context.SaveChangesAsync();
        using var factory = App(db, MailImportSecretProtectorTests.FixtureKey);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health/ready")).StatusCode);
        config.EncryptedPassword = MailImportSecretProtectorTests.LegacyCiphertext;
        await context.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/ready")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/ready/encryption.v1")).StatusCode);
    }

    private static WebApplicationFactory<Host.Program> App(PostgisTestDatabase database, string key) =>
        new WebApplicationFactory<Host.Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:BaikorR", database.ConnectionString);
            builder.UseSetting("Encryption:Key", key);
            builder.UseSetting("Encryption:Required", "true");
            builder.UseSetting("Encryption:ExpectedKeySha256", Fingerprint);
            builder.UseSetting("MailImports:WorkerEnabled", "false");
        });
}
