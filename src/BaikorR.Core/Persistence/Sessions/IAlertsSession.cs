using BaikorR.Core.Features.Alerts;
using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Persistence.Sessions;

public interface IAlertWriteScope : IAsyncDisposable
{
    Task CommitAsync(CancellationToken cancellationToken);
}

public interface IAlertsSession
{
    Task<(IReadOnlyList<AlertRecord> Items, int TotalCount)> ListAsync(AlertListQuery query, CancellationToken cancellationToken);
    Task<AlertRecord?> GetAsync(Guid id, bool forUpdate, CancellationToken cancellationToken);
    Task<IReadOnlyList<AlertRecord>> ListRelatedAsync(Guid id, Guid canonicalId, CancellationToken cancellationToken);
    Task<AlertRule?> GetRuleAsync(Guid id, bool forUpdate, CancellationToken cancellationToken);
    Task<IAlertWriteScope> BeginWriteAsync(CancellationToken cancellationToken);
    void SetExpectedVersion(AlertRecord alert, uint version);
    void SetExpectedVersion(AlertRule rule, uint version);
    Task<bool> SaveChangesAsync(CancellationToken cancellationToken);
}
