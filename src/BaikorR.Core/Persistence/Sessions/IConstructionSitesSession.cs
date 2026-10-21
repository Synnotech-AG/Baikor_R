using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Persistence.Sessions;

public interface IConstructionSitesSession
{
    Task<IReadOnlyList<ConstructionSite>> ListAsync(
        int maximumCount,
        CancellationToken cancellationToken);

    Task<ConstructionSite?> GetAsync(Guid id, CancellationToken cancellationToken);

    Task<ConstructionSite?> GetForUpdateAsync(Guid id, CancellationToken cancellationToken);

    Task<IReadOnlyList<ConstructionSite>> GetForUpdateAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken cancellationToken);

    void Add(ConstructionSite constructionSite);

    void Remove(ConstructionSite constructionSite);

    void RemoveRange(IEnumerable<ConstructionSite> constructionSites);

    void AddArea(ConstructionSite constructionSite, ConstructionSiteArea area);

    void RemoveArea(ConstructionSite constructionSite, ConstructionSiteArea area);

    void AddContact(ConstructionSite constructionSite, ConstructionSiteContact contact);

    void RemoveContact(ConstructionSite constructionSite, ConstructionSiteContact contact);

    void AddCommunication(ConstructionSite constructionSite, ConstructionSiteCommunication communication);

    void RemoveCommunication(ConstructionSite constructionSite, ConstructionSiteCommunication communication);

    void SetExpectedVersion(ConstructionSite constructionSite, uint version);

    Task<bool> SaveChangesAsync(CancellationToken cancellationToken);
}
