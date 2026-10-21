using BaikorR.Core.Features.ConstructionSites.ChangeStatus;
using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.ConstructionSites.ById.Status;

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
