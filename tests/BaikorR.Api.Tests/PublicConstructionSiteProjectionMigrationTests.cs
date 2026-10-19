using BaikorR.Core.Persistence.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;

namespace BaikorR.Api.Tests;

public sealed class PublicConstructionSiteProjectionMigrationTests
{
    [Fact]
    public void MigrationPublishesSanitizedAreaDetailsAndOneSearchFeaturePerSite()
    {
        var migration = new ImprovePublicConstructionSiteProjection();

        var sql = string.Join(
            Environment.NewLine,
            migration.UpOperations.OfType<SqlOperation>().Select(operation => operation.Sql));

        Assert.Contains("CREATE VIEW baikor.public_construction_site_areas", sql);
        Assert.Contains("construction_site.\"Status\" IN ('Approved', 'Active')", sql);
        Assert.Contains("AS status_label", sql);
        Assert.Contains("AS area_size_sqm", sql);
        Assert.Contains("AS diversion", sql);
        Assert.Contains("AS communications", sql);
        Assert.Contains("CREATE VIEW baikor.public_construction_sites", sql);
        Assert.Contains("GROUP BY construction_site.\"Id\", construction_site.\"Title\"", sql);
        Assert.DoesNotContain("construction_site_contacts", sql);
        Assert.DoesNotContain("construction_site_attachments", sql);
    }
}
