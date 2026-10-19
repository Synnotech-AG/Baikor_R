using BaikorR.Api.Shared.Spatial;
using FluentValidation;
using FluentValidation.Results;

namespace BaikorR.Api.Features.ConstructionSites.Common;

public sealed record ConstructionSiteAreaRequest(
    Guid? Id,
    string Name,
    PolygonDto Geometry)
{
    public sealed class Validator : AbstractValidator<ConstructionSiteAreaRequest>
    {
        public Validator()
        {
            RuleFor(area => area.Name)
                .NotEmpty()
                .WithMessage("An area name is required.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.AreaNameRequired)
                .MaximumLength(100)
                .WithMessage("The area name must not exceed 100 characters.")
                .WithErrorCode(ConstructionSiteValidationErrorKeys.AreaNameTooLong)
                .OverridePropertyName("name");

            RuleFor(area => area.Geometry)
                .Custom((geometry, context) =>
                {
                    if (!Epsg25832PolygonConverter.TryCreate(geometry, out _, out var error))
                    {
                        context.AddFailure(new ValidationFailure(
                            "geometry",
                            error ?? "The area geometry is invalid.")
                        {
                            ErrorCode = ConstructionSiteValidationErrorKeys.AreaGeometryInvalid
                        });
                    }
                });
        }
    }
}
