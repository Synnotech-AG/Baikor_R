using System.Text.Json;
using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Features.Alerts;

public sealed class AlertListQuery
{
    public string? Search { get; set; }
    public string? Type { get; set; }
    public AlertCondition? Condition { get; set; }
    public AlertHandling? Handling { get; set; }
    public string? Period { get; set; }
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    internal DateOnly AsOfDate { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
}

public sealed record AlertPageResponse(IReadOnlyList<AlertResponse> Items, int TotalCount, int Page, int PageSize);
public sealed record AlertPeriod(DateOnly? From, DateOnly? To);
public record AlertResponse(Guid Id, string Type, string Summary, string? Description, AlertCondition Condition,
    AlertHandling Handling, int Occurrence, int EvidenceRevision, AlertPointDto? Location,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset LastEvaluatedAt, uint Version)
{
    public IReadOnlyList<AlertPeriod> Periods { get; init; } = [];
    public static AlertResponse Create(AlertRecord record) => new(record.Id, record.Type, record.Summary, record.Description,
        record.Condition, record.Handling, record.Occurrence, record.EvidenceRevision,
        record.Location is null ? null : new("Point", [record.Location.X, record.Location.Y]),
        record.CreatedAt, record.UpdatedAt, record.LastEvaluatedAt, record.Version)
        { Periods = JsonSerializer.Deserialize<AlertPeriod[]>(record.AffectedPeriodsJson) ?? [] };
}

public sealed record AlertEventResponse(Guid Id, string Kind, string Explanation, string Actor, DateTimeOffset CreatedAt,
    int Occurrence, int EvidenceRevision, AlertHandling? Handling, string? Note)
{
    public static AlertEventResponse Create(AlertEvent item) => new(item.Id, item.Kind, item.Explanation, item.Actor,
        item.CreatedAt, item.Occurrence, item.EvidenceRevision, item.Handling, item.Note);
}

public sealed record RelatedAlertResponse(Guid Id, string Summary, AlertHandling Handling, int EvidenceRevision)
{
    public static RelatedAlertResponse Create(AlertRecord record) => new(record.Id, record.Summary, record.Handling, record.EvidenceRevision);
}

public sealed record AlertDetailsResponse : AlertResponse
{
    public AlertDetailsResponse(AlertRecord record, IReadOnlyList<AlertRecord>? related = null) : base(record.Id, record.Type, record.Summary, record.Description,
        record.Condition, record.Handling, record.Occurrence, record.EvidenceRevision,
        record.Location is null ? null : new("Point", [record.Location.X, record.Location.Y]),
        record.CreatedAt, record.UpdatedAt, record.LastEvaluatedAt, record.Version)
    {
        var current = record.RouteConflict?.Evidence.SingleOrDefault(item => item.Revision == record.EvidenceRevision);
        Details = current is null ? null : JsonSerializer.Deserialize<RouteConflictSnapshot>(current.SnapshotJson);
        EvidenceRevisions = record.RouteConflict?.Evidence.Select(item => item.Revision).Order().ToArray() ?? [];
        Periods = JsonSerializer.Deserialize<AlertPeriod[]>(record.AffectedPeriodsJson) ?? [];
        Events = record.Events.OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.Id).Select(AlertEventResponse.Create).ToArray();
        ReviewedEvidenceRevision = record.ReviewedEvidenceRevision;
        HandlingActor = record.HandlingActor;
        HandlingNote = record.HandlingNote;
        HandledAt = record.HandledAt;
        var focus = record.FocusEnvelope?.EnvelopeInternal;
        FocusEnvelope = focus is null ? null : [focus.MinX, focus.MinY, focus.MaxX, focus.MaxY];
        SupersededByAlertId = record.SupersededByAlertId;
        RelatedAlerts = related?.Select(RelatedAlertResponse.Create).ToArray() ?? [];
    }
    public RouteConflictSnapshot? Details { get; }
    public IReadOnlyList<int> EvidenceRevisions { get; }
    public IReadOnlyList<AlertEventResponse> Events { get; }
    public int? ReviewedEvidenceRevision { get; }
    public string? HandlingActor { get; }
    public string? HandlingNote { get; }
    public DateTimeOffset? HandledAt { get; }
    public double[]? FocusEnvelope { get; }
    public Guid? SupersededByAlertId { get; }
    public IReadOnlyList<RelatedAlertResponse> RelatedAlerts { get; }
}

public sealed record AlertHandlingRequest(AlertHandling Handling, string? Note, int EvidenceRevision, uint Version);
public sealed record AlertEvidenceResponse(Guid AlertId, string Type, int EvidenceRevision, DateTimeOffset CreatedAt,
    AlertPointDto? Location, double[]? FocusEnvelope, RouteConflictSnapshot? Details)
{
    public static AlertEvidenceResponse Create(AlertRecord alert, RouteConflictEvidence evidence)
    {
        var snapshot = JsonSerializer.Deserialize<RouteConflictSnapshot>(evidence.SnapshotJson);
        var areas = snapshot?.Areas ?? [];
        var envelopes = areas.Select(item => item.FocusEnvelope).ToArray();
        double[]? focus = envelopes.Length == 0 ? null :
            [envelopes.Min(item => item[0]), envelopes.Min(item => item[1]), envelopes.Max(item => item[2]), envelopes.Max(item => item[3])];
        return new(alert.Id, alert.Type, evidence.Revision, evidence.CreatedAt, areas.FirstOrDefault()?.Location, focus, snapshot);
    }
}
public sealed record AlertRuleUpdateRequest(bool Enabled, double SensitivityMetres, ConstructionSiteStatus[] EligibleStatuses, uint Version);
public sealed record AlertRuleResponse(Guid Id, bool Enabled, double SensitivityMetres, ConstructionSiteStatus[] EligibleStatuses, uint Version)
{
    public static AlertRuleResponse Create(AlertRule rule) => new(rule.Id, rule.Enabled, rule.SensitivityMetres, rule.EligibleStatuses, rule.Version);
}
