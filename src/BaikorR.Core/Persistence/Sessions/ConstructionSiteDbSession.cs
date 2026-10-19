using BaikorR.Api.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Api.Persistence.Sessions;

public sealed class ConstructionSiteDbSession(BaikorRDbContext dbContext)
    : IConstructionSitesSession
{
    public async Task<IReadOnlyList<ConstructionSite>> ListAsync(
        int maximumCount,
        CancellationToken cancellationToken) =>
        await dbContext.ConstructionSites
            .AsNoTracking()
            .Include(item => item.Areas)
            .Include(item => item.Contacts)
            .Include(item => item.Communications)
            .AsSplitQuery()
            .OrderByDescending(item => item.CreatedAt)
            .ThenBy(item => item.Title)
            .Take(maximumCount)
            .ToListAsync(cancellationToken);

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

    public void Remove(ConstructionSite constructionSite) =>
        dbContext.ConstructionSites.Remove(constructionSite);

    public void RemoveRange(IEnumerable<ConstructionSite> constructionSites) =>
        dbContext.ConstructionSites.RemoveRange(constructionSites);

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
