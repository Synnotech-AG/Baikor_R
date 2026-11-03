using BaikorR.Core.Features.ConstructionSites.Attachments.Common;
using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using FluentResults;
using FluentValidation;

namespace BaikorR.Core.Features.ConstructionSites.Attachments.Upload;

public sealed class UploadConstructionSiteAttachmentService(
    IConstructionSiteAttachmentsSession session,
    IValidator<UploadConstructionSiteAttachmentRequest> validator,
    TimeProvider timeProvider)
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

        var constructionSite = await session.GetConstructionSiteForUpdateAsync(constructionSiteId, cancellationToken);
        if (constructionSite is null)
        {
            return UploadConstructionSiteAttachmentResults.NotFound();
        }

        if (constructionSite.IsDeleted)
        {
            return Result.Fail<ConstructionSiteAttachmentResponse>(ConstructionSiteArchiveErrors.Archived());
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
        session.TouchConstructionSite(constructionSite, timeProvider.GetUtcNow());
        if (!await session.SaveChangesAsync(cancellationToken))
        {
            return UploadConstructionSiteAttachmentResults.Conflict();
        }

        return UploadConstructionSiteAttachmentResults.Success(attachment);
    }
}
