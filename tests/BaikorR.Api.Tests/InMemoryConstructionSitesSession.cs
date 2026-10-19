using BaikorR.Api.Persistence.Entities;
using BaikorR.Api.Persistence.Sessions;

namespace BaikorR.Api.Tests;

public sealed class InMemoryConstructionSitesSession : IConstructionSitesSession
{
    private readonly List<ConstructionSite> constructionSites = [];
    private readonly Dictionary<Guid, uint> expectedVersions = [];

    public Task<IReadOnlyList<ConstructionSite>> ListAsync(
        int maximumCount,
        CancellationToken cancellationToken)
    {
        IReadOnlyList<ConstructionSite> result = constructionSites
            .OrderByDescending(item => item.CreatedAt)
            .ThenBy(item => item.Title)
            .Take(maximumCount)
            .ToArray();
        return Task.FromResult(result);
    }

    public Task<ConstructionSite?> GetAsync(Guid id, CancellationToken cancellationToken) =>
        Task.FromResult(constructionSites.SingleOrDefault(item => item.Id == id));

    public Task<ConstructionSite?> GetForUpdateAsync(Guid id, CancellationToken cancellationToken) =>
        Task.FromResult(constructionSites.SingleOrDefault(item => item.Id == id));

    public Task<IReadOnlyList<ConstructionSite>> GetForUpdateAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken cancellationToken)
    {
        var idSet = ids.ToHashSet();
        return Task.FromResult<IReadOnlyList<ConstructionSite>>(
            constructionSites.Where(item => idSet.Contains(item.Id)).ToArray());
    }

    public void Add(ConstructionSite constructionSite) => constructionSites.Add(constructionSite);

    public void Remove(ConstructionSite constructionSite) => constructionSites.Remove(constructionSite);

    public void RemoveRange(IEnumerable<ConstructionSite> sites) => constructionSites.RemoveAll(sites.Contains);

    public void AddArea(ConstructionSite constructionSite, ConstructionSiteArea area) =>
        constructionSite.Areas.Add(area);

    public void RemoveArea(ConstructionSite constructionSite, ConstructionSiteArea area) =>
        constructionSite.Areas.Remove(area);

    public void AddContact(ConstructionSite constructionSite, ConstructionSiteContact contact) =>
        constructionSite.Contacts.Add(contact);

    public void RemoveContact(ConstructionSite constructionSite, ConstructionSiteContact contact) =>
        constructionSite.Contacts.Remove(contact);

    public void AddCommunication(
        ConstructionSite constructionSite,
        ConstructionSiteCommunication communication) =>
        constructionSite.Communications.Add(communication);

    public void RemoveCommunication(
        ConstructionSite constructionSite,
        ConstructionSiteCommunication communication) =>
        constructionSite.Communications.Remove(communication);

    public void SetExpectedVersion(ConstructionSite constructionSite, uint version) =>
        expectedVersions[constructionSite.Id] = version;

    public Task<bool> SaveChangesAsync(CancellationToken cancellationToken)
    {
        var hasConflict = expectedVersions.Any(expected =>
            constructionSites.Single(item => item.Id == expected.Key).Version != expected.Value);
        expectedVersions.Clear();
        return Task.FromResult(!hasConflict);
    }
}
