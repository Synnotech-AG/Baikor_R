using BaikorR.Core.Persistence.Sessions;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Shared.Results;
using FluentResults;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace BaikorR.Core.Importers.Gtfs;

public sealed record GtfsRoutesImportRequest(byte[] Content, string? SourceId = null, bool Preview = false);
public sealed record GtfsRoutesImportResponse(string SourceId, int CreatedCount, int UpdatedCount, int UnchangedCount,
    int SuppressedCount, int RouteCount, int TripCount, int ShapeCount, DateOnly CoverageStart, DateOnly CoverageEnd, IReadOnlyList<string> Warnings,
    int CreatedPathCount, int UpdatedPathCount, int UnchangedPathCount, int SuppressedPathCount, int PathCount);
public interface IGtfsRoutesImporter
{
    Task<Result<GtfsRoutesImportResponse>> ExecuteAsync(GtfsRoutesImportRequest request, CancellationToken cancellationToken);
}
public sealed class GtfsRoutesImporter(IRoutePathsSession session, TimeProvider timeProvider, GtfsScheduleParser parser) : IGtfsRoutesImporter
{
    public async Task<Result<GtfsRoutesImportResponse>> ExecuteAsync(GtfsRoutesImportRequest request, CancellationToken cancellationToken)
    {
        if (request.SourceId is not null && !Regex.IsMatch(request.SourceId, @"\A[a-z0-9][a-z0-9._-]{0,99}\z", RegexOptions.CultureInvariant))
        {
            return ApiError.Validation("routes.import.sourceId.invalid", "A stable provider sourceId of 1–100 lowercase letters, digits, dots, underscores or hyphens is required.", "sourceId");
        }
        ParsedGtfsFeed feed;
        try
        {
            feed = parser.Parse(request.Content, cancellationToken);
        }
        catch (InvalidDataException exception)
        {
            return ApiError.Validation("routes.import.gtfs.invalid", exception.Message, "file");
        }

        // Validate the entire feed before tracking changes; previews and failures never mutate existing aggregates.
        cancellationToken.ThrowIfCancellationRequested();
        await using var transaction = await session.BeginImportAsync(cancellationToken);
        var now = timeProvider.GetUtcNow();
        var resolution = await GtfsSourceResolver.ResolveAsync(session, feed, request.SourceId, now, cancellationToken);
        if (resolution.IsFailed)
        {
            return resolution.ToResult();
        }
        var sourceId = resolution.Value.SourceId;
        var existing = (await session.GetSourceAsync(sourceId, cancellationToken)).ToDictionary(route => route.ExternalRouteId!);
        var created = 0;
        var updated = 0;
        var unchanged = 0;
        var suppressed = 0;
        var createdPaths = 0;
        var updatedPaths = 0;
        var unchangedPaths = 0;
        var suppressedPaths = 0;
        var changes = new List<Action>();
        if (resolution.Value.NewBinding is { } binding)
        {
            changes.Add(() => session.AddImportSource(binding));
        }
        var groups = feed.Routes.GroupBy(item => item.ExternalRouteId).ToArray();
        foreach (var group in groups)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var metadata = group.First();
            if (!existing.TryGetValue(group.Key, out var definition))
            {
                created++;
                definition = new RouteDefinition
                {
                    Id = Guid.NewGuid(), Title = metadata.Title, Description = metadata.Description, SourceId = sourceId,
                    ExternalRouteId = group.Key, CreatedAt = now, UpdatedAt = now
                };
                foreach (var source in group)
                {
                    createdPaths++;
                    definition.Paths.Add(CreatePath(definition, source, feed, now));
                }
                var newDefinition = definition;
                changes.Add(() => session.Add(newDefinition));
                continue;
            }
            if (definition.IsSuppressed)
            {
                suppressed++;
                suppressedPaths += group.Count();
                continue;
            }
            var parentChanged = definition.Title != metadata.Title || definition.Description != metadata.Description;
            var activePaths = 0;
            foreach (var source in group)
            {
                var path = definition.Paths.SingleOrDefault(item => item.ExternalShapeId == source.ExternalShapeId);
                if (path is null)
                {
                    createdPaths++;
                    parentChanged = true;
                    var newPath = CreatePath(definition, source, feed, now);
                    changes.Add(() => session.AddPath(definition, newPath));
                    continue;
                }
                if (path.IsSuppressed)
                {
                    suppressedPaths++;
                    continue;
                }
                activePaths++;
                var matching = path.Versions.Where(version => version.SourceCoverageStart <= feed.CoverageEnd && version.SourceCoverageEnd >= feed.CoverageStart).ToArray();
                if (matching.Any(version => version.ServiceDayCalendarJson is null))
                {
                    return ApiError.Conflict("routes.import.provenanceMissing", "An existing source window has no service-day provenance and requires explicit reconciliation.");
                }
                if (path.Title == source.PathTitle && path.Description == source.Description && Equivalent(matching, source, feed.CoverageStart, feed.CoverageEnd))
                {
                    unchangedPaths++;
                    continue;
                }
                updatedPaths++;
                parentChanged = true;
                var replacements = new List<RoutePathVersion>();
                foreach (var old in matching)
                {
                    var calendar = Deserialize(old);
                    if (old.SourceCoverageStart < feed.CoverageStart)
                    {
                        var end = feed.CoverageStart.AddDays(-1);
                        replacements.Add(CreateVersion(path, old.Geometry, old.SourceCoverageStart!.Value, end, calendar.Where(pair => pair.Key <= end).ToDictionary()));
                    }
                    if (old.SourceCoverageEnd > feed.CoverageEnd)
                    {
                        var start = feed.CoverageEnd.AddDays(1);
                        replacements.Add(CreateVersion(path, old.Geometry, start, old.SourceCoverageEnd!.Value, calendar.Where(pair => pair.Key >= start).ToDictionary()));
                    }
                }
                replacements.Add(CreateVersion(path, source.Geometry, feed.CoverageStart, feed.CoverageEnd, source.ServiceDayOffsets));
                changes.Add(() =>
                {
                    path.Title = source.PathTitle;
                    path.Description = source.Description;
                    path.UpdatedAt = now;
                    foreach (var old in matching)
                    {
                        session.RemoveVersion(path, old);
                    }
                    foreach (var version in replacements)
                    {
                        session.AddVersion(path, version);
                    }
                });
            }
            if (parentChanged)
            {
                updated++;
                changes.Add(() =>
                {
                    definition.Title = metadata.Title;
                    definition.Description = metadata.Description;
                    definition.UpdatedAt = now;
                });
            }
            else if (activePaths > 0)
            {
                unchanged++;
            }
            else
            {
                suppressed++;
            }
        }
        if (!request.Preview && changes.Count > 0)
        {
            foreach (var change in changes)
            {
                change();
            }
            if (!await session.SaveChangesAsync(cancellationToken))
            {
                return ApiError.Conflict("routes.import.conflict", "Source data changed during import. Reload the preview and try again.");
            }
        }
        await transaction.CommitAsync(cancellationToken);
        var warnings = feed.Warnings.ToList();
        warnings.Add("Only supplied route/shape bindings are updated within this feed's service-date coverage; missing bindings are retained.");
        if (createdPaths > 0 && existing.Count > 0)
        {
            warnings.Add("Unmatched shape bindings create separate paths within their source route. Regenerated source shape IDs require explicit provider reconciliation.");
        }
        if (suppressedPaths > 0)
        {
            warnings.Add("Suppressed source routes and paths remain suppressed and are not updated or restored.");
        }
        return new GtfsRoutesImportResponse(sourceId, created, updated, unchanged, suppressed,
            groups.Length, feed.TripCount, feed.ShapeCount, feed.CoverageStart, feed.CoverageEnd, warnings,
            createdPaths, updatedPaths, unchangedPaths, suppressedPaths, feed.Routes.Count);
    }

    private static RoutePath CreatePath(RouteDefinition definition, ParsedGtfsRoute source, ParsedGtfsFeed feed, DateTimeOffset now)
    {
        var path = new RoutePath
        {
            Id = Guid.NewGuid(), RouteDefinitionId = definition.Id, RouteDefinition = definition, Title = source.PathTitle,
            Description = source.Description, SourceId = definition.SourceId, ExternalRouteId = source.ExternalRouteId,
            ExternalShapeId = source.ExternalShapeId, CreatedAt = now, UpdatedAt = now
        };
        path.Versions.Add(CreateVersion(path, source.Geometry, feed.CoverageStart, feed.CoverageEnd, source.ServiceDayOffsets));
        return path;
    }
    private static bool Equivalent(RoutePathVersion[] versions, ParsedGtfsRoute incoming, DateOnly start, DateOnly end)
    {
        if (versions.Length == 0 || versions.Any(version => !version.Geometry.EqualsExact(incoming.Geometry)))
        {
            return false;
        }
        var through = start.AddDays(-1);
        var calendar = new Dictionary<DateOnly, int[]>();
        foreach (var version in versions.OrderBy(version => version.SourceCoverageStart))
        {
            if (version.SourceCoverageStart > through.AddDays(1))
            {
                return false;
            }
            if (version.SourceCoverageEnd > through)
            {
                through = version.SourceCoverageEnd!.Value;
            }
            foreach (var pair in Deserialize(version).Where(pair => pair.Key >= start && pair.Key <= end))
            {
                calendar[pair.Key] = pair.Value;
            }
        }
        return through >= end && calendar.Count == incoming.ServiceDayOffsets.Count
            && calendar.All(pair => incoming.ServiceDayOffsets.TryGetValue(pair.Key, out var offsets) && pair.Value.SequenceEqual(offsets));
    }

    private static Dictionary<DateOnly, int[]> Deserialize(RoutePathVersion version) =>
        JsonSerializer.Deserialize<Dictionary<DateOnly, int[]>>(version.ServiceDayCalendarJson!)!;

    private static RoutePathVersion CreateVersion(RoutePath route, NetTopologySuite.Geometries.MultiLineString geometry,
        DateOnly start, DateOnly end, IReadOnlyDictionary<DateOnly, int[]> serviceDays)
    {
        var version = new RoutePathVersion
        {
            Id = Guid.NewGuid(), RoutePathId = route.Id, RoutePath = route, Geometry = geometry,
            SourceCoverageStart = start, SourceCoverageEnd = end, HasOperatingCalendar = true,
            ServiceDayCalendarJson = JsonSerializer.Serialize(serviceDays.OrderBy(pair => pair.Key).ToDictionary())
        };
        var civilDates = serviceDays.SelectMany(pair => pair.Value.Select(offset => pair.Key.AddDays(offset))).Distinct().Order().ToArray();
        foreach (var date in civilDates)
        {
            if (version.Periods.LastOrDefault() is { } last && last.To.AddDays(1) == date)
            {
                last.To = date;
            }
            else
            {
                version.Periods.Add(new RouteOperatingPeriod { Id = Guid.NewGuid(), RoutePathVersionId = version.Id, RoutePathVersion = version, From = date, To = date });
            }
        }
        return version;
    }
}
