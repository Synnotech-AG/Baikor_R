using BaikorR.Core.Features.Routes;
using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Routes.Get;

[ApiController]
[Route("api/routes/{id:guid}")]
[Authorize(Policy = BaikorPolicies.Viewer)]
public sealed class GetRouteController(IRoutePathsService service) : ControllerBase
{
    public const string RouteName = "GetRoute";
    [HttpGet(Name = RouteName)]
    public async Task<ActionResult<RoutePathResponse>> Get(Guid id, bool includeSuppressed = false, CancellationToken cancellationToken = default) =>
        (await service.GetAsync(id, cancellationToken, includeSuppressed)).ToApiActionResult(this);
}
