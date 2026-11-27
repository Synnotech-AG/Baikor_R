using System.IO.Compression;
using System.Security.Cryptography;
using BaikorR.Core.Features.MailImports;
using BaikorR.Core.Features.MailImports.Security;
using BaikorR.Core.Importers.Rkom;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.MailImports;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Core.Shared.Security;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Features;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO.Esri;

namespace BaikorR.Api.Tests;

public sealed class MailImportPostgisTests
{
    [PostgisFact]
    public async Task OnlyNewMailImportsOnceAndBadArchivesDoNotBlockOtherAttachments()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var mailbox = new Mailbox();
        var store = new MailImportDbStore(context);
        var protector = new Protector();
        var service = new MailImportService(store, mailbox, protector, TimeProvider.System);
        Assert.True((await service.SaveAsync(Request(), default)).IsSuccess);
        var archive = CreateArchive();
        mailbox.Attachments[(42, "1")] = [1, 2, 3];
        mailbox.Attachments[(42, "2")] = archive;
        mailbox.Attachments[(43, "1")] = archive;
        mailbox.Messages = [new(1, [new("1", "old.zip", 10)]), new(42, [new("1", "bad.zip", 3), new("2", new string('a', 300) + ".ZIP", archive.Length)]), new(43, [new("1", "same.zip", archive.Length)]), new(44, [])];
        mailbox.NextUid = 45;
        await Processor(context, store, mailbox, protector).ProcessAsync(Guid.NewGuid(), default);
        Assert.Equal(new uint[] { 42, 42, 43 }, mailbox.Downloaded.Select(x => x.Uid).Order());
        var history = await store.HistoryAsync(1, 20, default);
        Assert.Empty(Assert.Single(history.Items, x => x.State == "imported").Warnings);
        Assert.Equal(3, history.TotalCount);
        Assert.Single(history.Items, x => x.State == "failed");
        var longName = Assert.Single(history.Items, x => x.FileName.StartsWith("aaa", StringComparison.Ordinal));
        Assert.Equal(255, longName.FileName.Length);
        Assert.EndsWith(".ZIP", longName.FileName);
        Assert.Single(history.Items, x => x.State == "duplicate");
        Assert.DoesNotContain(history.Items, x => x.State == "ignored");
        Assert.Single(await context.ConstructionSites.ToArrayAsync());
        Assert.Single(await context.ArchiveImportReceipts.ToArrayAsync());
        Assert.Equal(45, (await store.GetAsync(default)).NextUid);
    }

    [PostgisFact]
    public async Task ProcessedHistoryFiltersBeforePagingAndUsesCompletionTime()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var store = new MailImportDbStore(context);
        var now = DateTimeOffset.UtcNow;
        string[] states = ["imported", "failed", "duplicate", "ignored", "pending", "retry", "processing", "configurationChanged", "sourceMissing"];
        for (var i = 0; i < states.Length; i++)
        {
            context.MailImportWorkItems.Add(new()
            {
                Uid = i + 1, PartId = "1", State = states[i], FileName = states[i] == "ignored" ? "" : $"{i}.zip",
                CreatedAt = now.AddMinutes(-20 + i), AvailableAt = now, Warnings = i == 0 ? ["previous warning"] : [],
                CompletedAt = states[i] is "pending" or "retry" or "processing" ? null : now.AddMinutes(-i)
            });
        }
        await context.SaveChangesAsync();

        var first = await store.HistoryAsync(1, 2, default, processedOnly: true);
        Assert.Equal(3, first.TotalCount);
        Assert.Equal(new[] { "imported", "failed" }, first.Items.Select(x => x.State));
        Assert.Equal("previous warning", Assert.Single(first.Items[0].Warnings));
        Assert.Equal("sourceMissing", Assert.Single((await store.HistoryAsync(2, 2, default, processedOnly: true)).Items).State);
        var full = await store.HistoryAsync(1, 20, default);
        Assert.Equal(states.Length, full.TotalCount);
        Assert.Equal("sourceMissing", full.Items[0].State);
    }

    [PostgisFact]
    public async Task SwitchingAnActiveFolderFencesOldWorkAndRejectsAStaleSettingsSave()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        await EnableAsync(context);
        var store = new MailImportDbStore(context);
        var oldLease = Assert.IsType<MailImportLease>(await store.AcquireLeaseAsync(Guid.NewGuid(), default));
        Assert.True(await store.DiscoverAsync(oldLease, new(7, 43, [new(42, [new("1", "previous.zip", 10)])]), default));
        var item = Assert.IsType<MailImportWorkItem>(await store.TakeWorkAsync(oldLease, default));
        var service = new MailImportService(store, new Mailbox { NextUid = 92 }, new Protector(), TimeProvider.System);
        var change = Request() with { Folder = "Projects", Version = 1, Password = null };

        Assert.True((await service.SaveAsync(change, default)).IsSuccess);
        Assert.True((await service.SaveAsync(change with { Folder = "Stale" }, default)).IsFailed);
        Assert.False(await store.DiscoverAsync(oldLease, new(7, 300, []), default));
        await store.CompleteWorkAsync(oldLease, item.Id, "imported", 1, null, false, default);
        Assert.Equal("configurationChanged", Assert.Single((await store.HistoryAsync(1, 20, default)).Items).State);
        Assert.Empty((await store.HistoryAsync(1, 20, default, processedOnly: true)).Items);
        var config = await store.GetAsync(default);
        Assert.Equal("Projects", config.Folder);
        Assert.Equal(92, config.NextUid);
        Assert.NotEqual(oldLease.Generation, config.Generation);
        Assert.True(config.Enabled);
    }

    [PostgisFact]
    public async Task ConcurrentSettingsEditPreservesNewerDiscoveryCursor()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        await EnableAsync(context);
        var store = new MailImportDbStore(context);
        var staleSettingsSnapshot = await store.GetAsync(default);
        var lease = Assert.IsType<MailImportLease>(await store.AcquireLeaseAsync(Guid.NewGuid(), default));
        Assert.True(await store.DiscoverAsync(lease, new(7, 99, []), default));
        staleSettingsSnapshot.PollIntervalSeconds = 120;
        Assert.True(await store.SaveConfigurationAsync(staleSettingsSnapshot, staleSettingsSnapshot.Version, false, default));
        var actual = await store.GetAsync(default);
        Assert.Equal(99, actual.NextUid);
        Assert.Equal(7, actual.UidValidity);
        Assert.Equal(staleSettingsSnapshot.Generation, actual.Generation);
        Assert.Equal(120, actual.PollIntervalSeconds);
    }

    [PostgisFact]
    public async Task InterruptedRecoveryIsBoundedAndManualRetryPreservesTotalAttempts()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        await EnableAsync(context);
        var store = new MailImportDbStore(context);
        var lease = Assert.IsType<MailImportLease>(await store.AcquireLeaseAsync(Guid.NewGuid(), default));
        Assert.True(await store.DiscoverAsync(lease, new(7, 43, [new(42, [new("1", "bad.zip", 3)])]), default));
        var work = Assert.IsType<MailImportWorkItem>(await store.TakeWorkAsync(lease, default));
        await store.ReleaseLeaseAsync(lease, default);
        Assert.Null(await store.AcquireLeaseAsync(Guid.NewGuid(), default)); // Persisted recovery deadline prevents a hot loop.
        await context.Database.ExecuteSqlRawAsync("UPDATE baikor.mail_import_work SET \"Attempts\" = 5, \"AvailableAt\" = clock_timestamp() - INTERVAL '1 second'");
        var mailbox = new Mailbox { NextUid = 43 };
        await Processor(context, store, mailbox, new Protector()).ProcessAsync(Guid.NewGuid(), default);
        var exhausted = Assert.Single((await store.HistoryAsync(1, 20, default)).Items);
        Assert.Equal("failed", exhausted.State);
        Assert.Equal("mailImport.retryExhausted", exhausted.ErrorKey);
        Assert.Equal(6, exhausted.Attempts);
        Assert.Empty(mailbox.Downloaded);
        // This connection's scheduler clock is deliberately behind the application host.
        // A manual retry must be due on the very next worker tick despite that skew.
        await context.Database.OpenConnectionAsync();
        await context.Database.ExecuteSqlRawAsync("""
            CREATE SCHEMA retry_test_clock;
            CREATE FUNCTION retry_test_clock.clock_timestamp() RETURNS timestamptz LANGUAGE sql
                AS 'SELECT pg_catalog.clock_timestamp() - interval ''1 hour''';
            SET search_path TO retry_test_clock, pg_catalog, public;
            """);
        Assert.True(await store.RetryAsync(work.Id, default));
        mailbox.Attachments[(42, "1")] = [1, 2, 3];
        await Processor(context, store, mailbox, new Protector()).ProcessAsync(Guid.NewGuid(), default);
        var retried = Assert.Single((await store.HistoryAsync(1, 20, default)).Items);
        Assert.Equal(7, retried.Attempts);
        Assert.Equal("mailImport.archiveInvalid", retried.ErrorKey);
    }

    [PostgisFact]
    public async Task MissingKeyShowsUnavailableAndHaltedHistoryDoesNotOfferRetry()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        await EnableAsync(context);
        var store = new MailImportDbStore(context);
        var service = new MailImportService(store, new Mailbox(),
            new MailImportSecretProtector(new ApplicationSecretEncryption(null)), TimeProvider.System);
        var status = await service.StatusAsync(default);
        Assert.Equal("unavailable", status.State);
        Assert.Equal("mailImport.encryptionUnavailable", status.ErrorKey);
        var config = await store.GetAsync(default);
        context.MailImportWorkItems.Add(new() { Generation = config.Generation, UidValidity = 7, Uid = 42, PartId = "1", FileName = "bad.zip", State = "failed", CreatedAt = DateTimeOffset.UtcNow, AvailableAt = DateTimeOffset.UtcNow });
        await context.SaveChangesAsync();
        await context.Database.ExecuteSqlRawAsync("UPDATE baikor.mail_import_configuration SET \"Halted\" = true, \"ErrorKey\" = 'mailImport.uidValidityChanged'");
        Assert.False(Assert.Single((await store.HistoryAsync(1, 20, default)).Items).CanRetry);
    }

    [PostgisFact]
    public async Task LeaseTakeoverFencesExpiredDiscoveryErrorsAndArchiveCommits()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var first = database.CreateContext();
        await EnableAsync(first);
        var oldStore = new MailImportDbStore(first);
        var oldLease = Assert.IsType<MailImportLease>(await oldStore.AcquireLeaseAsync(Guid.NewGuid(), default));
        await using var second = database.CreateContext();
        var newStore = new MailImportDbStore(second);
        Assert.Null(await newStore.AcquireLeaseAsync(Guid.NewGuid(), default));
        await second.Database.ExecuteSqlRawAsync("UPDATE baikor.mail_import_configuration SET \"LeaseExpiresAt\" = clock_timestamp() - INTERVAL '1 second'");
        var newLease = Assert.IsType<MailImportLease>(await newStore.AcquireLeaseAsync(Guid.NewGuid(), default));
        Assert.True(newLease.Fence > oldLease.Fence);
        Assert.False(await oldStore.DiscoverAsync(oldLease, new(7, 45, [new(44, [new("1", "late.zip", 3)])]), default));
        await oldStore.RecordErrorAsync(oldLease, "mailImport.connectionFailed", true, default);
        Assert.Null((await newStore.GetAsync(default)).ErrorKey);
        var stale = await Importer(first).ExecuteAsync(new("late.zip", CreateArchive()) { MailLease = oldLease }, default);
        Assert.True(stale.IsFailed);
        Assert.Empty(await first.ConstructionSites.ToArrayAsync());
        Assert.Empty(await first.ArchiveImportReceipts.ToArrayAsync());
        Assert.True(await newStore.DiscoverAsync(newLease, new(7, 43, [new(42, Enumerable.Range(1, 101).Select(x => new MailboxAttachment(x.ToString(), $"part-{x}.zip", 3)).ToArray())]), default));
        Assert.Equal(101, await second.MailImportWorkItems.CountAsync());
        Assert.Equal(43, (await newStore.GetAsync(default)).NextUid);
    }

    [PostgisFact]
    public async Task MailAndManualUploadRaceCommitOneReceiptAndOneSite()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var mail = database.CreateContext();
        await EnableAsync(mail);
        var lease = Assert.IsType<MailImportLease>(await new MailImportDbStore(mail).AcquireLeaseAsync(Guid.NewGuid(), default));
        await using var manual = database.CreateContext();
        var archive = CreateArchive();
        var results = await Task.WhenAll(
            Importer(mail).ExecuteAsync(new("mail.zip", archive) { MailLease = lease }, default),
            Importer(manual).ExecuteAsync(new("manual.zip", archive), default));
        Assert.Single(results, x => x.IsSuccess);
        Assert.Single(results, x => x.IsFailed && x.Errors.Any(error => error.Metadata.TryGetValue("Key", out var key) && Equals(key, "constructionSites.import.duplicate")));
        await using var verify = database.CreateContext();
        Assert.Single(await verify.ConstructionSites.ToArrayAsync());
        Assert.Single(await verify.ArchiveImportReceipts.ToArrayAsync());
    }

    [PostgisFact]
    public async Task ExpiryImmediatelyBeforeCommitRollsBackReceiptAndSites()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        await EnableAsync(context);
        var store = new MailImportDbStore(context);
        var lease = Assert.IsType<MailImportLease>(await store.AcquireLeaseAsync(Guid.NewGuid(), default));
        var session = new ConstructionSiteDbSession(context);
        await using (var transaction = await session.BeginImportAsync(new string('a', 64), lease, default))
        {
            Assert.True(transaction.IsAuthorized);
            session.Add(new() { Id = Guid.NewGuid(), Title = "Must roll back", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
            Assert.True(await session.SaveChangesAsync(default));
            await context.Database.ExecuteSqlRawAsync("UPDATE baikor.mail_import_configuration SET \"LeaseExpiresAt\" = clock_timestamp() - INTERVAL '1 second'");
            Assert.False(await transaction.CompleteAsync(default));
        }
        Assert.Empty(await context.ConstructionSites.ToArrayAsync());
        Assert.Empty(await context.ArchiveImportReceipts.ToArrayAsync());
    }

    [PostgisFact]
    public async Task CommittedReceiptRecoversInterruptedWorkWithoutRefetchingMissingMessage()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        await EnableAsync(context);
        var store = new MailImportDbStore(context);
        var lease = Assert.IsType<MailImportLease>(await store.AcquireLeaseAsync(Guid.NewGuid(), default));
        var archive = CreateArchive();
        var hash = Convert.ToHexString(SHA256.HashData(archive)).ToLowerInvariant();
        Assert.True(await store.DiscoverAsync(lease, new(7, 43, [new(42, [new("1", "once.zip", archive.Length)])]), default));
        var work = Assert.IsType<MailImportWorkItem>(await store.TakeWorkAsync(lease, default));
        Assert.True(await store.SetWorkHashAsync(lease, work.Id, hash, default));
        Assert.True((await Importer(context).ExecuteAsync(new("once.zip", archive) { MailLease = lease }, default)).IsSuccess);
        await store.ReleaseLeaseAsync(lease, default); // Simulates process death after commit, before history completion.
        await context.Database.ExecuteSqlRawAsync("UPDATE baikor.mail_import_work SET \"AvailableAt\" = clock_timestamp() - INTERVAL '1 second'");
        var mailbox = new Mailbox { NextUid = 43 };
        await Processor(context, store, mailbox, new Protector()).ProcessAsync(Guid.NewGuid(), default);
        Assert.Empty(mailbox.Downloaded);
        Assert.Equal("duplicate", Assert.Single((await store.HistoryAsync(1, 20, default)).Items).State);
        Assert.Single(await context.ConstructionSites.ToArrayAsync());
    }

    [PostgisFact]
    public async Task LegacyMailOnlyReceiptPreservesManualUploadBehavior()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var archive = CreateArchive();
        var hash = Convert.ToHexString(SHA256.HashData(archive)).ToLowerInvariant();
        context.MailImportLegacyReceipts.Add(new() { Sha256 = hash, ImportedAt = DateTimeOffset.UtcNow });
        await context.SaveChangesAsync();
        Assert.True(await new MailImportDbStore(context).HasMailReceiptAsync(hash, default));
        Assert.False(await new ConstructionSiteDbSession(context).HasImportedFileAsync(hash, default));
        Assert.True((await Importer(context).ExecuteAsync(new("manual.zip", archive), default)).IsSuccess);
    }

    [PostgisFact]
    public async Task UpgradeBackfillsValidActiveAndArchivedHashesAndStartsDisabled()
    {
        await using var database = await PostgisTestDatabase.CreateAsync(migrationTarget: "20261103111441_ArchiveConstructionSites");
        await using var context = database.CreateContext();
        // Released schema has no mail tables yet; raw inserts avoid the current EF model.
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();
        await context.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO baikor.construction_sites ("Id", "Title", "Status", "CreatedAt", "UpdatedAt", "IsDeleted", "Metadata")
            VALUES ({first}, 'active', 'Draft', now(), now(), false, jsonb_build_object('import.fileSha256', repeat('A',64))),
                   ({second}, 'archived', 'Draft', now(), now(), true, jsonb_build_object('import.fileSha256', repeat('b',64)))
            """);
        await context.Database.MigrateAsync();
        Assert.Equal(new[] { new string('a', 64), new string('b', 64) }, await context.ArchiveImportReceipts.OrderBy(x => x.Sha256).Select(x => x.Sha256).ToArrayAsync());
        Assert.False((await context.MailImportConfigurations.SingleAsync()).Enabled);
        Assert.Empty(await context.MailImportLegacyReceipts.ToArrayAsync());
    }

    private static RkomTrenchesImporter Importer(BaikorR.Core.Persistence.BaikorRDbContext context) =>
        new(new ConstructionSiteDbSession(context), TimeProvider.System, new(), new RkomTrenchesImportRequest.Validator());
    private static MailImportProcessor Processor(BaikorR.Core.Persistence.BaikorRDbContext context, IMailImportStore store, Mailbox mailbox, Protector protector) =>
        new(store, mailbox, protector, Importer(context));
    private static MailImportSettingsRequest Request() => new(true, "imap.test", 993, "sslOnConnect", "test", "INBOX", 60, 1, 0, "test-only");
    private static async Task EnableAsync(BaikorR.Core.Persistence.BaikorRDbContext context) =>
        Assert.True((await new MailImportService(new MailImportDbStore(context), new Mailbox(), new Protector(), TimeProvider.System).SaveAsync(Request(), default)).IsSuccess);

    private sealed class Protector : IMailImportSecretProtector
    {
        public bool IsConfigured => true;
        public string Protect(string plaintext) => "test:" + plaintext;
        public string Unprotect(string ciphertext) => ciphertext[5..];
    }

    private sealed class Mailbox : IMailboxClientFactory, IMailboxClient
    {
        public uint UidValidity => 7;
        public uint NextUid { get; set; } = 42;
        public IReadOnlyList<MailboxMessage> Messages { get; set; } = [];
        public Dictionary<(uint Uid, string Part), byte[]> Attachments { get; } = [];
        public List<(uint Uid, string Part)> Downloaded { get; } = [];
        public Task<IMailboxClient> ConnectAsync(MailboxConnection connection, CancellationToken cancellationToken) => Task.FromResult<IMailboxClient>(this);
        public Task<MailboxBatch> ReadBatchAsync(uint firstUid, int maximumMessages, CancellationToken cancellationToken) => Task.FromResult(new MailboxBatch(UidValidity, NextUid, Messages));
        public Task<byte[]> ReadAttachmentAsync(uint uid, string partId, CancellationToken cancellationToken)
        {
            Downloaded.Add((uid, partId));
            return Task.FromResult(Attachments[(uid, partId)]);
        }
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private static byte[] CreateArchive()
    {
        var directory = Path.Combine(Path.GetTempPath(), "baikor-mail-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            var path = Path.Combine(directory, "R-IMAP_Trenches.shp");
            Shapefile.WriteAllFeatures([new Feature(new MultiLineString([new LineString([new Coordinate(12.1, 49.01), new Coordinate(12.1001, 49.01)])]),
                new AttributesTable { { "executio_1", "Plan released" }, { "name", "Asphalt Str." }, { "externalID", "segment-1" } })], path);
            File.WriteAllText(Path.ChangeExtension(path, ".prj"), "GEOGCS[\"GCS_WGS_1984\",DATUM[\"D_WGS_1984\",SPHEROID[\"WGS_1984\",6378137,298.257223563]],PRIMEM[\"Greenwich\",0],UNIT[\"Degree\",0.0174532925199433]]");
            using var output = new MemoryStream();
            ZipFile.CreateFromDirectory(directory, output);
            return output.ToArray();
        }
        finally
        {
            Directory.Delete(directory, true);
        }
    }
}
