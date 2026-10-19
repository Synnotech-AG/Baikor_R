using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaikorR.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCommunicationTypeAndNote : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Text",
                schema: "baikor",
                table: "construction_site_communications",
                newName: "Type");

            migrationBuilder.AddColumn<string>(
                name: "Note",
                schema: "baikor",
                table: "construction_site_communications",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Note",
                schema: "baikor",
                table: "construction_site_communications");

            migrationBuilder.RenameColumn(
                name: "Type",
                schema: "baikor",
                table: "construction_site_communications",
                newName: "Text");
        }
    }
}
