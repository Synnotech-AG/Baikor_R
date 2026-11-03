using System.Security.Cryptography;
using BaikorR.Core.Features.ConstructionSites.Delete;
using BaikorR.Core.Features.ConstructionSites.Restore;
using BaikorR.Core.Importers.Rkom;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Api.Tests;

public sealed class ConstructionSiteArchivePostgisTests
{
    [PostgisFact]
    public async Task DuplicateImportProtectionIncludesArchivedRecordsBeyondTheSiteListLimit()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        byte[] content = [1, 2, 3];
        var original = CreateSite();
        original.IsDeleted = true;
        original.Metadata["import.fileSha256"] = Convert.ToHexString(SHA256.HashData(content));
        await using (var context = database.CreateContext())
        {
            context.ConstructionSites.Add(original);
            context.ConstructionSites.AddRange(Enumerable.Range(1, 2001).Select(index => new ConstructionSite
            {
                Id = Guid.NewGuid(),
                Title = $"Newer site {index}",
                CreatedAt = original.CreatedAt.AddDays(1),
                UpdatedAt = original.UpdatedAt.AddDays(1)
            }));
            await context.SaveChangesAsync();
        }
        await using var importing = database.CreateContext();
        var importer = new RkomTrenchesImporter(new ConstructionSiteDbSession(importing), TimeProvider.System,
            new RkomTrenchesShapefileParser(), new RkomTrenchesImportRequest.Validator());

        var result = await importer.ExecuteAsync(new RkomTrenchesImportRequest("original.zip", content), default);

        Assert.True(result.IsFailed);
        Assert.Contains(result.Errors, error => error.Metadata.TryGetValue("Key", out var key)
            && Equals(key, "constructionSites.import.duplicate"));
        var persisted = await importing.ConstructionSites.SingleAsync(site => site.Id == original.Id);
        Assert.Equal(original.Id, persisted.Id);
        Assert.True(persisted.IsDeleted);
        Assert.Equal(2002, await importing.ConstructionSites.CountAsync());
        Assert.Single(await importing.ConstructionSiteAttachments.ToArrayAsync());
    }

    [PostgisFact]
    public async Task ArchiveAndRestoreRetainChildrenAndUsePersistedVersionsAcrossSessions()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var site = CreateSite();
        uint originalVersion;
        await using (var context = database.CreateContext())
        {
            context.ConstructionSites.Add(site);
            await context.SaveChangesAsync();
            originalVersion = site.Version;
        }
        await using (var context = database.CreateContext())
        {
            var result = await new DeleteConstructionSiteService(new ConstructionSiteDbSession(context), TimeProvider.System)
                .ExecuteAsync(site.Id, default);
            Assert.True(result.IsSuccess);
        }

        uint archivedVersion;
        await using (var context = database.CreateContext())
        {
            var session = new ConstructionSiteDbSession(context);
            Assert.Empty(await session.ListAsync(10, default));
            var archived = Assert.Single(await session.ListAsync(10, default, ConstructionSiteArchiveFilter.Archived));
            archivedVersion = archived.Version;
            Assert.NotEqual(originalVersion, archivedVersion);
            Assert.True(archived.IsDeleted);
            Assert.Single(archived.Contacts);
            Assert.Single(archived.Communications);
            Assert.Equal("source-123", archived.Metadata["source.id"]);
            Assert.Equal(new byte[] { 1, 2, 3 }, (await context.ConstructionSiteAttachments.SingleAsync()).Data);
            Assert.True(await context.AlertDetectionWork.AnyAsync(work => work.Kind == "site" && work.SubjectId == site.Id));

            var stale = await new RestoreConstructionSiteService(session, TimeProvider.System)
                .ExecuteAsync(site.Id, new RestoreConstructionSiteRequest(originalVersion), default);
            Assert.True(stale.IsFailed);
        }
        await using (var context = database.CreateContext())
        {
            var restored = await new RestoreConstructionSiteService(new ConstructionSiteDbSession(context), TimeProvider.System)
                .ExecuteAsync(site.Id, new RestoreConstructionSiteRequest(archivedVersion), default);
            Assert.True(restored.IsSuccess);
            Assert.False(restored.Value.IsDeleted);
            Assert.NotEqual(archivedVersion, restored.Value.Version);
            Assert.Single(restored.Value.Contacts);
            Assert.Single(restored.Value.Communications);
        }
        await using (var context = database.CreateContext())
        {
            Assert.Single(await new ConstructionSiteDbSession(context).ListAsync(10, default));
            Assert.Single(await context.ConstructionSiteAttachments.ToListAsync());
        }
    }

    [PostgisFact]
    public Task AttachmentUploadConflictsWithAConcurrentArchive() =>
        AssertAttachmentConflictWithArchive(delete: false);

    [PostgisFact]
    public Task AttachmentDeletionConflictsWithAConcurrentArchive() =>
        AssertAttachmentConflictWithArchive(delete: true);

    private static async Task AssertAttachmentConflictWithArchive(bool delete)
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        var site = CreateSite();
        await using (var context = database.CreateContext())
        {
            context.ConstructionSites.Add(site);
            await context.SaveChangesAsync();
        }
        await using var staleContext = database.CreateContext();
        var session = new ConstructionSiteAttachmentDbSession(staleContext);
        var staleSite = await session.GetConstructionSiteForUpdateAsync(site.Id, default);
        Assert.NotNull(staleSite);
        await using (var archiveContext = database.CreateContext())
        {
            var archived = await new DeleteConstructionSiteService(new ConstructionSiteDbSession(archiveContext), TimeProvider.System)
                .ExecuteAsync(site.Id, default);
            Assert.True(archived.IsSuccess);
        }
        if (delete)
        {
            var attachment = await session.GetAsync(site.Id, site.Attachments.Single().Id, default);
            Assert.NotNull(attachment);
            session.Remove(attachment);
        }
        else
        {
            session.Add(new ConstructionSiteAttachment
            {
                Id = Guid.NewGuid(), ConstructionSiteId = site.Id, FileName = "new.pdf", MimeType = "application/pdf", Data = [9], FileSize = 1
            });
        }
        session.TouchConstructionSite(staleSite, staleSite.UpdatedAt);

        Assert.False(await session.SaveChangesAsync(default));
        await using var verification = database.CreateContext();
        Assert.True((await verification.ConstructionSites.SingleAsync()).IsDeleted);
        Assert.Equal(site.Attachments.Single().Id, (await verification.ConstructionSiteAttachments.SingleAsync()).Id);
    }

    private static ConstructionSite CreateSite()
    {
        var site = new ConstructionSite
        {
            Id = Guid.NewGuid(), Title = "Preserved history", Status = ConstructionSiteStatus.Approved,
            CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            Metadata = new Dictionary<string, string> { ["source.id"] = "source-123" }
        };
        site.Contacts.Add(new ConstructionSiteContact
        {
            Id = Guid.NewGuid(), ConstructionSiteId = site.Id, FirstName = "Ada", LastName = "Lovelace", Role = "Owner"
        });
        site.Communications.Add(new ConstructionSiteCommunication
        {
            Id = Guid.NewGuid(), ConstructionSiteId = site.Id, Type = "Notice", Note = "Preserved"
        });
        site.Attachments.Add(new ConstructionSiteAttachment
        {
            Id = Guid.NewGuid(), ConstructionSiteId = site.Id, FileName = "history.pdf", MimeType = "application/pdf", Data = [1, 2, 3], FileSize = 3
        });
        return site;
    }
}
