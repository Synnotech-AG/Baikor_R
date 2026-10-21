using FluentResults;

namespace BaikorR.Core.Shared.Results;

internal sealed class ApiError : Error
{
    public ApiError(
        string key,
        string message,
        ApiErrorType type,
        string? field = null) : base(message)
    {
        Key = key;
        Type = type;
        Field = field;

        WithMetadata(nameof(Key), key);
        WithMetadata(nameof(Type), type.ToString());
        if (!string.IsNullOrWhiteSpace(field))
        {
            WithMetadata(nameof(Field), field);
        }
    }

    public string Key { get; }

    public ApiErrorType Type { get; }

    public string? Field { get; }

    public static ApiError Validation(string key, string message, string field) =>
        new(key, message, ApiErrorType.Validation, field);

    public static ApiError NotFound(string key, string message) =>
        new(key, message, ApiErrorType.NotFound);

    public static ApiError Conflict(string key, string message) =>
        new(key, message, ApiErrorType.Conflict);
}
