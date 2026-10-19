using BaikorR.Api.Features.ConstructionSites.Common;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Create;

public interface ICreateConstructionSiteService
{
    Task<Result<ConstructionSiteResponse>> ExecuteAsync(
        CreateConstructionSiteRequest request,
        CancellationToken cancellationToken);
}
