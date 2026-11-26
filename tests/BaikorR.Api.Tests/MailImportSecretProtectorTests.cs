using System.Security.Cryptography;
using BaikorR.Core.Features.MailImports.Security;

namespace BaikorR.Api.Tests;

public sealed class MailImportSecretProtectorTests
{
    private static readonly string Key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

    [Fact]
    public void RoundTripsAcrossInstancesWithoutRevealingPassword()
    {
        var first = new AesMailImportSecretProtector(Key);
        var second = new AesMailImportSecretProtector(Key);
        var encrypted = first.Protect("synthetic-test-password");
        Assert.True(first.IsConfigured);
        Assert.DoesNotContain("synthetic-test-password", encrypted);
        Assert.Equal("synthetic-test-password", second.Unprotect(encrypted));
        Assert.NotEqual(encrypted, first.Protect("synthetic-test-password"));
    }

    [Fact]
    public void WrongKeyAndTamperingNeverReturnPlaintext()
    {
        var protector = new AesMailImportSecretProtector(Key);
        var ciphertext = protector.Protect("synthetic-test-password");
        var bytes = Convert.FromBase64String(ciphertext);
        bytes[^1] ^= 1;
        Assert.ThrowsAny<CryptographicException>(() => protector.Unprotect(Convert.ToBase64String(bytes)));
        var other = new AesMailImportSecretProtector(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));
        Assert.ThrowsAny<CryptographicException>(() => other.Unprotect(ciphertext));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("invalid")]
    [InlineData("YWJj")]
    public void MissingOrMalformedDeploymentKeyDisablesOnlyProtector(string? key)
    {
        var protector = new AesMailImportSecretProtector(key);
        Assert.False(protector.IsConfigured);
        Assert.Throws<InvalidOperationException>(() => protector.Protect("password"));
        Assert.Throws<InvalidOperationException>(() => protector.Unprotect("ciphertext"));
    }
}
