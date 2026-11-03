using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;

namespace BaikorR.Core.Persistence.Detection;

/// <summary>PostGIS discovers candidates; the registered detector owns conflict semantics.</summary>
public sealed class RouteConflictDetectionHandler(BaikorRDbContext context,
    IRouteConflictDetector detector, AlertReconciler reconciler) : IAlertDetectionHandler
{
    public string Type => detector.Type;
    public IReadOnlyCollection<string> SupportedTriggerKinds => detector.SupportedTriggerKinds;

    public async Task<DetectionScanPage> ScanPageAsync(Guid cursor, int pageSize,
        CancellationToken cancellationToken)
    {
        var ids = await context.RouteDefinitions.AsNoTracking()
            .Where(route => route.Id.CompareTo(cursor) > 0)
            .OrderBy(route => route.Id).Select(route => route.Id)
            .Take(pageSize + 1).ToArrayAsync(cancellationToken);
        return new(ids.Take(pageSize).Select(id => new DetectionSubject("routeDefinition", id)).ToArray(),
            ids.Length > pageSize ? ids[pageSize - 1] : null);
    }

    public async Task<DetectionProcessOutcome> ProcessAsync(AlertDetectionWork work, DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var rule = await context.AlertRules.AsNoTracking().SingleOrDefaultAsync(
            item => item.Id == AlertRule.RouteConflictRuleId, cancellationToken)
            ?? throw new InvalidOperationException("The route conflict rule is missing.");
        if (!rule.Enabled)
        {
            return new(false, false);
        }
        if (work.Kind == "site")
        {
            await ScheduleAffectedRoutes(work.SubjectId, rule, now, cancellationToken);
            return new(false);
        }

        var routeId = work.Kind switch
        {
            "routeVersion" => await context.RoutePathVersions.Where(version => version.Id == work.SubjectId)
                .Select(version => (Guid?)version.RoutePath.RouteDefinitionId).SingleOrDefaultAsync(cancellationToken),
            "route" => await context.RoutePaths.Where(path => path.Id == work.SubjectId)
                .Select(path => (Guid?)path.RouteDefinitionId).SingleOrDefaultAsync(cancellationToken) ?? work.SubjectId,
            _ => (Guid?)work.SubjectId
        };
        if (routeId is null)
        {
            // Deleting the parent version also persists its owning route invalidation.
            return new(false, false);
        }
        var route = await context.RouteDefinitions.AsNoTracking()
            .Include(item => item.Paths).ThenInclude(path => path.Versions).ThenInclude(version => version.Periods)
            .AsSplitQuery().SingleOrDefaultAsync(item => item.Id == routeId, cancellationToken);
        var existing = await context.Alerts
            .Where(item => item.RuleId == rule.Id && item.SupersededByAlertId == null && item.RouteConflict != null
                && item.RouteConflict.RouteId == routeId)
            .Include(item => item.RouteConflict).ToDictionaryAsync(item => item.RouteConflict!.ConstructionSiteId, cancellationToken);
        if (route is null || route.IsSuppressed || route.Paths.All(path => path.IsSuppressed))
        {
            foreach (var alert in existing.Values)
            {
                reconciler.Clear(alert, now, "The route was removed or suppressed.");
            }
            return new(true);
        }

        var candidateIds = new HashSet<Guid>(existing.Keys);
        var activePaths = route.Paths.Where(path => !path.IsSuppressed).ToArray();
        var versions = activePaths.SelectMany(path => path.Versions).ToArray();
        if (versions.Length > 0)
        {
            var paths = Collection(versions.Select(version => version.Geometry));
            candidateIds.UnionWith(await context.ConstructionSiteAreas.AsNoTracking()
                .Where(area => !area.ConstructionSite.IsDeleted
                    && area.Geometry.IsWithinDistance(paths, rule.SensitivityMetres))
                .Select(area => area.ConstructionSiteId).Distinct().ToArrayAsync(cancellationToken));
        }
        var input = new RouteConflictRoute(route.Id, route.Title, route.IsSuppressed,
            activePaths.SelectMany(path => path.Versions.Select(version => new RouteConflictPath(version.Geometry,
                version.ValidFrom, version.ValidTo, version.HasOperatingCalendar,
                version.Periods.Select(period => new RouteConflictPeriod(period.From, period.To)).ToArray(),
                version.SourceCoverageStart, version.SourceCoverageEnd, path.Id, path.Title))).ToArray());

        // Bound query parameters and tracking to one spatial partition, never the UI listing limit.
        foreach (var batch in candidateIds.Chunk(500))
        {
            var sites = await context.ConstructionSites.AsNoTracking().Include(site => site.Areas)
                .Where(site => !site.IsDeleted && batch.Contains(site.Id)).AsSplitQuery().ToDictionaryAsync(
                    site => site.Id, cancellationToken);
            foreach (var id in batch)
            {
                existing.TryGetValue(id, out var current);
                if (!sites.TryGetValue(id, out var site))
                {
                    if (current is not null)
                    {
                        reconciler.Clear(current, now, "The construction site was archived or removed.");
                    }
                    continue;
                }
                var evaluation = detector.Evaluate(rule, input, new(site.Id, site.Title, site.Status,
                    site.PlannedStart, site.PlannedEnd, site.Areas.Select(area =>
                        new RouteConflictArea(area.Id, area.Name, area.Geometry)).ToArray()));
                if (!evaluation.Assessable)
                {
                    throw new InvalidDataException("Route conflict evidence is not assessable.");
                }
                if (evaluation.Candidate is not null)
                {
                    var alert = reconciler.Reconcile(current, evaluation.Candidate, now);
                    if (current is null)
                    {
                        context.Alerts.Add(alert);
                    }
                }
                else if (current is not null)
                {
                    reconciler.Clear(current, now, "Spatial, temporal or status conditions no longer match.");
                }
            }
        }
        return new(true);
    }

    private async Task ScheduleAffectedRoutes(Guid siteId, AlertRule rule, DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var ids = (await context.RouteConflictAlerts.AsNoTracking()
            .Where(item => item.ConstructionSiteId == siteId && item.Alert.SupersededByAlertId == null).Select(item => item.RouteId)
            .Distinct().ToArrayAsync(cancellationToken)).ToHashSet();
        var site = await context.ConstructionSites.AsNoTracking().Include(item => item.Areas)
            .SingleOrDefaultAsync(item => item.Id == siteId, cancellationToken);
        if (site is not null && !site.IsDeleted && site.Areas.Count > 0 && rule.EligibleStatuses.Contains(site.Status))
        {
            var areas = Collection(site.Areas.Select(area => area.Geometry));
            ids.UnionWith(await context.RoutePathVersions.AsNoTracking()
                .Where(version => !version.RoutePath.IsSuppressed && !version.RoutePath.RouteDefinition.IsSuppressed
                    && version.Geometry.IsWithinDistance(areas, rule.SensitivityMetres))
                .Select(version => version.RoutePath.RouteDefinitionId).Distinct().ToArrayAsync(cancellationToken));
        }
        foreach (var id in ids)
        {
            context.AlertDetectionWork.Add(new()
            {
                Kind = "routeDefinition", SubjectId = id, DetectorType = Type, CreatedAt = now, AvailableAt = now
            });
        }
    }

    private static GeometryCollection Collection(IEnumerable<Geometry> geometries) =>
        new GeometryFactory(new PrecisionModel(), 25832).CreateGeometryCollection(geometries.ToArray());
}
