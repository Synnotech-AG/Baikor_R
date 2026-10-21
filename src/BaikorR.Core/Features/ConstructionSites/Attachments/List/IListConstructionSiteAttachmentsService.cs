using BaikorR.Core.Features.ConstructionSites.Attachments.Common;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Attachments.List;

public interface IListConstructionSiteAttachmentsService
{
    Task<Result<IReadOnlyList<ConstructionSiteAttachmentResponse>>> ExecuteAsync(
        Guid constructionSiteId,
        CancellationToken cancellationToken);
}
