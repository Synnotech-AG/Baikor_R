using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Persistence.Entities;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.List;

internal static class ListConstructionSitesResults
{
    public static Result<IReadOnlyList<ConstructionSiteResponse>> ToListSuccess(
        this IEnumerable<ConstructionSite> constructionSites)
    {
        IReadOnlyList<ConstructionSiteResponse> response = constructionSites
            .Select(ConstructionSiteResponse.Create)
            .ToArray();

        return Result.Ok(response);
    }
}
