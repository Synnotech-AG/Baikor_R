namespace BaikorR.Core.Persistence.Entities;

public sealed class RoutePath
{
    public Guid Id { get; set; }
    public Guid RouteDefinitionId { get; set; }
    public RouteDefinition RouteDefinition { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? SourceId { get; set; }
    public string? ExternalRouteId { get; set; }
    public string? ExternalShapeId { get; set; }
    public bool IsSuppressed { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public uint Version { get; set; }
    public List<RoutePathVersion> Versions { get; set; } = [];
}
