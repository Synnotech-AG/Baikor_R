using BaikorR.Core.Features.Routes;
using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Routes.RestorePath;

[ApiController]
[Route("api/routes/{id:guid}/paths/{pathId:guid}/restore")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class RestoreRoutePathController(IRoutePathsService service) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<RoutePathResponse>> Post(Guid id, Guid pathId, RoutePathRestoreRequest request, CancellationToken cancellationToken) =>
        (await service.RestorePathAsync(id, pathId, request, cancellationToken)).ToApiActionResult(this);
}
