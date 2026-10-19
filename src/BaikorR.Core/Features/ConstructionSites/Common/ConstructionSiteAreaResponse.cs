using BaikorR.Api.Persistence.Entities;
using BaikorR.Api.Shared.Spatial;

namespace BaikorR.Api.Features.ConstructionSites.Common;

public sealed record ConstructionSiteAreaResponse(
    Guid Id,
    string Name,
    PolygonDto Geometry,
    double AreaSquareMetres)
{
    public static ConstructionSiteAreaResponse Create(ConstructionSiteArea area) =>
        new(
            area.Id,
            area.Name,
            Epsg25832PolygonConverter.ToDto(area.Geometry),
            area.Geometry.Area);
}
