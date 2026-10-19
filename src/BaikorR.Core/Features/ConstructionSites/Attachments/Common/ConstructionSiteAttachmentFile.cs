namespace BaikorR.Api.Features.ConstructionSites.Attachments.Common;

public sealed record ConstructionSiteAttachmentFile(
    string FileName,
    string MimeType,
    byte[] Data);
