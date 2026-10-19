using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Persistence.Sessions;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.List;

public sealed class ListConstructionSitesService(IConstructionSitesSession session)
    : IListConstructionSitesService
{
    public async Task<Result<IReadOnlyList<ConstructionSiteResponse>>> ExecuteAsync(
        CancellationToken cancellationToken)
    {
        var constructionSites = await session.ListAsync(2000, cancellationToken);

        return constructionSites.ToListSuccess();
    }
}
