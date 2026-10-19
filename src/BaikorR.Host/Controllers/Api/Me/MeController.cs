using System.Security.Claims;
using BaikorR.Api.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Api.Controllers.Api.Me;

[ApiController]
[Route("api/me")]
[Authorize(Policy = BaikorPolicies.Viewer)]
public sealed class MeController : ControllerBase
{
    [HttpGet]
    public ActionResult<UserSessionResponse> Get()
    {
        var name = User.Identity?.Name
            ?? User.FindFirstValue("preferred_username")
            ?? "unknown";
        return Ok(new UserSessionResponse(
            name,
            BaikorRoles.All.Where(User.IsInRole).ToArray()));
    }
}
