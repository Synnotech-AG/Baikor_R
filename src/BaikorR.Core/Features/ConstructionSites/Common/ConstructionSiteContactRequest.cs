using FluentValidation;

namespace BaikorR.Core.Features.ConstructionSites.Common;

public sealed record ConstructionSiteContactRequest(
    Guid? Id,
    string FirstName,
    string LastName,
    string Role,
    string? Email,
    string? Phone1,
    string? Phone2)
{
    public sealed class Validator : AbstractValidator<ConstructionSiteContactRequest>
    {
        public Validator()
        {
            RuleFor(request => request.FirstName)
                .NotEmpty().WithMessage("A first name is required.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.ContactFirstNameRequired)
                .MaximumLength(100).WithMessage("The first name must not exceed 100 characters.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.ContactFirstNameTooLong);
            RuleFor(request => request.LastName)
                .NotEmpty().WithMessage("A last name is required.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.ContactLastNameRequired)
                .MaximumLength(100).WithMessage("The last name must not exceed 100 characters.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.ContactLastNameTooLong);
            RuleFor(request => request.Role)
                .NotEmpty().WithMessage("A role is required.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.ContactRoleRequired)
                .MaximumLength(100).WithMessage("The role must not exceed 100 characters.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.ContactRoleTooLong);
            RuleFor(request => request.Email)
                .EmailAddress().When(request => !string.IsNullOrWhiteSpace(request.Email))
                .WithMessage("The email address is invalid.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.ContactEmailInvalid)
                .MaximumLength(254);
            RuleFor(request => request.Phone1).MaximumLength(50);
            RuleFor(request => request.Phone2).MaximumLength(50);
        }
    }
}
