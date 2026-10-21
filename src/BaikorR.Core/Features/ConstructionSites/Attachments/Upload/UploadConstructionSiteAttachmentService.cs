using BaikorR.Core.Features.ConstructionSites.Attachments.Common;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using FluentResults;
using FluentValidation;

namespace BaikorR.Core.Features.ConstructionSites.Attachments.Upload;

public sealed class UploadConstructionSiteAttachmentService(
    IConstructionSiteAttachmentsSession session,
    IValidator<UploadConstructionSiteAttachmentRequest> validator)
    : IUploadConstructionSiteAttachmentService
{
    public async Task<Result<ConstructionSiteAttachmentResponse>> ExecuteAsync(
        Guid constructionSiteId,
        UploadConstructionSiteAttachmentRequest request,
        CancellationToken cancellationToken)
    {
        var validation = await validator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            return UploadConstructionSiteAttachmentResults.ValidationFailed(validation);
        }

        if (!await session.ConstructionSiteExistsAsync(constructionSiteId, cancellationToken))
        {
            return UploadConstructionSiteAttachmentResults.NotFound();
        }

        var normalizedFileName = Path.GetFileName(request.FileName.Replace('\\', '/')).Trim();
        var attachment = new ConstructionSiteAttachment
        {
            Id = Guid.NewGuid(),
            ConstructionSiteId = constructionSiteId,
            FileName = normalizedFileName,
            FileSize = request.Data.LongLength,
            MimeType = string.IsNullOrWhiteSpace(request.MimeType)
                ? "application/octet-stream"
                : request.MimeType.Trim(),
            Data = request.Data
        };
        session.Add(attachment);
        if (!await session.SaveChangesAsync(cancellationToken))
        {
            return UploadConstructionSiteAttachmentResults.Conflict();
        }

        return UploadConstructionSiteAttachmentResults.Success(attachment);
    }
}
