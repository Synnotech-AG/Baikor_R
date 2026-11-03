using BaikorR.Core.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Core.Persistence.Detection;

public readonly record struct DetectionInvalidation(string Kind, Guid SubjectId);

public static class DetectionChangeCollector
{
    public static IReadOnlySet<DetectionInvalidation> Collect(BaikorRDbContext context)
    {
        context.ChangeTracker.DetectChanges();
        var result = new HashSet<DetectionInvalidation>();
        foreach (var entry in context.ChangeTracker.Entries())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified or EntityState.Deleted))
            {
                continue;
            }

            switch (entry.Entity)
            {
                case ConstructionSite site when entry.State != EntityState.Modified
                    || entry.Properties.Any(property => property.IsModified
                        && property.Metadata.Name is nameof(ConstructionSite.Title)
                            or nameof(ConstructionSite.Status) or nameof(ConstructionSite.PlannedStart)
                            or nameof(ConstructionSite.PlannedEnd) or nameof(ConstructionSite.IsDeleted)):
                    result.Add(new("site", site.Id));
                    break;
                case ConstructionSiteArea area:
                    result.Add(new("site", area.ConstructionSiteId));
                    break;
                case RouteDefinition route:
                    result.Add(new("routeDefinition", route.Id));
                    break;
                case RoutePath path:
                    result.Add(new("routeDefinition", path.RouteDefinitionId));
                    break;
                case RoutePathVersion version:
                    result.Add(ForVersion(version));
                    break;
                case RouteOperatingPeriod period when period.RoutePathVersion is not null:
                    result.Add(ForVersion(period.RoutePathVersion));
                    break;
                case RouteOperatingPeriod period:
                    // Direct calendar edits can load only the period. Resolve its parent in the handler.
                    result.Add(new("routeVersion", period.RoutePathVersionId));
                    break;
                case AlertRule rule:
                    result.Add(new("rule", rule.Id));
                    break;
            }
        }
        return result;
    }

    private static DetectionInvalidation ForVersion(RoutePathVersion version) =>
        version.RoutePath is { } path
            ? new("routeDefinition", path.RouteDefinitionId)
            : new("route", version.RoutePathId);
}
