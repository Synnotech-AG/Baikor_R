using BaikorR.Core.Persistence.Sessions;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Delete;

public sealed class DeleteConstructionSiteService(IConstructionSitesSession session, TimeProvider timeProvider)
    : IDeleteConstructionSiteService
{
    public async Task<Result> ExecuteAsync(Guid id, CancellationToken cancellationToken)
    {
        var constructionSite = await session.GetForUpdateAsync(id, cancellationToken);
        if (constructionSite is null)
        {
            return DeleteConstructionSiteResults.NotFound();
        }

        if (constructionSite.IsDeleted)
        {
            return DeleteConstructionSiteResults.Success();
        }

        constructionSite.IsDeleted = true;
        constructionSite.UpdatedAt = timeProvider.GetUtcNow();
        return await session.SaveChangesAsync(cancellationToken)
            ? DeleteConstructionSiteResults.Success()
            : DeleteConstructionSiteResults.Conflict();
    }
}
