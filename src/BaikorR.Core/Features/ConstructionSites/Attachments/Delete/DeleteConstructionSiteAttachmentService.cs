using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Persistence.Sessions;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Attachments.Delete;

public sealed class DeleteConstructionSiteAttachmentService(
    IConstructionSiteAttachmentsSession session,
    TimeProvider timeProvider)
    : IDeleteConstructionSiteAttachmentService
{
    public async Task<Result> ExecuteAsync(
        Guid constructionSiteId,
        Guid attachmentId,
        CancellationToken cancellationToken)
    {
        var attachment = await session.GetAsync(constructionSiteId, attachmentId, cancellationToken);
        if (attachment is null)
        {
            return DeleteConstructionSiteAttachmentResults.NotFound();
        }

        var constructionSite = await session.GetConstructionSiteForUpdateAsync(constructionSiteId, cancellationToken);
        if (constructionSite is null)
        {
            return DeleteConstructionSiteAttachmentResults.NotFound();
        }

        if (constructionSite.IsDeleted)
        {
            return Result.Fail(ConstructionSiteArchiveErrors.Archived());
        }

        session.Remove(attachment);
        session.TouchConstructionSite(constructionSite, timeProvider.GetUtcNow());
        return await session.SaveChangesAsync(cancellationToken)
            ? Result.Ok()
            : DeleteConstructionSiteAttachmentResults.Conflict();
    }
}
