using System.Security.Cryptography;
using System.Text;

namespace BaikorR.Core.Shared.Security;

/// <summary>Encrypts recoverable application secrets with authenticated, purpose-bound AES-GCM.</summary>
public sealed class ApplicationSecretEncryption
{
    private const int NonceLength = 12;
    private const int TagLength = 16;
    private const int HeaderLength = 1 + NonceLength + TagLength;
    private readonly byte[]? key;

    public ApplicationSecretEncryption(string? encodedKey, string? legacyMailKey = null)
    {
        key = DecodeKey(encodedKey ?? legacyMailKey);
        if (encodedKey is not null && legacyMailKey is not null && key is not null)
        {
            var legacy = DecodeKey(legacyMailKey);
            if (legacy is null || !CryptographicOperations.FixedTimeEquals(key, legacy))
            {
                CryptographicOperations.ZeroMemory(key);
                key = null;
            }
            if (legacy is not null)
            {
                CryptographicOperations.ZeroMemory(legacy);
            }
        }
    }

    public bool IsConfigured => key is not null;

    public bool MatchesFingerprint(string expectedSha256) =>
        key is not null && string.Equals(Convert.ToHexString(SHA256.HashData(key)), expectedSha256,
            StringComparison.OrdinalIgnoreCase);

    private static byte[]? DecodeKey(string? encoded)
    {
        var bytes = new byte[32];
        if (encoded is not null && Convert.TryFromBase64String(encoded, bytes, out var written) && written == bytes.Length)
        {
            return bytes;
        }
        CryptographicOperations.ZeroMemory(bytes);
        return null;
    }

    public string Protect(string purpose, string plaintext)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(purpose);
        using var aes = CreateCipher();
        var bytes = Encoding.UTF8.GetBytes(plaintext);
        try
        {
            // Preserve the v1 envelope used by deployed mail credentials, including newly written passwords.
            var envelope = new byte[HeaderLength + bytes.Length];
            envelope[0] = 1;
            var nonce = envelope.AsSpan(1, NonceLength);
            RandomNumberGenerator.Fill(nonce);
            aes.Encrypt(nonce, bytes, envelope.AsSpan(HeaderLength), envelope.AsSpan(1 + NonceLength, TagLength),
                Encoding.UTF8.GetBytes(purpose));
            return Convert.ToBase64String(envelope);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

    public string Unprotect(string purpose, string ciphertext)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(purpose);
        using var aes = CreateCipher();
        byte[] envelope;
        try
        {
            envelope = Convert.FromBase64String(ciphertext);
        }
        catch (FormatException)
        {
            throw new CryptographicException("Application secret cannot be decrypted.");
        }
        if (envelope.Length < HeaderLength || envelope[0] != 1)
        {
            throw new CryptographicException("Application secret cannot be decrypted.");
        }
        var bytes = new byte[envelope.Length - HeaderLength];
        try
        {
            aes.Decrypt(envelope.AsSpan(1, NonceLength), envelope.AsSpan(HeaderLength),
                envelope.AsSpan(1 + NonceLength, TagLength), bytes, Encoding.UTF8.GetBytes(purpose));
            return Encoding.UTF8.GetString(bytes);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

    private AesGcm CreateCipher() =>
        new(key ?? throw new InvalidOperationException("Application secret encryption is not configured."), TagLength);
}
