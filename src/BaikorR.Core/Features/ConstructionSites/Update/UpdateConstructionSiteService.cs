using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using FluentResults;
using FluentValidation;

namespace BaikorR.Core.Features.ConstructionSites.Update;

public sealed class UpdateConstructionSiteService(
    IConstructionSitesSession session,
    TimeProvider timeProvider,
    IValidator<UpdateConstructionSiteRequest> validator) : IUpdateConstructionSiteService
{
    public async Task<Result<ConstructionSiteResponse>> ExecuteAsync(
        Guid id,
        UpdateConstructionSiteRequest request,
        CancellationToken cancellationToken)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            return UpdateConstructionSiteResults.ValidationFailed(validationResult);
        }

        var parsedAreas = request.Areas.Select(ParsedConstructionSiteArea.Create).ToArray();
        var requestedContacts = request.Contacts ?? [];
        var requestedCommunications = request.Communications ?? [];

        var constructionSite = await session.GetForUpdateAsync(id, cancellationToken);
        if (constructionSite is null)
        {
            return UpdateConstructionSiteResults.NotFound();
        }

        var ownershipErrors = new List<IError>();
        var existingAreas = constructionSite.Areas.ToDictionary(area => area.Id);
        foreach (var parsedArea in parsedAreas.Where(area => area.Id.HasValue))
        {
            if (!existingAreas.ContainsKey(parsedArea.Id!.Value))
            {
                ownershipErrors.Add(UpdateConstructionSiteResults.AreaNotOwned(parsedArea.Name));
            }
        }

        var existingContacts = constructionSite.Contacts.ToDictionary(contact => contact.Id);
        foreach (var contact in requestedContacts.Where(contact => contact.Id.HasValue))
        {
            if (!existingContacts.ContainsKey(contact.Id!.Value))
            {
                ownershipErrors.Add(UpdateConstructionSiteResults.ContactNotOwned(contact.Id.Value));
            }
        }

        var existingCommunications = constructionSite.Communications
            .ToDictionary(communication => communication.Id);
        foreach (var communication in requestedCommunications.Where(communication => communication.Id.HasValue))
        {
            if (!existingCommunications.ContainsKey(communication.Id!.Value))
            {
                ownershipErrors.Add(
                    UpdateConstructionSiteResults.CommunicationNotOwned(communication.Id.Value));
            }
        }

        if (ownershipErrors.Count > 0)
        {
            return UpdateConstructionSiteResults.ValidationFailed(ownershipErrors);
        }

        var retainedAreaIds = parsedAreas
            .Where(area => area.Id.HasValue)
            .Select(area => area.Id!.Value)
            .ToHashSet();
        var removedAreas = constructionSite.Areas
            .Where(area => !retainedAreaIds.Contains(area.Id))
            .ToArray();
        foreach (var removedArea in removedAreas)
        {
            session.RemoveArea(constructionSite, removedArea);
        }

        foreach (var parsedArea in parsedAreas)
        {
            if (parsedArea.Id.HasValue)
            {
                var existingArea = existingAreas[parsedArea.Id.Value];
                existingArea.Name = parsedArea.Name;
                existingArea.Geometry = parsedArea.Geometry;
                continue;
            }

            var newArea = new ConstructionSiteArea
            {
                Id = Guid.NewGuid(),
                ConstructionSiteId = constructionSite.Id,
                Name = parsedArea.Name,
                Geometry = parsedArea.Geometry
            };
            session.AddArea(constructionSite, newArea);
        }

        SynchronizeContacts(session, constructionSite, existingContacts, requestedContacts);
        SynchronizeCommunications(
            session,
            constructionSite,
            existingCommunications,
            requestedCommunications);

        session.SetExpectedVersion(constructionSite, request.Version);
        constructionSite.Title = request.Title.Trim();
        constructionSite.Status = request.Status;
        constructionSite.PlannedStart = request.PlannedStart;
        constructionSite.PlannedEnd = request.PlannedEnd;
        constructionSite.Diversion = NormalizeOptional(request.Diversion);
        constructionSite.Metadata = ConstructionSiteMetadataRules.Normalize(request.Metadata);
        constructionSite.UpdatedAt = timeProvider.GetUtcNow();

        if (!await session.SaveChangesAsync(cancellationToken))
        {
            return UpdateConstructionSiteResults.Conflict();
        }

        return constructionSite.ToUpdateSuccess();
    }

    private static void SynchronizeContacts(
        IConstructionSitesSession session,
        ConstructionSite constructionSite,
        IReadOnlyDictionary<Guid, ConstructionSiteContact> existingContacts,
        IReadOnlyList<ConstructionSiteContactRequest> requestedContacts)
    {
        var retainedIds = requestedContacts
            .Where(contact => contact.Id.HasValue)
            .Select(contact => contact.Id!.Value)
            .ToHashSet();
        foreach (var removed in constructionSite.Contacts.Where(contact => !retainedIds.Contains(contact.Id)).ToArray())
        {
            session.RemoveContact(constructionSite, removed);
        }

        foreach (var (request, position) in requestedContacts.Select((contact, position) => (contact, position)))
        {
            var contact = request.Id.HasValue
                ? existingContacts[request.Id.Value]
                : new ConstructionSiteContact
                {
                    Id = Guid.NewGuid(),
                    ConstructionSiteId = constructionSite.Id
                };
            contact.Position = position;
            contact.FirstName = request.FirstName.Trim();
            contact.LastName = request.LastName.Trim();
            contact.Role = request.Role.Trim();
            contact.Email = NormalizeOptional(request.Email);
            contact.Phone1 = NormalizeOptional(request.Phone1);
            contact.Phone2 = NormalizeOptional(request.Phone2);
            if (!request.Id.HasValue)
            {
                session.AddContact(constructionSite, contact);
            }
        }
    }

    private static void SynchronizeCommunications(
        IConstructionSitesSession session,
        ConstructionSite constructionSite,
        IReadOnlyDictionary<Guid, ConstructionSiteCommunication> existingCommunications,
        IReadOnlyList<ConstructionSiteCommunicationRequest> requestedCommunications)
    {
        var retainedIds = requestedCommunications
            .Where(communication => communication.Id.HasValue)
            .Select(communication => communication.Id!.Value)
            .ToHashSet();
        foreach (var removed in constructionSite.Communications
                     .Where(communication => !retainedIds.Contains(communication.Id)).ToArray())
        {
            session.RemoveCommunication(constructionSite, removed);
        }

        foreach (var (request, position) in requestedCommunications
                     .Select((communication, position) => (communication, position)))
        {
            var communication = request.Id.HasValue
                ? existingCommunications[request.Id.Value]
                : new ConstructionSiteCommunication
                {
                    Id = Guid.NewGuid(),
                    ConstructionSiteId = constructionSite.Id
                };
            communication.Position = position;
            communication.Type = request.Type.Trim();
            communication.Note = NormalizeOptional(request.Note);
            if (!request.Id.HasValue)
            {
                session.AddCommunication(constructionSite, communication);
            }
        }
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
