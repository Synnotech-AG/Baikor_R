namespace BaikorR.Api.Shared.Results;

internal enum ApiErrorType
{
    Validation,
    NotFound,
    Conflict,
    Forbidden,
    Unauthorized,
    Unavailable,
    Unexpected
}
