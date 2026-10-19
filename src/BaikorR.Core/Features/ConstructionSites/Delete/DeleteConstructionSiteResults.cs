using BaikorR.Api.Shared.Results;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Delete;

internal static class DeleteConstructionSiteResults
{
    public const string NotFoundErrorKey = "constructionSites.delete.notFound";
    public const string ConflictErrorKey = "constructionSites.delete.conflict";

    public static Result NotFound() => Result.Fail(ApiError.NotFound(
        NotFoundErrorKey,
        "The construction site could not be found."));

    public static Result Conflict() => Result.Fail(ApiError.Conflict(
        ConflictErrorKey,
        "The construction site changed while it was being deleted. Reload it and try again."));

    public static Result Success() => Result.Ok();
}
