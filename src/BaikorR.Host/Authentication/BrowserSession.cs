using System.Globalization;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace BaikorR.Host.Authentication;

internal static class BrowserSession
{
    private static readonly object RenewedExpiry = new();

    public static bool IsApiRequest(HttpRequest request) =>
        request.Path.StartsWithSegments("/api") && request.Headers["X-Baikor-Session"] == "1"
        && !request.Headers.Authorization.ToString().StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase);

    public static Task CheckSlidingExpiration(CookieSlidingExpirationContext context)
    {
        if (IsApiRequest(context.Request))
        {
            if (HttpMethods.IsGet(context.Request.Method) && context.Request.Headers["X-Baikor-Session-Probe"] == "1")
            {
                context.ShouldRenew = false;
            }
            else if (context.ShouldRenew && context.Properties.ExpiresUtc is { } expires)
            {
                // The cookie handler issues a replacement with the original ticket's full lifetime.
                context.HttpContext.Items[RenewedExpiry] = expires + context.ElapsedTime;
            }
        }
        return Task.CompletedTask;
    }

    public static Task ReportRemainingLifetime(CookieValidatePrincipalContext context)
    {
        if (IsApiRequest(context.Request) && context.Properties.ExpiresUtc is { } ticketExpiry)
        {
            var expiry = context.HttpContext.Items[RenewedExpiry] as DateTimeOffset? ?? ticketExpiry;
            context.Response.OnStarting(() =>
            {
                if (context.Response.StatusCode is >= 200 and < 300)
                {
                    var remaining = expiry - context.Options.TimeProvider!.GetUtcNow();
                    var seconds = Math.Max(0, Math.Ceiling(remaining.TotalSeconds));
                    context.Response.Headers["X-Baikor-Session-Remaining"] = seconds.ToString(CultureInfo.InvariantCulture);
                    context.Response.Headers.CacheControl = "no-store";
                }
                return Task.CompletedTask;
            });
        }
        return Task.CompletedTask;
    }
}
