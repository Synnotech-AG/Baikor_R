using BaikorR.Core.Features.Alerts;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Alerts;

[ApiController]
[Route("api/alerts")]
[Authorize(Policy = BaikorPolicies.Viewer)]
public sealed class AlertsController(IAlertQueryService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<AlertPageResponse>> List([FromQuery] AlertListQuery query, CancellationToken cancellationToken) =>
        (await service.ListAsync(query, cancellationToken)).ToApiActionResult(this);

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<AlertDetailsResponse>> Get(Guid id, CancellationToken cancellationToken) =>
        (await service.GetAsync(id, cancellationToken)).ToApiActionResult(this);
}
