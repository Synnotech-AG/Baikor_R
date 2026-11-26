using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Features.MailImports;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace BaikorR.Core.Persistence.Sessions;

public sealed class ConstructionSiteDbSession(BaikorRDbContext dbContext)
    : IConstructionSitesSession
{
    public async Task<IReadOnlyList<ConstructionSite>> ListAsync(
        int maximumCount,
        CancellationToken cancellationToken,
        ConstructionSiteArchiveFilter archive = ConstructionSiteArchiveFilter.Active) =>
        await dbContext.ConstructionSites
            .AsNoTracking()
            .Where(item => archive == ConstructionSiteArchiveFilter.All
                || item.IsDeleted == (archive == ConstructionSiteArchiveFilter.Archived))
            .Include(item => item.Areas)
            .Include(item => item.Contacts)
            .Include(item => item.Communications)
            .AsSplitQuery()
            .OrderByDescending(item => item.CreatedAt)
            .ThenBy(item => item.Title)
            .Take(maximumCount)
            .ToListAsync(cancellationToken);

    public Task<bool> HasImportedFileAsync(string fileHash, CancellationToken cancellationToken) =>
        dbContext.Database.SqlQuery<bool>($"""
            SELECT EXISTS (SELECT 1 FROM baikor.archive_import_receipts WHERE "Sha256" = {fileHash.ToLowerInvariant()}) OR EXISTS (
                SELECT 1 FROM baikor.construction_sites
                WHERE lower("Metadata" ->> 'import.fileSha256') = {fileHash.ToLowerInvariant()}
            ) AS "Value"
            """).SingleAsync(cancellationToken);

    public async Task<IArchiveImportTransaction> BeginImportAsync(string fileHash, MailImportLease? mailLease, CancellationToken cancellationToken)
    {
        var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            var authorized = true;
            if (mailLease is not null)
            {
                // This row lock also orders pause/source edits against the construction-site commit.
                var configuration = await dbContext.MailImportConfigurations
                    .FromSqlRaw("SELECT * FROM baikor.mail_import_configuration WHERE \"Id\" = 1 FOR UPDATE").AsNoTracking()
                    .SingleAsync(cancellationToken);
                authorized = configuration.Enabled && !configuration.Halted && configuration.LeaseOwner == mailLease.Owner
                    && configuration.LeaseFence == mailLease.Fence && configuration.Generation == mailLease.Generation
                    && await MailImportDbClock.OwnsAsync(dbContext, mailLease, cancellationToken);
            }
            await dbContext.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724603282)", cancellationToken);
            var duplicate = await HasImportedFileAsync(fileHash, cancellationToken)
                || mailLease is not null && await dbContext.MailImportLegacyReceipts.AnyAsync(x => x.Sha256 == fileHash, cancellationToken);
            if (authorized && !duplicate)
            {
                dbContext.ArchiveImportReceipts.Add(new() { Sha256 = fileHash, ImportedAt = DateTimeOffset.UtcNow });
            }
            return new ArchiveImportTransaction(dbContext, transaction, duplicate, authorized, mailLease);
        }
        catch
        {
            await transaction.DisposeAsync();
            throw;
        }
    }

    private sealed class ArchiveImportTransaction(BaikorRDbContext context, IDbContextTransaction transaction, bool duplicate, bool authorized, MailImportLease? mailLease)
        : IArchiveImportTransaction
    {
        public bool IsDuplicate => duplicate;
        public bool IsAuthorized => authorized;
        public async Task<bool> CompleteAsync(CancellationToken cancellationToken)
        {
            if (mailLease is not null && !await MailImportDbClock.OwnsAsync(context, mailLease, cancellationToken))
            {
                return false;
            }
            await transaction.CommitAsync(cancellationToken);
            return true;
        }
        public async ValueTask DisposeAsync()
        {
            await transaction.DisposeAsync();
            context.ChangeTracker.Clear();
        }
    }

    public Task<ConstructionSite?> GetAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.ConstructionSites
            .AsNoTracking()
            .Include(item => item.Areas)
            .Include(item => item.Contacts)
            .Include(item => item.Communications)
            .AsSplitQuery()
            .SingleOrDefaultAsync(item => item.Id == id, cancellationToken);

    public Task<ConstructionSite?> GetForUpdateAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.ConstructionSites
            .Include(item => item.Areas)
            .Include(item => item.Contacts)
            .Include(item => item.Communications)
            .AsSplitQuery()
            .SingleOrDefaultAsync(item => item.Id == id, cancellationToken);

    public async Task<IReadOnlyList<ConstructionSite>> GetForUpdateAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken cancellationToken)
    {
        const int databaseBatchSize = 500;
        var constructionSites = new List<ConstructionSite>(ids.Count);

        foreach (var idBatch in ids.Chunk(databaseBatchSize))
        {
            constructionSites.AddRange(await dbContext.ConstructionSites
                .Where(item => idBatch.Contains(item.Id))
                .ToListAsync(cancellationToken));
        }

        return constructionSites;
    }

    public void Add(ConstructionSite constructionSite) =>
        dbContext.ConstructionSites.Add(constructionSite);

    public void AddArea(ConstructionSite constructionSite, ConstructionSiteArea area)
    {
        constructionSite.Areas.Add(area);
        dbContext.ConstructionSiteAreas.Add(area);
    }

    public void RemoveArea(ConstructionSite constructionSite, ConstructionSiteArea area)
    {
        constructionSite.Areas.Remove(area);
        dbContext.ConstructionSiteAreas.Remove(area);
    }

    public void AddContact(ConstructionSite constructionSite, ConstructionSiteContact contact)
    {
        constructionSite.Contacts.Add(contact);
        dbContext.ConstructionSiteContacts.Add(contact);
    }

    public void RemoveContact(ConstructionSite constructionSite, ConstructionSiteContact contact)
    {
        constructionSite.Contacts.Remove(contact);
        dbContext.ConstructionSiteContacts.Remove(contact);
    }

    public void AddCommunication(
        ConstructionSite constructionSite,
        ConstructionSiteCommunication communication)
    {
        constructionSite.Communications.Add(communication);
        dbContext.ConstructionSiteCommunications.Add(communication);
    }

    public void RemoveCommunication(
        ConstructionSite constructionSite,
        ConstructionSiteCommunication communication)
    {
        constructionSite.Communications.Remove(communication);
        dbContext.ConstructionSiteCommunications.Remove(communication);
    }

    public void SetExpectedVersion(ConstructionSite constructionSite, uint version) =>
        dbContext.Entry(constructionSite).Property(item => item.Version).OriginalValue = version;

    public async Task<bool> SaveChangesAsync(CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateConcurrencyException)
        {
            return false;
        }
    }
}
