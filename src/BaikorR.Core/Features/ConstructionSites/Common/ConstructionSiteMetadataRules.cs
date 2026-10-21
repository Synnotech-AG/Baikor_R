using FluentValidation;
using FluentValidation.Results;

namespace BaikorR.Core.Features.ConstructionSites.Common;

internal static class ConstructionSiteMetadataRules
{
    public const int MaximumEntryCount = 100;
    public const int MaximumKeyLength = 100;
    public const int MaximumValueLength = 4000;

    public static void Validate<T>(
        IReadOnlyDictionary<string, string>? metadata,
        ValidationContext<T> context)
    {
        if (metadata is null)
        {
            return;
        }

        if (metadata.Count > MaximumEntryCount)
        {
            AddFailure(
                context,
                "Metadata must not contain more than 100 entries.",
                ConstructionSiteValidationErrorKeys.MetadataTooManyEntries);
        }

        foreach (var (key, value) in metadata)
        {
            if (string.IsNullOrWhiteSpace(key))
            {
                AddFailure(
                    context,
                    "A metadata key is required.",
                    ConstructionSiteValidationErrorKeys.MetadataKeyRequired);
            }
            else if (key.Trim().Length > MaximumKeyLength)
            {
                AddFailure(
                    context,
                    "A metadata key must not exceed 100 characters.",
                    ConstructionSiteValidationErrorKeys.MetadataKeyTooLong);
            }

            if (string.IsNullOrWhiteSpace(value))
            {
                AddFailure(
                    context,
                    "A metadata value is required.",
                    ConstructionSiteValidationErrorKeys.MetadataValueRequired);
            }
            else if (value.Trim().Length > MaximumValueLength)
            {
                AddFailure(
                    context,
                    "A metadata value must not exceed 4000 characters.",
                    ConstructionSiteValidationErrorKeys.MetadataValueTooLong);
            }
        }

        var normalizedKeys = metadata.Keys
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .Select(key => key.Trim());
        if (normalizedKeys.Distinct(StringComparer.OrdinalIgnoreCase).Count() != normalizedKeys.Count())
        {
            AddFailure(
                context,
                "Metadata keys must be unique.",
                ConstructionSiteValidationErrorKeys.MetadataKeysNotUnique);
        }
    }

    public static Dictionary<string, string> Normalize(IReadOnlyDictionary<string, string>? metadata) =>
        metadata?.ToDictionary(
            pair => pair.Key.Trim(),
            pair => pair.Value.Trim(),
            StringComparer.OrdinalIgnoreCase)
        ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    private static void AddFailure<T>(ValidationContext<T> context, string message, string errorCode) =>
        context.AddFailure(new ValidationFailure("metadata", message) { ErrorCode = errorCode });
}
