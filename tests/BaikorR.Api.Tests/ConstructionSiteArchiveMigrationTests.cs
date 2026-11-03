using BaikorR.Core.Persistence;
using BaikorR.Core.Persistence.Migrations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;

namespace BaikorR.Api.Tests;

public sealed class ConstructionSiteArchiveMigrationTests
{
    [PostgisFact]
    public async Task PublicViewsExcludeArchivedDataAndMigrationRollbackPreservesTheSite()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var siteId = Guid.NewGuid();
        var areaId = Guid.NewGuid();
        await context.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO baikor.construction_sites
                ("Id", "Title", "Status", "CreatedAt", "UpdatedAt")
            VALUES ({siteId}, 'Published work', 'Approved', now(), now());
            INSERT INTO baikor.construction_site_areas ("Id", "ConstructionSiteId", "Name", "Geometry")
            VALUES ({areaId}, {siteId}, 'Retained area',
                ST_GeomFromText('POLYGON((725000 5432000,725010 5432000,725010 5432010,725000 5432010,725000 5432000))', 25832));
            """);
        Assert.False((await context.ConstructionSites.AsNoTracking().SingleAsync()).IsDeleted);
        Assert.Equal(1, await PublicCount(context, "public_construction_site_areas"));
        Assert.Equal(1, await PublicCount(context, "public_construction_sites"));
        await AssertPublicationPermissions(context);
        await context.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE baikor.construction_sites SET "IsDeleted" = true WHERE "Id" = {siteId};
            """);
        Assert.Equal(0, await PublicCount(context, "public_construction_site_areas"));
        Assert.Equal(0, await PublicCount(context, "public_construction_sites"));
        Assert.Equal(1, await context.ConstructionSites.CountAsync());
        Assert.Equal(1, await context.ConstructionSiteAreas.CountAsync());

        var migrator = context.GetService<IMigrator>();
        await migrator.MigrateAsync("20261029123119_BindGtfsImportSources");
        Assert.Equal(1, await PublicCount(context, "public_construction_site_areas"));
        Assert.Equal(1, await PublicCount(context, "public_construction_sites"));
        await AssertPublicationPermissions(context);
        await migrator.MigrateAsync();
        Assert.False((await context.ConstructionSites.AsNoTracking().SingleAsync()).IsDeleted);
        Assert.Equal(1, await context.ConstructionSiteAreas.CountAsync());
        Assert.Equal(1, await PublicCount(context, "public_construction_site_areas"));
        Assert.Equal(1, await PublicCount(context, "public_construction_sites"));
        await AssertPublicationPermissions(context);
    }

    [Fact]
    public void ArchiveMigrationRetainsDataAndExcludesArchivedSitesFromBothPublicViews()
    {
        var migration = new ArchiveConstructionSites();
        var column = Assert.Single(migration.UpOperations.OfType<AddColumnOperation>());
        Assert.Equal("IsDeleted", column.Name);
        Assert.Equal(false, column.DefaultValue);
        var sql = string.Join(Environment.NewLine,
            migration.UpOperations.OfType<SqlOperation>().Select(operation => operation.Sql));
        Assert.Contains("CREATE OR REPLACE VIEW baikor.public_construction_site_areas", sql);
        Assert.Contains("CREATE OR REPLACE VIEW baikor.public_construction_sites", sql);
        Assert.Equal(2, sql.Split("NOT construction_site.\"IsDeleted\"").Length - 1);
        Assert.Contains("geometry(Point, 25832)", sql);
        Assert.DoesNotContain("construction_site_contacts", sql);
        Assert.DoesNotContain("construction_site_attachments", sql);
        Assert.DoesNotContain(migration.UpOperations, operation => operation is DeleteDataOperation or DropTableOperation);
        var dropColumn = Assert.Single(migration.DownOperations.OfType<DropColumnOperation>());
        Assert.Equal("IsDeleted", dropColumn.Name);
        Assert.IsType<SqlOperation>(migration.DownOperations[0]);
    }

    private static Task<int> PublicCount(BaikorRDbContext context, string view) =>
        context.Database.SqlQueryRaw<int>(view switch
        {
            "public_construction_site_areas" => "SELECT count(*)::int AS \"Value\" FROM baikor.public_construction_site_areas",
            "public_construction_sites" => "SELECT count(*)::int AS \"Value\" FROM baikor.public_construction_sites",
            _ => throw new ArgumentOutOfRangeException(nameof(view))
        }).SingleAsync();

    private static async Task AssertPublicationPermissions(BaikorRDbContext context)
    {
        var publicViews = await context.Database.SqlQueryRaw<int>("""
            SELECT count(*)::int AS "Value"
            FROM pg_class AS relation
            INNER JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
            WHERE schema.nspname = 'baikor'
              AND relation.relname IN ('public_construction_site_areas', 'public_construction_sites')
              AND relation.reloptions @> ARRAY['security_barrier=true']::text[]
              AND EXISTS (
                  SELECT 1 FROM aclexplode(relation.relacl) AS permission
                  WHERE permission.grantee = 0 AND permission.privilege_type = 'SELECT')
            """).SingleAsync();
        Assert.Equal(2, publicViews);
    }
}
