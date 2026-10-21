using NetTopologySuite.Geometries;

namespace BaikorR.Core.Persistence.Entities;

public sealed class ConstructionSiteArea
{
    public Guid Id { get; set; }

    public Guid ConstructionSiteId { get; set; }

    public ConstructionSite ConstructionSite { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public Polygon Geometry { get; set; } = null!;
}
