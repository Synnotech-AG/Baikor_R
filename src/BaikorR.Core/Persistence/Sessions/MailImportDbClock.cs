using BaikorR.Core.Features.MailImports;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Core.Persistence.Sessions;

internal static class MailImportDbClock
{
    public static Task<DateTimeOffset> UtcNowAsync(BaikorRDbContext context, CancellationToken cancellationToken) =>
        context.Database.SqlQueryRaw<DateTimeOffset>("SELECT clock_timestamp() AS \"Value\"").SingleAsync(cancellationToken);

    public static Task<bool> OwnsAsync(BaikorRDbContext context, MailImportLease lease, CancellationToken cancellationToken) =>
        context.Database.SqlQuery<bool>($"""
            SELECT EXISTS (SELECT 1 FROM baikor.mail_import_configuration WHERE "Id" = 1
                AND "Enabled" AND NOT "Halted" AND "LeaseOwner" = {lease.Owner}
                AND "LeaseFence" = {lease.Fence} AND "Generation" = {lease.Generation}
                AND "LeaseExpiresAt" > clock_timestamp()) AS "Value"
            """).SingleAsync(cancellationToken);
}
