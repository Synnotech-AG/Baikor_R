namespace BaikorR.Core.Features.MailImports;

public sealed record MailboxConnection(string Host, int Port, string Security, string Username, string Password, string Folder)
{
    public override string ToString() => "MailboxConnection [credentials redacted]";
}

public interface IMailboxClientFactory
{
    Task<IMailboxClient> ConnectAsync(MailboxConnection connection, CancellationToken cancellationToken);
}

public interface IMailboxClient : IAsyncDisposable
{
    uint UidValidity { get; }
    uint NextUid { get; }
    Task<MailboxBatch> ReadBatchAsync(uint firstUid, int maximumMessages, CancellationToken cancellationToken);
    Task<byte[]> ReadAttachmentAsync(uint uid, string partId, CancellationToken cancellationToken);
}

public sealed record MailboxBatch(uint UidValidity, uint NextUid, IReadOnlyList<MailboxMessage> Messages);
public sealed record MailboxMessage(uint Uid, IReadOnlyList<MailboxAttachment> Attachments);
public sealed record MailboxAttachment(string PartId, string FileName, long? Octets);

public interface IMailImportSecretProtector
{
    bool IsConfigured { get; }
    string Protect(string plaintext);
    string Unprotect(string ciphertext);
}

public sealed class MailImportTransportException(string errorKey, bool isTransient) : Exception(errorKey)
{
    public string ErrorKey { get; } = errorKey;
    public bool IsTransient { get; } = isTransient;
}

public sealed record MailImportSettingsResponse(bool Enabled, string Host, int Port, string Security,
    string Username, string Folder, int PollIntervalSeconds, double BufferMetres,
    bool HasPassword, bool EncryptionConfigured, long Version);

public sealed record MailImportSettingsRequest(bool Enabled, string Host, int Port, string Security,
    string Username, string Folder, int PollIntervalSeconds, double BufferMetres,
    long Version, string? Password = null, bool ClearPassword = false, bool ResetCursor = false);

public sealed record MailImportTestRequest(string Host, int Port, string Security, string Username,
    string Folder, string? Password = null, bool UseSavedPassword = false);

public sealed record MailImportTestResponse(bool Connected);
public sealed record MailImportStatusResponse(bool Enabled, string State, DateTimeOffset? LastCheckedAt,
    DateTimeOffset? LastSuccessAt, DateTimeOffset? ActivatedAt, string? ErrorKey,
    int PendingCount, int FailedCount, int ImportedCount);
public sealed record MailImportHistoryItem(Guid Id, string FileName, string State, DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt, int? CreatedCount, string[] Warnings, string? ErrorKey, int Attempts, bool CanRetry);
public sealed record MailImportHistoryResponse(IReadOnlyList<MailImportHistoryItem> Items, int Page, int PageSize, int TotalCount);
