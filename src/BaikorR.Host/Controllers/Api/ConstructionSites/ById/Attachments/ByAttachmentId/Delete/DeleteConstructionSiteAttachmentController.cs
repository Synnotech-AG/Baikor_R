using BaikorR.Api.Authentication;
using BaikorR.Api.Features.ConstructionSites.Attachments.Delete;
using BaikorR.Api.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Api.Controllers.Api.ConstructionSites.ById.Attachments.ByAttachmentId.Delete;

[ApiController]
[Route("api/construction-sites/{constructionSiteId:guid}/attachments/{attachmentId:guid}")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class DeleteConstructionSiteAttachmentController(
    IDeleteConstructionSiteAttachmentService service) : ControllerBase
{
    [HttpDelete]
    public async Task<ActionResult> Delete(
        Guid constructionSiteId,
        Guid attachmentId,
        CancellationToken cancellationToken)
    {
        var result = await service.ExecuteAsync(constructionSiteId, attachmentId, cancellationToken);
        return result.ToApiActionResult(this);
    }
}
