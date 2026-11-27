using System.Security.Cryptography;
using BaikorR.Core.Features.MailImports;
using BaikorR.Core.Shared.Security;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace BaikorR.Host.Hosting;

internal sealed class ApplicationEncryptionHealthCheck(ApplicationSecretEncryption encryption,
    IMailImportSecretProtector mailboxPasswords, IConfiguration configuration, IServiceScopeFactory scopes) : IHealthCheck
{
    private readonly SemaphoreSlim gate = new(1);
    private volatile bool verified;

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken)
    {
        if (verified)
        {
            return HealthCheckResult.Healthy();
        }
        if (!encryption.IsConfigured)
        {
            return HealthCheckResult.Unhealthy("Application encryption key is missing, malformed, or conflicts with the legacy key.");
        }
        if (configuration["Encryption:ExpectedKeySha256"] is { } expected && !encryption.MatchesFingerprint(expected))
        {
            return HealthCheckResult.Unhealthy("Application encryption key does not match the deployment fingerprint.");
        }

        await gate.WaitAsync(cancellationToken);
        try
        {
            if (!verified)
            {
                await using var scope = scopes.CreateAsyncScope();
                var store = scope.ServiceProvider.GetRequiredService<IMailImportStore>();
                var settings = await store.GetAsync(cancellationToken);
                if (settings.EncryptedPassword is not null)
                {
                    mailboxPasswords.Unprotect(settings.EncryptedPassword);
                }
                verified = true;
            }
            return HealthCheckResult.Healthy();
        }
        catch (CryptographicException)
        {
            return HealthCheckResult.Unhealthy("Application encryption key cannot decrypt the saved mailbox credential.");
        }
        finally
        {
            gate.Release();
        }
    }
}
