using System.Text.Json;
using BaikorR.Core.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace BaikorR.Core.Persistence.Alerts;

public static class AlertModelConfiguration
{
    public static void Configure(ModelBuilder modelBuilder)
    {
        var rule = modelBuilder.Entity<AlertRule>();
        rule.ToTable("alert_rules", "baikor");
        rule.HasKey(item => item.Id);
        rule.Property(item => item.Type).HasMaxLength(100).IsRequired();
        rule.Property(item => item.Name).HasMaxLength(200).IsRequired();
        rule.Property(item => item.Version).IsRowVersion();
        rule.Property(item => item.EligibleStatuses)
            .HasConversion(value => JsonSerializer.Serialize(value, (JsonSerializerOptions?)null),
                value => JsonSerializer.Deserialize<ConstructionSiteStatus[]>(value, (JsonSerializerOptions?)null)!)
            .HasColumnType("jsonb")
            .Metadata.SetValueComparer(new ValueComparer<ConstructionSiteStatus[]>(
                (left, right) => left != null && right != null && left.SequenceEqual(right),
                value => value.Aggregate(0, (hash, status) => HashCode.Combine(hash, status)),
                value => value.ToArray()));
        rule.HasData(new AlertRule());

        var alert = modelBuilder.Entity<AlertRecord>();
        alert.ToTable("alerts", "baikor");
        alert.HasKey(item => item.Id);
        alert.Property(item => item.Type).HasMaxLength(100).IsRequired();
        alert.Property(item => item.IdentityKey).HasMaxLength(300).IsRequired();
        alert.Property(item => item.Summary).HasMaxLength(1000).IsRequired();
        alert.Property(item => item.Description).HasMaxLength(4000);
        alert.Property(item => item.Condition).HasConversion<string>().HasMaxLength(32);
        alert.Property(item => item.Handling).HasConversion<string>().HasMaxLength(32);
        alert.Property(item => item.EvidenceHash).HasMaxLength(64).IsRequired();
        alert.Property(item => item.AffectedPeriodsJson).HasColumnType("jsonb").HasDefaultValueSql("'[]'::jsonb").IsRequired();
        alert.Property(item => item.HandlingActor).HasMaxLength(200);
        alert.Property(item => item.HandlingNote).HasMaxLength(4000);
        alert.Property(item => item.Location).HasColumnType("geometry(Point,25832)");
        alert.Property(item => item.FocusEnvelope).HasColumnType("geometry(Polygon,25832)");
        alert.Property(item => item.Version).IsRowVersion();
        alert.HasIndex(item => new { item.RuleId, item.IdentityKey }).IsUnique();
        alert.HasIndex(item => new { item.Condition, item.Handling, item.UpdatedAt });
        alert.HasIndex(item => item.Location).HasMethod("gist");
        alert.HasOne(item => item.Rule).WithMany().HasForeignKey(item => item.RuleId).OnDelete(DeleteBehavior.Restrict);
        alert.HasOne<AlertRecord>().WithMany().HasForeignKey(item => item.SupersededByAlertId).OnDelete(DeleteBehavior.Restrict);

        var detail = modelBuilder.Entity<RouteConflictAlert>();
        detail.ToTable("route_conflict_alerts", "baikor");
        detail.HasKey(item => item.AlertId);
        detail.HasIndex(item => item.RouteId);
        detail.HasIndex(item => item.ConstructionSiteId);
        detail.HasOne(item => item.Alert).WithOne(item => item.RouteConflict)
            .HasForeignKey<RouteConflictAlert>(item => item.AlertId).OnDelete(DeleteBehavior.Cascade);

        var evidence = modelBuilder.Entity<RouteConflictEvidence>();
        evidence.ToTable("route_conflict_evidence", "baikor");
        evidence.HasKey(item => new { item.AlertId, item.Revision });
        evidence.Property(item => item.MaterialHash).HasMaxLength(64).IsRequired();
        evidence.Property(item => item.SnapshotJson).HasColumnType("jsonb").IsRequired();
        evidence.HasOne(item => item.RouteConflict).WithMany(item => item.Evidence)
            .HasForeignKey(item => item.AlertId).OnDelete(DeleteBehavior.Cascade);

        var journal = modelBuilder.Entity<AlertEvent>();
        journal.ToTable("alert_events", "baikor");
        journal.HasKey(item => item.Id);
        journal.Property(item => item.Id).ValueGeneratedNever();
        journal.Property(item => item.Kind).HasMaxLength(100).IsRequired();
        journal.Property(item => item.Explanation).HasMaxLength(4000).IsRequired();
        journal.Property(item => item.Actor).HasMaxLength(200).IsRequired();
        journal.Property(item => item.Handling).HasConversion<string>().HasMaxLength(32);
        journal.Property(item => item.Note).HasMaxLength(4000);
        journal.HasIndex(item => new { item.AlertId, item.CreatedAt });
        journal.HasOne(item => item.Alert).WithMany(item => item.Events)
            .HasForeignKey(item => item.AlertId).OnDelete(DeleteBehavior.Cascade);
    }
}
