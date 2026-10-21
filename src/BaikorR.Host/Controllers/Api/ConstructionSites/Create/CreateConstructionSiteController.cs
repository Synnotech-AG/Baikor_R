using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Features.ConstructionSites.Create;
using BaikorR.Host.Authentication;
using BaikorR.Host.Controllers.Api.ConstructionSites.ById.Get;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.ConstructionSites.Create;

[ApiController]
[Route("api/construction-sites")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class CreateConstructionSiteController(
    ICreateConstructionSiteService service) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<ConstructionSiteResponse>> Post(
        CreateConstructionSiteRequest request,
        CancellationToken cancellationToken)
    {
        var result = await service.ExecuteAsync(request, cancellationToken);
        if (result.IsFailed)
        {
            return result.ToApiActionResult(this);
        }

        return CreatedAtRoute(
            GetConstructionSiteController.RouteName,
            new { id = result.Value.Id },
            result.Value);
    }
}
