namespace BaikorR.Core.Persistence.Entities;

public sealed class AlertEvent
{
    public Guid Id { get; set; }
    public Guid AlertId { get; set; }
    public AlertRecord Alert { get; set; } = null!;
    public int Occurrence { get; set; }
    public int EvidenceRevision { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string Actor { get; set; } = "system";
    public string Kind { get; set; } = string.Empty;
    public string Explanation { get; set; } = string.Empty;
    public AlertHandling? Handling { get; set; }
    public string? Note { get; set; }
}
