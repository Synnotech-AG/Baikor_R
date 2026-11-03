using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BaikorR.Core.Importers.Gtfs;

internal static class GtfsSourceIdentity
{
    public static string? Create(IEnumerable<string?> agencyUrls)
    {
        var values = agencyUrls.Select(CanonicalUrl).ToArray();
        if (values.Length == 0 || values.Any(url => url is null))
        {
            return null;
        }
        var canonical = JsonSerializer.Serialize(new
        {
            Format = "gtfs-source-v1",
            Agencies = values.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal)
        });
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
    }

    private static string? CanonicalUrl(string? value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) || uri.UserInfo.Length > 0)
        {
            return null;
        }
        var host = uri.IdnHost.ToLowerInvariant();
        if (host.StartsWith("www.", StringComparison.Ordinal))
        {
            host = host[4..];
        }
        var port = uri.IsDefaultPort ? string.Empty : $":{uri.Port}";
        return host + port + uri.AbsolutePath.TrimEnd('/');
    }
}
