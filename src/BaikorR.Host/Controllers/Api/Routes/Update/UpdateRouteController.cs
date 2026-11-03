using BaikorR.Core.Features.Routes;
using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Routes.Update;

[ApiController]
[Route("api/routes/{id:guid}")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class UpdateRouteController(IRoutePathsService service) : ControllerBase
{
    [HttpPut]
    public async Task<ActionResult<RoutePathResponse>> Put(Guid id, RoutePathWriteRequest request, CancellationToken cancellationToken) =>
        (await service.UpdateAsync(id, request, cancellationToken)).ToApiActionResult(this);
}
