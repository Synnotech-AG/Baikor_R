using BaikorR.Core.Configuration;
using BaikorR.Host.Controllers.Auth.Logout;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace BaikorR.Api.Tests;

public sealed class LogoutControllerTests
{
    [Fact]
    public void EnabledAuthenticationSignsOutToPublicConfirmationPage()
    {
        var controller = CreateController(authenticationEnabled: true);

        var result = Assert.IsType<SignOutResult>(controller.Logout());

        Assert.Equal("/signed-out.html", result.Properties?.RedirectUri);
        Assert.Equal(
            [CookieAuthenticationDefaults.AuthenticationScheme, OpenIdConnectDefaults.AuthenticationScheme],
            result.AuthenticationSchemes);
    }

    [Fact]
    public void DisabledAuthenticationReturnsToApplication()
    {
        var controller = CreateController(authenticationEnabled: false);

        var result = Assert.IsType<RedirectResult>(controller.Logout());

        Assert.Equal("/", result.Url);
    }

    private static LogoutController CreateController(bool authenticationEnabled) =>
        new(Options.Create(new AuthenticationConfiguration { Enabled = authenticationEnabled }));
}
