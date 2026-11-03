using System.Text.Json;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Shared.Results;
using FluentResults;

namespace BaikorR.Core.Features.Alerts.Detection;

public sealed class AlertReconciler
{
    public AlertRecord Reconcile(AlertRecord? current, RouteConflictCandidate candidate, DateTimeOffset now)
    {
        var created = current is null;
        current ??= new AlertRecord
        {
            Id = Guid.NewGuid(), RuleId = candidate.RuleId, Type = AlertRule.RouteConflictType,
            IdentityKey = candidate.IdentityKey, CreatedAt = now, FirstDetectedAt = now,
            Occurrence = 1, Condition = AlertCondition.Present, Handling = AlertHandling.Open,
            RouteConflict = new() { RouteId = candidate.Snapshot.RouteId, ConstructionSiteId = candidate.Snapshot.ConstructionSiteId }
        };
        if (current.RuleId != candidate.RuleId || current.IdentityKey != candidate.IdentityKey || current.Type != AlertRule.RouteConflictType)
        {
            throw new ArgumentException("The evidence identity does not belong to this alert.", nameof(candidate));
        }
        var recurrence = !created && current.Condition == AlertCondition.Cleared;
        var changed = created || recurrence || current.EvidenceHash != candidate.MaterialHash;
        current.LastDetectedAt = now;
        current.LastEvaluatedAt = now;
        current.Summary = $"{candidate.Snapshot.RouteTitle} / {candidate.Snapshot.ConstructionSiteTitle}";
        current.Description = "Route proximity and availability overlap at calendar-date precision; coordinator review is required.";
        if (changed)
        {
            current.UpdatedAt = now;
            current.Condition = AlertCondition.Present;
            current.Handling = AlertHandling.Open;
            current.EvidenceRevision++;
            current.EvidenceHash = candidate.MaterialHash;
            current.AffectedPeriodsJson = JsonSerializer.Serialize(candidate.Snapshot.Periods);
            current.Location = (NetTopologySuite.Geometries.Point)candidate.Location.Copy();
            current.FocusEnvelope = (NetTopologySuite.Geometries.Polygon)candidate.FocusEnvelope.Copy();
            if (recurrence)
            {
                current.Occurrence++;
            }
            current.RouteConflict!.AlertId = current.Id;
            current.RouteConflict.Evidence.Add(new()
            {
                AlertId = current.Id, Revision = current.EvidenceRevision, MaterialHash = candidate.MaterialHash,
                CreatedAt = now, SnapshotJson = JsonSerializer.Serialize(candidate.Snapshot)
            });
            Journal(current, now, created ? "detected" : recurrence ? "recurrence" : "materialChange",
                created ? "Potential conflict detected." : recurrence ? "The cleared conflict is present again." : "Relevant geometry, overlap periods or rule inputs changed; review is required again.");
        }
        return current;
    }

    public void Clear(AlertRecord current, DateTimeOffset now, string reason)
    {
        current.LastEvaluatedAt = now;
        if (current.Condition == AlertCondition.Cleared)
        {
            return;
        }
        current.Condition = AlertCondition.Cleared;
        current.UpdatedAt = now;
        Journal(current, now, "cleared", reason);
    }

    public Result Handle(AlertRecord current, AlertHandling handling, string? note, string actor,
        int expectedEvidenceRevision, uint expectedVersion, DateTimeOffset now)
    {
        if (current.SupersededByAlertId.HasValue)
        {
            return Result.Fail(ApiError.Conflict("alerts.handling.superseded", "This retained case is read-only. Record the decision on its canonical alert."));
        }
        if (!Enum.IsDefined(handling) || string.IsNullOrWhiteSpace(actor) || actor.Length > 200 || note?.Length > 4000)
        {
            return Result.Fail(ApiError.Validation("alerts.handling.invalid", "A valid handling state, actor and note of at most 4000 characters are required.", "handling"));
        }
        if (current.EvidenceRevision != expectedEvidenceRevision || current.Version != expectedVersion)
        {
            return Result.Fail(ApiError.Conflict("alerts.handling.conflict", "The alert or its evidence changed. Reload it before recording a decision."));
        }
        current.Handling = handling;
        current.HandlingActor = actor;
        current.HandlingNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        current.HandledAt = now;
        current.ReviewedEvidenceRevision = current.EvidenceRevision;
        current.UpdatedAt = now;
        Journal(current, now, "handlingChanged", "A reviewer changed the handling state.", actor, handling, current.HandlingNote);
        return Result.Ok();
    }

    private static void Journal(AlertRecord record, DateTimeOffset now, string kind, string explanation,
        string actor = "system", AlertHandling? handling = null, string? note = null) => record.Events.Add(new()
        {
            Id = Guid.NewGuid(), AlertId = record.Id, Occurrence = record.Occurrence, EvidenceRevision = record.EvidenceRevision,
            CreatedAt = now, Kind = kind, Explanation = explanation, Actor = actor, Handling = handling, Note = note
        });
}
