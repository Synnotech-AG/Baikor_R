using BaikorR.Api.Features.ConstructionSites.Attachments.Common;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Attachments.Download;

public interface IDownloadConstructionSiteAttachmentService
{
    Task<Result<ConstructionSiteAttachmentFile>> ExecuteAsync(
        Guid constructionSiteId,
        Guid attachmentId,
        CancellationToken cancellationToken);
}
