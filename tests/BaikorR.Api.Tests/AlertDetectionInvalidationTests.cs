using BaikorR.Core.Persistence;
using BaikorR.Core.Persistence.Detection;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Features.Alerts.Detection;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;

namespace BaikorR.Api.Tests;

public sealed class AlertDetectionInvalidationTests
{
    [Fact]
    public void HandlerAcceptsParentInvalidationsForTheRegisteredDetector()
    {
        using var context = CreateContext();
        var handler = new RouteConflictDetectionHandler(context, new RouteConflictDetector(), new AlertReconciler());

        Assert.Contains("routeDefinition", handler.SupportedTriggerKinds);
    }

    [Fact]
    public void ChildRemovalAndParentSuppressionInvalidateTheSameParent()
    {
        using var context = CreateContext();
        var parent = new RouteDefinition { Id = Guid.NewGuid(), Title = "Line" };
        var child = new RoutePath { Id = Guid.NewGuid(), Title = "Outbound", RouteDefinition = parent, RouteDefinitionId = parent.Id };
        parent.Paths.Add(child);
        context.Attach(parent);
        parent.IsSuppressed = true;
        context.Remove(child);

        var work = DetectionChangeCollector.Collect(context);

        Assert.Equal(new DetectionInvalidation("routeDefinition", parent.Id), Assert.Single(work));
    }

    [Fact]
    public void CreatingASiteSchedulesItsEvaluationEvenWithoutAreas()
    {
        using var context = CreateContext();
        var site = new ConstructionSite { Id = Guid.NewGuid(), Title = "Future work" };
        context.Add(site);

        var work = DetectionChangeCollector.Collect(context);

        Assert.Contains(work, item => item.Kind == "site" && item.SubjectId == site.Id);
    }

    [Fact]
    public void ADirectAreaEditSchedulesTheOwningSiteOnce()
    {
        using var context = CreateContext();
        var siteId = Guid.NewGuid();
        var factory = new GeometryFactory(new PrecisionModel(), 25832);
        var area = new ConstructionSiteArea
        {
            Id = Guid.NewGuid(), ConstructionSiteId = siteId, Name = "Road",
            Geometry = factory.CreatePolygon([
                new Coordinate(1, 1), new Coordinate(2, 1), new Coordinate(2, 2),
                new Coordinate(1, 1)
            ])
        };
        context.Attach(area);
        area.Geometry = (Polygon)area.Geometry.Buffer(1);

        var work = DetectionChangeCollector.Collect(context);

        Assert.Single(work, item => item.Kind == "site" && item.SubjectId == siteId);
    }

    [Fact]
    public void DeletingASiteRetainsItsIdForReconciliation()
    {
        using var context = CreateContext();
        var site = new ConstructionSite { Id = Guid.NewGuid(), Title = "Removed work" };
        context.Attach(site);
        context.Remove(site);

        var work = DetectionChangeCollector.Collect(context);

        Assert.Contains(work, item => item.Kind == "site" && item.SubjectId == site.Id);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ArchivingAndRestoringASiteSchedulesReconciliation(bool originallyArchived)
    {
        using var context = CreateContext();
        var site = new ConstructionSite
        {
            Id = Guid.NewGuid(), Title = "Retained work", IsDeleted = originallyArchived
        };
        context.Attach(site);
        site.IsDeleted = !originallyArchived;

        var work = DetectionChangeCollector.Collect(context);

        Assert.Equal(new DetectionInvalidation("site", site.Id), Assert.Single(work));
    }

    [Fact]
    public void EditingOnlyAContactDoesNotInvalidateSpatialEvidence()
    {
        using var context = CreateContext();
        var contact = new ConstructionSiteContact
        {
            Id = Guid.NewGuid(), ConstructionSiteId = Guid.NewGuid(), FirstName = "A",
            LastName = "B", Role = "Coordinator"
        };
        context.Attach(contact);
        contact.FirstName = "Changed";

        Assert.Empty(DetectionChangeCollector.Collect(context));
    }

    private static BaikorRDbContext CreateContext() => new(
        new DbContextOptionsBuilder<BaikorRDbContext>()
            .UseNpgsql("Host=localhost;Database=unused;Username=unused;Password=unused",
                options => options.UseNetTopologySuite()).Options);
}
