using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Attachments.Delete;

public interface IDeleteConstructionSiteAttachmentService
{
    Task<Result> ExecuteAsync(
        Guid constructionSiteId,
        Guid attachmentId,
        CancellationToken cancellationToken);
}
