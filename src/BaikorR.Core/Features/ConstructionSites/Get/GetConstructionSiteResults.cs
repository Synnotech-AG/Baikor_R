using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Persistence.Entities;
using BaikorR.Api.Shared.Results;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Get;

internal static class GetConstructionSiteResults
{
    public const string NotFoundErrorKey = "constructionSites.get.notFound";

    public static Result<ConstructionSiteResponse> NotFound() =>
        Result.Fail<ConstructionSiteResponse>(ApiError.NotFound(
            NotFoundErrorKey,
            "The construction site could not be found."));

    public static Result<ConstructionSiteResponse> ToGetSuccess(this ConstructionSite constructionSite) =>
        Result.Ok(ConstructionSiteResponse.Create(constructionSite));
}
