namespace BaikorR.Api.Importers.Rkom;

internal sealed record ParsedRkomTrenches(
    string SourceProjectId,
    int FeatureCount,
    int SkippedCount,
    IReadOnlyList<RkomTrenchComponent> Components);
