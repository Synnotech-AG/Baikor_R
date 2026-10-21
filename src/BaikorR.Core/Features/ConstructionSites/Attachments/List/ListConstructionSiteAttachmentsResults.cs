using BaikorR.Core.Features.ConstructionSites.Attachments.Common;
using BaikorR.Core.Shared.Results;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Attachments.List;

internal static class ListConstructionSiteAttachmentsResults
{
    public static Result<IReadOnlyList<ConstructionSiteAttachmentResponse>> NotFound() =>
        Result.Fail<IReadOnlyList<ConstructionSiteAttachmentResponse>>(ApiError.NotFound(
            "constructionSites.attachments.siteNotFound",
            "The construction site could not be found."));
}
