using System.Text.Json;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace BaikorR.Core.Persistence;

internal sealed class StringDictionaryValueComparer()
    : ValueComparer<Dictionary<string, string>>(
        (left, right) => Serialize(left) == Serialize(right),
        value => Serialize(value).GetHashCode(),
        value => Deserialize(Serialize(value)))
{
    private static string Serialize(Dictionary<string, string>? value) =>
        JsonSerializer.Serialize(value ?? [], JsonSerializerOptions.Default);

    private static Dictionary<string, string> Deserialize(string value) =>
        JsonSerializer.Deserialize<Dictionary<string, string>>(value, JsonSerializerOptions.Default)
        ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
}
