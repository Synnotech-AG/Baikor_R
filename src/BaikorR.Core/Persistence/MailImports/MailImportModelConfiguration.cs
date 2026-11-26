using BaikorR.Core.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Core.Persistence.MailImports;

internal static class MailImportModelConfiguration
{
    public static void Configure(ModelBuilder builder)
    {
        var settings = builder.Entity<MailImportConfiguration>();
        settings.ToTable("mail_import_configuration", "baikor", table => table.HasCheckConstraint("CK_mail_import_singleton", "\"Id\" = 1"));
        settings.HasKey(x => x.Id);
        settings.Property(x => x.Version).IsConcurrencyToken();
        settings.Property(x => x.Host).HasMaxLength(253);
        settings.Property(x => x.Security).HasMaxLength(32);
        settings.Property(x => x.Username).HasMaxLength(320);
        settings.Property(x => x.Folder).HasMaxLength(512);
        settings.Property(x => x.EncryptedPassword).HasMaxLength(8192);
        settings.Property(x => x.ErrorKey).HasMaxLength(160);

        var work = builder.Entity<MailImportWorkItem>();
        work.ToTable("mail_import_work", "baikor");
        work.HasKey(x => x.Id);
        work.Property(x => x.PartId).HasMaxLength(128);
        work.Property(x => x.FileName).HasMaxLength(255);
        work.Property(x => x.State).HasMaxLength(32);
        work.Property(x => x.ErrorKey).HasMaxLength(160);
        work.Property(x => x.Sha256).HasMaxLength(64);
        work.Property(x => x.Warnings).HasColumnType("text[]");
        work.HasIndex(x => new { x.Generation, x.UidValidity, x.Uid, x.PartId }).IsUnique();
        work.HasIndex(x => new { x.Generation, x.State, x.AvailableAt });
        work.HasIndex(x => x.CreatedAt);

        var receipts = builder.Entity<ArchiveImportReceipt>();
        receipts.ToTable("archive_import_receipts", "baikor");
        receipts.HasKey(x => x.Sha256);
        receipts.Property(x => x.Sha256).HasMaxLength(64);
        var legacy = builder.Entity<MailImportLegacyReceipt>();
        legacy.ToTable("mail_import_legacy_receipts", "baikor");
        legacy.HasKey(x => x.Sha256);
        legacy.Property(x => x.Sha256).HasMaxLength(64);
    }
}
