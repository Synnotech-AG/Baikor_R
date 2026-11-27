using System.Security.Cryptography;
using System.Text;
using BaikorR.Core.Features.MailImports.Security;
using BaikorR.Core.Shared.Security;

namespace BaikorR.Api.Tests;

public sealed class MailImportSecretProtectorTests
{
    private static readonly string Key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
    internal const string FixtureKey = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
    internal const string LegacyCiphertext = "AQABAgMEBQYHCAkKC6as/GuQqY+AIeLYEnykkaA0Y6B+ocigfusu5e6cnAgK8bfjUQ==";

    [Fact]
    public void RoundTripsAcrossInstancesWithoutRevealingPassword()
    {
        var first = new MailImportSecretProtector(new ApplicationSecretEncryption(Key));
        var second = new MailImportSecretProtector(new ApplicationSecretEncryption(Key));
        var encrypted = first.Protect("synthetic-test-password");
        Assert.True(first.IsConfigured);
        Assert.DoesNotContain("synthetic-test-password", encrypted);
        Assert.Equal("synthetic-test-password", second.Unprotect(encrypted));
        Assert.NotEqual(encrypted, first.Protect("synthetic-test-password"));
    }

    [Fact]
    public void WrongKeyAndTamperingNeverReturnPlaintext()
    {
        var protector = new MailImportSecretProtector(new ApplicationSecretEncryption(Key));
        var ciphertext = protector.Protect("synthetic-test-password");
        var bytes = Convert.FromBase64String(ciphertext);
        bytes[^1] ^= 1;
        Assert.ThrowsAny<CryptographicException>(() => protector.Unprotect(Convert.ToBase64String(bytes)));
        var other = new MailImportSecretProtector(new ApplicationSecretEncryption(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))));
        Assert.ThrowsAny<CryptographicException>(() => other.Unprotect(ciphertext));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("invalid")]
    [InlineData("YWJj")]
    public void MissingOrMalformedDeploymentKeyDisablesOnlyProtector(string? key)
    {
        var protector = new MailImportSecretProtector(new ApplicationSecretEncryption(key));
        Assert.False(protector.IsConfigured);
        Assert.Throws<InvalidOperationException>(() => protector.Protect("password"));
        Assert.Throws<InvalidOperationException>(() => protector.Unprotect("ciphertext"));
    }

    [Fact]
    public void MailCanReadOldCredentialsAndExistingVersionsCanReadNewOnes()
    {
        var oldSetting = new MailImportSecretProtector(new ApplicationSecretEncryption(null, FixtureKey));
        var newSetting = new MailImportSecretProtector(new ApplicationSecretEncryption(FixtureKey));
        Assert.Equal("saved-before-upgrade", oldSetting.Unprotect(LegacyCiphertext));
        Assert.Equal("saved-before-upgrade", newSetting.Unprotect(LegacyCiphertext));

        var envelope = Convert.FromBase64String(newSetting.Protect("changed-after-upgrade"));
        Assert.Equal(1, envelope[0]);
        using var oldReader = new AesGcm(Convert.FromBase64String(FixtureKey), 16);
        var plaintext = new byte[envelope.Length - 29];
        oldReader.Decrypt(envelope.AsSpan(1, 12), envelope.AsSpan(29), envelope.AsSpan(13, 16), plaintext,
            "BaikorR.MailImports.Password.v1"u8);
        Assert.Equal("changed-after-upgrade", Encoding.UTF8.GetString(plaintext));
    }

    [Fact]
    public void AStoredValueIsBoundToItsPurposeWithOneSharedKey()
    {
        var encryption = new ApplicationSecretEncryption(Key);
        var value = encryption.Protect("test-purpose", "secret");
        Assert.Equal("secret", encryption.Unprotect("test-purpose", value));
        Assert.ThrowsAny<CryptographicException>(() => encryption.Unprotect("other-purpose", value));
        Assert.ThrowsAny<CryptographicException>(() => new MailImportSecretProtector(encryption).Unprotect(value));
    }

    [Fact]
    public void AcceptsMatchingSettingsAndRejectsConflictingOrInvalidKeys()
    {
        var fingerprint = Convert.ToHexString(SHA256.HashData(Convert.FromBase64String(FixtureKey)));
        Assert.True(new ApplicationSecretEncryption(FixtureKey, FixtureKey).MatchesFingerprint(fingerprint));
        Assert.False(new ApplicationSecretEncryption(Key, FixtureKey).IsConfigured);
        Assert.False(new ApplicationSecretEncryption("malformed", FixtureKey).IsConfigured);
        Assert.False(new ApplicationSecretEncryption("", FixtureKey).IsConfigured);
        Assert.False(new ApplicationSecretEncryption(FixtureKey, "malformed").IsConfigured);
        Assert.False(new ApplicationSecretEncryption(Key).MatchesFingerprint(fingerprint));
    }
}
