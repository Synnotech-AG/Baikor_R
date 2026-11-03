using BaikorR.Core.Features.Routes;
using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Routes.SuppressPath;

[ApiController]
[Route("api/routes/{id:guid}/paths/{pathId:guid}")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class SuppressRoutePathController(IRoutePathsService service) : ControllerBase
{
    [HttpDelete]
    public async Task<ActionResult<RoutePathResponse>> Delete(Guid id, Guid pathId, RoutePathDeleteRequest request, CancellationToken cancellationToken) =>
        (await service.SuppressPathAsync(id, pathId, request, cancellationToken)).ToApiActionResult(this);
}
