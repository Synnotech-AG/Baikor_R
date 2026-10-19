using BaikorR.Api.Shared.Spatial;

namespace BaikorR.Api.Tests;

public sealed class PolygonConverterTests
{
    [Fact]
    public void CreatesAValidPolygonInTheConfiguredProjection()
    {
        var dto = new PolygonDto(
            "Polygon",
            [
                [
                    [725000, 5432000],
                    [725100, 5432000],
                    [725100, 5432100],
                    [725000, 5432100],
                    [725000, 5432000]
                ]
            ]);

        var success = Epsg25832PolygonConverter.TryCreate(dto, out var geometry, out var error);

        Assert.True(success, error);
        Assert.NotNull(geometry);
        Assert.Equal(25832, geometry.SRID);
        Assert.Equal(10_000, geometry.Area);
    }

    [Fact]
    public void RejectsATypeOtherThanPolygon()
    {
        var dto = new PolygonDto("MultiPolygon", []);

        var success = Epsg25832PolygonConverter.TryCreate(dto, out var geometry, out var error);

        Assert.False(success);
        Assert.Null(geometry);
        Assert.NotNull(error);
    }
}
