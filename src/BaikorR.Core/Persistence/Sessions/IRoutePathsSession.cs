using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Persistence.Sessions;

public interface IRoutePathsSession
{
    Task<IRouteImportTransaction> BeginImportAsync(CancellationToken cancellationToken);
    Task<(IReadOnlyList<RouteDefinition> Items, int TotalCount)> ListAsync(string? search, bool includeSuppressed, int page, int pageSize, CancellationToken cancellationToken);
    Task<RouteDefinition?> GetAsync(Guid id, bool forUpdate, CancellationToken cancellationToken);
    Task<IReadOnlyList<RouteDefinition>> GetSourceAsync(string sourceId, CancellationToken cancellationToken);
    Task<GtfsImportSource?> GetImportSourceAsync(string identity, CancellationToken cancellationToken);
    Task<bool> IsImportSourceBoundAsync(string sourceId, CancellationToken cancellationToken);
    Task<IReadOnlyList<RouteDefinition>> GetUnboundSourceRoutesAsync(CancellationToken cancellationToken);
    void AddImportSource(GtfsImportSource source);
    void Add(RouteDefinition route);
    void AddPath(RouteDefinition route, RoutePath path);
    void RemovePath(RouteDefinition route, RoutePath path);
    void AddVersion(RoutePath route, RoutePathVersion version);
    void RemoveVersion(RoutePath route, RoutePathVersion version);
    void SetExpectedVersion(RouteDefinition route, uint version);
    Task<bool> SaveChangesAsync(CancellationToken cancellationToken);
}

public interface IRouteImportTransaction : IAsyncDisposable
{
    Task CommitAsync(CancellationToken cancellationToken);
}
