using NetTopologySuite.Geometries;

namespace BaikorR.Core.Persistence.Entities;

public enum AlertCondition { Present, Cleared }
public enum AlertHandling { Open, Acknowledged, Handled }

public sealed class AlertRecord
{
    public Guid Id { get; set; }
    public Guid RuleId { get; set; }
    public AlertRule Rule { get; set; } = null!;
    public string Type { get; set; } = string.Empty;
    public string IdentityKey { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid? SupersededByAlertId { get; set; }
    public AlertCondition Condition { get; set; }
    public AlertHandling Handling { get; set; }
    public int Occurrence { get; set; }
    public int EvidenceRevision { get; set; }
    public string EvidenceHash { get; set; } = string.Empty;
    public string AffectedPeriodsJson { get; set; } = "[]";
    public int? ReviewedEvidenceRevision { get; set; }
    public string? HandlingActor { get; set; }
    public string? HandlingNote { get; set; }
    public DateTimeOffset? HandledAt { get; set; }
    public Point? Location { get; set; }
    public Polygon? FocusEnvelope { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset FirstDetectedAt { get; set; }
    public DateTimeOffset LastDetectedAt { get; set; }
    public DateTimeOffset LastEvaluatedAt { get; set; }
    public uint Version { get; set; }
    public RouteConflictAlert? RouteConflict { get; set; }
    public List<AlertEvent> Events { get; set; } = [];
}
