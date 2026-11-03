namespace BaikorR.Core.Persistence.Entities;

public sealed class AlertRule
{
    public static readonly Guid RouteConflictRuleId = Guid.Parse("86ddf9a0-3aa1-4efd-85a6-2c8b97332e01");
    public const string RouteConflictType = "routeConflict";
    public Guid Id { get; set; } = RouteConflictRuleId;
    public string Type { get; set; } = RouteConflictType;
    public string Name { get; set; } = "Potential route conflicts";
    public bool Enabled { get; set; } = true;
    public double SensitivityMetres { get; set; } = 10;
    public ConstructionSiteStatus[] EligibleStatuses { get; set; } = [ConstructionSiteStatus.Planned, ConstructionSiteStatus.Approved, ConstructionSiteStatus.Active];
    public uint Version { get; set; }
}
