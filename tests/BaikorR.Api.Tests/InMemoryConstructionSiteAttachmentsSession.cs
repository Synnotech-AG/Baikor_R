using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;

namespace BaikorR.Api.Tests;

public sealed class InMemoryConstructionSiteAttachmentsSession : IConstructionSiteAttachmentsSession
{
    private readonly HashSet<Guid> constructionSiteIds = [];
    private readonly List<ConstructionSiteAttachment> attachments = [];

    public void AddConstructionSite(Guid constructionSiteId) => constructionSiteIds.Add(constructionSiteId);

    public Task<bool> ConstructionSiteExistsAsync(
        Guid constructionSiteId,
        CancellationToken cancellationToken) =>
        Task.FromResult(constructionSiteIds.Contains(constructionSiteId));

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

    public Task<bool> SaveChangesAsync(CancellationToken cancellationToken) => Task.FromResult(true);
}
