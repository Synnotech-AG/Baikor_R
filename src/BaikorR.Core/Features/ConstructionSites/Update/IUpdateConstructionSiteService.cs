using BaikorR.Core.Features.ConstructionSites.Common;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Update;

public interface IUpdateConstructionSiteService
{
    Task<Result<ConstructionSiteResponse>> ExecuteAsync(
        Guid id,
        UpdateConstructionSiteRequest request,
        CancellationToken cancellationToken);
}
