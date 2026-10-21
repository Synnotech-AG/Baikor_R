using BaikorR.Core.Features.ConstructionSites.Attachments.Common;
using BaikorR.Core.Features.ConstructionSites.Attachments.Upload;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.ConstructionSites.ById.Attachments.Upload;

[ApiController]
[Route("api/construction-sites/{constructionSiteId:guid}/attachments")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class UploadConstructionSiteAttachmentController(
    IUploadConstructionSiteAttachmentService service) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(26 * 1024 * 1024)]
    public async Task<ActionResult<ConstructionSiteAttachmentResponse>> Post(
        Guid constructionSiteId,
        [FromForm] IFormFile file,
        CancellationToken cancellationToken)
    {
        await using var content = new MemoryStream();
        await file.CopyToAsync(content, cancellationToken);
        var request = new UploadConstructionSiteAttachmentRequest(
            file.FileName,
            file.ContentType,
            content.ToArray());
        var result = await service.ExecuteAsync(constructionSiteId, request, cancellationToken);
        return result.ToApiActionResult(this);
    }
}
