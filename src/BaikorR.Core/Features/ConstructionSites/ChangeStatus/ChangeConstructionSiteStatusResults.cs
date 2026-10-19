using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Persistence.Entities;
using BaikorR.Api.Shared.Results;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.ChangeStatus;

internal static class ChangeConstructionSiteStatusResults
{
    public const string NotFoundErrorKey = "constructionSites.changeStatus.notFound";
    public const string ConflictErrorKey = "constructionSites.changeStatus.conflict";

    public static Result<ConstructionSiteResponse> NotFound() =>
        Result.Fail<ConstructionSiteResponse>(ApiError.NotFound(
            NotFoundErrorKey,
            "The construction site could not be found."));

    public static Result<ConstructionSiteResponse> Conflict() =>
        Result.Fail<ConstructionSiteResponse>(ApiError.Conflict(
            ConflictErrorKey,
            "The construction site changed while its status was being updated. Reload it and try again."));

    public static Result<ConstructionSiteResponse> ToStatusChangeSuccess(
        this ConstructionSite constructionSite) =>
        Result.Ok(ConstructionSiteResponse.Create(constructionSite));
}
