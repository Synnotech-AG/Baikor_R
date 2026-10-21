using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Shared.Spatial;

namespace BaikorR.Core.Features.ConstructionSites.Common;

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
