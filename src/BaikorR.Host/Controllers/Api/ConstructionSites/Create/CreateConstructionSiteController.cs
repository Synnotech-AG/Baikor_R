using BaikorR.Api.Authentication;
using BaikorR.Api.Controllers.Api.ConstructionSites.ById.Get;
using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Features.ConstructionSites.Create;
using BaikorR.Api.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Api.Controllers.Api.ConstructionSites.Create;

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
