namespace BaikorR.Core.Persistence.Entities;

public sealed class RouteDefinition
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? SourceId { get; set; }
    public string? ExternalRouteId { get; set; }
    public bool IsSuppressed { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public uint Version { get; set; }
    public List<RoutePath> Paths { get; set; } = [];
}
