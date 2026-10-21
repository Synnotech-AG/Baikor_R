using BaikorR.Core.Features.ConstructionSites.Attachments.Common;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Shared.Results;
using BaikorR.Core.Shared.Validation;
using FluentResults;
using FluentValidation.Results;

namespace BaikorR.Core.Features.ConstructionSites.Attachments.Upload;

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
