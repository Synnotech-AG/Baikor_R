using BaikorR.Core.Features.ConstructionSites.BulkDelete;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.ConstructionSites.BulkDelete;

[ApiController]
[Route("api/construction-sites/bulk-delete")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class BulkDeleteConstructionSitesController(
    IBulkDeleteConstructionSitesService service) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<BulkDeleteConstructionSitesResponse>> Post(
        BulkDeleteConstructionSitesRequest request,
        CancellationToken cancellationToken)
    {
        var result = await service.ExecuteAsync(request, cancellationToken);
        return result.ToApiActionResult(this);
    }
}
