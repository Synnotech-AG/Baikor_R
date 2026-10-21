using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Shared.Results;
using BaikorR.Core.Shared.Validation;
using FluentResults;
using FluentValidation.Results;

namespace BaikorR.Core.Features.ConstructionSites.Create;

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
