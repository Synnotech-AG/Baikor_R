using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Features.ConstructionSites.Common;

public sealed record ConstructionSiteContactResponse(
    Guid Id,
    string FirstName,
    string LastName,
    string Role,
    string? Email,
    string? Phone1,
    string? Phone2)
{
    public static ConstructionSiteContactResponse Create(ConstructionSiteContact contact) => new(
        contact.Id,
        contact.FirstName,
        contact.LastName,
        contact.Role,
        contact.Email,
        contact.Phone1,
        contact.Phone2);
}
