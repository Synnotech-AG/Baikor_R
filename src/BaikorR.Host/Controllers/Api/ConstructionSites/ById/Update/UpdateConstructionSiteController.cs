using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Features.ConstructionSites.Update;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.ConstructionSites.ById.Update;

[ApiController]
[Route("api/construction-sites/{id:guid}")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class UpdateConstructionSiteController(
    IUpdateConstructionSiteService service) : ControllerBase
{
    [HttpPut]
    public async Task<ActionResult<ConstructionSiteResponse>> Put(
        Guid id,
        UpdateConstructionSiteRequest request,
        CancellationToken cancellationToken)
    {
        var result = await service.ExecuteAsync(id, request, cancellationToken);
        return result.ToApiActionResult(this);
    }
}
