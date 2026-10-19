using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaikorR.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddConstructionSiteDetailsAndAttachments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Diversion",
                schema: "baikor",
                table: "construction_sites",
                type: "character varying(10000)",
                maxLength: 10000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "construction_site_attachments",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConstructionSiteId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    FileSize = table.Column<long>(type: "bigint", nullable: false),
                    MimeType = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Data = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_construction_site_attachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_construction_site_attachments_construction_sites_Constructi~",
                        column: x => x.ConstructionSiteId,
                        principalSchema: "baikor",
                        principalTable: "construction_sites",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "construction_site_communications",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConstructionSiteId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    Text = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_construction_site_communications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_construction_site_communications_construction_sites_Constru~",
                        column: x => x.ConstructionSiteId,
                        principalSchema: "baikor",
                        principalTable: "construction_sites",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "construction_site_contacts",
                schema: "baikor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConstructionSiteId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    FirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Role = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    Phone1 = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Phone2 = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_construction_site_contacts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_construction_site_contacts_construction_sites_ConstructionS~",
                        column: x => x.ConstructionSiteId,
                        principalSchema: "baikor",
                        principalTable: "construction_sites",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_construction_site_attachments_ConstructionSiteId",
                schema: "baikor",
                table: "construction_site_attachments",
                column: "ConstructionSiteId");

            migrationBuilder.CreateIndex(
                name: "IX_construction_site_communications_ConstructionSiteId_Position",
                schema: "baikor",
                table: "construction_site_communications",
                columns: new[] { "ConstructionSiteId", "Position" });

            migrationBuilder.CreateIndex(
                name: "IX_construction_site_contacts_ConstructionSiteId_Position",
                schema: "baikor",
                table: "construction_site_contacts",
                columns: new[] { "ConstructionSiteId", "Position" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "construction_site_attachments",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "construction_site_communications",
                schema: "baikor");

            migrationBuilder.DropTable(
                name: "construction_site_contacts",
                schema: "baikor");

            migrationBuilder.DropColumn(
                name: "Diversion",
                schema: "baikor",
                table: "construction_sites");
        }
    }
}
