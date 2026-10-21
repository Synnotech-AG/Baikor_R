using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Features.ConstructionSites.List;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.ConstructionSites.List;

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
