using BaikorR.Api.Shared.Results;
using BaikorR.Api.Shared.Validation;
using FluentResults;
using FluentValidation.Results;

namespace BaikorR.Api.Features.ConstructionSites.BulkDelete;

internal static class BulkDeleteConstructionSitesResults
{
    public const string EmptySelectionErrorKey = "constructionSites.bulkDelete.emptySelection";
    public const string InvalidIdentifiersErrorKey = "constructionSites.bulkDelete.invalidIdentifiers";
    public const string NotFoundErrorKey = "constructionSites.bulkDelete.notFound";
    public const string ConflictErrorKey = "constructionSites.bulkDelete.conflict";

    public static Result<BulkDeleteConstructionSitesResponse> ValidationFailed(ValidationResult validationResult) =>
        Result.Fail<BulkDeleteConstructionSitesResponse>(validationResult.ToValidationErrors());

    public static Result<BulkDeleteConstructionSitesResponse> NotFound() =>
        Result.Fail(ApiError.NotFound(
            NotFoundErrorKey,
            "At least one selected construction site could not be found. Reload the list and try again."));

    public static Result<BulkDeleteConstructionSitesResponse> Conflict() =>
        Result.Fail(ApiError.Conflict(
            ConflictErrorKey,
            "At least one selected construction site changed while it was being deleted."));

    public static Result<BulkDeleteConstructionSitesResponse> Success(int deletedCount) =>
        Result.Ok(new BulkDeleteConstructionSitesResponse(deletedCount));
}
