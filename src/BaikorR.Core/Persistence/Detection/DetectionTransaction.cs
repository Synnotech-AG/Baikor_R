using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace BaikorR.Core.Persistence.Detection;

/// <summary>
/// A short transaction gate orders source commits, reviews and detection partitions.
/// Full scans enqueue partitions; they never hold this gate for the entire scan.
/// </summary>
public static class DetectionTransaction
{
    public const long AdvisoryLockId = 724603281;

    public static async Task<IDbContextTransaction> EnterAsync(
        BaikorRDbContext context, CancellationToken cancellationToken)
    {
        var transaction = await context.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            await LockAsync(context, cancellationToken);
            return transaction;
        }
        catch
        {
            await transaction.DisposeAsync();
            throw;
        }
    }

    public static Task LockAsync(BaikorRDbContext context, CancellationToken cancellationToken) =>
        context.Database.ExecuteSqlRawAsync(
            "SELECT pg_advisory_xact_lock(724603281)", cancellationToken);
}
