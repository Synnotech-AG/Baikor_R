using FluentValidation;

namespace BaikorR.Core.Importers.Rkom;

public sealed record RkomTrenchesImportRequest(
    string FileName,
    byte[] Content,
    double BufferMetres = 1)
{
    public sealed class Validator : AbstractValidator<RkomTrenchesImportRequest>
    {
        private const int MaximumFileSize = 25 * 1024 * 1024;

        public Validator()
        {
            RuleFor(request => request.FileName)
                .NotEmpty()
                .WithErrorCode(RkomTrenchesImportResults.FileRequiredErrorKey)
                .Must(fileName => string.Equals(Path.GetExtension(fileName), ".zip", StringComparison.OrdinalIgnoreCase))
                .WithMessage("A ZIP archive is required.")
                .WithErrorCode(RkomTrenchesImportResults.FileTypeInvalidErrorKey)
                .OverridePropertyName("file");

            RuleFor(request => request.Content)
                .NotEmpty()
                .WithMessage("The import file is empty.")
                .WithErrorCode(RkomTrenchesImportResults.FileRequiredErrorKey)
                .Must(content => content.Length <= MaximumFileSize)
                .WithMessage("The import file must not exceed 25 MB.")
                .WithErrorCode(RkomTrenchesImportResults.FileTooLargeErrorKey)
                .OverridePropertyName("file");

            RuleFor(request => request.BufferMetres)
                .InclusiveBetween(0.1, 20)
                .WithMessage("The area buffer must be between 0.1 and 20 metres.")
                .WithErrorCode(RkomTrenchesImportResults.BufferInvalidErrorKey)
                .OverridePropertyName("bufferMetres");
        }
    }
}
