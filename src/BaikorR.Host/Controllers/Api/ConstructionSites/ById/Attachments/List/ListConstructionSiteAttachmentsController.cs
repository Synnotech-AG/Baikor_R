using BaikorR.Core.Features.ConstructionSites.Attachments.Common;
using BaikorR.Core.Features.ConstructionSites.Attachments.List;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.ConstructionSites.ById.Attachments.List;

[ApiController]
[Route("api/construction-sites/{constructionSiteId:guid}/attachments")]
[Authorize(Policy = BaikorPolicies.Viewer)]
public sealed class ListConstructionSiteAttachmentsController(
    IListConstructionSiteAttachmentsService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ConstructionSiteAttachmentResponse>>> Get(
        Guid constructionSiteId,
        CancellationToken cancellationToken)
    {
        var result = await service.ExecuteAsync(constructionSiteId, cancellationToken);
        return result.ToApiActionResult(this);
    }
}
