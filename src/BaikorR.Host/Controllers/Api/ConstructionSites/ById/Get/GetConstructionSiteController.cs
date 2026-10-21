using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Features.ConstructionSites.Get;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.ConstructionSites.ById.Get;

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
