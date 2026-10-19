using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaikorR.Core.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ImprovePublicConstructionSiteProjection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DROP VIEW IF EXISTS baikor.public_construction_sites;
                DROP VIEW IF EXISTS baikor.public_construction_site_areas;

                CREATE VIEW baikor.public_construction_site_areas
                WITH (security_barrier = true)
                AS
                SELECT
                    area."Id" AS id,
                    area."ConstructionSiteId" AS construction_site_id,
                    area."Name" AS area_name,
                    construction_site."Title" AS title,
                    lower(construction_site."Status") AS status,
                    CASE construction_site."Status"
                        WHEN 'Approved' THEN 'Genehmigt'
                        WHEN 'Active' THEN 'Laufend'
                    END AS status_label,
                    construction_site."PlannedStart" AS planned_start,
                    construction_site."PlannedEnd" AS planned_end,
                    round(ST_Area(area."Geometry"))::bigint AS area_size_sqm,
                    NULLIF(
                        trim(
                            regexp_replace(
                                regexp_replace(
                                    replace(construction_site."Diversion", '&nbsp;', ' '),
                                    '<[^>]*>',
                                    ' ',
                                    'g'),
                                '\s+',
                                ' ',
                                'g')),
                        '') AS diversion,
                    communication.communications,
                    construction_site."UpdatedAt" AS updated_at,
                    area."Geometry" AS geometry
                FROM baikor.construction_site_areas AS area
                INNER JOIN baikor.construction_sites AS construction_site
                    ON construction_site."Id" = area."ConstructionSiteId"
                LEFT JOIN LATERAL (
                    SELECT NULLIF(
                        string_agg(
                            communication."Type" ||
                            CASE
                                WHEN communication."Note" IS NULL OR trim(communication."Note") = '' THEN ''
                                ELSE ': ' || trim(
                                    regexp_replace(
                                        regexp_replace(
                                            replace(communication."Note", '&nbsp;', ' '),
                                            '<[^>]*>',
                                            ' ',
                                            'g'),
                                        '\s+',
                                        ' ',
                                        'g'))
                            END,
                            E'\n'
                            ORDER BY communication."Position"),
                        '') AS communications
                    FROM baikor.construction_site_communications AS communication
                    WHERE communication."ConstructionSiteId" = construction_site."Id"
                ) AS communication ON true
                WHERE construction_site."Status" IN ('Approved', 'Active');

                COMMENT ON VIEW baikor.public_construction_site_areas IS
                    'Sanitized read-only construction-site area projection for GeoServer publication.';
                GRANT USAGE ON SCHEMA baikor TO PUBLIC;
                GRANT SELECT ON baikor.public_construction_site_areas TO PUBLIC;

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

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DROP VIEW IF EXISTS baikor.public_construction_sites;
                DROP VIEW IF EXISTS baikor.public_construction_site_areas;

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
    }
}
