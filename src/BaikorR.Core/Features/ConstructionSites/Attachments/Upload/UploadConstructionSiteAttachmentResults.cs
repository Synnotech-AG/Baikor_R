using BaikorR.Api.Features.ConstructionSites.Attachments.Common;
using BaikorR.Api.Persistence.Entities;
using BaikorR.Api.Shared.Results;
using BaikorR.Api.Shared.Validation;
using FluentResults;
using FluentValidation.Results;

namespace BaikorR.Api.Features.ConstructionSites.Attachments.Upload;

internal static class UploadConstructionSiteAttachmentResults
{
    public static Result<ConstructionSiteAttachmentResponse> ValidationFailed(ValidationResult result) =>
        Result.Fail<ConstructionSiteAttachmentResponse>(result.ToValidationErrors());

    public static Result<ConstructionSiteAttachmentResponse> NotFound() =>
        Result.Fail<ConstructionSiteAttachmentResponse>(ApiError.NotFound(
            "constructionSites.attachments.siteNotFound",
            "The construction site could not be found."));

    public static Result<ConstructionSiteAttachmentResponse> Conflict() =>
        Result.Fail<ConstructionSiteAttachmentResponse>(ApiError.Conflict(
            "constructionSites.attachments.upload.conflict",
            "The attachment could not be stored because the construction site changed."));

    public static Result<ConstructionSiteAttachmentResponse> Success(ConstructionSiteAttachment attachment) =>
        Result.Ok(ConstructionSiteAttachmentResponse.Create(attachment));
}
