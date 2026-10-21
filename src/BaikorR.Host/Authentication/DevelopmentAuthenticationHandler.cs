using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace BaikorR.Host.Authentication;

public sealed class DevelopmentAuthenticationHandler(
    IOptionsMonitor<DevelopmentAuthenticationOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<DevelopmentAuthenticationOptions>(options, logger, encoder)
{
    public const string SchemeName = "Development";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        Claim[] claims =
        [
            new(ClaimTypes.NameIdentifier, "local-editor"),
            new("preferred_username", "local-editor"),
            new(ClaimTypes.Name, "Local Editor"),
            .. BaikorRoles.All.Select(role => new Claim(BaikorClaimTypes.Roles, role))
        ];
        var identity = new ClaimsIdentity(claims, SchemeName, ClaimTypes.Name, BaikorClaimTypes.Roles);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
