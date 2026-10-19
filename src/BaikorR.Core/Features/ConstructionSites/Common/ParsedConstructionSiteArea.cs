using BaikorR.Api.Shared.Spatial;
using NetTopologySuite.Geometries;

namespace BaikorR.Api.Features.ConstructionSites.Common;

internal sealed record ParsedConstructionSiteArea(Guid? Id, string Name, Polygon Geometry)
{
    public static ParsedConstructionSiteArea Create(ConstructionSiteAreaRequest request)
    {
        if (!Epsg25832PolygonConverter.TryCreate(request.Geometry, out var geometry, out var error)
            || geometry is null)
        {
            throw new InvalidOperationException(error ?? "The validated area geometry could not be created.");
        }

        return new ParsedConstructionSiteArea(request.Id, request.Name.Trim(), geometry);
    }
}
