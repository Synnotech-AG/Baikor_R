using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Host.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.Alerts.DetectionStatus;

[ApiController]
[Route("api/alerts/detection-status")]
[Authorize(Policy = BaikorPolicies.Viewer)]
public sealed class GetDetectionStatusController(IDetectionOperations operations) : ControllerBase
{
    [HttpGet]
    public Task<DetectionStatusResponse> Get(CancellationToken cancellationToken) =>
        operations.GetStatusAsync(cancellationToken);
}
