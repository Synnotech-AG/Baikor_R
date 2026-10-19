using BaikorR.Api.Shared.Results;
using FluentResults;
using FluentValidation.Results;

namespace BaikorR.Api.Shared.Validation;

internal static class FluentValidationResultExtensions
{
    public static List<IError> ToValidationErrors(this ValidationResult validationResult) =>
        validationResult.Errors
            .Select(failure => (IError)ApiError.Validation(
                failure.ErrorCode,
                failure.ErrorMessage,
                failure.PropertyName))
            .ToList();
}
