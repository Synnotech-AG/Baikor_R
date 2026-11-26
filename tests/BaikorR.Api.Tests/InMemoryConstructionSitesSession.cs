using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Core.Features.MailImports;

namespace BaikorR.Api.Tests;

public sealed class InMemoryConstructionSitesSession : IConstructionSitesSession
{
    private readonly List<ConstructionSite> constructionSites = [];
    private readonly Dictionary<Guid, uint> expectedVersions = [];
    private readonly HashSet<string> receipts = new(StringComparer.OrdinalIgnoreCase);
    private readonly SemaphoreSlim importGate = new(1, 1);

    public Task<IReadOnlyList<ConstructionSite>> ListAsync(
        int maximumCount,
        CancellationToken cancellationToken,
        ConstructionSiteArchiveFilter archive = ConstructionSiteArchiveFilter.Active)
    {
        IReadOnlyList<ConstructionSite> result = constructionSites
            .Where(item => archive == ConstructionSiteArchiveFilter.All
                || item.IsDeleted == (archive == ConstructionSiteArchiveFilter.Archived))
            .OrderByDescending(item => item.CreatedAt)
            .ThenBy(item => item.Title)
            .Take(maximumCount)
            .ToArray();
        return Task.FromResult(result);
    }

    public Task<bool> HasImportedFileAsync(string fileHash, CancellationToken cancellationToken) =>
        Task.FromResult(receipts.Contains(fileHash) || constructionSites.Any(site =>
            site.Metadata.TryGetValue("import.fileSha256", out var importedHash)
            && string.Equals(importedHash, fileHash, StringComparison.OrdinalIgnoreCase)));

    public async Task<IArchiveImportTransaction> BeginImportAsync(string fileHash, MailImportLease? mailLease, CancellationToken cancellationToken)
    {
        await importGate.WaitAsync(cancellationToken);
        return new MemoryImportTransaction(this, fileHash, await HasImportedFileAsync(fileHash, cancellationToken));
    }

    private sealed class MemoryImportTransaction(InMemoryConstructionSitesSession session, string hash, bool duplicate) : IArchiveImportTransaction
    {
        public bool IsDuplicate => duplicate;
        public bool IsAuthorized => true;
        public Task<bool> CompleteAsync(CancellationToken cancellationToken)
        {
            session.receipts.Add(hash);
            return Task.FromResult(true);
        }
        public ValueTask DisposeAsync()
        {
            session.importGate.Release();
            return ValueTask.CompletedTask;
        }
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
