using BaikorR.Api.Persistence.Entities;

namespace BaikorR.Api.Features.ConstructionSites.Attachments.Common;

public sealed record ConstructionSiteAttachmentResponse(
    Guid Id,
    string FileName,
    long FileSize,
    string MimeType)
{
    public static ConstructionSiteAttachmentResponse Create(ConstructionSiteAttachment attachment) =>
        new(attachment.Id, attachment.FileName, attachment.FileSize, attachment.MimeType);
}
