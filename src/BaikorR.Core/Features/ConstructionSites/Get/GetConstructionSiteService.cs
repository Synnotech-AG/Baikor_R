using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Persistence.Sessions;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Get;

public sealed class GetConstructionSiteService(IConstructionSitesSession session) : IGetConstructionSiteService
{
    public async Task<Result<ConstructionSiteResponse>> ExecuteAsync(
        Guid id,
        CancellationToken cancellationToken)
    {
        var constructionSite = await session.GetAsync(id, cancellationToken);

        return constructionSite is null
            ? GetConstructionSiteResults.NotFound()
            : constructionSite.ToGetSuccess();
    }
}
