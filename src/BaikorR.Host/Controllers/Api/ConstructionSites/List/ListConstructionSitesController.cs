using BaikorR.Api.Authentication;
using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Features.ConstructionSites.List;
using BaikorR.Api.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Api.Controllers.Api.ConstructionSites.List;

[ApiController]
[Route("api/construction-sites")]
[Authorize(Policy = BaikorPolicies.Viewer)]
public sealed class ListConstructionSitesController(
    IListConstructionSitesService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ConstructionSiteResponse>>> Get(
        CancellationToken cancellationToken)
    {
        var result = await service.ExecuteAsync(cancellationToken);
        return result.ToApiActionResult(this);
    }
}
