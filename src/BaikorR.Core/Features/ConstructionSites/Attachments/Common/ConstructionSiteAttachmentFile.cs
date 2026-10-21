namespace BaikorR.Core.Features.ConstructionSites.Attachments.Common;

public sealed record ConstructionSiteAttachmentFile(
    string FileName,
    string MimeType,
    byte[] Data);
