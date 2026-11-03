using BaikorR.Core.Features.Alerts;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Alerts;

[ApiController]
[Route("api/alerts/rules/route-conflict")]
public sealed class AlertRuleController(IAlertRuleService service) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = BaikorPolicies.Viewer)]
    public async Task<ActionResult<AlertRuleResponse>> Get(CancellationToken cancellationToken) =>
        (await service.GetAsync(cancellationToken)).ToApiActionResult(this);

    [HttpPut]
    [Authorize(Policy = BaikorPolicies.Administrator)]
    public async Task<ActionResult<AlertRuleResponse>> Put(AlertRuleUpdateRequest request, CancellationToken cancellationToken) =>
        (await service.UpdateAsync(request, cancellationToken)).ToApiActionResult(this);
}
