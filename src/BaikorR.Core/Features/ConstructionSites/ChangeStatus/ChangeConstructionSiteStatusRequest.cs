using BaikorR.Api.Persistence.Entities;

namespace BaikorR.Api.Features.ConstructionSites.ChangeStatus;

public sealed record ChangeConstructionSiteStatusRequest(ConstructionSiteStatus Status);
