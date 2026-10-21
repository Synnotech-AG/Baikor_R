using BaikorR.Core.Features.ConstructionSites.Attachments.Common;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Attachments.Download;

public interface IDownloadConstructionSiteAttachmentService
{
    Task<Result<ConstructionSiteAttachmentFile>> ExecuteAsync(
        Guid constructionSiteId,
        Guid attachmentId,
        CancellationToken cancellationToken);
}
