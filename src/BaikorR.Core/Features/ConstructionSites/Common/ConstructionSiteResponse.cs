using BaikorR.Api.Persistence.Entities;

namespace BaikorR.Api.Features.ConstructionSites.Common;

public sealed record ConstructionSiteResponse(
    Guid Id,
    string Title,
    ConstructionSiteStatus Status,
    DateOnly? PlannedStart,
    DateOnly? PlannedEnd,
    IReadOnlyList<ConstructionSiteAreaResponse> Areas,
    string? Diversion,
    IReadOnlyList<ConstructionSiteContactResponse> Contacts,
    IReadOnlyList<ConstructionSiteCommunicationResponse> Communications,
    double AreaSquareMetres,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    uint Version,
    IReadOnlyDictionary<string, string> Metadata)
{
    public static ConstructionSiteResponse Create(ConstructionSite constructionSite)
    {
        var areas = constructionSite.Areas
            .OrderBy(area => area.Name, StringComparer.OrdinalIgnoreCase)
            .Select(ConstructionSiteAreaResponse.Create)
            .ToArray();
        var contacts = constructionSite.Contacts
            .OrderBy(contact => contact.Position)
            .Select(ConstructionSiteContactResponse.Create)
            .ToArray();
        var communications = constructionSite.Communications
            .OrderBy(communication => communication.Position)
            .Select(ConstructionSiteCommunicationResponse.Create)
            .ToArray();

        return new ConstructionSiteResponse(
            constructionSite.Id,
            constructionSite.Title,
            constructionSite.Status,
            constructionSite.PlannedStart,
            constructionSite.PlannedEnd,
            areas,
            constructionSite.Diversion,
            contacts,
            communications,
            areas.Sum(area => area.AreaSquareMetres),
            constructionSite.CreatedAt,
            constructionSite.UpdatedAt,
            constructionSite.Version,
            constructionSite.Metadata
                .OrderBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(pair => pair.Key, pair => pair.Value));
    }
}
