using System.Reflection;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Api.Controllers.Api.Version;

[ApiController]
[Route("api/version")]
public sealed class VersionController(IHostEnvironment environment) : ControllerBase
{
    [HttpGet]
    public ActionResult<ServiceVersionResponse> Get() => Ok(new ServiceVersionResponse(
        "Baikor_R",
        Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "unknown",
        environment.EnvironmentName));
}
