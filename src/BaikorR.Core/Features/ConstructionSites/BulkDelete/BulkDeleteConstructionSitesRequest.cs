using FluentValidation;

namespace BaikorR.Api.Features.ConstructionSites.BulkDelete;

public sealed record BulkDeleteConstructionSitesRequest(IReadOnlyCollection<Guid> Ids)
{
    public sealed class Validator : AbstractValidator<BulkDeleteConstructionSitesRequest>
    {
        public Validator()
        {
            RuleFor(request => request.Ids)
                .NotEmpty()
                .WithMessage("At least one construction site must be selected.")
                .WithErrorCode(BulkDeleteConstructionSitesResults.EmptySelectionErrorKey)
                .Must(ids => ids.All(id => id != Guid.Empty) && ids.Distinct().Count() == ids.Count)
                .WithMessage("Construction site identifiers must be non-empty and unique.")
                .WithErrorCode(BulkDeleteConstructionSitesResults.InvalidIdentifiersErrorKey)
                .OverridePropertyName("ids");
        }
    }
}
