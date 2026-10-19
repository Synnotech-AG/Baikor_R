using BaikorR.Api.Authentication;
using BaikorR.Core.Configuration;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace BaikorR.Api.Controllers.Auth.Login;

[ApiController]
[Route("auth/login")]
public sealed class LoginController(IOptions<AuthenticationConfiguration> authenticationConfiguration) : ControllerBase
{
    [HttpGet]
    public IActionResult Login([FromQuery] string? returnUrl)
    {
        var redirectUri = LocalReturnUrl(returnUrl);
        return authenticationConfiguration.Value.Enabled
            ? Challenge(
                new AuthenticationProperties { RedirectUri = redirectUri },
                OpenIdConnectDefaults.AuthenticationScheme)
            : Redirect(redirectUri);
    }

    private string LocalReturnUrl(string? returnUrl) =>
        !string.IsNullOrWhiteSpace(returnUrl)
        && Url.IsLocalUrl(returnUrl)
            ? Url.Content(returnUrl)
            : "/";
}
