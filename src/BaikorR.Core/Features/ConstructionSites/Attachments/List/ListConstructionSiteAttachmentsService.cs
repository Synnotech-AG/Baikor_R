using BaikorR.Api.Features.ConstructionSites.Attachments.Common;
using BaikorR.Api.Persistence.Sessions;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Attachments.List;

public sealed class ListConstructionSiteAttachmentsService(IConstructionSiteAttachmentsSession session)
    : IListConstructionSiteAttachmentsService
{
    public async Task<Result<IReadOnlyList<ConstructionSiteAttachmentResponse>>> ExecuteAsync(
        Guid constructionSiteId,
        CancellationToken cancellationToken)
    {
        if (!await session.ConstructionSiteExistsAsync(constructionSiteId, cancellationToken))
        {
            return ListConstructionSiteAttachmentsResults.NotFound();
        }

        var attachments = await session.ListAsync(constructionSiteId, cancellationToken);
        return Result.Ok<IReadOnlyList<ConstructionSiteAttachmentResponse>>(
            attachments.Select(ConstructionSiteAttachmentResponse.Create).ToArray());
    }
}
