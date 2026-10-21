namespace BaikorR.Core.Features.ConstructionSites.Common;

internal static class ConstructionSiteCollectionValidationRules
{
    public static bool HaveUniqueContactIdentifiers(ConstructionSiteContactRequest[]? contacts) =>
        HaveUniqueIdentifiers(contacts?.Select(contact => contact.Id));

    public static bool HaveUniqueCommunicationIdentifiers(
        ConstructionSiteCommunicationRequest[]? communications) =>
        HaveUniqueIdentifiers(communications?.Select(communication => communication.Id));

    private static bool HaveUniqueIdentifiers(IEnumerable<Guid?>? identifiers)
    {
        if (identifiers is null)
        {
            return true;
        }

        var persistedIdentifiers = identifiers.Where(identifier => identifier.HasValue).Select(identifier => identifier!.Value);
        return persistedIdentifiers.Distinct().Count() == persistedIdentifiers.Count();
    }
}
