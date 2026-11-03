using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Routes.Suppress;

[ApiController]
[Route("api/routes/{id:guid}")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class SuppressRouteController(IRoutePathsService service) : ControllerBase
{
    [HttpDelete]
    public async Task<ActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        (await service.SuppressAsync(id, cancellationToken)).ToApiActionResult(this);
}
