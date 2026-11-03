using BaikorR.Core.Features.Routes.Manage;
using BaikorR.Core.Importers.Gtfs;
using BaikorR.Core.Persistence.Sessions;

namespace BaikorR.Host.Hosting;

internal static class RouteFeatureExtensions
{
    public static WebApplicationBuilder AddRouteFeatures(this WebApplicationBuilder builder)
    {
        builder.Services.AddScoped<IRoutePathsSession, RoutePathsDbSession>();
        builder.Services.AddScoped<IRoutePathsService, RoutePathsService>();
        builder.Services.AddScoped<IGtfsRoutesImporter, GtfsRoutesImporter>();
        builder.Services.AddSingleton<GtfsScheduleParser>();
        return builder;
    }
}
