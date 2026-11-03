using BaikorR.Core.Importers.Gtfs;
using BaikorR.Core.Shared.Results;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FluentResults;

namespace BaikorR.Host.Controllers.Api.Routes.Imports.Gtfs;

[ApiController]
[Route("api/routes/imports/gtfs")]
[Authorize(Policy = BaikorPolicies.Editor)]
public sealed class ImportGtfsController(IGtfsRoutesImporter importer) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(26 * 1024 * 1024)]
    public async Task<ActionResult<GtfsRoutesImportResponse>> Post([FromForm] IFormFile file,
        [FromForm] string? sourceId = null, [FromForm] bool preview = false, CancellationToken cancellationToken = default)
    {
        if (file.Length == 0 || file.Length > GtfsScheduleParser.MaximumArchiveBytes)
        {
            return Result.Fail<GtfsRoutesImportResponse>(ApiError.Validation("routes.import.file.size", "GTFS ZIP must contain between 1 byte and 25 MiB.", "file"))
                .ToApiActionResult(this);
        }
        await using var content = new MemoryStream((int)file.Length);
        await file.CopyToAsync(content, cancellationToken);
        // Omission selects automatic identification. A supplied but empty field
        // retains the explicit-source validation contract instead of changing mode.
        var requestedSource = sourceId ?? (Request.Form.ContainsKey("sourceId") ? string.Empty : null);
        return (await importer.ExecuteAsync(new GtfsRoutesImportRequest(content.ToArray(), requestedSource, preview), cancellationToken)).ToApiActionResult(this);
    }
}
