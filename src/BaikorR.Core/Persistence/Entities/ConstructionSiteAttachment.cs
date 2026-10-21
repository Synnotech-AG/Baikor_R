namespace BaikorR.Core.Persistence.Entities;

public sealed class ConstructionSiteAttachment
{
    public Guid Id { get; set; }

    public Guid ConstructionSiteId { get; set; }

    public ConstructionSite ConstructionSite { get; set; } = null!;

    public string FileName { get; set; } = string.Empty;

    public long FileSize { get; set; }

    public string MimeType { get; set; } = string.Empty;

    public byte[] Data { get; set; } = [];
}
