using BaikorR.Api.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Api.Persistence.Sessions;

public sealed class ConstructionSiteAttachmentDbSession(BaikorRDbContext dbContext)
    : IConstructionSiteAttachmentsSession
{
    public Task<bool> ConstructionSiteExistsAsync(
        Guid constructionSiteId,
        CancellationToken cancellationToken) =>
        dbContext.ConstructionSites.AnyAsync(site => site.Id == constructionSiteId, cancellationToken);

    public async Task<IReadOnlyList<ConstructionSiteAttachment>> ListAsync(
        Guid constructionSiteId,
        CancellationToken cancellationToken) =>
        await dbContext.ConstructionSiteAttachments
            .AsNoTracking()
            .Where(attachment => attachment.ConstructionSiteId == constructionSiteId)
            .OrderBy(attachment => attachment.FileName)
            .Select(attachment => new ConstructionSiteAttachment
            {
                Id = attachment.Id,
                ConstructionSiteId = attachment.ConstructionSiteId,
                FileName = attachment.FileName,
                FileSize = attachment.FileSize,
                MimeType = attachment.MimeType
            })
            .ToListAsync(cancellationToken);

    public Task<ConstructionSiteAttachment?> GetAsync(
        Guid constructionSiteId,
        Guid attachmentId,
        CancellationToken cancellationToken) =>
        dbContext.ConstructionSiteAttachments
            .AsNoTracking()
            .SingleOrDefaultAsync(
                attachment => attachment.ConstructionSiteId == constructionSiteId
                    && attachment.Id == attachmentId,
                cancellationToken);

    public void Add(ConstructionSiteAttachment attachment) =>
        dbContext.ConstructionSiteAttachments.Add(attachment);

    public void Remove(ConstructionSiteAttachment attachment) =>
        dbContext.ConstructionSiteAttachments.Remove(attachment);

    public async Task<bool> SaveChangesAsync(CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateConcurrencyException)
        {
            return false;
        }
    }
}
