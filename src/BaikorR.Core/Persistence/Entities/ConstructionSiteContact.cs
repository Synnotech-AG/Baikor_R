namespace BaikorR.Api.Persistence.Entities;

public sealed class ConstructionSiteContact
{
    public Guid Id { get; set; }

    public Guid ConstructionSiteId { get; set; }

    public ConstructionSite ConstructionSite { get; set; } = null!;

    public int Position { get; set; }

    public string FirstName { get; set; } = string.Empty;

    public string LastName { get; set; } = string.Empty;

    public string Role { get; set; } = string.Empty;

    public string? Email { get; set; }

    public string? Phone1 { get; set; }

    public string? Phone2 { get; set; }
}
