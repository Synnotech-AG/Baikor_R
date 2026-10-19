using BaikorR.Api.Features.ConstructionSites.Common;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Get;

public interface IGetConstructionSiteService
{
    Task<Result<ConstructionSiteResponse>> ExecuteAsync(Guid id, CancellationToken cancellationToken);
}
