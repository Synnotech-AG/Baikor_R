using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Core.Shared.Results;
using FluentResults;

namespace BaikorR.Core.Importers.Gtfs;

internal sealed record GtfsSourceResolution(string SourceId, GtfsImportSource? NewBinding = null);

internal static class GtfsSourceResolver
{
    // The caller holds the import transaction lock. A proposed binding is only
    // tracked alongside successful import changes, never by a preview or failure.
    public static async Task<Result<GtfsSourceResolution>> ResolveAsync(
        IRoutePathsSession session, ParsedGtfsFeed feed, string? requestedSource, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (requestedSource is not null)
        {
            // An explicit namespace remains authoritative for compatibility. It
            // can establish a missing binding, but never redirects/rebinds one.
            if (feed.SourceIdentity is { } explicitIdentity
                && await session.GetImportSourceAsync(explicitIdentity, cancellationToken) is null
                && !await session.IsImportSourceBoundAsync(requestedSource, cancellationToken))
            {
                return Bind(requestedSource, explicitIdentity, now);
            }
            return new GtfsSourceResolution(requestedSource);
        }
        if (feed.SourceIdentity is not { } identity)
        {
            return ApiError.Validation("routes.import.sourceIdentity.missing",
                "Automatic source identification requires valid agency URLs in agency.txt.", "file");
        }
        var bound = await session.GetImportSourceAsync(identity, cancellationToken);
        if (bound is not null)
        {
            return new GtfsSourceResolution(bound.SourceId);
        }

        var unbound = await session.GetUnboundSourceRoutesAsync(cancellationToken);
        var incoming = feed.Routes.ToDictionary(route => (route.ExternalRouteId, route.ExternalShapeId));
        var matches = unbound.GroupBy(route => route.SourceId!).Where(group => Matches(group, incoming)).ToArray();
        if (matches.Length > 1)
        {
            return ApiError.Conflict("routes.import.sourceIdentity.ambiguous",
                "Several existing sources match this feed. Resolve the source binding explicitly before importing.");
        }
        var sourceId = matches.Length == 1 ? matches[0].Key : $"gtfs-{identity}";
        if (matches.Length == 0 && (await session.GetSourceAsync(sourceId, cancellationToken)).Count > 0)
        {
            return ApiError.Conflict("routes.import.sourceIdentity.ambiguous",
                "The derived source namespace is already in use without matching provenance. Resolve the source binding explicitly before importing.");
        }
        return Bind(sourceId, identity, now);
    }

    private static GtfsSourceResolution Bind(string sourceId, string identity, DateTimeOffset now) =>
        new(sourceId, new GtfsImportSource { Identity = identity, SourceId = sourceId, CreatedAt = now });

    private static bool Matches(IEnumerable<RouteDefinition> existing,
        IReadOnlyDictionary<(string Route, string Shape), ParsedGtfsRoute> incoming)
    {
        var parents = existing.ToArray();
        var paths = parents.SelectMany(route => route.Paths).ToArray();
        return paths.Length == incoming.Count
            && parents.Select(route => route.ExternalRouteId).ToHashSet().SetEquals(incoming.Keys.Select(key => key.Route))
            && paths.All(path => path.ExternalRouteId is not null && path.ExternalShapeId is not null
                && incoming.TryGetValue((path.ExternalRouteId, path.ExternalShapeId), out var route)
                && path.Versions.Any(version => version.Geometry.EqualsExact(route.Geometry)));
    }
}
