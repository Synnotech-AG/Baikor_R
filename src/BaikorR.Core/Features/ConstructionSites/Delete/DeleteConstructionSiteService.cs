using BaikorR.Api.Persistence.Sessions;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Delete;

public sealed class DeleteConstructionSiteService(IConstructionSitesSession session)
    : IDeleteConstructionSiteService
{
    public async Task<Result> ExecuteAsync(Guid id, CancellationToken cancellationToken)
    {
        var constructionSite = await session.GetForUpdateAsync(id, cancellationToken);
        if (constructionSite is null)
        {
            return DeleteConstructionSiteResults.NotFound();
        }

        session.Remove(constructionSite);
        return await session.SaveChangesAsync(cancellationToken)
            ? DeleteConstructionSiteResults.Success()
            : DeleteConstructionSiteResults.Conflict();
    }
}
