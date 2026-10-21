using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Importers.Rkom;

internal static class RkomTrenchStatusMapping
{
    public static ConstructionSiteStatus ToConstructionSiteStatus(string sourceStatus) => sourceStatus switch
    {
        "Gross planning" or "Detailed planning" or "Canceled" => ConstructionSiteStatus.Draft,
        "Assigned" => ConstructionSiteStatus.Planned,
        "Plan released" => ConstructionSiteStatus.Approved,
        "Executed" or "Documented" => ConstructionSiteStatus.Active,
        _ => ConstructionSiteStatus.Draft
    };

    public static string ToGermanLabel(string sourceStatus) => sourceStatus switch
    {
        "Gross planning" => "Grobplanung",
        "Detailed planning" => "Detailplanung",
        "Assigned" => "Zugewiesen",
        "Plan released" => "Plan freigegeben",
        "Executed" => "Ausgeführt",
        "Documented" => "Dokumentiert",
        "Canceled" => "Storniert",
        _ => sourceStatus
    };
}
