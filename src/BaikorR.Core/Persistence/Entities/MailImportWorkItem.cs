namespace BaikorR.Core.Persistence.Entities;

public sealed class MailImportWorkItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid Generation { get; set; }
    public long UidValidity { get; set; }
    public long Uid { get; set; }
    public string PartId { get; set; } = "";
    public string FileName { get; set; } = "";
    public string State { get; set; } = "pending";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset AvailableAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public int Attempts { get; set; }
    public int RetryCycleStartAttempt { get; set; }
    public long LeaseFence { get; set; }
    public int? CreatedCount { get; set; }
    public string[] Warnings { get; set; } = [];
    public string? ErrorKey { get; set; }
    public string? Sha256 { get; set; }
}

public sealed class ArchiveImportReceipt
{
    public string Sha256 { get; set; } = "";
    public DateTimeOffset ImportedAt { get; set; }
}

public sealed class MailImportLegacyReceipt
{
    public string Sha256 { get; set; } = "";
    public DateTimeOffset ImportedAt { get; set; }
}
