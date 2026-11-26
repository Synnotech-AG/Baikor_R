using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BaikorR.Core.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class NativeMailImports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "archive_import_receipts",
                schema: "baikor",
                columns: table => new
                {
                    Sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ImportedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_archive_import_receipts", x => x.Sha256);
                });

            migrationBuilder.CreateTable(
                name: "mail_import_configuration",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    Host = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: false),
                    Port = table.Column<int>(type: "integer", nullable: false),
                    Security = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Username = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    Folder = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    EncryptedPassword = table.Column<string>(type: "character varying(8192)", maxLength: 8192, nullable: true),
                    PollIntervalSeconds = table.Column<int>(type: "integer", nullable: false),
                    BufferMetres = table.Column<double>(type: "double precision", nullable: false),
                    Generation = table.Column<Guid>(type: "uuid", nullable: false),
                    UidValidity = table.Column<long>(type: "bigint", nullable: true),
                    NextUid = table.Column<long>(type: "bigint", nullable: true),
                    ActivatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastCheckedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastSuccessAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    NextCheckAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ErrorKey = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    Halted = table.Column<bool>(type: "boolean", nullable: false),
                    LeaseOwner = table.Column<Guid>(type: "uuid", nullable: true),
                    LeaseFence = table.Column<long>(type: "bigint", nullable: false),
                    LeaseExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mail_import_configuration", x => x.Id);
                    table.CheckConstraint("CK_mail_import_singleton", "\"Id\" = 1");
                });

            migrationBuilder.CreateTable(
                name: "mail_import_legacy_receipts",
                schema: "baikor",
                columns: table => new
                {
                    Sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ImportedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mail_import_legacy_receipts", x => x.Sha256);
                });

            migrationBuilder.CreateTable(
                name: "mail_import_work",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Generation = table.Column<Guid>(type: "uuid", nullable: false),
                    UidValidity = table.Column<long>(type: "bigint", nullable: false),
                    Uid = table.Column<long>(type: "bigint", nullable: false),
                    PartId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    FileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    State = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AvailableAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    RetryCycleStartAttempt = table.Column<int>(type: "integer", nullable: false),
                    LeaseFence = table.Column<long>(type: "bigint", nullable: false),
                    CreatedCount = table.Column<int>(type: "integer", nullable: true),
                    Warnings = table.Column<string[]>(type: "text[]", nullable: false),
                    ErrorKey = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    Sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mail_import_work", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_mail_import_work_CreatedAt",
                schema: "baikor",
                table: "mail_import_work",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_mail_import_work_Generation_State_AvailableAt",
                schema: "baikor",
                table: "mail_import_work",
                columns: new[] { "Generation", "State", "AvailableAt" });

            migrationBuilder.CreateIndex(
                name: "IX_mail_import_work_Generation_UidValidity_Uid_PartId",
                schema: "baikor",
                table: "mail_import_work",
                columns: new[] { "Generation", "UidValidity", "Uid", "PartId" },
                unique: true);

            migrationBuilder.Sql("""
                INSERT INTO baikor.mail_import_configuration
                    ("Id", "Version", "Enabled", "Host", "Port", "Security", "Username", "Folder", "PollIntervalSeconds",
                     "BufferMetres", "Generation", "Halted", "LeaseFence")
                VALUES (1, 0, false, '', 993, 'sslOnConnect', '', 'INBOX', 60, 1, '00000000-0000-0000-0000-000000000000', false, 0);

                INSERT INTO baikor.archive_import_receipts ("Sha256", "ImportedAt")
                SELECT lower("Metadata" ->> 'import.fileSha256'), min("CreatedAt")
                FROM baikor.construction_sites
                WHERE "Metadata" ->> 'import.fileSha256' ~ '^[0-9a-fA-F]{64}$'
                GROUP BY lower("Metadata" ->> 'import.fileSha256')
                ON CONFLICT ("Sha256") DO NOTHING;

                REVOKE ALL ON baikor.mail_import_configuration, baikor.mail_import_work,
                    baikor.mail_import_legacy_receipts, baikor.archive_import_receipts FROM PUBLIC;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "archive_import_receipts",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "mail_import_configuration",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "mail_import_legacy_receipts",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "mail_import_work",
                schema: "baikor");
        }
    }
}
