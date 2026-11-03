using BaikorR.Core.Features.Alerts;
using BaikorR.Core.Persistence.Detection;
using BaikorR.Core.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace BaikorR.Core.Persistence.Sessions;

public sealed class AlertsDbSession(BaikorRDbContext dbContext) : IAlertsSession
{
    public async Task<(IReadOnlyList<AlertRecord> Items, int TotalCount)> ListAsync(AlertListQuery query, CancellationToken cancellationToken)
    {
        var records = dbContext.Set<AlertRecord>().AsNoTracking();
        if (!string.IsNullOrEmpty(query.Period) || query.From.HasValue || query.To.HasValue)
        {
            // Apply inclusive date predicates to each disjoint period, rather than its enclosing range.
            records = dbContext.Set<AlertRecord>().FromSqlInterpolated($"""
                SELECT a.*, a.xmin FROM baikor.alerts AS a
                WHERE EXISTS (
                    SELECT 1 FROM jsonb_array_elements(a."AffectedPeriodsJson") AS p(value)
                    WHERE ({query.From}::date IS NULL OR (p.value->>'To') IS NULL OR (p.value->>'To')::date >= {query.From}::date)
                      AND ({query.To}::date IS NULL OR (p.value->>'From') IS NULL OR (p.value->>'From')::date <= {query.To}::date)
                      AND ({query.Period}::text IS NULL OR {query.Period}::text = ''
                        OR ({query.Period}::text = 'current'
                          AND ((p.value->>'From') IS NULL OR (p.value->>'From')::date <= {query.AsOfDate}::date)
                          AND ((p.value->>'To') IS NULL OR (p.value->>'To')::date >= {query.AsOfDate}::date))
                        OR ({query.Period}::text = 'upcoming' AND (p.value->>'From')::date > {query.AsOfDate}::date)
                        OR ({query.Period}::text = 'past' AND (p.value->>'To')::date < {query.AsOfDate}::date))
                )
                """).AsNoTracking();
        }
        records = records.Where(item => item.SupersededByAlertId == null);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim();
            records = records.Where(item => item.Summary.Contains(search) || item.Description != null && item.Description.Contains(search));
        }
        if (!string.IsNullOrWhiteSpace(query.Type))
        {
            records = records.Where(item => item.Type == query.Type);
        }
        if (query.Condition.HasValue)
        {
            records = records.Where(item => item.Condition == query.Condition);
        }
        if (query.Handling.HasValue)
        {
            records = records.Where(item => item.Handling == query.Handling);
        }
        var total = await records.CountAsync(cancellationToken);
        var items = await records.OrderByDescending(item => item.UpdatedAt).ThenBy(item => item.Id)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(cancellationToken);
        return (items, total);
    }

    public Task<AlertRecord?> GetAsync(Guid id, bool forUpdate, CancellationToken cancellationToken)
    {
        var records = dbContext.Set<AlertRecord>().AsQueryable();
        if (!forUpdate)
        {
            records = records.AsNoTracking();
        }
        return records.Include(item => item.RouteConflict!).ThenInclude(item => item.Evidence)
            .Include(item => item.Events).AsSplitQuery().SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
    }

    public Task<AlertRule?> GetRuleAsync(Guid id, bool forUpdate, CancellationToken cancellationToken) =>
        (forUpdate ? dbContext.Set<AlertRule>() : dbContext.Set<AlertRule>().AsNoTracking())
        .SingleOrDefaultAsync(item => item.Id == id, cancellationToken);

    public async Task<IReadOnlyList<AlertRecord>> ListRelatedAsync(Guid id, Guid canonicalId, CancellationToken cancellationToken) =>
        await dbContext.Alerts.AsNoTracking()
            .Where(item => item.Id != id && (item.Id == canonicalId || item.SupersededByAlertId == canonicalId))
            .OrderBy(item => item.CreatedAt).ThenBy(item => item.Id).ToArrayAsync(cancellationToken);

    public async Task<IAlertWriteScope> BeginWriteAsync(CancellationToken cancellationToken) =>
        new WriteScope(await DetectionTransaction.EnterAsync(dbContext, cancellationToken));

    public void SetExpectedVersion(AlertRecord alert, uint version) => dbContext.Entry(alert).Property(item => item.Version).OriginalValue = version;
    public void SetExpectedVersion(AlertRule rule, uint version) => dbContext.Entry(rule).Property(item => item.Version).OriginalValue = version;

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
    }

    private sealed class WriteScope(IDbContextTransaction? transaction) : IAlertWriteScope
    {
        public Task CommitAsync(CancellationToken cancellationToken) => transaction?.CommitAsync(cancellationToken) ?? Task.CompletedTask;
        public ValueTask DisposeAsync() => transaction?.DisposeAsync() ?? ValueTask.CompletedTask;
    }
}
