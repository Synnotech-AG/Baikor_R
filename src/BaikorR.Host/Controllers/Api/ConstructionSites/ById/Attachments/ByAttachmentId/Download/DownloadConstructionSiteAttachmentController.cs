using BaikorR.Core.Features.ConstructionSites.Attachments.Common;
using BaikorR.Core.Features.ConstructionSites.Attachments.Download;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.ConstructionSites.ById.Attachments.ByAttachmentId.Download;

[ApiController]
[Route("api/construction-sites/{constructionSiteId:guid}/attachments/{attachmentId:guid}")]
[Authorize(Policy = BaikorPolicies.Viewer)]
public sealed class DownloadConstructionSiteAttachmentController(
    IDownloadConstructionSiteAttachmentService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ConstructionSiteAttachmentFile>> Get(
        Guid constructionSiteId,
        Guid attachmentId,
        CancellationToken cancellationToken)
    {
        var result = await service.ExecuteAsync(constructionSiteId, attachmentId, cancellationToken);
        if (result.IsFailed)
        {
            return result.ToApiActionResult(this);
        }

        Response.Headers.Append("X-Content-Type-Options", "nosniff");
        return File(result.Value.Data, result.Value.MimeType, result.Value.FileName);
    }
}
