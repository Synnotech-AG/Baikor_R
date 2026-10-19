using BaikorR.Api.Features.ConstructionSites.ChangeStatus;
using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Features.ConstructionSites.Create;
using BaikorR.Api.Features.ConstructionSites.Delete;
using BaikorR.Api.Features.ConstructionSites.Update;
using BaikorR.Api.Persistence.Entities;
using BaikorR.Api.Persistence.Sessions;
using BaikorR.Api.Shared.Spatial;
using NetTopologySuite.Geometries;

namespace BaikorR.Api.Tests;

public sealed class ConstructionSiteServiceTests
{
    [Theory]
    [InlineData(ConstructionSiteStatus.Draft)]
    [InlineData(ConstructionSiteStatus.Planned)]
    [InlineData(ConstructionSiteStatus.Approved)]
    [InlineData(ConstructionSiteStatus.Active)]
    public async Task CreateAcceptsEveryStatus(ConstructionSiteStatus status)
    {
        var session = new InMemoryConstructionSitesSession();
        var service = new CreateConstructionSiteService(
            session,
            new FixedTimeProvider(new DateTimeOffset(2026, 8, 18, 6, 0, 0, TimeSpan.Zero)),
            new CreateConstructionSiteRequest.Validator(new ConstructionSiteAreaRequest.Validator()));

        var result = await service.ExecuteAsync(
            new CreateConstructionSiteRequest(
                "Construction site",
                status,
                new DateOnly(2026, 8, 20),
                new DateOnly(2026, 8, 30),
                [new ConstructionSiteAreaRequest(null, "Area 1", CreatePolygonDto(726000, 5434000, 100))]),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(status, result.Value.Status);
    }

    [Fact]
    public async Task CreateAcceptsMissingPlannedDates()
    {
        var session = new InMemoryConstructionSitesSession();
        var service = new CreateConstructionSiteService(
            session,
            new FixedTimeProvider(new DateTimeOffset(2026, 8, 19, 6, 0, 0, TimeSpan.Zero)),
            new CreateConstructionSiteRequest.Validator(new ConstructionSiteAreaRequest.Validator()));

        var result = await service.ExecuteAsync(
            new CreateConstructionSiteRequest(
                "Construction site without dates",
                ConstructionSiteStatus.Draft,
                null,
                null,
                [new ConstructionSiteAreaRequest(null, "Area 1", CreatePolygonDto(726000, 5434000, 100))]),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(result.Value.PlannedStart);
        Assert.Null(result.Value.PlannedEnd);
    }

    [Fact]
    public async Task CreateAcceptsMissingAreas()
    {
        var session = new InMemoryConstructionSitesSession();
        var service = new CreateConstructionSiteService(
            session,
            new FixedTimeProvider(new DateTimeOffset(2026, 8, 19, 6, 0, 0, TimeSpan.Zero)),
            new CreateConstructionSiteRequest.Validator(new ConstructionSiteAreaRequest.Validator()));

        var result = await service.ExecuteAsync(
            new CreateConstructionSiteRequest(
                "New construction site",
                ConstructionSiteStatus.Draft,
                null,
                null,
                []),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value.Areas);
    }

    [Fact]
    public async Task CreatePersistsContactsCommunicationsAndDiversion()
    {
        var session = new InMemoryConstructionSitesSession();
        var service = new CreateConstructionSiteService(
            session,
            new FixedTimeProvider(new DateTimeOffset(2026, 8, 19, 6, 0, 0, TimeSpan.Zero)),
            new CreateConstructionSiteRequest.Validator(
                new ConstructionSiteAreaRequest.Validator(),
                new ConstructionSiteContactRequest.Validator(),
                new ConstructionSiteCommunicationRequest.Validator()));

        var result = await service.ExecuteAsync(
            new CreateConstructionSiteRequest(
                "Construction site",
                ConstructionSiteStatus.Planned,
                new DateOnly(2026, 8, 20),
                new DateOnly(2026, 8, 30),
                [new ConstructionSiteAreaRequest(null, "Area 1", CreatePolygonDto(726000, 5434000, 100))],
                "  Follow the signed diversion.  ",
                [new ConstructionSiteContactRequest(null, " Ada ", " Lovelace ", "Applicant", "ada@example.test", null, null)],
                [new ConstructionSiteCommunicationRequest(null, " Resident information ", " Published by email ")]),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Follow the signed diversion.", result.Value.Diversion);
        Assert.Equal("Ada", result.Value.Contacts.Single().FirstName);
        Assert.Equal("Resident information", result.Value.Communications.Single().Type);
        Assert.Equal("Published by email", result.Value.Communications.Single().Note);
    }

    [Fact]
    public async Task CreateNormalizesAndPersistsMetadata()
    {
        var session = new InMemoryConstructionSitesSession();
        var service = new CreateConstructionSiteService(
            session,
            new FixedTimeProvider(new DateTimeOffset(2026, 9, 2, 8, 0, 0, TimeSpan.Zero)),
            new CreateConstructionSiteRequest.Validator(new ConstructionSiteAreaRequest.Validator()));

        var result = await service.ExecuteAsync(
            new CreateConstructionSiteRequest(
                "Imported construction site",
                ConstructionSiteStatus.Draft,
                null,
                null,
                [],
                Metadata: new Dictionary<string, string>
                {
                    [" source.projectId "] = " R-10002 "
                }),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("R-10002", result.Value.Metadata["source.projectId"]);
        var persisted = await session.GetAsync(result.Value.Id, CancellationToken.None);
        Assert.Equal("R-10002", persisted!.Metadata["source.projectId"]);
    }

    [Fact]
    public async Task CreateRejectsDuplicateNormalizedMetadataKeys()
    {
        var session = new InMemoryConstructionSitesSession();
        var service = new CreateConstructionSiteService(
            session,
            new FixedTimeProvider(new DateTimeOffset(2026, 9, 2, 8, 0, 0, TimeSpan.Zero)),
            new CreateConstructionSiteRequest.Validator(new ConstructionSiteAreaRequest.Validator()));

        var result = await service.ExecuteAsync(
            new CreateConstructionSiteRequest(
                "Imported construction site",
                ConstructionSiteStatus.Draft,
                null,
                null,
                [],
                Metadata: new Dictionary<string, string>
                {
                    ["source.projectId"] = "R-10002",
                    [" Source.ProjectId "] = "R-10003"
                }),
            CancellationToken.None);

        Assert.True(result.IsFailed);
        Assert.Contains(
            result.Errors,
            error => error.Metadata.TryGetValue("Key", out var key)
                     && Equals(key, "constructionSites.validation.metadata.keysNotUnique"));
    }

    [Fact]
    public async Task ChangeStatusAllowsAnyTargetStatus()
    {
        var session = new InMemoryConstructionSitesSession();
        var constructionSite = CreateConstructionSite();
        session.Add(constructionSite);
        var service = new ChangeConstructionSiteStatusService(
            session,
            new FixedTimeProvider(new DateTimeOffset(2026, 8, 18, 8, 0, 0, TimeSpan.Zero)));

        var result = await service.ExecuteAsync(
            constructionSite.Id,
            new ChangeConstructionSiteStatusRequest(ConstructionSiteStatus.Approved),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(ConstructionSiteStatus.Approved, constructionSite.Status);
    }

    [Fact]
    public async Task ChangeStatusAdvancesToTheNextWorkflowStep()
    {
        var session = new InMemoryConstructionSitesSession();
        var constructionSite = CreateConstructionSite();
        constructionSite.Status = ConstructionSiteStatus.Active;
        session.Add(constructionSite);
        var changedAt = new DateTimeOffset(2026, 8, 18, 9, 0, 0, TimeSpan.Zero);
        var service = new ChangeConstructionSiteStatusService(
            session,
            new FixedTimeProvider(changedAt));

        var result = await service.ExecuteAsync(
            constructionSite.Id,
            new ChangeConstructionSiteStatusRequest(ConstructionSiteStatus.Draft),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(ConstructionSiteStatus.Draft, constructionSite.Status);
        Assert.Equal(changedAt, constructionSite.UpdatedAt);
    }

    [Fact]
    public async Task UpdatePreservesAreaIdentityAndReplacesRemovedAreas()
    {
        var session = new InMemoryConstructionSitesSession();
        var constructionSite = CreateConstructionSite();
        var existingAreaId = constructionSite.Areas.Single().Id;
        session.Add(constructionSite);
        var changedAt = new DateTimeOffset(2026, 8, 18, 10, 0, 0, TimeSpan.Zero);
        var service = new UpdateConstructionSiteService(
            session,
            new FixedTimeProvider(changedAt),
            new UpdateConstructionSiteRequest.Validator(new ConstructionSiteAreaRequest.Validator()));

        var result = await service.ExecuteAsync(
            constructionSite.Id,
            new UpdateConstructionSiteRequest(
                "Updated title",
                ConstructionSiteStatus.Active,
                new DateOnly(2026, 9, 1),
                new DateOnly(2026, 9, 15),
                [
                    new ConstructionSiteAreaRequest(
                        existingAreaId,
                        "Area 1",
                        CreatePolygonDto(727000, 5435000, 50)),
                    new ConstructionSiteAreaRequest(
                        null,
                        "Area 2",
                        CreatePolygonDto(727100, 5435100, 25))
                ],
                constructionSite.Version),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Updated title", constructionSite.Title);
        Assert.Equal(ConstructionSiteStatus.Active, constructionSite.Status);
        Assert.Equal(2, constructionSite.Areas.Count);
        Assert.Contains(constructionSite.Areas, area =>
            area.Id == existingAreaId && area.Name == "Area 1");
        Assert.Contains(constructionSite.Areas, area => area.Name == "Area 2");
        Assert.Equal(changedAt, constructionSite.UpdatedAt);
    }

    [Fact]
    public async Task UpdateAcceptsRemovingEveryArea()
    {
        var session = new InMemoryConstructionSitesSession();
        var constructionSite = CreateConstructionSite();
        session.Add(constructionSite);
        var service = new UpdateConstructionSiteService(
            session,
            new FixedTimeProvider(new DateTimeOffset(2026, 8, 19, 7, 0, 0, TimeSpan.Zero)),
            new UpdateConstructionSiteRequest.Validator(new ConstructionSiteAreaRequest.Validator()));

        var result = await service.ExecuteAsync(
            constructionSite.Id,
            new UpdateConstructionSiteRequest(
                constructionSite.Title,
                constructionSite.Status,
                constructionSite.PlannedStart,
                constructionSite.PlannedEnd,
                [],
                constructionSite.Version),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(constructionSite.Areas);
    }

    [Fact]
    public async Task UpdateReplacesMetadata()
    {
        var session = new InMemoryConstructionSitesSession();
        var constructionSite = CreateConstructionSite();
        constructionSite.Metadata["source.projectId"] = "R-10001";
        session.Add(constructionSite);
        var service = new UpdateConstructionSiteService(
            session,
            new FixedTimeProvider(new DateTimeOffset(2026, 9, 2, 9, 0, 0, TimeSpan.Zero)),
            new UpdateConstructionSiteRequest.Validator(new ConstructionSiteAreaRequest.Validator()));

        var result = await service.ExecuteAsync(
            constructionSite.Id,
            new UpdateConstructionSiteRequest(
                constructionSite.Title,
                constructionSite.Status,
                constructionSite.PlannedStart,
                constructionSite.PlannedEnd,
                [],
                constructionSite.Version,
                Metadata: new Dictionary<string, string>
                {
                    ["source.projectId"] = "R-10002",
                    ["source.format"] = "shapefile"
                }),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(2, constructionSite.Metadata.Count);
        Assert.Equal("R-10002", constructionSite.Metadata["source.projectId"]);
        Assert.Equal("shapefile", result.Value.Metadata["source.format"]);
    }

    [Fact]
    public async Task DeleteRemovesTheConstructionSite()
    {
        var session = new InMemoryConstructionSitesSession();
        var constructionSite = CreateConstructionSite();
        session.Add(constructionSite);
        var service = new DeleteConstructionSiteService(session);

        var result = await service.ExecuteAsync(constructionSite.Id, CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(await session.GetAsync(constructionSite.Id, CancellationToken.None));
    }

    private static ConstructionSite CreateConstructionSite()
    {
        var id = Guid.NewGuid();
        var createdAt = new DateTimeOffset(2026, 8, 18, 7, 0, 0, TimeSpan.Zero);
        return new ConstructionSite
        {
            Id = id,
            Title = "Service test",
            Status = ConstructionSiteStatus.Draft,
            CreatedAt = createdAt,
            UpdatedAt = createdAt,
            Areas =
            [
                new ConstructionSiteArea
                {
                    Id = Guid.NewGuid(),
                    ConstructionSiteId = id,
                    Name = "Area 1",
                    Geometry = CreatePolygon(726000, 5434000, 100)
                }
            ]
        };
    }

    private static PolygonDto CreatePolygonDto(double x, double y, double size) =>
        Epsg25832PolygonConverter.ToDto(CreatePolygon(x, y, size));

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
