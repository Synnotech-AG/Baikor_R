using BaikorR.Core.Features.Routes;
using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Routes.Restore;

[ApiController]
[Route("api/routes/{id:guid}/restore")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class RestoreRouteController(IRoutePathsService service) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<RoutePathResponse>> Post(Guid id, RoutePathRestoreRequest request, CancellationToken cancellationToken) =>
        (await service.RestoreAsync(id, request, cancellationToken)).ToApiActionResult(this);
}
