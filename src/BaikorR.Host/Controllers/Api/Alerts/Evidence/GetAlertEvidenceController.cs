using BaikorR.Core.Features.Alerts;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Alerts.Evidence;

[ApiController]
[Route("api/alerts/{id:guid}/evidence/{revision:int}")]
[Authorize(Policy = BaikorPolicies.Viewer)]
public sealed class GetAlertEvidenceController(IAlertQueryService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<AlertEvidenceResponse>> Get(Guid id, int revision, CancellationToken cancellationToken) =>
        (await service.GetEvidenceAsync(id, revision, cancellationToken)).ToApiActionResult(this);
}
