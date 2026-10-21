using BaikorR.Core.Persistence.Sessions;
using FluentResults;
using FluentValidation;

namespace BaikorR.Core.Features.ConstructionSites.BulkDelete;

public sealed class BulkDeleteConstructionSitesService(
    IConstructionSitesSession session,
    IValidator<BulkDeleteConstructionSitesRequest> validator) : IBulkDeleteConstructionSitesService
{
    public async Task<Result<BulkDeleteConstructionSitesResponse>> ExecuteAsync(
        BulkDeleteConstructionSitesRequest request,
        CancellationToken cancellationToken)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            return BulkDeleteConstructionSitesResults.ValidationFailed(validationResult);
        }

        var constructionSites = await session.GetForUpdateAsync(request.Ids, cancellationToken);
        if (constructionSites.Count != request.Ids.Count)
        {
            return BulkDeleteConstructionSitesResults.NotFound();
        }

        session.RemoveRange(constructionSites);
        return await session.SaveChangesAsync(cancellationToken)
            ? BulkDeleteConstructionSitesResults.Success(constructionSites.Count)
            : BulkDeleteConstructionSitesResults.Conflict();
    }
}
