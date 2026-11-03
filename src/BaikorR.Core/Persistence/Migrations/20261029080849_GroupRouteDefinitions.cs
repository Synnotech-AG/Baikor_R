using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaikorR.Core.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class GroupRouteDefinitions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "RouteDefinitionId",
                schema: "baikor",
                table: "routes",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "SupersededByAlertId",
                schema: "baikor",
                table: "alerts",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "route_definitions",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: true),
                    SourceId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExternalRouteId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsSuppressed = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_route_definitions", x => x.Id);
                    table.CheckConstraint("CK_route_definitions_source_binding", "(\"SourceId\" IS NULL AND \"ExternalRouteId\" IS NULL) OR (\"SourceId\" IS NOT NULL AND \"ExternalRouteId\" IS NOT NULL)");
                });

            // Keep every path/version UUID. A provider route becomes a stable parent;
            // unrelated manual routes are never grouped merely because their names match.
            migrationBuilder.Sql("""
                WITH bindings AS (
                    SELECT r.*, first_value("Id") OVER (
                        PARTITION BY "SourceId", "ExternalRouteId",
                            CASE WHEN "SourceId" IS NULL THEN "Id" END
                        ORDER BY "Id") AS parent_id
                    FROM baikor.routes r
                )
                INSERT INTO baikor.route_definitions
                    ("Id", "Title", "Description", "SourceId", "ExternalRouteId", "IsSuppressed", "CreatedAt", "UpdatedAt")
                SELECT parent_id, (array_agg("Title" ORDER BY "Id"))[1],
                    (array_agg("Description" ORDER BY "Id"))[1], "SourceId", "ExternalRouteId",
                    bool_and("IsSuppressed"), min("CreatedAt"), max("UpdatedAt")
                FROM bindings GROUP BY parent_id, "SourceId", "ExternalRouteId";

                UPDATE baikor.routes r SET "RouteDefinitionId" = d."Id"
                FROM baikor.route_definitions d
                WHERE (r."SourceId" IS NULL AND d."SourceId" IS NULL AND r."Id" = d."Id")
                   OR (r."SourceId" = d."SourceId" AND r."ExternalRouteId" = d."ExternalRouteId");

                -- These rows record lineage only; immutable evidence and reviewer events are untouched.
                CREATE TEMP TABLE grouped_route_cases ON COMMIT DROP AS
                SELECT a."Id" AS alert_id, c."ConstructionSiteId" AS site_id, r."RouteDefinitionId" AS parent_id,
                    first_value(a."Id") OVER (
                        PARTITION BY a."RuleId", r."RouteDefinitionId", c."ConstructionSiteId"
                        ORDER BY (r."Id" = r."RouteDefinitionId") DESC, a."CreatedAt", a."Id") AS canonical_id,
                    count(*) OVER (PARTITION BY a."RuleId", r."RouteDefinitionId", c."ConstructionSiteId") AS case_count
                FROM baikor.alerts a JOIN baikor.route_conflict_alerts c ON c."AlertId" = a."Id"
                    JOIN baikor.routes r ON r."Id" = c."RouteId"
                WHERE a."Type" = 'routeConflict' AND a."SupersededByAlertId" IS NULL;

                -- Free the old identity before assigning the canonical parent identity.
                UPDATE baikor.alerts a SET "SupersededByAlertId" = g.canonical_id,
                    "IdentityKey" = 'legacy-path/' || a."Id"::text, "UpdatedAt" = CURRENT_TIMESTAMP
                FROM grouped_route_cases g WHERE a."Id" = g.alert_id AND g.alert_id <> g.canonical_id;
                UPDATE baikor.alerts a SET "IdentityKey" = g.parent_id::text || '/' || g.site_id::text
                FROM grouped_route_cases g WHERE a."Id" = g.alert_id AND g.alert_id = g.canonical_id;
                UPDATE baikor.route_conflict_alerts c SET "RouteId" = g.parent_id
                FROM grouped_route_cases g WHERE c."AlertId" = g.alert_id;

                INSERT INTO baikor.alert_events
                    ("Id", "AlertId", "Occurrence", "EvidenceRevision", "CreatedAt", "Actor", "Kind", "Explanation", "Handling", "Note")
                SELECT gen_random_uuid(), a."Id", a."Occurrence", a."EvidenceRevision", CURRENT_TIMESTAMP,
                    'system:migration', CASE WHEN g.alert_id = g.canonical_id THEN 'routeGrouped' ELSE 'superseded' END,
                    CASE WHEN g.alert_id = g.canonical_id
                        THEN 'Path cases were grouped under their route. Earlier path histories remain separately available.'
                        ELSE 'This path case is retained as read-only history under its canonical route case.' END,
                    NULL, NULL
                FROM grouped_route_cases g JOIN baikor.alerts a ON a."Id" = g.alert_id
                WHERE g.case_count > 1;

                -- Normalize uncompleted legacy subjects so successful parent work also repairs their failures.
                UPDATE baikor.alert_detection_work w SET "Kind" = 'routeDefinition', "SubjectId" = r."RouteDefinitionId"
                FROM baikor.routes r WHERE w."CompletedAt" IS NULL AND w."Kind" = 'route' AND w."SubjectId" = r."Id";
                UPDATE baikor.alert_detection_work w SET "Kind" = 'routeDefinition', "SubjectId" = r."RouteDefinitionId"
                FROM baikor.route_path_versions v JOIN baikor.routes r ON r."Id" = v."RoutePathId"
                WHERE w."CompletedAt" IS NULL AND w."Kind" = 'routeVersion' AND w."SubjectId" = v."Id";

                INSERT INTO baikor.alert_detection_work
                    ("Kind", "SubjectId", "CreatedAt", "AvailableAt", "Attempts")
                SELECT 'rule', r."Id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0 FROM baikor.alert_rules r
                WHERE r."Type" = 'routeConflict' AND r."Enabled"
                    AND NOT EXISTS (SELECT 1 FROM baikor.alert_detection_work w
                        WHERE w."Kind" = 'rule' AND w."SubjectId" = r."Id" AND w."CompletedAt" IS NULL AND w."Attempts" < 5);
                """);

            migrationBuilder.CreateIndex(
                name: "IX_routes_RouteDefinitionId",
                schema: "baikor",
                table: "routes",
                column: "RouteDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_alerts_SupersededByAlertId",
                schema: "baikor",
                table: "alerts",
                column: "SupersededByAlertId");

            migrationBuilder.CreateIndex(
                name: "IX_route_definitions_SourceId_ExternalRouteId",
                schema: "baikor",
                table: "route_definitions",
                columns: new[] { "SourceId", "ExternalRouteId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_alerts_alerts_SupersededByAlertId",
                schema: "baikor",
                table: "alerts",
                column: "SupersededByAlertId",
                principalSchema: "baikor",
                principalTable: "alerts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_routes_route_definitions_RouteDefinitionId",
                schema: "baikor",
                table: "routes",
                column: "RouteDefinitionId",
                principalSchema: "baikor",
                principalTable: "route_definitions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Older application versions cannot represent consolidated review lineage.
            // Permit empty-schema test rollback, but never silently discard populated grouping metadata.
            migrationBuilder.Sql("""
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM baikor.route_definitions)
                        OR EXISTS (SELECT 1 FROM baikor.alerts WHERE "SupersededByAlertId" IS NOT NULL)
                        OR EXISTS (SELECT 1 FROM baikor.alert_detection_work WHERE "Kind" = 'routeDefinition' AND "CompletedAt" IS NULL)
                    THEN
                        RAISE EXCEPTION 'Grouped routes cannot be downgraded while populated. Restore a consistent pre-upgrade backup and matching application instead.';
                    END IF;
                END $$;
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_alerts_alerts_SupersededByAlertId",
                schema: "baikor",
                table: "alerts");

            migrationBuilder.DropForeignKey(
                name: "FK_routes_route_definitions_RouteDefinitionId",
                schema: "baikor",
                table: "routes");

            migrationBuilder.DropTable(
                name: "route_definitions",
                schema: "baikor");

            migrationBuilder.DropIndex(
                name: "IX_routes_RouteDefinitionId",
                schema: "baikor",
                table: "routes");

            migrationBuilder.DropIndex(
                name: "IX_alerts_SupersededByAlertId",
                schema: "baikor",
                table: "alerts");

            migrationBuilder.DropColumn(
                name: "RouteDefinitionId",
                schema: "baikor",
                table: "routes");

            migrationBuilder.DropColumn(
                name: "SupersededByAlertId",
                schema: "baikor",
                table: "alerts");
        }
    }
}
