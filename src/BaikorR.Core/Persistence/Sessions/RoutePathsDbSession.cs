using BaikorR.Core.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using BaikorR.Core.Persistence.Detection;
using Microsoft.EntityFrameworkCore.Storage;

namespace BaikorR.Core.Persistence.Sessions;

public sealed class RoutePathsDbSession(BaikorRDbContext dbContext) : IRoutePathsSession
{
    public async Task<IRouteImportTransaction> BeginImportAsync(CancellationToken cancellationToken) =>
        new ImportTransaction(await DetectionTransaction.EnterAsync(dbContext, cancellationToken));
    public async Task<(IReadOnlyList<RouteDefinition> Items, int TotalCount)> ListAsync(string? search, bool includeSuppressed, int page, int pageSize, CancellationToken cancellationToken)
    {
        var query = dbContext.Set<RouteDefinition>().AsNoTracking().Where(item => includeSuppressed || !item.IsSuppressed);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
            var pattern = $"%{term}%";
            query = query.Where(item => EF.Functions.ILike(item.Title, pattern, "\\")
                || (item.Description != null && EF.Functions.ILike(item.Description, pattern, "\\"))
                || item.Paths.Any(path => EF.Functions.ILike(path.Title, pattern, "\\")));
        }
        var count = await query.CountAsync(cancellationToken);
        var items = await WithPaths(query).OrderBy(item => item.Title).ThenBy(item => item.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return (items, count);
    }

    public Task<RouteDefinition?> GetAsync(Guid id, bool forUpdate, CancellationToken cancellationToken)
    {
        var query = dbContext.Set<RouteDefinition>().AsQueryable();
        if (!forUpdate)
        {
            query = query.AsNoTracking();
        }
        return WithPaths(query).SingleOrDefaultAsync(item => item.Id == id || (!forUpdate && item.Paths.Any(path => path.Id == id)), cancellationToken);
    }

    public async Task<IReadOnlyList<RouteDefinition>> GetSourceAsync(string sourceId, CancellationToken cancellationToken) =>
        await WithPaths(dbContext.Set<RouteDefinition>().Where(item => item.SourceId == sourceId)).ToListAsync(cancellationToken);

    public Task<GtfsImportSource?> GetImportSourceAsync(string identity, CancellationToken cancellationToken) =>
        dbContext.Set<GtfsImportSource>().SingleOrDefaultAsync(source => source.Identity == identity, cancellationToken);

    public Task<bool> IsImportSourceBoundAsync(string sourceId, CancellationToken cancellationToken) =>
        dbContext.Set<GtfsImportSource>().AnyAsync(source => source.SourceId == sourceId, cancellationToken);

    public async Task<IReadOnlyList<RouteDefinition>> GetUnboundSourceRoutesAsync(CancellationToken cancellationToken) =>
        await WithPaths(dbContext.Set<RouteDefinition>().Where(route => route.SourceId != null
            && !dbContext.Set<GtfsImportSource>().Any(source => source.SourceId == route.SourceId))).ToListAsync(cancellationToken);

    public void AddImportSource(GtfsImportSource source) => dbContext.Set<GtfsImportSource>().Add(source);

    public void Add(RouteDefinition route) => dbContext.Set<RouteDefinition>().Add(route);
    public void AddPath(RouteDefinition route, RoutePath path)
    {
        route.Paths.Add(path);
        dbContext.Set<RoutePath>().Add(path);
        Touch(route);
    }
    public void RemovePath(RouteDefinition route, RoutePath path)
    {
        route.Paths.Remove(path);
        dbContext.Set<RoutePath>().Remove(path);
        Touch(route);
    }
    public void AddVersion(RoutePath route, RoutePathVersion version)
    {
        route.Versions.Add(version);
        dbContext.Set<RoutePathVersion>().Add(version);
        dbContext.Entry(route).Property(item => item.UpdatedAt).IsModified = true;
        Touch(route.RouteDefinition);
    }
    public void RemoveVersion(RoutePath route, RoutePathVersion version)
    {
        route.Versions.Remove(version);
        dbContext.Set<RoutePathVersion>().Remove(version);
        dbContext.Entry(route).Property(item => item.UpdatedAt).IsModified = true;
        Touch(route.RouteDefinition);
    }
    public void SetExpectedVersion(RouteDefinition route, uint version)
    {
        dbContext.Entry(route).Property(item => item.Version).OriginalValue = version;
        Touch(route);
    }
    public async Task<bool> SaveChangesAsync(CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateConcurrencyException)
        {
            return false;
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            return false;
        }
    }

    private void Touch(RouteDefinition route) => dbContext.Entry(route).Property(item => item.UpdatedAt).IsModified = true;
    private static IQueryable<RouteDefinition> WithPaths(IQueryable<RouteDefinition> query) =>
        query.Include(item => item.Paths).ThenInclude(item => item.Versions).ThenInclude(item => item.Periods).AsSplitQuery();

    private sealed class ImportTransaction(IDbContextTransaction transaction) : IRouteImportTransaction
    {
        public Task CommitAsync(CancellationToken cancellationToken) => transaction.CommitAsync(cancellationToken);
        public ValueTask DisposeAsync() => transaction.DisposeAsync();
    }
}
