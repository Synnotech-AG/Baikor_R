using BaikorR.Core.Shared.Results;

namespace BaikorR.Core.Features.ConstructionSites.Common;

internal static class ConstructionSiteArchiveErrors
{
    public static ApiError Archived() => ApiError.Conflict(
        "constructionSites.archived",
        "The construction site is archived. Restore it before making changes.");
}
