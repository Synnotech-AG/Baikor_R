using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Persistence.Entities;
using BaikorR.Api.Shared.Results;
using BaikorR.Api.Shared.Validation;
using FluentResults;
using FluentValidation.Results;

namespace BaikorR.Api.Features.ConstructionSites.Create;

internal static class CreateConstructionSiteResults
{
    public const string ConflictErrorKey = "constructionSites.create.conflict";

    public static Result<ConstructionSiteResponse> ValidationFailed(ValidationResult validationResult) =>
        Result.Fail<ConstructionSiteResponse>(validationResult.ToValidationErrors());

    public static Result<ConstructionSiteResponse> Conflict() =>
        Result.Fail<ConstructionSiteResponse>(ApiError.Conflict(
            ConflictErrorKey,
            "The construction site could not be created because the stored data changed concurrently."));

    public static Result<ConstructionSiteResponse> ToCreateSuccess(this ConstructionSite constructionSite) =>
        Result.Ok(ConstructionSiteResponse.Create(constructionSite));
}
