using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Persistence.Entities;
using BaikorR.Api.Persistence.Sessions;
using FluentResults;
using FluentValidation;

namespace BaikorR.Api.Features.ConstructionSites.Create;

public sealed class CreateConstructionSiteService(
    IConstructionSitesSession session,
    TimeProvider timeProvider,
    IValidator<CreateConstructionSiteRequest> validator) : ICreateConstructionSiteService
{
    public async Task<Result<ConstructionSiteResponse>> ExecuteAsync(
        CreateConstructionSiteRequest request,
        CancellationToken cancellationToken)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            return CreateConstructionSiteResults.ValidationFailed(validationResult);
        }

        var parsedAreas = request.Areas.Select(ParsedConstructionSiteArea.Create).ToArray();

        var now = timeProvider.GetUtcNow();
        var constructionSiteId = Guid.NewGuid();
        var contacts = request.Contacts ?? [];
        var communications = request.Communications ?? [];
        var constructionSite = new ConstructionSite
        {
            Id = constructionSiteId,
            Title = request.Title.Trim(),
            Status = request.Status,
            PlannedStart = request.PlannedStart,
            PlannedEnd = request.PlannedEnd,
            Diversion = NormalizeOptional(request.Diversion),
            Metadata = ConstructionSiteMetadataRules.Normalize(request.Metadata),
            CreatedAt = now,
            UpdatedAt = now,
            Areas = parsedAreas.Select(area => new ConstructionSiteArea
            {
                Id = Guid.NewGuid(),
                ConstructionSiteId = constructionSiteId,
                Name = area.Name,
                Geometry = area.Geometry
            }).ToList(),
            Contacts = contacts.Select((contact, position) => new ConstructionSiteContact
            {
                Id = Guid.NewGuid(),
                ConstructionSiteId = constructionSiteId,
                Position = position,
                FirstName = contact.FirstName.Trim(),
                LastName = contact.LastName.Trim(),
                Role = contact.Role.Trim(),
                Email = NormalizeOptional(contact.Email),
                Phone1 = NormalizeOptional(contact.Phone1),
                Phone2 = NormalizeOptional(contact.Phone2)
            }).ToList(),
            Communications = communications.Select((communication, position) =>
                new ConstructionSiteCommunication
                {
                    Id = Guid.NewGuid(),
                    ConstructionSiteId = constructionSiteId,
                    Position = position,
                    Type = communication.Type.Trim(),
                    Note = NormalizeOptional(communication.Note)
                }).ToList()
        };

        session.Add(constructionSite);
        if (!await session.SaveChangesAsync(cancellationToken))
        {
            return CreateConstructionSiteResults.Conflict();
        }

        return constructionSite.ToCreateSuccess();
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
