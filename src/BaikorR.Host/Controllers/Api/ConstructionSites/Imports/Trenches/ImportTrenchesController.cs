using BaikorR.Core.Importers.Rkom;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Antiforgery;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.ConstructionSites.Imports.Trenches;

[ApiController]
[Route("api/construction-sites/imports/trenches")]
[Authorize(Policy = BaikorPolicies.Importer)]
[IgnoreAntiforgeryToken]
[ValidateAntiforgeryForCookie]
public sealed class ImportTrenchesController(IRkomTrenchesImporter importer) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(26 * 1024 * 1024)]
    public async Task<ActionResult<RkomTrenchesImportResponse>> Post(
        [FromForm] IFormFile file,
        [FromForm] double bufferMetres = 1,
        CancellationToken cancellationToken = default)
    {
        await using var content = new MemoryStream();
        await file.CopyToAsync(content, cancellationToken);
        var result = await importer.ExecuteAsync(
            new RkomTrenchesImportRequest(
                file.FileName,
                content.ToArray(),
                bufferMetres),
            cancellationToken);
        return result.ToApiActionResult(this);
    }
}
