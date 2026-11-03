using BaikorR.Core.Features.Routes;
using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Routes.List;

[ApiController]
[Route("api/routes")]
[Authorize(Policy = BaikorPolicies.Viewer)]
public sealed class ListRoutesController(IRoutePathsService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<RoutePathsPage>> Get(string? search = null, bool includeSuppressed = false,
        int page = 1, int pageSize = 50, CancellationToken cancellationToken = default) =>
        (await service.ListAsync(search, includeSuppressed, page, pageSize, cancellationToken)).ToApiActionResult(this);
}
