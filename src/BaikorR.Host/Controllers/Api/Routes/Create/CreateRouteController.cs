using BaikorR.Core.Features.Routes;
using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Host.Authentication;
using BaikorR.Host.Controllers.Api.Routes.Get;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Routes.Create;

[ApiController]
[Route("api/routes")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class CreateRouteController(IRoutePathsService service) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<RoutePathResponse>> Post(RoutePathWriteRequest request, CancellationToken cancellationToken)
    {
        var result = await service.CreateAsync(request, cancellationToken);
        return result.IsFailed ? result.ToApiActionResult(this)
            : CreatedAtRoute(GetRouteController.RouteName, new { id = result.Value.Id }, result.Value);
    }
}
