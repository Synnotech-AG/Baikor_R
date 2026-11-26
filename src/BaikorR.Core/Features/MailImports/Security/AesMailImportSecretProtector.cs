using System.Security.Cryptography;
using System.Text;

namespace BaikorR.Core.Features.MailImports.Security;

public sealed class AesMailImportSecretProtector : IMailImportSecretProtector
{
    private static readonly byte[] AssociatedData = "BaikorR.MailImports.Password.v1"u8.ToArray();
    private readonly byte[]? key;

    public AesMailImportSecretProtector(string? encodedKey)
    {
        try
        {
            var candidate = Convert.FromBase64String(encodedKey ?? "");
            if (candidate.Length == 32)
            {
                key = candidate;
            }
        }
        catch (FormatException)
        {
            // A missing or invalid mail key must not prevent application startup.
        }
    }

    public bool IsConfigured => key is not null;

    public string Protect(string plaintext)
    {
        EnsureConfigured();
        var bytes = Encoding.UTF8.GetBytes(plaintext);
        try
        {
            // Version byte, random nonce, authentication tag, ciphertext.
            var envelope = new byte[1 + 12 + 16 + bytes.Length];
            envelope[0] = 1;
            RandomNumberGenerator.Fill(envelope.AsSpan(1, 12));
            using var aes = new AesGcm(key!, 16);
            aes.Encrypt(envelope.AsSpan(1, 12), bytes, envelope.AsSpan(29), envelope.AsSpan(13, 16), AssociatedData);
            return Convert.ToBase64String(envelope);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

    public string Unprotect(string ciphertext)
    {
        EnsureConfigured();
        byte[] envelope;
        try
        {
            envelope = Convert.FromBase64String(ciphertext);
        }
        catch (FormatException)
        {
            throw new CryptographicException("Mail import credential cannot be decrypted.");
        }
        if (envelope.Length < 29 || envelope[0] != 1)
        {
            throw new CryptographicException("Mail import credential cannot be decrypted.");
        }
        var bytes = new byte[envelope.Length - 29];
        try
        {
            using var aes = new AesGcm(key!, 16);
            aes.Decrypt(envelope.AsSpan(1, 12), envelope.AsSpan(29), envelope.AsSpan(13, 16), bytes, AssociatedData);
            return Encoding.UTF8.GetString(bytes);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

    private void EnsureConfigured()
    {
        if (key is null)
        {
            throw new InvalidOperationException("Mail import encryption is not configured.");
        }
    }
}
