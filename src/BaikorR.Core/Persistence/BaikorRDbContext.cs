using BaikorR.Core.Persistence.Entities;
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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("postgis");

        var constructionSite = modelBuilder.Entity<ConstructionSite>();
        constructionSite.ToTable("construction_sites", "baikor");
        constructionSite.HasKey(item => item.Id);

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
