using BaikorR.Api.Persistence.Sessions;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Attachments.Delete;

public sealed class DeleteConstructionSiteAttachmentService(IConstructionSiteAttachmentsSession session)
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

        session.Remove(attachment);
        return await session.SaveChangesAsync(cancellationToken)
            ? Result.Ok()
            : DeleteConstructionSiteAttachmentResults.Conflict();
    }
}
