using System.Security.Claims;
using BaikorR.Core.Features.Alerts;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Alerts;

[ApiController]
[Route("api/alerts/{id:guid}/handling")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class AlertHandlingController(IAlertHandlingService service) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<AlertDetailsResponse>> Post(Guid id, AlertHandlingRequest request, CancellationToken cancellationToken)
    {
        var actor = User.FindFirstValue("sub") ?? User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name ?? "unknown";
        return (await service.ExecuteAsync(id, request, actor, cancellationToken)).ToApiActionResult(this);
    }
}
