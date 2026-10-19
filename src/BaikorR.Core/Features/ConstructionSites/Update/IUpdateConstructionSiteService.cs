using BaikorR.Api.Features.ConstructionSites.Common;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Update;

public interface IUpdateConstructionSiteService
{
    Task<Result<ConstructionSiteResponse>> ExecuteAsync(
        Guid id,
        UpdateConstructionSiteRequest request,
        CancellationToken cancellationToken);
}
