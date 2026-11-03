namespace BaikorR.Core.Persistence.Entities;

public sealed class RouteOperatingPeriod
{
    public Guid Id { get; set; }
    public Guid RoutePathVersionId { get; set; }
    public RoutePathVersion RoutePathVersion { get; set; } = null!;
    public DateOnly From { get; set; }
    public DateOnly To { get; set; }
}
