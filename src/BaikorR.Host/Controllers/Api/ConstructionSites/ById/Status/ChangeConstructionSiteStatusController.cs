using BaikorR.Api.Authentication;
using BaikorR.Api.Features.ConstructionSites.ChangeStatus;
using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Api.Controllers.Api.ConstructionSites.ById.Status;

[ApiController]
[Route("api/construction-sites/{id:guid}/status")]
[Authorize(Policy = BaikorPolicies.Approver)]
public sealed class ChangeConstructionSiteStatusController(
    IChangeConstructionSiteStatusService service) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<ConstructionSiteResponse>> Post(
        Guid id,
        ChangeConstructionSiteStatusRequest request,
        CancellationToken cancellationToken)
    {
        var result = await service.ExecuteAsync(id, request, cancellationToken);
        return result.ToApiActionResult(this);
    }
}
