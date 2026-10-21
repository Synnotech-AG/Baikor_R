using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;

#nullable disable

namespace BaikorR.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialConstructionSiteSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "baikor");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:postgis", ",,");

            migrationBuilder.CreateTable(
                name: "construction_sites",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PlannedStart = table.Column<DateOnly>(type: "date", nullable: true),
                    PlannedEnd = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_construction_sites", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "construction_site_areas",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConstructionSiteId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Geometry = table.Column<Polygon>(type: "geometry(Polygon,25832)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_construction_site_areas", x => x.Id);
                    table.ForeignKey(
                        name: "FK_construction_site_areas_construction_sites_ConstructionSite~",
                        column: x => x.ConstructionSiteId,
                        principalSchema: "baikor",
                        principalTable: "construction_sites",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_construction_site_areas_ConstructionSiteId_Name",
                schema: "baikor",
                table: "construction_site_areas",
                columns: new[] { "ConstructionSiteId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_construction_site_areas_Geometry",
                schema: "baikor",
                table: "construction_site_areas",
                column: "Geometry")
                .Annotation("Npgsql:IndexMethod", "gist");

            migrationBuilder.Sql(
                """
                CREATE VIEW baikor.public_construction_site_areas
                WITH (security_barrier = true)
                AS
                SELECT
                    area."Id" AS id,
                    area."ConstructionSiteId" AS construction_site_id,
                    area."Name" AS area_name,
                    construction_site."Title" AS title,
                    lower(construction_site."Status") AS status,
                    construction_site."PlannedStart" AS planned_start,
                    construction_site."PlannedEnd" AS planned_end,
                    construction_site."UpdatedAt" AS updated_at,
                    area."Geometry" AS geometry
                FROM baikor.construction_site_areas AS area
                INNER JOIN baikor.construction_sites AS construction_site
                    ON construction_site."Id" = area."ConstructionSiteId"
                WHERE construction_site."Status" IN ('Approved', 'Active');

                COMMENT ON VIEW baikor.public_construction_site_areas IS
                    'Sanitized read-only construction-site area projection for GeoServer publication.';
                GRANT USAGE ON SCHEMA baikor TO PUBLIC;
                GRANT SELECT ON baikor.public_construction_site_areas TO PUBLIC;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP VIEW IF EXISTS baikor.public_construction_site_areas;");

            migrationBuilder.DropTable(
                name: "construction_site_areas",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "construction_sites",
                schema: "baikor");

            migrationBuilder.Sql("DROP SCHEMA IF EXISTS baikor;");
        }
    }
}
