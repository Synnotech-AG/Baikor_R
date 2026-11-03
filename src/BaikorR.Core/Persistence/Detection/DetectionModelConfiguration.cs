using BaikorR.Core.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Core.Persistence.Detection;

public static class DetectionModelConfiguration
{
    public static void Configure(ModelBuilder modelBuilder)
    {
        var work = modelBuilder.Entity<AlertDetectionWork>();
        work.ToTable("alert_detection_work", "baikor");
        work.HasKey(item => item.Id);
        work.Property(item => item.Kind).HasMaxLength(32).IsRequired();
        work.Property(item => item.DetectorType).HasMaxLength(100);
        work.Property(item => item.FailureCode).HasMaxLength(100);
        work.HasIndex(item => new { item.AvailableAt, item.Id })
            .HasFilter("\"CompletedAt\" IS NULL");
        work.HasIndex(item => item.ScanRunId);
        var run = modelBuilder.Entity<AlertScanRun>();
        run.ToTable("alert_scan_runs", "baikor");
        run.HasKey(item => item.Id);
        run.Property(item => item.State).HasMaxLength(32).IsRequired();
        run.HasIndex(item => item.CreatedAt);
    }
}
