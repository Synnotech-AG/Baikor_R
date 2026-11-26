using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Features.MailImports;

public sealed record MailImportLease(Guid Owner, long Fence, Guid Generation);

public interface IMailImportStore
{
    Task<MailImportConfiguration> GetAsync(CancellationToken cancellationToken);
    Task<bool> SaveConfigurationAsync(MailImportConfiguration configuration, long expectedVersion, bool invalidatePending, CancellationToken cancellationToken);
    Task<MailImportStatusResponse> StatusAsync(CancellationToken cancellationToken);
    Task<MailImportHistoryResponse> HistoryAsync(int page, int pageSize, CancellationToken cancellationToken);
    Task<bool> ScheduleCheckAsync(CancellationToken cancellationToken);
    Task<bool> RetryAsync(Guid id, CancellationToken cancellationToken);
    Task<MailImportLease?> AcquireLeaseAsync(Guid owner, CancellationToken cancellationToken);
    Task<bool> RenewLeaseAsync(MailImportLease lease, CancellationToken cancellationToken);
    Task ReleaseLeaseAsync(MailImportLease lease, CancellationToken cancellationToken);
    Task<bool> DiscoverAsync(MailImportLease lease, MailboxBatch batch, CancellationToken cancellationToken);
    Task<MailImportWorkItem?> TakeWorkAsync(MailImportLease lease, CancellationToken cancellationToken);
    Task<bool> HasMailReceiptAsync(string sha256, CancellationToken cancellationToken);
    Task<bool> SetWorkHashAsync(MailImportLease lease, Guid id, string sha256, CancellationToken cancellationToken);
    Task CompleteWorkAsync(MailImportLease lease, Guid id, string state, int? createdCount, string[] warnings, string? errorKey, bool transient, CancellationToken cancellationToken);
    Task RecordErrorAsync(MailImportLease lease, string errorKey, bool halt, CancellationToken cancellationToken);
}
