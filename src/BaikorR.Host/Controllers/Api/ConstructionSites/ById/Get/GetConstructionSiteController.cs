using BaikorR.Api.Authentication;
using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Features.ConstructionSites.Get;
using BaikorR.Api.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Api.Controllers.Api.ConstructionSites.ById.Get;

[ApiController]
[Route("api/construction-sites/{id:guid}")]
[Authorize(Policy = BaikorPolicies.Viewer)]
public sealed class GetConstructionSiteController(
    IGetConstructionSiteService service) : ControllerBase
{
    public const string RouteName = "GetConstructionSite";

    [HttpGet(Name = RouteName)]
    public async Task<ActionResult<ConstructionSiteResponse>> Get(
        Guid id,
        CancellationToken cancellationToken)
    {
        var result = await service.ExecuteAsync(id, cancellationToken);
        return result.ToApiActionResult(this);
    }
}
