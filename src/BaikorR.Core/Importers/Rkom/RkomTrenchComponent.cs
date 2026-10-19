using NetTopologySuite.Geometries;

namespace BaikorR.Api.Importers.Rkom;

internal sealed record RkomTrenchComponent(
    string SourceStatus,
    string SourceType,
    string SourceExternalId,
    double SourceLengthMetres,
    IReadOnlyList<int> SourceIndexes,
    IReadOnlyList<Polygon> Areas,
    Envelope Envelope);
