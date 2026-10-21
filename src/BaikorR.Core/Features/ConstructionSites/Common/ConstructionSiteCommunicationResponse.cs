using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Features.ConstructionSites.Common;

public sealed record ConstructionSiteCommunicationResponse(Guid Id, string Type, string? Note)
{
    public static ConstructionSiteCommunicationResponse Create(ConstructionSiteCommunication communication) =>
        new(communication.Id, communication.Type, communication.Note);
}
