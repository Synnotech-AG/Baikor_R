using BaikorR.Api.Persistence;
using BaikorR.Api.Persistence.Entities;
using BaikorR.Api.Persistence.Sessions;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;

namespace BaikorR.Api.Tests;

public sealed class ConstructionSiteDbSessionTests
{
    [Fact]
    public void AddAreaMarksEntityAsAdded()
    {
        using var dbContext = CreateDbContext();
        var constructionSite = CreateTrackedConstructionSite(dbContext);
        var area = new ConstructionSiteArea
        {
            Id = Guid.NewGuid(),
            ConstructionSiteId = constructionSite.Id,
            Name = "Area 1",
            Geometry = CreatePolygon(726000, 5434000, 100)
        };

        new ConstructionSiteDbSession(dbContext).AddArea(constructionSite, area);

        Assert.Equal(EntityState.Added, dbContext.Entry(area).State);
    }

    [Fact]
    public void AddContactMarksEntityAsAdded()
    {
        using var dbContext = CreateDbContext();
        var constructionSite = CreateTrackedConstructionSite(dbContext);
        var contact = new ConstructionSiteContact
        {
            Id = Guid.NewGuid(),
            ConstructionSiteId = constructionSite.Id,
            FirstName = "Ada",
            LastName = "Lovelace",
            Role = "Applicant"
        };

        new ConstructionSiteDbSession(dbContext).AddContact(constructionSite, contact);

        Assert.Equal(EntityState.Added, dbContext.Entry(contact).State);
    }

    [Fact]
    public void AddCommunicationMarksEntityAsAdded()
    {
        using var dbContext = CreateDbContext();
        var constructionSite = CreateTrackedConstructionSite(dbContext);
        var communication = new ConstructionSiteCommunication
        {
            Id = Guid.NewGuid(),
            ConstructionSiteId = constructionSite.Id,
            Type = "Resident information"
        };

        new ConstructionSiteDbSession(dbContext).AddCommunication(constructionSite, communication);

        Assert.Equal(EntityState.Added, dbContext.Entry(communication).State);
    }

    private static BaikorRDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<BaikorRDbContext>()
            .UseNpgsql(
                "Host=localhost;Database=unused;Username=unused;Password=unused",
                options => options.UseNetTopologySuite())
            .Options);

    private static ConstructionSite CreateTrackedConstructionSite(BaikorRDbContext dbContext)
    {
        var constructionSite = new ConstructionSite
        {
            Id = Guid.NewGuid(),
            Title = "Tracked construction site"
        };
        dbContext.Attach(constructionSite);
        return constructionSite;
    }

    private static Polygon CreatePolygon(double x, double y, double size)
    {
        var factory = NetTopologySuite.NtsGeometryServices.Instance
            .CreateGeometryFactory(srid: 25832);
        return factory.CreatePolygon([
            new Coordinate(x, y),
            new Coordinate(x + size, y),
            new Coordinate(x + size, y + size),
            new Coordinate(x, y + size),
            new Coordinate(x, y)
        ]);
    }
}
