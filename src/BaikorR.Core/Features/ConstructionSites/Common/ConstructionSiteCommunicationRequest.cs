using FluentValidation;

namespace BaikorR.Api.Features.ConstructionSites.Common;

public sealed record ConstructionSiteCommunicationRequest(Guid? Id, string Type, string? Note)
{
    public sealed class Validator : AbstractValidator<ConstructionSiteCommunicationRequest>
    {
        public Validator()
        {
            RuleFor(request => request.Type)
                .NotEmpty().WithMessage("A communication type is required.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.CommunicationTypeRequired)
                .MaximumLength(2000).WithMessage("The communication type must not exceed 2000 characters.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.CommunicationTypeTooLong);
            RuleFor(request => request.Note)
                .MaximumLength(2000).WithMessage("The communication note must not exceed 2000 characters.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.CommunicationNoteTooLong);
        }
    }
}
