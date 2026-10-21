using BaikorR.Core.Features.ConstructionSites.Common;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Create;

public interface ICreateConstructionSiteService
{
    Task<Result<ConstructionSiteResponse>> ExecuteAsync(
        CreateConstructionSiteRequest request,
        CancellationToken cancellationToken);
}
