using BaikorR.Api.Features.ConstructionSites.Attachments.Common;
using BaikorR.Api.Shared.Results;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Attachments.Download;

internal static class DownloadConstructionSiteAttachmentResults
{
    public static Result<ConstructionSiteAttachmentFile> NotFound() =>
        Result.Fail<ConstructionSiteAttachmentFile>(ApiError.NotFound(
            "constructionSites.attachments.notFound",
            "The attachment could not be found."));
}
