using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Api.Controllers.Api.Antiforgery;

[ApiController]
[Route("api/antiforgery")]
// Every signed-in account must be able to log out, including accounts awaiting
// a Baikor role. Application endpoints still enforce their own role policies.
[Authorize]
public sealed class AntiforgeryController(IAntiforgery antiforgery) : ControllerBase
{
    [HttpGet]
    public ActionResult<AntiforgeryTokenResponse> Get()
    {
        var tokens = antiforgery.GetAndStoreTokens(HttpContext);
        return Ok(new AntiforgeryTokenResponse(tokens.RequestToken
            ?? throw new InvalidOperationException("No antiforgery request token was created.")));
    }
}
