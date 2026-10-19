using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaikorR.Core.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddConstructionSiteMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Metadata",
                schema: "baikor",
                table: "construction_sites",
                type: "jsonb",
                nullable: false,
                defaultValueSql: "'{}'::jsonb");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Metadata",
                schema: "baikor",
                table: "construction_sites");
        }
    }
}
