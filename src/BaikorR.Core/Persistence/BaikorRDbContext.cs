using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Detection;
using BaikorR.Core.Persistence.Routes;
using BaikorR.Core.Persistence.Alerts;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Core.Persistence;

public sealed class BaikorRDbContext(DbContextOptions<BaikorRDbContext> options)
    : DbContext(options)
{
    public DbSet<ConstructionSite> ConstructionSites => Set<ConstructionSite>();

    public DbSet<ConstructionSiteArea> ConstructionSiteAreas => Set<ConstructionSiteArea>();

    public DbSet<ConstructionSiteContact> ConstructionSiteContacts => Set<ConstructionSiteContact>();

    public DbSet<ConstructionSiteCommunication> ConstructionSiteCommunications => Set<ConstructionSiteCommunication>();

    public DbSet<ConstructionSiteAttachment> ConstructionSiteAttachments => Set<ConstructionSiteAttachment>();

    public DbSet<RouteDefinition> RouteDefinitions => Set<RouteDefinition>();
    public DbSet<GtfsImportSource> GtfsImportSources => Set<GtfsImportSource>();
    public DbSet<RoutePath> RoutePaths => Set<RoutePath>();
    public DbSet<RoutePathVersion> RoutePathVersions => Set<RoutePathVersion>();
    public DbSet<RouteOperatingPeriod> RouteOperatingPeriods => Set<RouteOperatingPeriod>();
    public DbSet<AlertRecord> Alerts => Set<AlertRecord>();
    public DbSet<AlertRule> AlertRules => Set<AlertRule>();
    public DbSet<RouteConflictAlert> RouteConflictAlerts => Set<RouteConflictAlert>();
    public DbSet<RouteConflictEvidence> RouteConflictEvidence => Set<RouteConflictEvidence>();
    public DbSet<AlertEvent> AlertEvents => Set<AlertEvent>();
    public DbSet<AlertDetectionWork> AlertDetectionWork => Set<AlertDetectionWork>();
    public DbSet<AlertScanRun> AlertScanRuns => Set<AlertScanRun>();

    public override int SaveChanges(bool acceptAllChangesOnSuccess) =>
        SaveChangesAsync(acceptAllChangesOnSuccess, CancellationToken.None).GetAwaiter().GetResult();

    public override async Task<int> SaveChangesAsync(
        bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        var invalidations = DetectionChangeCollector.Collect(this);
        if (invalidations.Count == 0)
        {
            return await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
        }

        var ownsTransaction = Database.CurrentTransaction is null;
        await using var transaction = ownsTransaction
            ? await DetectionTransaction.EnterAsync(this, cancellationToken)
            : null;
        if (!ownsTransaction)
        {
            await DetectionTransaction.LockAsync(this, cancellationToken);
        }
        var now = DateTimeOffset.UtcNow;
        var work = invalidations.Select(item => new AlertDetectionWork
        {
            Kind = item.Kind, SubjectId = item.SubjectId, CreatedAt = now, AvailableAt = now
        }).ToArray();
        AlertDetectionWork.AddRange(work);
        try
        {
            var changed = await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }
            return changed;
        }
        catch
        {
            foreach (var item in work)
            {
                Entry(item).State = EntityState.Detached;
            }
            throw;
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("postgis");
        RouteModelConfiguration.Configure(modelBuilder);
        AlertModelConfiguration.Configure(modelBuilder);
        DetectionModelConfiguration.Configure(modelBuilder);

        var constructionSite = modelBuilder.Entity<ConstructionSite>();
        constructionSite.ToTable("construction_sites", "baikor");
        constructionSite.HasKey(item => item.Id);

        constructionSite.Property(item => item.IsDeleted)
            .HasDefaultValue(false);

        constructionSite.Property(item => item.Title)
            .HasMaxLength(200)
            .IsRequired();

        constructionSite.Property(item => item.Status)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        constructionSite.Property(item => item.Diversion)
            .HasMaxLength(10000);

        constructionSite.Property(item => item.Metadata)
            .HasConversion<StringDictionaryJsonConverter, StringDictionaryValueComparer>()
            .HasColumnType("jsonb")
            .HasDefaultValueSql("'{}'::jsonb")
            .IsRequired();

        constructionSite.Property(item => item.Version)
            .IsRowVersion();

        var constructionSiteArea = modelBuilder.Entity<ConstructionSiteArea>();
        constructionSiteArea.ToTable("construction_site_areas", "baikor");
        constructionSiteArea.HasKey(item => item.Id);

        constructionSiteArea.Property(item => item.Name)
            .HasMaxLength(100)
            .IsRequired();

        constructionSiteArea.Property(item => item.Geometry)
            .HasColumnType("geometry(Polygon,25832)")
            .IsRequired();

        constructionSiteArea.HasIndex(item => item.Geometry)
            .HasMethod("gist");

        constructionSiteArea.HasIndex(item => new { item.ConstructionSiteId, item.Name })
            .IsUnique();

        constructionSite.HasMany(item => item.Areas)
            .WithOne(item => item.ConstructionSite)
            .HasForeignKey(item => item.ConstructionSiteId)
            .OnDelete(DeleteBehavior.Cascade);

        var constructionSiteContact = modelBuilder.Entity<ConstructionSiteContact>();
        constructionSiteContact.ToTable("construction_site_contacts", "baikor");
        constructionSiteContact.HasKey(item => item.Id);
        constructionSiteContact.Property(item => item.FirstName).HasMaxLength(100).IsRequired();
        constructionSiteContact.Property(item => item.LastName).HasMaxLength(100).IsRequired();
        constructionSiteContact.Property(item => item.Role).HasMaxLength(100).IsRequired();
        constructionSiteContact.Property(item => item.Email).HasMaxLength(254);
        constructionSiteContact.Property(item => item.Phone1).HasMaxLength(50);
        constructionSiteContact.Property(item => item.Phone2).HasMaxLength(50);
        constructionSiteContact.HasIndex(item => new { item.ConstructionSiteId, item.Position });
        constructionSite.HasMany(item => item.Contacts)
            .WithOne(item => item.ConstructionSite)
            .HasForeignKey(item => item.ConstructionSiteId)
            .OnDelete(DeleteBehavior.Cascade);

        var constructionSiteCommunication = modelBuilder.Entity<ConstructionSiteCommunication>();
        constructionSiteCommunication.ToTable("construction_site_communications", "baikor");
        constructionSiteCommunication.HasKey(item => item.Id);
        constructionSiteCommunication.Property(item => item.Type).HasMaxLength(2000).IsRequired();
        constructionSiteCommunication.Property(item => item.Note).HasMaxLength(2000);
        constructionSiteCommunication.HasIndex(item => new { item.ConstructionSiteId, item.Position });
        constructionSite.HasMany(item => item.Communications)
            .WithOne(item => item.ConstructionSite)
            .HasForeignKey(item => item.ConstructionSiteId)
            .OnDelete(DeleteBehavior.Cascade);

        var constructionSiteAttachment = modelBuilder.Entity<ConstructionSiteAttachment>();
        constructionSiteAttachment.ToTable("construction_site_attachments", "baikor");
        constructionSiteAttachment.HasKey(item => item.Id);
        constructionSiteAttachment.Property(item => item.FileName).HasMaxLength(255).IsRequired();
        constructionSiteAttachment.Property(item => item.MimeType).HasMaxLength(255).IsRequired();
        constructionSiteAttachment.Property(item => item.Data).IsRequired();
        constructionSite.HasMany(item => item.Attachments)
            .WithOne(item => item.ConstructionSite)
            .HasForeignKey(item => item.ConstructionSiteId)
            .OnDelete(DeleteBehavior.Cascade);

    }
}
