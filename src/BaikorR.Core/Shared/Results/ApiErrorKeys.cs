namespace BaikorR.Api.Shared.Results;

internal static class ApiErrorKeys
{
    public const string Unexpected = "api.unexpected";
    public const string ValidationFailed = "api.validation.failed";
    public const string Forbidden = "api.authorization.forbidden";
    public const string Unauthorized = "api.authentication.required";
    public const string Unavailable = "api.unavailable";
}
