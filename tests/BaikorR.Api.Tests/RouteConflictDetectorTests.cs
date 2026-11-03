using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Entities;
using NetTopologySuite.Geometries;

namespace BaikorR.Api.Tests;

public sealed class RouteConflictDetectorTests
{
    private static readonly GeometryFactory Factory = new(new PrecisionModel(), 25832);
    private static readonly Guid RouteId = Guid.Parse("00000000-0000-0000-0000-000000000001");
    private static readonly Guid SiteId = Guid.Parse("00000000-0000-0000-0000-000000000002");
    private static readonly Guid AreaId = Guid.Parse("00000000-0000-0000-0000-000000000003");

    [Fact]
    public void ParentRouteWorkIsSupportedAndMatchingChildIdentityIsRetained()
    {
        var detector = new RouteConflictDetector();
        var id = Guid.NewGuid();
        var candidate = detector.Evaluate(new AlertRule(), Route() with
        {
            Paths = [Path() with { PathId = id, PathTitle = "Weekday path" }]
        }, Site()).Candidate!;
        Assert.Contains("routeDefinition", detector.SupportedTriggerKinds);
        Assert.Equal(id, Assert.Single(candidate.Snapshot.Paths).PathId);
        Assert.Equal("Weekday path", Assert.Single(candidate.Snapshot.Paths).PathTitle);
    }

    [Fact]
    public void OnlyMatchingChildCalendarAndGeometryContributeToParentEvidence()
    {
        var weekdayId = Guid.NewGuid();
        var weekendId = Guid.NewGuid();
        var route = Route() with { Paths = [
            Path() with { PathId = weekdayId, PathTitle = "Weekday", HasOperatingCalendar = true,
                Periods = [new(new(2040, 1, 2), new(2040, 1, 6))] },
            Path() with { PathId = weekendId, PathTitle = "Weekend", HasOperatingCalendar = true,
                Periods = [new(new(2040, 1, 7), new(2040, 1, 8))] }
        ] };
        var site = Site() with { PlannedStart = new(2040, 1, 7), PlannedEnd = new(2040, 1, 7) };

        var candidate = Evaluate(route, site).Candidate!;

        Assert.Equal(route.Id, candidate.Snapshot.RouteId);
        Assert.Equal(weekendId, Assert.Single(candidate.Snapshot.Paths).PathId);
        Assert.Equal(new RouteConflictPeriod(new(2040, 1, 7), new(2040, 1, 7)), Assert.Single(candidate.Snapshot.Periods));
    }

    [Fact]
    public void LegacyEvidenceWithoutPathIdentityStillDeserializes()
    {
        var candidate = Evaluate(Route(), Site()).Candidate!;
        var json = System.Text.Json.Nodes.JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(candidate.Snapshot))!;
        json["Paths"]![0]!.AsObject().Remove("PathId");
        json["Paths"]![0]!.AsObject().Remove("PathTitle");

        var legacy = System.Text.Json.JsonSerializer.Deserialize<RouteConflictSnapshot>(json.ToJsonString())!;

        Assert.Null(Assert.Single(legacy.Paths).PathId);
        Assert.Null(Assert.Single(legacy.Paths).PathTitle);
    }

    [Theory]
    [InlineData(0, 0, true)]
    [InlineData(10, 10, true)]
    [InlineData(10.001, 10, false)]
    public void SpatialBoundaryIsInclusiveAndLocationLiesOnRoute(double gap, double threshold, bool expected)
    {
        var result = Evaluate(Route(), Site(gap), new AlertRule { SensitivityMetres = threshold });

        Assert.True(result.Assessable);
        Assert.Equal(expected, result.Candidate is not null);
        if (expected)
        {
            Assert.Equal(gap, result.Candidate!.Snapshot.DistanceMetres, 8);
            Assert.Equal(0, result.Candidate.Location!.Y);
            Assert.InRange(result.Candidate.Location.X, 20, 30);
        }
    }

    [Fact]
    public void FutureInclusiveOverlapAndNullBoundsAreDetected()
    {
        var future = new DateOnly(2040, 1, 1);
        var result = Evaluate(Route(new RouteConflictPeriod(future, future)), Site() with { PlannedStart = future });

        Assert.Equal(new RouteConflictPeriod(future, future), Assert.Single(result.Candidate!.Snapshot.Periods));
        var unbounded = Evaluate(Route(), Site());
        Assert.Equal(new RouteConflictPeriod(null, null), Assert.Single(unbounded.Candidate!.Snapshot.Periods));
    }

    [Fact]
    public void ExplicitEmptyCalendarAndDraftDoNotProduceConflicts()
    {
        Assert.Null(Evaluate(Route() with { Paths = [Path() with { HasOperatingCalendar = true }] }, Site()).Candidate);
        Assert.Null(Evaluate(Route(), Site() with { Status = ConstructionSiteStatus.Draft }).Candidate);
    }

    [Fact]
    public void DisjointCalendarPeriodsStayDisjointAndAggregateAreas()
    {
        var route = Route() with { Paths = [Path() with { HasOperatingCalendar = true, Periods = [new(new(2040, 1, 1), new(2040, 1, 2)), new(new(2040, 1, 5), new(2040, 1, 6))] }] };
        var site = Site();
        site = site with { Areas = [.. site.Areas, site.Areas[0] with { Id = Guid.NewGuid(), Name = "Second" }] };

        var candidate = Evaluate(route, site).Candidate!;

        Assert.Equal(2, candidate.Snapshot.Periods.Count);
        Assert.Equal(2, candidate.Snapshot.Areas.Count);
    }

    [Fact]
    public void InvalidGeometryAndInvertedDatesAreNotAssessable()
    {
        var invalid = Route() with { Paths = [Path() with { ValidFrom = new(2040, 2, 1), ValidTo = new(2040, 1, 1) }] };
        Assert.False(Evaluate(invalid, Site()).Assessable);
        var wrongSrid = Path().Geometry.Copy() as MultiLineString;
        wrongSrid!.SRID = 4326;
        Assert.False(Evaluate(Route() with { Paths = [Path() with { Geometry = wrongSrid }] }, Site()).Assessable);
    }

    [Fact]
    public void CanonicalFingerprintIgnoresNamesOrderingAndEquivalentGeometryRepresentation()
    {
        var first = Evaluate(Route(), Site()).Candidate!;
        var reversed = Factory.CreateMultiLineString([Factory.CreateLineString([new Coordinate(100, 0), new Coordinate(50, 0), new Coordinate(0, 0)])]);
        var second = Evaluate(Route() with { Title = "Renamed", Paths = [Path() with { Geometry = reversed }] }, Site() with { Title = "Renamed site" }).Candidate!;

        Assert.Equal(first.MaterialHash, second.MaterialHash);
        Assert.NotEqual(first.MaterialHash, Evaluate(Route(), Site(1)).Candidate!.MaterialHash);
    }

    [Fact]
    public void EquivalentWindowPartitioningDoesNotChangeMaterialFingerprint()
    {
        var first = Evaluate(Route() with { Paths = [Path() with { HasOperatingCalendar = true,
            Periods = [new(new(2040, 1, 1), new(2040, 1, 4))] }] }, Site()).Candidate!;
        var second = Evaluate(Route() with { Paths = [
            Path() with { HasOperatingCalendar = true, Periods = [new(new(2040, 1, 1), new(2040, 1, 2))] },
            Path() with { HasOperatingCalendar = true, Periods = [new(new(2040, 1, 3), new(2040, 1, 4))] }] }, Site()).Candidate!;

        Assert.Equal(first.MaterialHash, second.MaterialHash);
    }

    [Fact]
    public void UnmatchedAreaAndUnavailableOrRemotePathChangesDoNotChangeMaterialEvidence()
    {
        var first = Evaluate(Route(), Site()).Candidate!;
        var remoteArea = Site(800).Areas[0] with { Id = Guid.NewGuid() };
        var remotePath = (MultiLineString)Path().Geometry.Copy();
        remotePath.Apply(new ShiftCoordinates(500));
        remotePath.GeometryChanged();
        var irrelevantPaths = new[]
        {
            Path(),
            Path() with { HasOperatingCalendar = true },
            Path() with { Geometry = remotePath }
        };
        var site = Site();
        var second = Evaluate(Route() with { Paths = irrelevantPaths }, site with { Areas = [.. site.Areas, remoteArea] }).Candidate!;

        Assert.Equal(first.MaterialHash, second.MaterialHash);
        Assert.Single(second.Snapshot.Areas);
        Assert.Single(second.Snapshot.Paths);
    }

    [Fact]
    public void PathChangeOutsideEveryPossibleConflictLocationDoesNotReopenEvidence()
    {
        var first = Evaluate(Route(), Site()).Candidate!;
        var changedOutsideSite = Factory.CreateMultiLineString([Factory.CreateLineString(
            [new Coordinate(0, 0), new Coordinate(50, 0), new Coordinate(100, 50)])]);
        var second = Evaluate(Route() with { Paths = [Path() with { Geometry = changedOutsideSite }] }, Site()).Candidate!;

        Assert.Equal(first.MaterialHash, second.MaterialHash);
        var changedInsideSite = Factory.CreateMultiLineString([Factory.CreateLineString(
            [new Coordinate(0, 1), new Coordinate(100, 1)])]);
        Assert.NotEqual(first.MaterialHash, Evaluate(Route() with { Paths = [Path() with { Geometry = changedInsideSite }] }, Site()).Candidate!.MaterialHash);
    }

    private static RouteConflictEvaluation Evaluate(RouteConflictRoute route, RouteConflictSite site, AlertRule? rule = null) =>
        new RouteConflictDetector().Evaluate(rule ?? new AlertRule(), route, site);

    internal static RouteConflictRoute Route(RouteConflictPeriod? validity = null) => new(RouteId, "Route", false,
        [Path() with { ValidFrom = validity?.From, ValidTo = validity?.To }]);

    internal static RouteConflictPath Path() => new(
        Factory.CreateMultiLineString([Factory.CreateLineString([new Coordinate(0, 0), new Coordinate(100, 0)])]), null, null, false, []);

    internal static RouteConflictSite Site(double gap = 0) => new(SiteId, "Site", ConstructionSiteStatus.Planned, null, null,
        [new(AreaId, "Area", Factory.CreatePolygon([new(20, gap), new(30, gap), new(30, gap + 10), new(20, gap + 10), new(20, gap)]))]);

    private sealed class ShiftCoordinates(double offset) : ICoordinateFilter
    {
        public void Filter(Coordinate coordinate) => coordinate.Y += offset;
    }
}
