using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Persistence.Sessions;

public interface IConstructionSiteAttachmentsSession
{
    Task<bool> ConstructionSiteExistsAsync(Guid constructionSiteId, CancellationToken cancellationToken);

    Task<IReadOnlyList<ConstructionSiteAttachment>> ListAsync(
        Guid constructionSiteId,
        CancellationToken cancellationToken);

    Task<ConstructionSiteAttachment?> GetAsync(
        Guid constructionSiteId,
        Guid attachmentId,
        CancellationToken cancellationToken);

    void Add(ConstructionSiteAttachment attachment);

    void Remove(ConstructionSiteAttachment attachment);

    Task<bool> SaveChangesAsync(CancellationToken cancellationToken);
}
