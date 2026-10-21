using BaikorR.Core.Configuration;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace BaikorR.Host.Controllers.Auth.Logout;

[ApiController]
[Route("auth/logout")]
public sealed class LogoutController(IOptions<AuthenticationConfiguration> authenticationConfiguration) : ControllerBase
{
    [HttpPost]
    [Authorize]
    public IActionResult Logout() =>
        authenticationConfiguration.Value.Enabled
            ? SignOut(
                new AuthenticationProperties { RedirectUri = "/signed-out.html" },
                CookieAuthenticationDefaults.AuthenticationScheme,
                OpenIdConnectDefaults.AuthenticationScheme)
            : Redirect("/");
}
