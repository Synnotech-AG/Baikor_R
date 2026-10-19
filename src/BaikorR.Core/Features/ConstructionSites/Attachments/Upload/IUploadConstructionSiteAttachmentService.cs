using BaikorR.Api.Features.ConstructionSites.Attachments.Common;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Attachments.Upload;

public interface IUploadConstructionSiteAttachmentService
{
    Task<Result<ConstructionSiteAttachmentResponse>> ExecuteAsync(
        Guid constructionSiteId,
        UploadConstructionSiteAttachmentRequest request,
        CancellationToken cancellationToken);
}
