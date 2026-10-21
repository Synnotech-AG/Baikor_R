using NetTopologySuite.Geometries;

namespace BaikorR.Core.Importers.Rkom;

internal sealed record RkomTrenchSourceFeature(
    int SourceIndex,
    string SourceStatus,
    string SourceType,
    string SourceExternalId,
    double SourceLengthMetres,
    Geometry Geometry);
