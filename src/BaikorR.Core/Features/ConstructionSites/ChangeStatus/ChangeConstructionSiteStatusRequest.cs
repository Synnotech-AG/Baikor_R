using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Core.Features.ConstructionSites.ChangeStatus;

public sealed record ChangeConstructionSiteStatusRequest(ConstructionSiteStatus Status);
