using BaikorR.Core.Features.MailImports;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace BaikorR.Core.Persistence.MailImports;

public sealed class MailImportDbStore(BaikorRDbContext dbContext) : IMailImportStore
{
    private static readonly string[] RetryableStates = ["failed", "retry"];

    public Task<MailImportConfiguration> GetAsync(CancellationToken cancellationToken) =>
        dbContext.MailImportConfigurations.AsNoTracking().SingleAsync(cancellationToken);

    public async Task<bool> SaveConfigurationAsync(MailImportConfiguration configuration, long expectedVersion, bool invalidatePending, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var current = await LockAsync(cancellationToken);
        if (current.Version != expectedVersion)
        {
            return false;
        }
        current.Enabled = configuration.Enabled;
        current.Host = configuration.Host;
        current.Port = configuration.Port;
        current.Security = configuration.Security;
        current.Username = configuration.Username;
        current.Folder = configuration.Folder;
        current.EncryptedPassword = configuration.EncryptedPassword;
        current.PollIntervalSeconds = configuration.PollIntervalSeconds;
        current.BufferMetres = configuration.BufferMetres;
        if (current.Generation != configuration.Generation)
        {
            current.Generation = configuration.Generation;
            current.UidValidity = configuration.UidValidity;
            current.NextUid = configuration.NextUid;
            current.ActivatedAt = configuration.ActivatedAt;
            current.ErrorKey = null;
        }
        // Discovery does not edit the settings version. Never overwrite its newer cursor
        // or UIDVALIDITY halt from the earlier settings snapshot when the source is unchanged.
        current.ErrorKey = current.ErrorKey == "mailImport.uidValidityChanged" ? current.ErrorKey : null;
        current.Halted = current.ErrorKey is not null;
        current.NextCheckAt = null;
        current.Version++;
        // Any configuration edit revokes the in-flight worker. Its commit guard checks this fence.
        current.LeaseFence++;
        current.LeaseOwner = null;
        current.LeaseExpiresAt = null;
        if (invalidatePending)
        {
            await dbContext.MailImportWorkItems.Where(x => x.State == "pending" || x.State == "retry" || x.State == "processing")
                .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.State, "configurationChanged")
                    .SetProperty(x => x.ErrorKey, "mailImport.configurationChanged")
                    .SetProperty(x => x.CompletedAt, DateTimeOffset.UtcNow), cancellationToken);
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        configuration.Version = current.Version;
        return true;
    }

    public async Task<MailImportStatusResponse> StatusAsync(CancellationToken cancellationToken)
    {
        var config = await GetAsync(cancellationToken);
        var counts = await dbContext.MailImportWorkItems.AsNoTracking().GroupBy(x => x.State)
            .Select(x => new { State = x.Key, Count = x.Count() }).ToDictionaryAsync(x => x.State, x => x.Count, cancellationToken);
        var working = config.LeaseOwner is not null && config.LeaseExpiresAt > DateTimeOffset.UtcNow;
        return new(config.Enabled, !config.Enabled ? "paused" : config.Halted ? "error" : working ? "checking" : "idle",
            config.LastCheckedAt, config.LastSuccessAt, config.ActivatedAt, config.ErrorKey,
            counts.GetValueOrDefault("pending") + counts.GetValueOrDefault("retry") + counts.GetValueOrDefault("processing"),
            counts.GetValueOrDefault("failed"), counts.GetValueOrDefault("imported"));
    }

    public async Task<MailImportHistoryResponse> HistoryAsync(int page, int pageSize, CancellationToken cancellationToken, bool processedOnly = false)
    {
        var config = await GetAsync(cancellationToken);
        var query = dbContext.MailImportWorkItems.AsNoTracking();
        if (processedOnly)
        {
            query = query.Where(x => x.CompletedAt != null && EF.Functions.ILike(x.FileName, "%.zip")
                && (x.State == "imported" || x.State == "failed" || x.State == "sourceMissing"));
        }
        var count = await query.CountAsync(cancellationToken);
        var ordered = processedOnly ? query.OrderByDescending(x => x.CompletedAt) : query.OrderByDescending(x => x.CreatedAt);
        var items = await ordered.ThenByDescending(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(cancellationToken);
        return new(items.Select(x => new MailImportHistoryItem(x.Id, x.FileName, x.State, x.CreatedAt,
            x.CompletedAt, x.CreatedCount, x.Warnings, x.ErrorKey, x.Attempts,
            config.Enabled && !config.Halted && x.Generation == config.Generation && RetryableStates.Contains(x.State))).ToArray(), page, pageSize, count);
    }

    public async Task<bool> ScheduleCheckAsync(CancellationToken cancellationToken) =>
        await dbContext.MailImportConfigurations.Where(x => x.Id == 1 && x.Enabled && !x.Halted)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.NextCheckAt, (DateTimeOffset?)null), cancellationToken) != 0;

    public async Task<bool> RetryAsync(Guid id, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var config = await LockAsync(cancellationToken);
        if (!config.Enabled || config.Halted) { return false; }
        var now = await MailImportDbClock.UtcNowAsync(dbContext, cancellationToken);
        var changed = await dbContext.MailImportWorkItems.Where(x => x.Id == id && x.Generation == config.Generation
                && (x.State == "failed" || x.State == "retry"))
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.State, "pending")
                .SetProperty(x => x.RetryCycleStartAttempt, x => x.Attempts).SetProperty(x => x.AvailableAt, now)
                .SetProperty(x => x.CompletedAt, (DateTimeOffset?)null).SetProperty(x => x.ErrorKey, (string?)null), cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return changed != 0;
    }

    public async Task<MailImportLease?> AcquireLeaseAsync(Guid owner, CancellationToken cancellationToken)
    {
        // Database time is authoritative for all replicas. No transaction spans IMAP I/O.
        var changed = await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE baikor.mail_import_configuration SET "LeaseOwner" = {owner}, "LeaseFence" = "LeaseFence" + 1,
                "LeaseExpiresAt" = clock_timestamp() + INTERVAL '60 seconds'
            WHERE "Id" = 1 AND "Enabled" AND NOT "Halted"
                AND ("LeaseExpiresAt" IS NULL OR "LeaseExpiresAt" <= clock_timestamp())
                AND ("NextCheckAt" IS NULL OR "NextCheckAt" <= clock_timestamp() OR EXISTS (
                    SELECT 1 FROM baikor.mail_import_work w WHERE w."Generation" = "mail_import_configuration"."Generation"
                    AND (w."State" IN ('processing', 'pending', 'retry') AND w."AvailableAt" <= clock_timestamp())))
            """, cancellationToken);
        if (changed == 0) { return null; }
        var current = await GetAsync(cancellationToken);
        return new(owner, current.LeaseFence, current.Generation);
    }

    public async Task<bool> RenewLeaseAsync(MailImportLease lease, CancellationToken cancellationToken)
    {
        // Renewal uses its own connection; EF contexts cannot be used concurrently with attachment/import work.
        await using var connection = new NpgsqlConnection(dbContext.Database.GetConnectionString());
        await connection.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand("""
            UPDATE baikor.mail_import_configuration SET "LeaseExpiresAt" = clock_timestamp() + INTERVAL '60 seconds'
            WHERE "Id" = 1 AND "Enabled" AND NOT "Halted" AND "LeaseOwner" = @owner
                AND "LeaseFence" = @fence AND "Generation" = @generation AND "LeaseExpiresAt" > clock_timestamp()
            """, connection);
        command.Parameters.AddWithValue("owner", lease.Owner);
        command.Parameters.AddWithValue("fence", lease.Fence);
        command.Parameters.AddWithValue("generation", lease.Generation);
        return await command.ExecuteNonQueryAsync(cancellationToken) != 0;
    }

    public Task ReleaseLeaseAsync(MailImportLease lease, CancellationToken cancellationToken) =>
        dbContext.MailImportConfigurations.Where(x => x.Id == 1 && x.LeaseOwner == lease.Owner && x.LeaseFence == lease.Fence)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.LeaseOwner, (Guid?)null)
                .SetProperty(x => x.LeaseExpiresAt, (DateTimeOffset?)null), cancellationToken);

    public async Task<bool> DiscoverAsync(MailImportLease lease, MailboxBatch batch, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var current = await LockAsync(cancellationToken);
        if (!await MailImportDbClock.OwnsAsync(dbContext, lease, cancellationToken)) { return false; }
        if (current.UidValidity != batch.UidValidity)
        {
            current.ErrorKey = "mailImport.uidValidityChanged";
            current.Halted = true;
            current.LastCheckedAt = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return false;
        }
        var now = await MailImportDbClock.UtcNowAsync(dbContext, cancellationToken);
        foreach (var message in batch.Messages.Where(x => x.Uid >= current.NextUid).OrderBy(x => x.Uid))
        {
            foreach (var attachment in message.Attachments.Where(x => x.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)))
            {
                if (attachment.PartId.Length is 0 or > 128) { continue; }
                var name = SafeFileName(attachment.FileName);
                var exists = await dbContext.MailImportWorkItems.AnyAsync(x => x.Generation == lease.Generation
                    && x.UidValidity == batch.UidValidity && x.Uid == message.Uid && x.PartId == attachment.PartId, cancellationToken);
                if (!exists)
                {
                    dbContext.MailImportWorkItems.Add(new()
                    {
                        Generation = lease.Generation, UidValidity = batch.UidValidity, Uid = message.Uid,
                        PartId = attachment.PartId, FileName = name, CreatedAt = now, AvailableAt = now
                    });
                }
            }
        }
        current.NextUid = Math.Max(current.NextUid ?? 1, batch.NextUid);
        current.LastCheckedAt = now;
        current.NextCheckAt = now.AddSeconds(current.PollIntervalSeconds);
        current.ErrorKey = null;
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    public async Task<MailImportWorkItem?> TakeWorkAsync(MailImportLease lease, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var current = await LockAsync(cancellationToken);
        if (!await MailImportDbClock.OwnsAsync(dbContext, lease, cancellationToken)) { return null; }
        var now = await MailImportDbClock.UtcNowAsync(dbContext, cancellationToken);
        var work = await dbContext.MailImportWorkItems.Where(x => x.Generation == lease.Generation
                && x.AvailableAt <= now && (x.State == "processing" && x.LeaseFence != lease.Fence
                    || x.State == "pending" || x.State == "retry"))
            .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).FirstOrDefaultAsync(cancellationToken);
        if (work is null) { return null; }
        work.State = "processing";
        work.LeaseFence = lease.Fence;
        work.Attempts++;
        // Persist recovery backoff before external I/O, including when a later database outage
        // prevents recording the result. A restarted process cannot spin on interrupted work.
        work.AvailableAt = now.AddSeconds(Math.Min(300, 15 * Math.Pow(2, Math.Min(5, work.Attempts - work.RetryCycleStartAttempt - 1))));
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return work;
    }

    public async Task<bool> HasMailReceiptAsync(string sha256, CancellationToken cancellationToken) =>
        await dbContext.ArchiveImportReceipts.AnyAsync(x => x.Sha256 == sha256, cancellationToken)
        || await dbContext.MailImportLegacyReceipts.AnyAsync(x => x.Sha256 == sha256, cancellationToken);

    public async Task<bool> SetWorkHashAsync(MailImportLease lease, Guid id, string sha256, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var current = await LockAsync(cancellationToken);
        if (!await MailImportDbClock.OwnsAsync(dbContext, lease, cancellationToken)) { return false; }
        var count = await dbContext.MailImportWorkItems.Where(x => x.Id == id && x.State == "processing" && x.LeaseFence == lease.Fence)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.Sha256, sha256), cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return count != 0;
    }

    public async Task CompleteWorkAsync(MailImportLease lease, Guid id, string state, int? createdCount, string? errorKey, bool transient, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var current = await LockAsync(cancellationToken);
        if (!await MailImportDbClock.OwnsAsync(dbContext, lease, cancellationToken)) { return; }
        var work = await dbContext.MailImportWorkItems.SingleAsync(x => x.Id == id, cancellationToken);
        if (work.LeaseFence != lease.Fence || work.State != "processing") { return; }
        var now = await MailImportDbClock.UtcNowAsync(dbContext, cancellationToken);
        work.State = transient && work.Attempts - work.RetryCycleStartAttempt < 5 ? "retry" : state;
        work.AvailableAt = now.AddSeconds(Math.Min(300, 15 * Math.Pow(2, Math.Min(5, work.Attempts - work.RetryCycleStartAttempt - 1))));
        work.CompletedAt = work.State == "retry" ? null : now;
        work.CreatedCount = createdCount;
        work.ErrorKey = errorKey;
        if (state is "imported" or "duplicate") { current.LastSuccessAt = now; }
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public async Task RecordErrorAsync(MailImportLease lease, string errorKey, bool halt, CancellationToken cancellationToken)
    {
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE baikor.mail_import_configuration SET "ErrorKey" = {errorKey}, "Halted" = {halt},
                "LastCheckedAt" = clock_timestamp(), "NextCheckAt" = clock_timestamp() + INTERVAL '60 seconds'
            WHERE "Id" = 1 AND "Enabled" AND "LeaseOwner" = {lease.Owner} AND "LeaseFence" = {lease.Fence}
                AND "Generation" = {lease.Generation} AND "LeaseExpiresAt" > clock_timestamp()
            """, cancellationToken);
    }

    private async Task<MailImportConfiguration> LockAsync(CancellationToken cancellationToken)
    {
        dbContext.ChangeTracker.Clear();
        return await dbContext.MailImportConfigurations.FromSqlRaw("SELECT * FROM baikor.mail_import_configuration WHERE \"Id\" = 1 FOR UPDATE")
            .SingleAsync(cancellationToken);
    }

    private static string SafeFileName(string fileName)
    {
        var name = fileName.Replace('\\', '/').Split('/').Last();
        name = new string(name.Where(x => !char.IsControl(x)).ToArray());
        if (name.Length > 255)
        {
            // Preserve the already-validated ZIP extension when bounding display/persistence data.
            name = name[..251] + name[^4..];
        }
        return string.IsNullOrWhiteSpace(name) ? "attachment.zip" : name;
    }
}
