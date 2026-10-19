using System.Text.Json;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace BaikorR.Api.Persistence;

internal sealed class StringDictionaryJsonConverter()
    : ValueConverter<Dictionary<string, string>, string>(
        value => JsonSerializer.Serialize(value, JsonSerializerOptions.Default),
        value => JsonSerializer.Deserialize<Dictionary<string, string>>(
                     value,
                     JsonSerializerOptions.Default)
                 ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase));
