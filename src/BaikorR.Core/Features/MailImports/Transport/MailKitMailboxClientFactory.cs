using MailKit;
using MailKit.Net.Imap;
using MailKit.Search;
using MailKit.Security;
using MimeKit;

namespace BaikorR.Core.Features.MailImports.Transport;

public sealed class MailKitMailboxClientFactory : IMailboxClientFactory
{
    private readonly Func<ImapClient> createClient;

    public MailKitMailboxClientFactory() : this(() => new ImapClient()) { }

    internal MailKitMailboxClientFactory(Func<ImapClient> createClient) => this.createClient = createClient;

    public async Task<IMailboxClient> ConnectAsync(MailboxConnection connection, CancellationToken cancellationToken)
    {
        var client = createClient();
        client.Timeout = 30_000;
        try
        {
            var security = connection.Security switch
            {
                "sslOnConnect" => SecureSocketOptions.SslOnConnect,
                "startTls" => SecureSocketOptions.StartTls,
                _ => throw new MailImportTransportException("mailImport.invalidSecurity", false)
            };
            await client.ConnectAsync(connection.Host, connection.Port, security, cancellationToken);
            await client.AuthenticateAsync(connection.Username, connection.Password, cancellationToken);
            var folder = string.Equals(connection.Folder, "INBOX", StringComparison.OrdinalIgnoreCase)
                ? client.Inbox : await client.GetFolderAsync(connection.Folder, cancellationToken);
            await folder.OpenAsync(FolderAccess.ReadOnly, cancellationToken);
            uint nextUid;
            if (folder.UidNext is { } next)
            {
                nextUid = next.Id;
            }
            else if (folder.Count == 0)
            {
                nextUid = 1;
            }
            else
            {
                var last = await folder.FetchAsync(folder.Count - 1, folder.Count - 1, MessageSummaryItems.UniqueId, cancellationToken);
                var highest = last.Max(summary => summary.UniqueId.Id);
                if (highest == uint.MaxValue)
                {
                    throw new MailImportTransportException("mailImport.uidExhausted", false);
                }
                nextUid = highest + 1;
            }
            return new MailboxClient(client, folder, nextUid);
        }
        catch (OperationCanceledException)
        {
            client.Dispose();
            throw;
        }
        catch (MailImportTransportException)
        {
            client.Dispose();
            throw;
        }
        catch (AuthenticationException)
        {
            client.Dispose();
            throw new MailImportTransportException("mailImport.authenticationFailed", false);
        }
        catch (Exception exception) when (exception is IOException or ImapCommandException or ImapProtocolException or System.Net.Sockets.SocketException or System.Security.Authentication.AuthenticationException or FolderNotFoundException or SslHandshakeException or NotSupportedException)
        {
            client.Dispose();
            throw new MailImportTransportException("mailImport.connectionFailed", exception is not SslHandshakeException and not FolderNotFoundException and not NotSupportedException);
        }
    }

    private sealed class MailboxClient(ImapClient client, IMailFolder folder, uint nextUid) : IMailboxClient
    {
        private const int MaxDecodedBytes = 25 * 1024 * 1024;
        // Quoted-printable binary parts can expand to roughly three times their
        // decoded size, plus soft line breaks. Keep both representations bounded.
        private const int MaxEncodedBytes = 80 * 1024 * 1024;
        public uint UidValidity => folder.UidValidity;
        public uint NextUid => nextUid;

        public async Task<MailboxBatch> ReadBatchAsync(uint firstUid, int maximumMessages, CancellationToken cancellationToken)
        {
            ArgumentOutOfRangeException.ThrowIfZero(firstUid);
            ArgumentOutOfRangeException.ThrowIfLessThan(maximumMessages, 1);
            if (firstUid >= NextUid)
            {
                return new(UidValidity, firstUid, []);
            }
            // Bound UID windows, not just returned messages: sparse/huge mailboxes cannot
            // force an unbounded SEARCH result or a full mailbox body download.
            var upper = (uint)Math.Min((ulong)NextUid - 1, (ulong)firstUid + 511);
            try
            {
                var found = await folder.SearchAsync(SearchQuery.Uids(new UniqueIdRange(new UniqueId(firstUid), new UniqueId(upper))), cancellationToken);
                var candidates = found.Where(uid => uid.Id >= firstUid && uid.Id <= upper).OrderBy(uid => uid.Id).ToArray();
                var selected = candidates.Take(Math.Min(maximumMessages, 100)).ToArray();
                var cursor = selected.Length < candidates.Length ? selected[^1].Id + 1 : upper + 1;
                if (selected.Length == 0)
                {
                    return new(UidValidity, cursor, []);
                }
                var summaries = await folder.FetchAsync(selected, MessageSummaryItems.UniqueId | MessageSummaryItems.BodyStructure, cancellationToken);
                var messages = summaries.Where(summary => selected.Contains(summary.UniqueId))
                    .OrderBy(summary => summary.UniqueId.Id)
                    .Select(summary => new MailboxMessage(summary.UniqueId.Id, summary.BodyParts
                        .Where(IsZip).Select(part => new MailboxAttachment(part.PartSpecifier, SafeName(part.FileName!), part.Octets)).ToArray()))
                    .ToArray();
                return new(UidValidity, cursor, messages);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception exception) when (exception is IOException or ImapCommandException or ImapProtocolException)
            {
                throw new MailImportTransportException("mailImport.connectionFailed", true);
            }
        }

        public async Task<byte[]> ReadAttachmentAsync(uint uid, string partId, CancellationToken cancellationToken)
        {
            try
            {
                var summaries = await folder.FetchAsync(new[] { new UniqueId(uid) }, MessageSummaryItems.UniqueId | MessageSummaryItems.BodyStructure, cancellationToken);
                var part = summaries.SingleOrDefault(summary => summary.UniqueId.Id == uid)?.BodyParts
                    .FirstOrDefault(part => part.PartSpecifier == partId && IsZip(part));
                if (part is null)
                {
                    throw new MailImportTransportException("mailImport.attachmentMissing", false);
                }
                if (part.Octets > MaxEncodedBytes)
                {
                    throw new MailImportTransportException("mailImport.attachmentTooLarge", false);
                }
                // A bounded partial BODY.PEEK request also protects against dishonest size
                // metadata. MailKit never marks messages Seen when fetching these parts.
                await using var encoded = await folder.GetStreamAsync(new UniqueId(uid), partId, 0, MaxEncodedBytes + 1L, cancellationToken);
                if (encoded.Length > MaxEncodedBytes)
                {
                    throw new MailImportTransportException("mailImport.attachmentTooLarge", false);
                }
                var encoding = part.ContentTransferEncoding?.ToLowerInvariant() switch
                {
                    "base64" => ContentEncoding.Base64,
                    "quoted-printable" => ContentEncoding.QuotedPrintable,
                    "7bit" => ContentEncoding.SevenBit,
                    "8bit" => ContentEncoding.EightBit,
                    "binary" or null => ContentEncoding.Binary,
                    _ => throw new MailImportTransportException("mailImport.attachmentInvalid", false)
                };
                using var content = new MimeContent(encoded, encoding);
                using var decoded = new LimitedMemoryStream(MaxDecodedBytes);
                await content.DecodeToAsync(decoded, cancellationToken);
                if (decoded.Length == 0)
                {
                    throw new MailImportTransportException("mailImport.attachmentInvalid", false);
                }
                return decoded.ToArray();
            }
            catch (OperationCanceledException) { throw; }
            catch (MessageNotFoundException)
            {
                throw new MailImportTransportException("mailImport.attachmentMissing", false);
            }
            catch (FormatException)
            {
                throw new MailImportTransportException("mailImport.attachmentInvalid", false);
            }
            catch (Exception exception) when (exception is IOException or ImapCommandException or ImapProtocolException)
            {
                throw new MailImportTransportException("mailImport.connectionFailed", true);
            }
        }

        private static bool IsZip(BodyPartBasic part) => part.FileName?.EndsWith(".zip", StringComparison.OrdinalIgnoreCase) == true;
        private static string SafeName(string fileName) => fileName.Replace('\\', '/').Split('/')[^1];

        public ValueTask DisposeAsync()
        {
            // Disconnect without LOGOUT avoids waiting on a dead server during cancellation;
            // the read-only session has no mailbox changes to commit.
            client.Dispose();
            return ValueTask.CompletedTask;
        }
    }

    private sealed class LimitedMemoryStream(int limit) : MemoryStream
    {
        public override void Write(byte[] buffer, int offset, int count)
        {
            CheckLimit(count);
            base.Write(buffer, offset, count);
        }
        public override void Write(ReadOnlySpan<byte> buffer)
        {
            CheckLimit(buffer.Length);
            base.Write(buffer);
        }
        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
        {
            CheckLimit(count);
            return base.WriteAsync(buffer, offset, count, cancellationToken);
        }
        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            CheckLimit(buffer.Length);
            return base.WriteAsync(buffer, cancellationToken);
        }
        private void CheckLimit(int count)
        {
            if (Length + count > limit)
            {
                throw new MailImportTransportException("mailImport.attachmentTooLarge", false);
            }
        }
    }
}
