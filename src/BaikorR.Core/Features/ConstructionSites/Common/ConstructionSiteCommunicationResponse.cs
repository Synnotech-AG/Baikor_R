using BaikorR.Api.Persistence.Entities;

namespace BaikorR.Api.Features.ConstructionSites.Common;

public sealed record ConstructionSiteCommunicationResponse(Guid Id, string Type, string? Note)
{
    public static ConstructionSiteCommunicationResponse Create(ConstructionSiteCommunication communication) =>
        new(communication.Id, communication.Type, communication.Note);
}
