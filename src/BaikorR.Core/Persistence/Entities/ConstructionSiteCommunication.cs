namespace BaikorR.Api.Persistence.Entities;

public sealed class ConstructionSiteCommunication
{
    public Guid Id { get; set; }

    public Guid ConstructionSiteId { get; set; }

    public ConstructionSite ConstructionSite { get; set; } = null!;

    public int Position { get; set; }

    public string Type { get; set; } = string.Empty;

    public string? Note { get; set; }
}
