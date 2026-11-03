using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BaikorR.Core.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRoutesAndAlerts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "alert_detection_work",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    DetectorType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    ScanRunId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AvailableAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    FailureCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_alert_detection_work", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "alert_rules",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    SensitivityMetres = table.Column<double>(type: "double precision", nullable: false),
                    EligibleStatuses = table.Column<string>(type: "jsonb", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_alert_rules", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "alert_scan_runs",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    State = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    TotalCount = table.Column<int>(type: "integer", nullable: false),
                    CompletedCount = table.Column<int>(type: "integer", nullable: false),
                    FailedCount = table.Column<int>(type: "integer", nullable: false),
                    PendingScanners = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_alert_scan_runs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "routes",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: true),
                    SourceId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExternalRouteId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ExternalShapeId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsSuppressed = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_routes", x => x.Id);
                    table.CheckConstraint("CK_routes_source_binding", "(\"SourceId\" IS NULL AND \"ExternalRouteId\" IS NULL AND \"ExternalShapeId\" IS NULL) OR (\"SourceId\" IS NOT NULL AND \"ExternalRouteId\" IS NOT NULL AND \"ExternalShapeId\" IS NOT NULL)");
                });

            migrationBuilder.CreateTable(
                name: "alerts",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RuleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IdentityKey = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Summary = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Condition = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Handling = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Occurrence = table.Column<int>(type: "integer", nullable: false),
                    EvidenceRevision = table.Column<int>(type: "integer", nullable: false),
                    EvidenceHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    AffectedPeriodsJson = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'[]'::jsonb"),
                    ReviewedEvidenceRevision = table.Column<int>(type: "integer", nullable: true),
                    HandlingActor = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    HandlingNote = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    HandledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Location = table.Column<Point>(type: "geometry(Point,25832)", nullable: true),
                    FocusEnvelope = table.Column<Polygon>(type: "geometry(Polygon,25832)", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    FirstDetectedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastDetectedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastEvaluatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_alerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_alerts_alert_rules_RuleId",
                        column: x => x.RuleId,
                        principalSchema: "baikor",
                        principalTable: "alert_rules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "route_path_versions",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RoutePathId = table.Column<Guid>(type: "uuid", nullable: false),
                    Geometry = table.Column<MultiLineString>(type: "geometry(MultiLineString,25832)", nullable: false),
                    ValidFrom = table.Column<DateOnly>(type: "date", nullable: true),
                    ValidTo = table.Column<DateOnly>(type: "date", nullable: true),
                    SourceCoverageStart = table.Column<DateOnly>(type: "date", nullable: true),
                    SourceCoverageEnd = table.Column<DateOnly>(type: "date", nullable: true),
                    HasOperatingCalendar = table.Column<bool>(type: "boolean", nullable: false),
                    ServiceDayCalendarJson = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_route_path_versions", x => x.Id);
                    table.CheckConstraint("CK_route_versions_coverage", "(\"SourceCoverageStart\" IS NULL AND \"SourceCoverageEnd\" IS NULL) OR (\"SourceCoverageStart\" IS NOT NULL AND \"SourceCoverageEnd\" IS NOT NULL AND \"SourceCoverageStart\" <= \"SourceCoverageEnd\")");
                    table.CheckConstraint("CK_route_versions_valid_dates", "\"ValidFrom\" IS NULL OR \"ValidTo\" IS NULL OR \"ValidFrom\" <= \"ValidTo\"");
                    table.ForeignKey(
                        name: "FK_route_path_versions_routes_RoutePathId",
                        column: x => x.RoutePathId,
                        principalSchema: "baikor",
                        principalTable: "routes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "alert_events",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AlertId = table.Column<Guid>(type: "uuid", nullable: false),
                    Occurrence = table.Column<int>(type: "integer", nullable: false),
                    EvidenceRevision = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Actor = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Kind = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Explanation = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Handling = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    Note = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_alert_events", x => x.Id);
                    table.ForeignKey(
                        name: "FK_alert_events_alerts_AlertId",
                        column: x => x.AlertId,
                        principalSchema: "baikor",
                        principalTable: "alerts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "route_conflict_alerts",
                schema: "baikor",
                columns: table => new
                {
                    AlertId = table.Column<Guid>(type: "uuid", nullable: false),
                    RouteId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConstructionSiteId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_route_conflict_alerts", x => x.AlertId);
                    table.ForeignKey(
                        name: "FK_route_conflict_alerts_alerts_AlertId",
                        column: x => x.AlertId,
                        principalSchema: "baikor",
                        principalTable: "alerts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "route_operating_periods",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RoutePathVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    From = table.Column<DateOnly>(type: "date", nullable: false),
                    To = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_route_operating_periods", x => x.Id);
                    table.CheckConstraint("CK_route_periods_dates", "\"From\" <= \"To\"");
                    table.ForeignKey(
                        name: "FK_route_operating_periods_route_path_versions_RoutePathVersio~",
                        column: x => x.RoutePathVersionId,
                        principalSchema: "baikor",
                        principalTable: "route_path_versions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "route_conflict_evidence",
                schema: "baikor",
                columns: table => new
                {
                    AlertId = table.Column<Guid>(type: "uuid", nullable: false),
                    Revision = table.Column<int>(type: "integer", nullable: false),
                    MaterialHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SnapshotJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_route_conflict_evidence", x => new { x.AlertId, x.Revision });
                    table.ForeignKey(
                        name: "FK_route_conflict_evidence_route_conflict_alerts_AlertId",
                        column: x => x.AlertId,
                        principalSchema: "baikor",
                        principalTable: "route_conflict_alerts",
                        principalColumn: "AlertId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                schema: "baikor",
                table: "alert_rules",
                columns: new[] { "Id", "EligibleStatuses", "Enabled", "Name", "SensitivityMetres", "Type" },
                values: new object[] { new Guid("86ddf9a0-3aa1-4efd-85a6-2c8b97332e01"), "[1,2,3]", true, "Potential route conflicts", 10.0, "routeConflict" });

            migrationBuilder.CreateIndex(
                name: "IX_alert_detection_work_AvailableAt_Id",
                schema: "baikor",
                table: "alert_detection_work",
                columns: new[] { "AvailableAt", "Id" },
                filter: "\"CompletedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_alert_detection_work_ScanRunId",
                schema: "baikor",
                table: "alert_detection_work",
                column: "ScanRunId");

            migrationBuilder.CreateIndex(
                name: "IX_alert_events_AlertId_CreatedAt",
                schema: "baikor",
                table: "alert_events",
                columns: new[] { "AlertId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_alert_scan_runs_CreatedAt",
                schema: "baikor",
                table: "alert_scan_runs",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_alerts_Condition_Handling_UpdatedAt",
                schema: "baikor",
                table: "alerts",
                columns: new[] { "Condition", "Handling", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_alerts_Location",
                schema: "baikor",
                table: "alerts",
                column: "Location")
                .Annotation("Npgsql:IndexMethod", "gist");

            migrationBuilder.CreateIndex(
                name: "IX_alerts_RuleId_IdentityKey",
                schema: "baikor",
                table: "alerts",
                columns: new[] { "RuleId", "IdentityKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_route_conflict_alerts_ConstructionSiteId",
                schema: "baikor",
                table: "route_conflict_alerts",
                column: "ConstructionSiteId");

            migrationBuilder.CreateIndex(
                name: "IX_route_conflict_alerts_RouteId",
                schema: "baikor",
                table: "route_conflict_alerts",
                column: "RouteId");

            migrationBuilder.CreateIndex(
                name: "IX_route_operating_periods_RoutePathVersionId_From_To",
                schema: "baikor",
                table: "route_operating_periods",
                columns: new[] { "RoutePathVersionId", "From", "To" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_route_path_versions_Geometry",
                schema: "baikor",
                table: "route_path_versions",
                column: "Geometry")
                .Annotation("Npgsql:IndexMethod", "gist");

            migrationBuilder.CreateIndex(
                name: "IX_route_path_versions_RoutePathId_SourceCoverageStart_SourceC~",
                schema: "baikor",
                table: "route_path_versions",
                columns: new[] { "RoutePathId", "SourceCoverageStart", "SourceCoverageEnd" });

            migrationBuilder.CreateIndex(
                name: "IX_routes_SourceId_ExternalRouteId_ExternalShapeId",
                schema: "baikor",
                table: "routes",
                columns: new[] { "SourceId", "ExternalRouteId", "ExternalShapeId" },
                unique: true);

            // Bootstrap uses the same durable scan path as later rule changes. No existing
            // construction-site/public-view data is rewritten by this migration.
            migrationBuilder.Sql("""
                INSERT INTO baikor.alert_detection_work
                    ("Kind", "SubjectId", "CreatedAt", "AvailableAt", "Attempts")
                VALUES ('rule', '86ddf9a0-3aa1-4efd-85a6-2c8b97332e01', now(), now(), 0);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "alert_detection_work",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "alert_events",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "alert_scan_runs",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "route_conflict_evidence",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "route_operating_periods",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "route_conflict_alerts",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "route_path_versions",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "alerts",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "routes",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "alert_rules",
                schema: "baikor");
        }
    }
}
