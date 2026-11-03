using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaikorR.Core.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BindGtfsImportSources : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "gtfs_import_sources",
                schema: "baikor",
                columns: table => new
                {
                    Identity = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SourceId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_gtfs_import_sources", x => x.Identity);
                });

            migrationBuilder.CreateIndex(
                name: "IX_gtfs_import_sources_SourceId",
                schema: "baikor",
                table: "gtfs_import_sources",
                column: "SourceId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "gtfs_import_sources",
                schema: "baikor");
        }
    }
}
