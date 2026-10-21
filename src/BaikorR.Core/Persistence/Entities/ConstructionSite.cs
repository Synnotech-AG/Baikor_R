namespace BaikorR.Core.Persistence.Entities;

public sealed class ConstructionSite
{
    public Guid Id { get; set; }

    public string Title { get; set; } = string.Empty;

    public ConstructionSiteStatus Status { get; set; }

    public DateOnly? PlannedStart { get; set; }

    public DateOnly? PlannedEnd { get; set; }

    public string? Diversion { get; set; }

    public Dictionary<string, string> Metadata { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public uint Version { get; set; }

    public List<ConstructionSiteArea> Areas { get; set; } = [];

    public List<ConstructionSiteContact> Contacts { get; set; } = [];

    public List<ConstructionSiteCommunication> Communications { get; set; } = [];

    public List<ConstructionSiteAttachment> Attachments { get; set; } = [];
}
