using BaikorR.Core.Features.ConstructionSites.Attachments.Common;
using BaikorR.Core.Persistence.Sessions;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Attachments.Download;

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
