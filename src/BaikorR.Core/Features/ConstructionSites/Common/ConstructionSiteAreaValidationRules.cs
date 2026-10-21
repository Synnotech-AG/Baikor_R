namespace BaikorR.Core.Features.ConstructionSites.Common;

internal static class ConstructionSiteAreaValidationRules
{
    public static bool HaveUniqueNames(ConstructionSiteAreaRequest[]? areas) =>
        areas is null
        || !areas.GroupBy(area => area.Name?.Trim() ?? string.Empty, StringComparer.OrdinalIgnoreCase)
            .Any(group => group.Count() > 1);

    public static bool HaveUniqueIdentifiers(ConstructionSiteAreaRequest[]? areas) =>
        areas is null
        || !areas.Where(area => area.Id.HasValue)
            .GroupBy(area => area.Id!.Value)
            .Any(group => group.Count() > 1);
}
