using System.Security.Cryptography;
using BaikorR.Core.Importers.Rkom;

namespace BaikorR.Core.Features.MailImports;

public sealed class MailImportProcessor(IMailImportStore store, IMailboxClientFactory factory,
    IMailImportSecretProtector protector, IRkomTrenchesImporter importer)
{
    public async Task ProcessAsync(Guid owner, CancellationToken cancellationToken)
    {
        if (!protector.IsConfigured)
        {
            return;
        }
        var lease = await store.AcquireLeaseAsync(owner, cancellationToken);
        if (lease is null)
        {
            return;
        }
        using var workCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        using var renewalCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var renew = RenewAsync(lease, workCancellation, renewalCancellation.Token);
        var token = workCancellation.Token;
        try
        {
            var configuration = await store.GetAsync(token);
            string password;
            try
            {
                password = protector.Unprotect(configuration.EncryptedPassword ?? "");
            }
            catch (Exception exception) when (exception is CryptographicException or FormatException or InvalidOperationException)
            {
                await store.RecordErrorAsync(lease, "mailImport.encryptionUnavailable", true, token);
                return;
            }
            await using var mailbox = await factory.ConnectAsync(MailImportService.Connection(configuration, password), token);
            if (mailbox.UidValidity != configuration.UidValidity)
            {
                await store.RecordErrorAsync(lease, "mailImport.uidValidityChanged", true, token);
                return;
            }
            var batch = await mailbox.ReadBatchAsync(checked((uint)(configuration.NextUid ?? 1)), 25, token);
            if (!await store.DiscoverAsync(lease, batch, token))
            {
                return;
            }
            for (var index = 0; index < 25; index++)
            {
                var work = await store.TakeWorkAsync(lease, token);
                if (work is null)
                {
                    break;
                }
                try
                {
                    // A previous process can have committed the archive before losing its history update.
                    if (work.Sha256 is not null && await store.HasMailReceiptAsync(work.Sha256, token))
                    {
                        await store.CompleteWorkAsync(lease, work.Id, "duplicate", null, [], null, false, token);
                        continue;
                    }
                    if (work.Attempts - work.RetryCycleStartAttempt > 5)
                    {
                        await store.CompleteWorkAsync(lease, work.Id, "failed", null, [], "mailImport.retryExhausted", false, token);
                        continue;
                    }
                    var content = await mailbox.ReadAttachmentAsync(checked((uint)work.Uid), work.PartId, token);
                    if (content.Length is < 1 or > 25 * 1024 * 1024)
                    {
                        throw new MailImportTransportException("mailImport.attachmentTooLarge", false);
                    }
                    var hash = Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();
                    if (!await store.SetWorkHashAsync(lease, work.Id, hash, token))
                    {
                        return;
                    }
                    if (await store.HasMailReceiptAsync(hash, token))
                    {
                        await store.CompleteWorkAsync(lease, work.Id, "duplicate", null, [], null, false, token);
                        continue;
                    }
                    var result = await importer.ExecuteAsync(new(work.FileName, content, configuration.BufferMetres) { MailLease = lease }, token);
                    if (result.IsSuccess)
                    {
                        await store.CompleteWorkAsync(lease, work.Id, "imported", result.Value.CreatedCount, result.Value.Warnings.ToArray(), null, false, token);
                    }
                    else
                    {
                        var duplicate = result.Errors.Any(x => x.Metadata.TryGetValue("Key", out var key) && Equals(key, RkomTrenchesImportResults.DuplicateErrorKey));
                        var conflict = result.Errors.Any(x => x.Metadata.TryGetValue("Key", out var key) && Equals(key, RkomTrenchesImportResults.ConflictErrorKey));
                        await store.CompleteWorkAsync(lease, work.Id, duplicate ? "duplicate" : "failed", null, [],
                            duplicate ? null : conflict ? "mailImport.importConflict" : "mailImport.archiveInvalid", conflict, token);
                    }
                }
                catch (MailImportTransportException exception)
                {
                    await store.CompleteWorkAsync(lease, work.Id, "failed", null, [], exception.ErrorKey, exception.IsTransient, token);
                    if (exception.ErrorKey == "mailImport.authenticationFailed")
                    {
                        await store.RecordErrorAsync(lease, exception.ErrorKey, true, token);
                        return;
                    }
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception)
                {
                    // No exception text is persisted. Database outages may prevent this write;
                    // the persisted processing deadline then supplies recovery backoff and a bound.
                    await store.CompleteWorkAsync(lease, work.Id, "failed", null, [], "mailImport.processingFailed", true, token);
                }
            }
        }
        catch (MailImportTransportException exception)
        {
            await store.RecordErrorAsync(lease, exception.ErrorKey, !exception.IsTransient, token);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            // Durable work is recovered by the next owner. No stale owner may commit imported sites.
        }
        finally
        {
            await renewalCancellation.CancelAsync();
            await renew;
            if (!cancellationToken.IsCancellationRequested)
            {
                await store.ReleaseLeaseAsync(lease, cancellationToken);
            }
        }
    }

    private async Task RenewAsync(MailImportLease lease, CancellationTokenSource workCancellation, CancellationToken cancellationToken)
    {
        try
        {
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(15));
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                if (!await store.RenewLeaseAsync(lease, cancellationToken))
                {
                    await workCancellation.CancelAsync();
                    return;
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch
        {
            await workCancellation.CancelAsync();
        }
    }
}
