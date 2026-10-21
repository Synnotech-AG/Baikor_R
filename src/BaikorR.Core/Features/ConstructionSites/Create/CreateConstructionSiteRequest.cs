using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Persistence.Entities;
using FluentValidation;

namespace BaikorR.Core.Features.ConstructionSites.Create;

public sealed record CreateConstructionSiteRequest(
    string Title,
    ConstructionSiteStatus Status,
    DateOnly? PlannedStart,
    DateOnly? PlannedEnd,
    ConstructionSiteAreaRequest[] Areas,
    string? Diversion = null,
    ConstructionSiteContactRequest[]? Contacts = null,
    ConstructionSiteCommunicationRequest[]? Communications = null,
    IReadOnlyDictionary<string, string>? Metadata = null)
{
    public sealed class Validator : AbstractValidator<CreateConstructionSiteRequest>
    {
        public Validator(
            IValidator<ConstructionSiteAreaRequest> areaValidator,
            IValidator<ConstructionSiteContactRequest>? contactValidator = null,
            IValidator<ConstructionSiteCommunicationRequest>? communicationValidator = null)
        {
            RuleFor(request => request.Title)
                .NotEmpty()
                .WithMessage("A title is required.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.TitleRequired)
                .MaximumLength(200)
                .WithMessage("The title must not exceed 200 characters.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.TitleTooLong)
                .OverridePropertyName("title");

            RuleFor(request => request.Status)
                .IsInEnum()
                .WithMessage("The status is invalid.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.StatusInvalid)
                .OverridePropertyName("status");

            RuleFor(request => request.PlannedEnd)
                .GreaterThanOrEqualTo(request => request.PlannedStart)
                .When(request => request.PlannedStart.HasValue && request.PlannedEnd.HasValue)
                .WithMessage("The planned end must not be before the planned start.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.PlannedEndBeforeStart)
                .OverridePropertyName("plannedEnd");

            RuleFor(request => request.Areas)
                .NotNull()
                .WithMessage("Construction site areas must be provided.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.AreasRequired)
                .Must(ConstructionSiteAreaValidationRules.HaveUniqueNames)
                .WithMessage("Area names must be unique within a construction site.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.AreaNamesNotUnique)
                .Must(ConstructionSiteAreaValidationRules.HaveUniqueIdentifiers)
                .WithMessage("An area identifier may only occur once.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.AreaIdentifiersNotUnique)
                .OverridePropertyName("areas");

            RuleForEach(request => request.Areas).SetValidator(areaValidator);

            RuleFor(request => request.Diversion)
                .MaximumLength(10000)
                .WithMessage("The diversion text must not exceed 10000 characters.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.DiversionTooLong)
                .OverridePropertyName("diversion");

            RuleFor(request => request.Metadata)
                .Custom(ConstructionSiteMetadataRules.Validate);

            RuleFor(request => request.Contacts)
                .Must(ConstructionSiteCollectionValidationRules.HaveUniqueContactIdentifiers)
                .WithMessage("A contact identifier may only occur once.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.ContactIdentifiersNotUnique)
                .OverridePropertyName("contacts");

            RuleFor(request => request.Communications)
                .Must(ConstructionSiteCollectionValidationRules.HaveUniqueCommunicationIdentifiers)
                .WithMessage("A communication identifier may only occur once.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.CommunicationIdentifiersNotUnique)
                .OverridePropertyName("communications");

            if (contactValidator is not null)
            {
                RuleForEach(request => request.Contacts!).SetValidator(contactValidator)
                    .When(request => request.Contacts is not null);
            }

            if (communicationValidator is not null)
            {
                RuleForEach(request => request.Communications!).SetValidator(communicationValidator)
                    .When(request => request.Communications is not null);
            }
        }
    }
}
