using BaikorR.Core.Shared.Results;
using BaikorR.Core.Shared.Validation;
using FluentResults;
using FluentValidation.Results;

namespace BaikorR.Core.Importers.Rkom;

internal static class RkomTrenchesImportResults
{
    public const string FileRequiredErrorKey = "constructionSites.import.fileRequired";
    public const string FileTypeInvalidErrorKey = "constructionSites.import.fileTypeInvalid";
    public const string FileTooLargeErrorKey = "constructionSites.import.fileTooLarge";
    public const string BufferInvalidErrorKey = "constructionSites.import.bufferInvalid";
    public const string FileInvalidErrorKey = "constructionSites.import.fileInvalid";
    public const string DuplicateErrorKey = "constructionSites.import.duplicate";
    public const string ConflictErrorKey = "constructionSites.import.conflict";

    public static Result<RkomTrenchesImportResponse> ValidationFailed(ValidationResult validationResult) =>
        Result.Fail<RkomTrenchesImportResponse>(validationResult.ToValidationErrors());

    public static Result<RkomTrenchesImportResponse> InvalidFile(string message) =>
        Result.Fail(ApiError.Validation(FileInvalidErrorKey, message, "file"));

    public static Result<RkomTrenchesImportResponse> Duplicate() =>
        Result.Fail(ApiError.Conflict(
            DuplicateErrorKey,
            "This exact file has already been imported. Delete the previous import before importing it again."));

    public static Result<RkomTrenchesImportResponse> Conflict() =>
        Result.Fail(ApiError.Conflict(
            ConflictErrorKey,
            "The construction sites could not be persisted because the data changed concurrently."));

    public static Result<RkomTrenchesImportResponse> Success(RkomTrenchesImportResponse response) => Result.Ok(response);
}
