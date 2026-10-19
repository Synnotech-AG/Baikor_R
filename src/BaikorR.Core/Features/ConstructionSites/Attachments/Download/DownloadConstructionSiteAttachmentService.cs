using BaikorR.Api.Features.ConstructionSites.Attachments.Common;
using BaikorR.Api.Persistence.Sessions;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Attachments.Download;

public sealed class DownloadConstructionSiteAttachmentService(IConstructionSiteAttachmentsSession session)
    : IDownloadConstructionSiteAttachmentService
{
    public async Task<Result<ConstructionSiteAttachmentFile>> ExecuteAsync(
        Guid constructionSiteId,
        Guid attachmentId,
        CancellationToken cancellationToken)
    {
        var attachment = await session.GetAsync(constructionSiteId, attachmentId, cancellationToken);
        return attachment is null
            ? DownloadConstructionSiteAttachmentResults.NotFound()
            : Result.Ok(new ConstructionSiteAttachmentFile(
                attachment.FileName,
                attachment.MimeType,
                attachment.Data));
    }
}
