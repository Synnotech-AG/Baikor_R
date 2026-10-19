using NetTopologySuite.Geometries;
using ProjNet.CoordinateSystems.Transformations;

namespace BaikorR.Api.Importers.Rkom;

internal sealed class CoordinateTransformFilter(MathTransform transform) : ICoordinateSequenceFilter
{
    public bool Done => false;

    public bool GeometryChanged => true;

    public void Filter(CoordinateSequence sequence, int index)
    {
        var transformed = transform.Transform([sequence.GetX(index), sequence.GetY(index)]);
        sequence.SetX(index, transformed[0]);
        sequence.SetY(index, transformed[1]);
    }
}
