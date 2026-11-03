using System.Text.Json.Serialization;

namespace BaikorR.Core.Features.ConstructionSites.Restore;

public sealed record RestoreConstructionSiteRequest([property: JsonRequired] uint Version);
