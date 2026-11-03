using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Host.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Alerts.Scans;

[ApiController]
[Route("api/alerts/scans")]
[Authorize(Policy = BaikorPolicies.Administrator)]
public sealed class RequestAlertScanController(IDetectionOperations operations) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<AlertScanResponse>> Post(CancellationToken cancellationToken)
    {
        var run = await operations.RequestScanAsync(cancellationToken);
        return AcceptedAtRoute(GetAlertScanController.RouteName, new { id = run.Id }, run);
    }
}
