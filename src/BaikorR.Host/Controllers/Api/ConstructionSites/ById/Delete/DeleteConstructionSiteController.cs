using BaikorR.Core.Features.ConstructionSites.Delete;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.ConstructionSites.ById.Delete;

[ApiController]
[Route("api/construction-sites/{id:guid}")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class DeleteConstructionSiteController(
    IDeleteConstructionSiteService service) : ControllerBase
{
    [HttpDelete]
    public async Task<ActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var result = await service.ExecuteAsync(id, cancellationToken);
        return result.ToApiActionResult(this);
    }
}
