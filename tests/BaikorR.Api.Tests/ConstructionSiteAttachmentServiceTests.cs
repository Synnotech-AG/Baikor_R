using BaikorR.Core.Features.ConstructionSites.Attachments.Delete;
using BaikorR.Core.Features.ConstructionSites.Attachments.Download;
using BaikorR.Core.Features.ConstructionSites.Attachments.List;
using BaikorR.Core.Features.ConstructionSites.Attachments.Upload;

namespace BaikorR.Api.Tests;

public sealed class ConstructionSiteAttachmentServiceTests
{
    [Fact]
    public async Task ArchivedAttachmentsRemainReadableAndRejectUploadAndDelete()
    {
        var constructionSiteId = Guid.NewGuid();
        var session = new InMemoryConstructionSiteAttachmentsSession();
        session.AddConstructionSite(constructionSiteId);
        var uploadService = new UploadConstructionSiteAttachmentService(
            session, new UploadConstructionSiteAttachmentRequest.Validator(), TimeProvider.System);
        var request = new UploadConstructionSiteAttachmentRequest("history.pdf", "application/pdf", [1, 2, 3]);
        var upload = await uploadService.ExecuteAsync(constructionSiteId, request, CancellationToken.None);
        Assert.True(upload.IsSuccess);
        session.ArchiveConstructionSite(constructionSiteId);

        var rejectedUpload = await uploadService.ExecuteAsync(constructionSiteId, request, CancellationToken.None);
        var rejectedDelete = await new DeleteConstructionSiteAttachmentService(session, TimeProvider.System)
            .ExecuteAsync(constructionSiteId, upload.Value.Id, CancellationToken.None);
        var list = await new ListConstructionSiteAttachmentsService(session)
            .ExecuteAsync(constructionSiteId, CancellationToken.None);
        var download = await new DownloadConstructionSiteAttachmentService(session)
            .ExecuteAsync(constructionSiteId, upload.Value.Id, CancellationToken.None);

        Assert.True(rejectedUpload.IsFailed);
        Assert.True(rejectedDelete.IsFailed);
        Assert.Single(list.Value);
        Assert.Equal([1, 2, 3], download.Value.Data);
    }

    [Fact]
    public async Task UploadListDownloadAndDeleteAttachment()
    {
        var constructionSiteId = Guid.NewGuid();
        var session = new InMemoryConstructionSiteAttachmentsSession();
        session.AddConstructionSite(constructionSiteId);
        var uploadService = new UploadConstructionSiteAttachmentService(
            session,
            new UploadConstructionSiteAttachmentRequest.Validator(), TimeProvider.System);

        var upload = await uploadService.ExecuteAsync(
            constructionSiteId,
            new UploadConstructionSiteAttachmentRequest(
                "notice.pdf",
                "application/pdf",
                [1, 2, 3, 4]),
            CancellationToken.None);

        Assert.True(upload.IsSuccess);
        Assert.Equal(4, upload.Value.FileSize);

        var list = await new ListConstructionSiteAttachmentsService(session)
            .ExecuteAsync(constructionSiteId, CancellationToken.None);
        Assert.Single(list.Value);

        var download = await new DownloadConstructionSiteAttachmentService(session)
            .ExecuteAsync(constructionSiteId, upload.Value.Id, CancellationToken.None);
        Assert.Equal([1, 2, 3, 4], download.Value.Data);

        var delete = await new DeleteConstructionSiteAttachmentService(session, TimeProvider.System)
            .ExecuteAsync(constructionSiteId, upload.Value.Id, CancellationToken.None);
        Assert.True(delete.IsSuccess);

        var emptyList = await new ListConstructionSiteAttachmentsService(session)
            .ExecuteAsync(constructionSiteId, CancellationToken.None);
        Assert.Empty(emptyList.Value);
    }
}
