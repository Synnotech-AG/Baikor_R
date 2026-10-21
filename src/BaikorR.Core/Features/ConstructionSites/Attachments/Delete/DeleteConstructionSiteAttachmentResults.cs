using BaikorR.Core.Shared.Results;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Attachments.Delete;

internal static class DeleteConstructionSiteAttachmentResults
{
    public static Result NotFound() => Result.Fail(ApiError.NotFound(
        "constructionSites.attachments.notFound",
        "The attachment could not be found."));

    public static Result Conflict() => Result.Fail(ApiError.Conflict(
        "constructionSites.attachments.delete.conflict",
        "The attachment changed while it was being deleted."));
}
