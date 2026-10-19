using FluentValidation;

namespace BaikorR.Api.Features.ConstructionSites.Attachments.Upload;

public sealed record UploadConstructionSiteAttachmentRequest(
    string FileName,
    string? MimeType,
    byte[] Data)
{
    public const int MaximumFileSizeBytes = 25 * 1024 * 1024;

    public sealed class Validator : AbstractValidator<UploadConstructionSiteAttachmentRequest>
    {
        public Validator()
        {
            RuleFor(request => request.FileName)
                .NotEmpty().WithMessage("A file name is required.")
                .WithErrorCode("constructionSites.attachments.validation.fileName.required")
                .MaximumLength(255).WithMessage("The file name must not exceed 255 characters.")
                .WithErrorCode("constructionSites.attachments.validation.fileName.tooLong");
            RuleFor(request => request.MimeType)
                .MaximumLength(255).WithMessage("The MIME type must not exceed 255 characters.")
                .WithErrorCode("constructionSites.attachments.validation.mimeType.tooLong");
            RuleFor(request => request.Data)
                .NotEmpty().WithMessage("The attachment must not be empty.")
                .WithErrorCode("constructionSites.attachments.validation.empty")
                .Must(data => data.Length <= MaximumFileSizeBytes)
                .WithMessage("The attachment must not exceed 25 MB.")
                .WithErrorCode("constructionSites.attachments.validation.tooLarge");
        }
    }
}
