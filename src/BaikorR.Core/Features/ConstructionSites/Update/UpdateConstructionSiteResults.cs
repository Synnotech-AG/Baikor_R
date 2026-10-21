using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Shared.Results;
using BaikorR.Core.Shared.Validation;
using FluentResults;
using FluentValidation.Results;

namespace BaikorR.Core.Features.ConstructionSites.Update;

internal static class UpdateConstructionSiteResults
{
    public const string NotFoundErrorKey = "constructionSites.update.notFound";
    public const string ConflictErrorKey = "constructionSites.update.conflict";
    public const string AreaNotOwnedErrorKey = "constructionSites.update.area.notOwned";
    public const string ContactNotOwnedErrorKey = "constructionSites.update.contact.notOwned";
    public const string CommunicationNotOwnedErrorKey = "constructionSites.update.communication.notOwned";

    public static Result<ConstructionSiteResponse> ValidationFailed(ValidationResult validationResult) =>
        Result.Fail<ConstructionSiteResponse>(validationResult.ToValidationErrors());

    public static Result<ConstructionSiteResponse> ValidationFailed(
        IEnumerable<IError> validationErrors) =>
        Result.Fail<ConstructionSiteResponse>(validationErrors);

    public static IError AreaNotOwned(string areaName) => ApiError.Validation(
        AreaNotOwnedErrorKey,
        "The area does not belong to this construction site.",
        $"areas.{areaName}.id");

    public static IError ContactNotOwned(Guid contactId) => ApiError.Validation(
        ContactNotOwnedErrorKey,
        "The contact does not belong to this construction site.",
        $"contacts.{contactId}.id");

    public static IError CommunicationNotOwned(Guid communicationId) => ApiError.Validation(
        CommunicationNotOwnedErrorKey,
        "The communication entry does not belong to this construction site.",
        $"communications.{communicationId}.id");

    public static Result<ConstructionSiteResponse> NotFound() =>
        Result.Fail<ConstructionSiteResponse>(ApiError.NotFound(
            NotFoundErrorKey,
            "The construction site could not be found."));

    public static Result<ConstructionSiteResponse> Conflict() =>
        Result.Fail<ConstructionSiteResponse>(ApiError.Conflict(
            ConflictErrorKey,
            "The construction site changed while it was being updated. Reload it and try again."));

    public static Result<ConstructionSiteResponse> ToUpdateSuccess(this ConstructionSite constructionSite) =>
        Result.Ok(ConstructionSiteResponse.Create(constructionSite));
}
