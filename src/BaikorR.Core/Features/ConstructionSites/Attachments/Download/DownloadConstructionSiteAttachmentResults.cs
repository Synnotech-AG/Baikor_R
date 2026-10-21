using BaikorR.Core.Features.ConstructionSites.Attachments.Common;
using BaikorR.Core.Shared.Results;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Attachments.Download;

internal static class DownloadConstructionSiteAttachmentResults
{
    public static Result<ConstructionSiteAttachmentFile> NotFound() =>
        Result.Fail<ConstructionSiteAttachmentFile>(ApiError.NotFound(
            "constructionSites.attachments.notFound",
            "The attachment could not be found."));
}
