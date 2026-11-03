using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaikorR.Core.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TrackActualAlertEvaluations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EvaluatedAt",
                schema: "baikor",
                table: "alert_detection_work",
                type: "timestamp with time zone",
                nullable: true);

            // Prior completions cannot prove that a detector actually ran. Establish
            // fresh evidence through the normal durable engine instead of backfilling.
            migrationBuilder.Sql("""
                INSERT INTO baikor.alert_detection_work
                    ("Kind", "SubjectId", "CreatedAt", "AvailableAt", "Attempts")
                SELECT 'rule', rule."Id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0
                FROM baikor.alert_rules AS rule
                WHERE rule."Enabled"
                  AND NOT EXISTS (
                    SELECT 1 FROM baikor.alert_detection_work AS work
                    WHERE work."Kind" = 'rule' AND work."SubjectId" = rule."Id"
                      AND work."CompletedAt" IS NULL AND work."Attempts" < 5
                  );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EvaluatedAt",
                schema: "baikor",
                table: "alert_detection_work");
        }
    }
}
