using BaikorR.Api.Importers.Rkom;
using FluentResults;

namespace BaikorR.Api.Tests;

internal sealed class RecordingRkomTrenchesImporter : IRkomTrenchesImporter
{
    public bool WasCalled { get; private set; }

    public Task<Result<RkomTrenchesImportResponse>> ExecuteAsync(
        RkomTrenchesImportRequest request,
        CancellationToken cancellationToken)
    {
        WasCalled = true;
        var response = new RkomTrenchesImportResponse(
            Guid.NewGuid(),
            "R-TEST",
            0,
            0,
            0,
            new Dictionary<string, int>(),
            []);
        return Task.FromResult(Result.Ok(response));
    }
}
