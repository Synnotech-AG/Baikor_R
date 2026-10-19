using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Attachments.Delete;

public interface IDeleteConstructionSiteAttachmentService
{
    Task<Result> ExecuteAsync(
        Guid constructionSiteId,
        Guid attachmentId,
        CancellationToken cancellationToken);
}
