using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Alerts.Scans;

[ApiController]
[Route("api/alerts/scans/{id:guid}")]
[Authorize(Policy = BaikorPolicies.Viewer)]
public sealed class GetAlertScanController(IDetectionOperations operations) : ControllerBase
{
    public const string RouteName = "GetAlertScan";

    [HttpGet(Name = RouteName)]
    public async Task<ActionResult<AlertScanResponse>> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await operations.GetScanAsync(id, cancellationToken);
        return result.IsFailed ? result.ToApiActionResult(this) : Ok(result.Value);
    }
}
