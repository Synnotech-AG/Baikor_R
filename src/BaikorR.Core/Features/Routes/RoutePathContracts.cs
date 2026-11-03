using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Features.Routes;

public sealed record RouteLineGeometry(string Type, double[][][] Coordinates);
public sealed record RoutePeriodResponse(DateOnly From, DateOnly To);
public sealed record RoutePathVersionResponse(Guid Id, RouteLineGeometry Geometry, DateOnly? ValidFrom, DateOnly? ValidTo,
    DateOnly? SourceCoverageStart, DateOnly? SourceCoverageEnd, bool HasOperatingCalendar, IReadOnlyList<RoutePeriodResponse> Periods);
public sealed record RoutePathChildResponse(Guid Id, string Title, string? ExternalShapeId, bool IsSuppressed,
    IReadOnlyList<RoutePathVersionResponse> Versions)
{
    public static RoutePathChildResponse Create(RoutePath path) => new(path.Id, path.Title, path.ExternalShapeId, path.IsSuppressed,
        path.Versions.OrderBy(item => item.SourceCoverageStart).ThenBy(item => item.Id).Select(item => new RoutePathVersionResponse(
            item.Id, RouteGeometry.ToDto(item.Geometry), item.ValidFrom, item.ValidTo, item.SourceCoverageStart, item.SourceCoverageEnd,
            item.HasOperatingCalendar, item.Periods.OrderBy(period => period.From).Select(period => new RoutePeriodResponse(period.From, period.To)).ToArray())).ToArray());
}
public sealed record RoutePathResponse(Guid Id, string Title, string? Description, string? SourceId, string? ExternalRouteId,
    bool IsSuppressed, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, uint Version, IReadOnlyList<RoutePathChildResponse> Paths)
{
    public static RoutePathResponse Create(RouteDefinition route) => new(route.Id, route.Title, route.Description, route.SourceId,
        route.ExternalRouteId, route.IsSuppressed, route.CreatedAt, route.UpdatedAt, route.Version,
        route.Paths.OrderBy(item => item.Title).ThenBy(item => item.Id).Select(RoutePathChildResponse.Create).ToArray());
}
public sealed record RoutePathWriteItem(Guid? Id, string Title, DateOnly? ValidFrom, DateOnly? ValidTo, RouteLineGeometry Geometry);
public sealed record RoutePathWriteRequest(string Title, string? Description = null, DateOnly? ValidFrom = null, DateOnly? ValidTo = null,
    RouteLineGeometry? Geometry = null, uint? Version = null, IReadOnlyList<RoutePathWriteItem>? Paths = null);
public sealed record RoutePathRestoreRequest(uint? Version);
public sealed record RoutePathDeleteRequest(uint? Version);
public sealed record RoutePathsPage(IReadOnlyList<RoutePathResponse> Items, int TotalCount, int Page, int PageSize);
