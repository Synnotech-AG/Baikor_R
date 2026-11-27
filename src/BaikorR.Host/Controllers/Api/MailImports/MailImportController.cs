using BaikorR.Core.Features.MailImports;
using BaikorR.Host.Authentication;
using BaikorR.Host.Shared.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BaikorR.Host.Controllers.Api.MailImports;

[ApiController]
[Route("api/settings/mail-import")]
[Authorize(Policy = BaikorPolicies.Administrator)]
public sealed class MailImportController(MailImportService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<MailImportSettingsResponse>> Get(CancellationToken cancellationToken) =>
        (await service.GetAsync(cancellationToken)).ToApiActionResult(this);

    [HttpPut]
    public async Task<ActionResult<MailImportSettingsResponse>> Save(MailImportSettingsRequest request, CancellationToken cancellationToken) =>
        (await service.SaveAsync(request, cancellationToken)).ToApiActionResult(this);

    [HttpPost("test")]
    public async Task<ActionResult<MailImportTestResponse>> Test(MailImportTestRequest request, CancellationToken cancellationToken) =>
        (await service.TestAsync(request, cancellationToken)).ToApiActionResult(this);

    [HttpPost("check")]
    public async Task<ActionResult<bool>> Check(CancellationToken cancellationToken)
    {
        var result = await service.CheckAsync(cancellationToken);
        return result.IsSuccess ? Accepted(new { scheduled = true }) : result.ToApiActionResult(this);
    }

    [HttpGet("status")]
    public async Task<ActionResult<MailImportStatusResponse>> Status(CancellationToken cancellationToken) =>
        Ok(await service.StatusAsync(cancellationToken));

    [HttpGet("history")]
    public async Task<ActionResult<MailImportHistoryResponse>> History([FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] bool processedOnly = false, CancellationToken cancellationToken = default) =>
        Ok(await service.HistoryAsync(page, pageSize, cancellationToken, processedOnly));

    [HttpPost("history/{id:guid}/retry")]
    public async Task<ActionResult<bool>> Retry(Guid id, CancellationToken cancellationToken)
    {
        var result = await service.RetryAsync(id, cancellationToken);
        return result.IsSuccess ? Accepted(new { scheduled = true }) : result.ToApiActionResult(this);
    }
}
