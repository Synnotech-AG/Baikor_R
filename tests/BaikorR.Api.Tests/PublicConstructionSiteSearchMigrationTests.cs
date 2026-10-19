using BaikorR.Core.Persistence.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;

namespace BaikorR.Api.Tests;

public sealed class PublicConstructionSiteSearchMigrationTests
{
    [Fact]
    public void MigrationUsesOneStablePointPerConstructionSiteForMasterportalZoom()
    {
        var migration = new UsePointGeometryForPublicConstructionSiteSearch();

        var sql = string.Join(
            Environment.NewLine,
            migration.UpOperations.OfType<SqlOperation>().Select(operation => operation.Sql));

        Assert.Contains("ST_PointOnSurface(ST_Union(area.\"Geometry\"))", sql);
        Assert.Contains("geometry(Point, 25832)", sql);
        Assert.Contains("construction_site.\"Status\" IN ('Approved', 'Active')", sql);
        Assert.Contains("GROUP BY construction_site.\"Id\", construction_site.\"Title\"", sql);
    }
}
