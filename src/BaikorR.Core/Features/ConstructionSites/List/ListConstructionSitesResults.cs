using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Persistence.Entities;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.List;

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
