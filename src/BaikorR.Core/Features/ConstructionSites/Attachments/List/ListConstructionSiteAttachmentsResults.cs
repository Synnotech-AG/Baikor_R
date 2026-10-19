using BaikorR.Api.Features.ConstructionSites.Attachments.Common;
using BaikorR.Api.Shared.Results;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Attachments.List;

internal static class ListConstructionSiteAttachmentsResults
{
    public static Result<IReadOnlyList<ConstructionSiteAttachmentResponse>> NotFound() =>
        Result.Fail<IReadOnlyList<ConstructionSiteAttachmentResponse>>(ApiError.NotFound(
            "constructionSites.attachments.siteNotFound",
            "The construction site could not be found."));
}
