namespace BaikorR.Api.Importers.Rkom;

public sealed record RkomTrenchesImportResponse(
    Guid BatchId,
    string SourceProjectId,
    int FeatureCount,
    int SkippedCount,
    int CreatedCount,
    IReadOnlyDictionary<string, int> CreatedBySourceStatus,
    IReadOnlyList<string> Warnings);
