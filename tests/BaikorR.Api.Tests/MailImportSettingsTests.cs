using BaikorR.Core.Features.MailImports;
using BaikorR.Core.Persistence.Entities;

namespace BaikorR.Api.Tests;

public sealed class MailImportSettingsTests
{
    [Fact]
    public async Task FirstEnableCapturesNextUidWithoutFetchingOldMail()
    {
        var store = new SettingsStore();
        var transport = new MailboxFactory();
        var service = new MailImportService(store, transport, new Protector(), TimeProvider.System);
        var result = await service.SaveAsync(Request(), CancellationToken.None);
        Assert.True(result.IsSuccess);
        Assert.Equal(42, store.Configuration.NextUid);
        Assert.Equal(7, store.Configuration.UidValidity);
        Assert.NotEqual(Guid.Empty, store.Configuration.Generation);
        Assert.Equal(0, transport.ReadCount);
        Assert.DoesNotContain("password", System.Text.Json.JsonSerializer.Serialize(result.Value));
    }

    [Fact]
    public async Task ConnectionFailureDoesNotEnableOrReplaceSavedConfiguration()
    {
        var store = new SettingsStore();
        var transport = new MailboxFactory { Fails = true };
        var result = await new MailImportService(store, transport, new Protector(), TimeProvider.System)
            .SaveAsync(Request(), CancellationToken.None);
        Assert.True(result.IsFailed);
        Assert.False(store.Configuration.Enabled);
        Assert.Equal(0, store.Saves);
    }

    [Fact]
    public async Task PauseAndResumePreserveCursorAndGeneration()
    {
        var store = new SettingsStore();
        var factory = new MailboxFactory();
        var service = new MailImportService(store, factory, new Protector(), TimeProvider.System);
        Assert.True((await service.SaveAsync(Request(), CancellationToken.None)).IsSuccess);
        var generation = store.Configuration.Generation;
        store.Configuration.NextUid = 99;
        Assert.True((await service.SaveAsync(Request() with { Enabled = false, Version = 1, Password = null }, CancellationToken.None)).IsSuccess);
        Assert.True((await service.SaveAsync(Request() with { Version = 2, Password = "" }, CancellationToken.None)).IsSuccess);
        Assert.Equal(generation, store.Configuration.Generation);
        Assert.Equal(99, store.Configuration.NextUid);
        Assert.Equal(1, factory.ConnectCount);
    }

    [Fact]
    public async Task SourceCannotChangeWhileEnabled()
    {
        var store = new SettingsStore();
        var service = new MailImportService(store, new MailboxFactory(), new Protector(), TimeProvider.System);
        await service.SaveAsync(Request(), CancellationToken.None);
        var result = await service.SaveAsync(Request() with { Host = "other.example", Version = 1 }, CancellationToken.None);
        Assert.True(result.IsFailed);
        Assert.Equal("imap.example", store.Configuration.Host);
    }

    [Fact]
    public async Task SavedPasswordRequiresExplicitTestConsent()
    {
        var store = new SettingsStore();
        var factory = new MailboxFactory();
        var service = new MailImportService(store, factory, new Protector(), TimeProvider.System);
        await service.SaveAsync(Request(), CancellationToken.None);
        var test = new MailImportTestRequest("imap.example", 993, "sslOnConnect", "user", "INBOX");
        Assert.True((await service.TestAsync(test, CancellationToken.None)).IsFailed);
        Assert.True((await service.TestAsync(test with { UseSavedPassword = true }, CancellationToken.None)).IsSuccess);
        Assert.Equal(1, store.Saves);
    }

    [Theory]
    [InlineData("other.example", 993, "sslOnConnect", "user")]
    [InlineData("imap.example", 999, "sslOnConnect", "user")]
    [InlineData("imap.example", 993, "startTls", "user")]
    [InlineData("imap.example", 993, "sslOnConnect", "User")]
    public async Task SavedPasswordCannotFollowAnEditedConnection(string host, int port, string security, string username)
    {
        var store = new SettingsStore();
        var factory = new MailboxFactory();
        var service = new MailImportService(store, factory, new Protector(), TimeProvider.System);
        Assert.True((await service.SaveAsync(Request() with { Enabled = false }, default)).IsSuccess);

        var test = new MailImportTestRequest(host, port, security, username, "INBOX", UseSavedPassword: true);
        Assert.True((await service.TestAsync(test, default)).IsFailed);
        var change = Request() with
        {
            Host = host, Port = port, Security = security, Username = username, Password = null, Version = 1
        };
        Assert.True((await service.SaveAsync(change with { Enabled = false }, default)).IsFailed);
        Assert.True((await service.SaveAsync(change, default)).IsFailed);
        Assert.Equal(0, factory.ConnectCount);
        Assert.Equal(1, store.Saves);

        Assert.True((await service.TestAsync(test with { Password = "replacement" }, default)).IsSuccess);
        Assert.True((await service.SaveAsync(change with { Password = "replacement" }, default)).IsSuccess);
        Assert.Equal("replacement", new Protector().Unprotect(store.Configuration.EncryptedPassword!));
    }

    [Fact]
    public async Task FolderChangeKeepsThePasswordAndExplicitClearAllowsNewDestinationWhilePaused()
    {
        var store = new SettingsStore();
        var factory = new MailboxFactory();
        var service = new MailImportService(store, factory, new Protector(), TimeProvider.System);
        Assert.True((await service.SaveAsync(Request() with { Enabled = false }, default)).IsSuccess);
        var folder = Request() with { Enabled = false, Host = "IMAP.EXAMPLE", Folder = "new-folder", Version = 1, Password = "" };
        Assert.True((await service.SaveAsync(folder, default)).IsSuccess);
        Assert.NotNull(store.Configuration.EncryptedPassword);
        Assert.True((await service.TestAsync(new("imap.example", 993, "sslOnConnect", "user", "INBOX", UseSavedPassword: true), default)).IsSuccess);

        Assert.True((await service.SaveAsync(folder with { Host = "other.example", Version = 2, ClearPassword = true }, default)).IsSuccess);
        Assert.Null(store.Configuration.EncryptedPassword);
    }

    [Fact]
    public async Task MissingEncryptionKeyRejectsEnableWithoutAConnection()
    {
        var store = new SettingsStore();
        var factory = new MailboxFactory();
        var service = new MailImportService(store, factory, new Protector { IsConfigured = false }, TimeProvider.System);
        Assert.True((await service.SaveAsync(Request(), CancellationToken.None)).IsFailed);
        Assert.Equal(0, factory.ConnectCount);
    }

    [Fact]
    public async Task PasswordLimitAppliesToUtf8BytesBeforeEncryption()
    {
        var store = new SettingsStore();
        var factory = new MailboxFactory();
        var service = new MailImportService(store, factory, new Protector(), TimeProvider.System);
        Assert.True((await service.SaveAsync(Request() with { Password = new string('\u20ac', 2000) }, default)).IsFailed);
        Assert.Equal(0, factory.ConnectCount);
        Assert.Equal(0, store.Saves);
    }

    private static MailImportSettingsRequest Request() => new(true, "imap.example", 993, "sslOnConnect", "user", "INBOX", 60, 1, 0, "password");

    private sealed class Protector : IMailImportSecretProtector
    {
        public bool IsConfigured { get; init; } = true;
        public string Protect(string plaintext) => "encrypted:" + plaintext;
        public string Unprotect(string ciphertext) => ciphertext[10..];
    }

    private sealed class MailboxFactory : IMailboxClientFactory, IMailboxClient
    {
        public bool Fails { get; init; }
        public int ConnectCount { get; private set; }
        public int ReadCount { get; private set; }
        public uint UidValidity => 7;
        public uint NextUid => 42;
        public Task<IMailboxClient> ConnectAsync(MailboxConnection connection, CancellationToken cancellationToken)
        {
            ConnectCount++;
            return Fails ? throw new MailImportTransportException("mailImport.connectionFailed", true) : Task.FromResult<IMailboxClient>(this);
        }
        public Task<MailboxBatch> ReadBatchAsync(uint firstUid, int maximumMessages, CancellationToken cancellationToken)
        {
            ReadCount++;
            throw new InvalidOperationException("Baseline must not fetch old mail.");
        }
        public Task<byte[]> ReadAttachmentAsync(uint uid, string partId, CancellationToken cancellationToken) => throw new NotImplementedException();
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class SettingsStore : IMailImportStore
    {
        public MailImportConfiguration Configuration { get; private set; } = new();
        public int Saves { get; private set; }
        public Task<MailImportConfiguration> GetAsync(CancellationToken cancellationToken) => Task.FromResult(Configuration);
        public Task<bool> SaveConfigurationAsync(MailImportConfiguration configuration, long expectedVersion, bool invalidatePending, CancellationToken cancellationToken)
        {
            if (Configuration.Version != expectedVersion) { return Task.FromResult(false); }
            configuration.Version = expectedVersion + 1;
            Configuration = configuration;
            Saves++;
            return Task.FromResult(true);
        }
        public Task<MailImportStatusResponse> StatusAsync(CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<MailImportHistoryResponse> HistoryAsync(int page, int pageSize, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<bool> ScheduleCheckAsync(CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<bool> RetryAsync(Guid id, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<MailImportLease?> AcquireLeaseAsync(Guid owner, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<bool> RenewLeaseAsync(MailImportLease lease, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task ReleaseLeaseAsync(MailImportLease lease, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<bool> DiscoverAsync(MailImportLease lease, MailboxBatch batch, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<MailImportWorkItem?> TakeWorkAsync(MailImportLease lease, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<bool> HasMailReceiptAsync(string sha256, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<bool> SetWorkHashAsync(MailImportLease lease, Guid id, string sha256, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task CompleteWorkAsync(MailImportLease lease, Guid id, string state, int? createdCount, string[] warnings, string? errorKey, bool transient, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task RecordErrorAsync(MailImportLease lease, string errorKey, bool halt, CancellationToken cancellationToken) => throw new NotImplementedException();
    }
}
