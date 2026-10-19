using BaikorR.Api.Features.ConstructionSites.ChangeStatus;
using BaikorR.Api.Features.ConstructionSites.BulkDelete;
using BaikorR.Api.Features.ConstructionSites.Attachments.Delete;
using BaikorR.Api.Features.ConstructionSites.Attachments.Download;
using BaikorR.Api.Features.ConstructionSites.Attachments.List;
using BaikorR.Api.Features.ConstructionSites.Attachments.Upload;
using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Features.ConstructionSites.Create;
using BaikorR.Api.Features.ConstructionSites.Delete;
using BaikorR.Api.Features.ConstructionSites.Get;
using BaikorR.Api.Features.ConstructionSites.List;
using BaikorR.Api.Importers.Rkom;
using BaikorR.Api.Features.ConstructionSites.Update;
using FluentValidation;

namespace BaikorR.Api.Hosting;

internal static class ConstructionSiteFeatureExtensions
{
    public static WebApplicationBuilder AddConstructionSiteFeatures(this WebApplicationBuilder builder)
    {
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddScoped<ICreateConstructionSiteService, CreateConstructionSiteService>();
        builder.Services.AddScoped<IGetConstructionSiteService, GetConstructionSiteService>();
        builder.Services.AddScoped<IListConstructionSitesService, ListConstructionSitesService>();
        builder.Services.AddScoped<IUpdateConstructionSiteService, UpdateConstructionSiteService>();
        builder.Services.AddScoped<IDeleteConstructionSiteService, DeleteConstructionSiteService>();
        builder.Services.AddScoped<IBulkDeleteConstructionSitesService, BulkDeleteConstructionSitesService>();
        builder.Services.AddScoped<IRkomTrenchesImporter, RkomTrenchesImporter>();
        builder.Services.AddSingleton<RkomTrenchesShapefileParser>();
        builder.Services.AddScoped<IChangeConstructionSiteStatusService, ChangeConstructionSiteStatusService>();
        builder.Services.AddScoped<IListConstructionSiteAttachmentsService, ListConstructionSiteAttachmentsService>();
        builder.Services.AddScoped<IUploadConstructionSiteAttachmentService, UploadConstructionSiteAttachmentService>();
        builder.Services.AddScoped<IDownloadConstructionSiteAttachmentService, DownloadConstructionSiteAttachmentService>();
        builder.Services.AddScoped<IDeleteConstructionSiteAttachmentService, DeleteConstructionSiteAttachmentService>();
        builder.Services.AddScoped<IValidator<ConstructionSiteAreaRequest>, ConstructionSiteAreaRequest.Validator>();
        builder.Services.AddScoped<IValidator<ConstructionSiteContactRequest>, ConstructionSiteContactRequest.Validator>();
        builder.Services.AddScoped<IValidator<ConstructionSiteCommunicationRequest>, ConstructionSiteCommunicationRequest.Validator>();
        builder.Services.AddScoped<IValidator<UploadConstructionSiteAttachmentRequest>, UploadConstructionSiteAttachmentRequest.Validator>();
        builder.Services.AddScoped<IValidator<CreateConstructionSiteRequest>, CreateConstructionSiteRequest.Validator>();
        builder.Services.AddScoped<IValidator<UpdateConstructionSiteRequest>, UpdateConstructionSiteRequest.Validator>();
        builder.Services.AddScoped<IValidator<BulkDeleteConstructionSitesRequest>, BulkDeleteConstructionSitesRequest.Validator>();
        builder.Services.AddScoped<IValidator<RkomTrenchesImportRequest>, RkomTrenchesImportRequest.Validator>();

        return builder;
    }
}
