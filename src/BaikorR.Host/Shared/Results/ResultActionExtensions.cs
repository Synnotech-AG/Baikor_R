using BaikorR.Core.Shared.Results;
using FluentResults;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Shared.Results;

internal static class ResultActionExtensions
{
    public static ActionResult<T> ToApiActionResult<T>(
        this Result<T> result,
        ControllerBase controller)
    {
        if (result.IsSuccess)
        {
            return controller.Ok(result.Value);
        }

        return CreateFailureResult(result.Errors, controller);
    }

    public static ActionResult ToApiActionResult(this Result result, ControllerBase controller)
    {
        if (result.IsSuccess)
        {
            return controller.NoContent();
        }

        return CreateFailureResult(result.Errors, controller);
    }

    private static ActionResult CreateFailureResult(
        IReadOnlyCollection<IError> errors,
        ControllerBase controller)
    {
        var apiErrors = errors.OfType<ApiError>().ToArray();
        if (apiErrors.Length == 0)
        {
            return CreateProblemResult(
                controller,
                StatusCodes.Status500InternalServerError,
                "An unexpected error occurred",
                "The server could not complete the request.",
                ApiErrorKeys.Unexpected);
        }

        if (apiErrors.All(error => error.Type == ApiErrorType.Validation))
        {
            return controller.BadRequest(CreateValidationProblem(apiErrors, controller));
        }

        var error = apiErrors[0];
        var (statusCode, title) = error.Type switch
        {
            ApiErrorType.NotFound => (StatusCodes.Status404NotFound, "Resource not found"),
            ApiErrorType.Conflict => (StatusCodes.Status409Conflict, "Request conflict"),
            ApiErrorType.Forbidden => (StatusCodes.Status403Forbidden, "Access forbidden"),
            ApiErrorType.Unauthorized => (StatusCodes.Status401Unauthorized, "Authentication required"),
            ApiErrorType.Unavailable => (StatusCodes.Status503ServiceUnavailable, "Service unavailable"),
            _ => (StatusCodes.Status500InternalServerError, "An unexpected error occurred")
        };

        return CreateProblemResult(controller, statusCode, title, error.Message, error.Key);
    }

    private static ValidationProblemDetails CreateValidationProblem(
        IReadOnlyCollection<ApiError> errors,
        ControllerBase controller)
    {
        var errorsByField = errors
            .GroupBy(error => error.Field ?? string.Empty)
            .ToDictionary(
                group => group.Key,
                group => group.Select(error => error.Message).ToArray());
        var errorKeysByField = errors
            .GroupBy(error => error.Field ?? string.Empty)
            .ToDictionary(
                group => group.Key,
                group => group.Select(error => error.Key).ToArray());

        var problem = new ValidationProblemDetails(errorsByField)
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "One or more validation errors occurred",
            Detail = "Please review the highlighted fields and submit the form again.",
            Instance = controller.HttpContext.Request.Path
        };
        problem.Extensions["errorKey"] = ApiErrorKeys.ValidationFailed;
        problem.Extensions["errorKeys"] = errorKeysByField;
        return problem;
    }

    private static ObjectResult CreateProblemResult(
        ControllerBase controller,
        int statusCode,
        string title,
        string detail,
        string errorKey)
    {
        var problem = new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = detail,
            Instance = controller.HttpContext.Request.Path
        };
        problem.Extensions["errorKey"] = errorKey;
        return new ObjectResult(problem) { StatusCode = statusCode };
    }
}
