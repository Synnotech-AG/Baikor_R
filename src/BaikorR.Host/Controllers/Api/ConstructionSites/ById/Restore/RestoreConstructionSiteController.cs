using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Features.ConstructionSites.Restore;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.ConstructionSites.ById.Restore;

[ApiController]
[Route("api/construction-sites/{id:guid}/restore")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class RestoreConstructionSiteController(IRestoreConstructionSiteService service) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<ConstructionSiteResponse>> Post(
        Guid id,
        RestoreConstructionSiteRequest request,
        CancellationToken cancellationToken)
    {
        var result = await service.ExecuteAsync(id, request, cancellationToken);
        return result.ToApiActionResult(this);
    }
}
