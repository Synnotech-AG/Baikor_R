using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaikorR.Core.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UsePointGeometryForPublicConstructionSiteSearch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DROP VIEW IF EXISTS baikor.public_construction_sites;

                CREATE VIEW baikor.public_construction_sites
                WITH (security_barrier = true)
                AS
                SELECT
                    construction_site."Id" AS id,
                    construction_site."Title" AS title,
                    ST_PointOnSurface(ST_Union(area."Geometry"))::geometry(Point, 25832) AS geometry
                FROM baikor.construction_sites AS construction_site
                INNER JOIN baikor.construction_site_areas AS area
                    ON area."ConstructionSiteId" = construction_site."Id"
                WHERE construction_site."Status" IN ('Approved', 'Active')
                GROUP BY construction_site."Id", construction_site."Title";

                COMMENT ON VIEW baikor.public_construction_sites IS
                    'Sanitized construction-site search projection with one stable map point per construction site.';
                GRANT SELECT ON baikor.public_construction_sites TO PUBLIC;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DROP VIEW IF EXISTS baikor.public_construction_sites;

                CREATE VIEW baikor.public_construction_sites
                WITH (security_barrier = true)
                AS
                SELECT
                    construction_site."Id" AS id,
                    construction_site."Title" AS title,
                    ST_Multi(ST_Union(area."Geometry"))::geometry(MultiPolygon, 25832) AS geometry
                FROM baikor.construction_sites AS construction_site
                INNER JOIN baikor.construction_site_areas AS area
                    ON area."ConstructionSiteId" = construction_site."Id"
                WHERE construction_site."Status" IN ('Approved', 'Active')
                GROUP BY construction_site."Id", construction_site."Title";

                COMMENT ON VIEW baikor.public_construction_sites IS
                    'Sanitized construction-site search projection with one feature per construction site.';
                GRANT SELECT ON baikor.public_construction_sites TO PUBLIC;
                """);
        }
    }
}
