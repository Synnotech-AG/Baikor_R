using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;

namespace BaikorR.Api.Tests;

public sealed class InMemoryConstructionSiteAttachmentsSession : IConstructionSiteAttachmentsSession
{
    private readonly Dictionary<Guid, ConstructionSite> constructionSites = [];
    private readonly List<ConstructionSiteAttachment> attachments = [];

    public void AddConstructionSite(Guid constructionSiteId) => constructionSites.Add(
        constructionSiteId, new ConstructionSite { Id = constructionSiteId });

    public void ArchiveConstructionSite(Guid constructionSiteId) =>
        constructionSites[constructionSiteId].IsDeleted = true;

    public Task<bool> ConstructionSiteExistsAsync(
        Guid constructionSiteId,
        CancellationToken cancellationToken) =>
        Task.FromResult(constructionSites.ContainsKey(constructionSiteId));

    public Task<ConstructionSite?> GetConstructionSiteForUpdateAsync(
        Guid constructionSiteId,
        CancellationToken cancellationToken) =>
        Task.FromResult(constructionSites.GetValueOrDefault(constructionSiteId));

    public Task<IReadOnlyList<ConstructionSiteAttachment>> ListAsync(
        Guid constructionSiteId,
        CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<ConstructionSiteAttachment>>(
            attachments.Where(item => item.ConstructionSiteId == constructionSiteId).ToArray());

    public Task<ConstructionSiteAttachment?> GetAsync(
        Guid constructionSiteId,
        Guid attachmentId,
        CancellationToken cancellationToken) =>
        Task.FromResult(attachments.SingleOrDefault(item =>
            item.ConstructionSiteId == constructionSiteId && item.Id == attachmentId));

    public void Add(ConstructionSiteAttachment attachment) => attachments.Add(attachment);

    public void Remove(ConstructionSiteAttachment attachment) => attachments.Remove(attachment);

    public void TouchConstructionSite(ConstructionSite constructionSite, DateTimeOffset updatedAt) =>
        constructionSite.UpdatedAt = updatedAt;

    public Task<bool> SaveChangesAsync(CancellationToken cancellationToken) => Task.FromResult(true);
}
