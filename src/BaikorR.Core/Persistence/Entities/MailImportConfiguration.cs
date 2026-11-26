namespace BaikorR.Core.Persistence.Entities;

public sealed class MailImportConfiguration
{
    public int Id { get; set; } = 1;
    public long Version { get; set; }
    public bool Enabled { get; set; }
    public string Host { get; set; } = "";
    public int Port { get; set; } = 993;
    public string Security { get; set; } = "sslOnConnect";
    public string Username { get; set; } = "";
    public string Folder { get; set; } = "INBOX";
    public string? EncryptedPassword { get; set; }
    public int PollIntervalSeconds { get; set; } = 60;
    public double BufferMetres { get; set; } = 1;
    public Guid Generation { get; set; }
    public long? UidValidity { get; set; }
    public long? NextUid { get; set; }
    public DateTimeOffset? ActivatedAt { get; set; }
    public DateTimeOffset? LastCheckedAt { get; set; }
    public DateTimeOffset? LastSuccessAt { get; set; }
    public DateTimeOffset? NextCheckAt { get; set; }
    public string? ErrorKey { get; set; }
    public bool Halted { get; set; }
    public Guid? LeaseOwner { get; set; }
    public long LeaseFence { get; set; }
    public DateTimeOffset? LeaseExpiresAt { get; set; }
}
