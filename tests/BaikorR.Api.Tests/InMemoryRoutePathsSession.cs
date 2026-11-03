using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;

namespace BaikorR.Api.Tests;

internal sealed class InMemoryRoutePathsSession : IRoutePathsSession
{
    public Task<IRouteImportTransaction> BeginImportAsync(CancellationToken cancellationToken) => Task.FromResult<IRouteImportTransaction>(new NoopTransaction());
    public List<RouteDefinition> Routes { get; } = [];
    public List<GtfsImportSource> ImportSources { get; } = [];
    public int SaveCount { get; private set; }
    public uint? ExpectedVersion { get; private set; }
    public Task<(IReadOnlyList<RouteDefinition> Items, int TotalCount)> ListAsync(string? search, bool includeSuppressed, int page, int pageSize, CancellationToken cancellationToken)
    {
        var items = Routes.Where(route => includeSuppressed || !route.IsSuppressed)
            .Where(route => string.IsNullOrWhiteSpace(search) || route.Title.Contains(search) || route.Description?.Contains(search) == true || route.Paths.Any(path => path.Title.Contains(search)))
            .OrderBy(route => route.Title).ThenBy(route => route.Id).ToArray();
        return Task.FromResult<(IReadOnlyList<RouteDefinition>, int)>((items.Skip((page - 1) * pageSize).Take(pageSize).ToArray(), items.Length));
    }
    public Task<RouteDefinition?> GetAsync(Guid id, bool forUpdate, CancellationToken cancellationToken) => Task.FromResult(Routes.SingleOrDefault(route => route.Id == id || (!forUpdate && route.Paths.Any(path => path.Id == id))));
    public Task<IReadOnlyList<RouteDefinition>> GetSourceAsync(string sourceId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<RouteDefinition>>(Routes.Where(route => route.SourceId == sourceId).ToArray());
    public Task<GtfsImportSource?> GetImportSourceAsync(string identity, CancellationToken cancellationToken) =>
        Task.FromResult(ImportSources.SingleOrDefault(source => source.Identity == identity));
    public Task<bool> IsImportSourceBoundAsync(string sourceId, CancellationToken cancellationToken) =>
        Task.FromResult(ImportSources.Any(source => source.SourceId == sourceId));
    public Task<IReadOnlyList<RouteDefinition>> GetUnboundSourceRoutesAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<RouteDefinition>>(Routes.Where(route => route.SourceId != null
            && !ImportSources.Any(source => source.SourceId == route.SourceId)).ToArray());
    public void AddImportSource(GtfsImportSource source) => ImportSources.Add(source);
    public void Add(RouteDefinition route) => Routes.Add(route);
    public void AddPath(RouteDefinition route, RoutePath path) => route.Paths.Add(path);
    public void RemovePath(RouteDefinition route, RoutePath path) => route.Paths.Remove(path);
    public void AddVersion(RoutePath route, RoutePathVersion version) => route.Versions.Add(version);
    public void RemoveVersion(RoutePath route, RoutePathVersion version) => route.Versions.Remove(version);
    public void SetExpectedVersion(RouteDefinition route, uint version) => ExpectedVersion = version;
    public Task<bool> SaveChangesAsync(CancellationToken cancellationToken)
    {
        SaveCount++;
        return Task.FromResult(true);
    }
    private sealed class NoopTransaction : IRouteImportTransaction
    {
        public Task CommitAsync(CancellationToken cancellationToken) => Task.CompletedTask;
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
