using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using BaikorR.Core.Features.MailImports;
using BaikorR.Core.Features.MailImports.Transport;
using MailKit.Net.Imap;

namespace BaikorR.Api.Tests;

public sealed class MailKitMailboxClientTests
{
    [Fact]
    public async Task ReadsOnlyNewZipPartsWithPeekAndLeavesMailboxUnchanged()
    {
        await using var fixture = new TlsImapFixture();
        var factory = fixture.CreateTrustedFactory();
        await using var mailbox = await factory.ConnectAsync(fixture.Connection, CancellationToken.None);
        Assert.Equal(71u, mailbox.UidValidity);
        Assert.Equal(3u, mailbox.NextUid);
        var batch = await mailbox.ReadBatchAsync(2, 25, CancellationToken.None);
        Assert.Equal(3u, batch.NextUid);
        var message = Assert.Single(batch.Messages);
        Assert.Equal(2u, message.Uid);
        var attachment = Assert.Single(message.Attachments);
        Assert.Equal("import.ZIP", attachment.FileName);
        Assert.Equal("2", attachment.PartId);
        Assert.Equal(fixture.Archive, await mailbox.ReadAttachmentAsync(2, "2", CancellationToken.None));
        Assert.Contains(fixture.Commands, line => line.Contains("EXAMINE INBOX", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(fixture.Commands, line => line.Contains("BODY.PEEK[2]<0.", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(fixture.Commands, line => line.Contains("BODY.PEEK[1]", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(fixture.Commands, line => line.Contains("STORE", StringComparison.OrdinalIgnoreCase) || line.Contains("EXPUNGE", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task FiltersLowerUidReturnedByServerForEmptyRange()
    {
        await using var fixture = new TlsImapFixture { ReturnLowerUid = true };
        await using var mailbox = await fixture.CreateTrustedFactory().ConnectAsync(fixture.Connection, CancellationToken.None);
        var batch = await mailbox.ReadBatchAsync(2, 25, CancellationToken.None);
        Assert.Empty(batch.Messages);
        Assert.Equal(3u, batch.NextUid);
        Assert.DoesNotContain(fixture.Commands, line => line.Contains("BODYSTRUCTURE", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task RejectsUntrustedTlsCertificate()
    {
        await using var fixture = new TlsImapFixture();
        await Assert.ThrowsAsync<MailImportTransportException>(() => new MailKitMailboxClientFactory().ConnectAsync(fixture.Connection, CancellationToken.None));
    }

    [Fact]
    public async Task OversizedPartIsRejectedBeforeDownloadingIt()
    {
        await using var fixture = new TlsImapFixture { Oversized = true };
        await using var mailbox = await fixture.CreateTrustedFactory().ConnectAsync(fixture.Connection, CancellationToken.None);
        await Assert.ThrowsAsync<MailImportTransportException>(() => mailbox.ReadAttachmentAsync(2, "2", CancellationToken.None));
        Assert.DoesNotContain(fixture.Commands, line => line.Contains("BODY.PEEK[2]", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task DecodedAttachmentLimitIsEnforcedEvenWhenEncodedSizeIsAllowed()
    {
        await using var fixture = new TlsImapFixture { Archive = new byte[26 * 1024 * 1024] };
        await using var mailbox = await fixture.CreateTrustedFactory().ConnectAsync(fixture.Connection, CancellationToken.None);
        var error = await Assert.ThrowsAsync<MailImportTransportException>(() => mailbox.ReadAttachmentAsync(2, "2", CancellationToken.None));
        Assert.Equal("mailImport.attachmentTooLarge", error.ErrorKey);
        Assert.False(error.IsTransient);
    }

    [Fact]
    public async Task AcceptsLegalQuotedPrintableZipWhoseEncodedPartExceedsFortyMiB()
    {
        await using var fixture = new TlsImapFixture { Archive = new byte[14 * 1024 * 1024], TransferEncoding = "QUOTED-PRINTABLE" };
        await using var mailbox = await fixture.CreateTrustedFactory().ConnectAsync(fixture.Connection, CancellationToken.None);
        Assert.Equal(fixture.Archive, await mailbox.ReadAttachmentAsync(2, "2", CancellationToken.None));
    }

    private sealed class TlsImapFixture : IAsyncDisposable
    {
        private readonly TcpListener listener = new(IPAddress.Loopback, 0);
        private readonly CancellationTokenSource cancellation = new(TimeSpan.FromSeconds(20));
        private readonly X509Certificate2 certificate;
        private readonly Task server;
        public List<string> Commands { get; } = [];
        public byte[] Archive { get; init; } = "PK synthetic zip part"u8.ToArray();
        public string TransferEncoding { get; init; } = "BASE64";
        private string? encodedContent;
        private string EncodedContent => encodedContent ??= EncodeContent();
        public bool ReturnLowerUid { get; init; }
        public bool Oversized { get; init; }
        public MailboxConnection Connection => new("localhost", ((IPEndPoint)listener.LocalEndpoint).Port, "sslOnConnect", "fixture", "fixture-password", "INBOX");

        public TlsImapFixture()
        {
            using var rsa = RSA.Create(2048);
            var request = new CertificateRequest("CN=localhost", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            var san = new SubjectAlternativeNameBuilder();
            san.AddDnsName("localhost");
            request.CertificateExtensions.Add(san.Build());
            using var generated = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
            certificate = X509CertificateLoader.LoadPkcs12(generated.Export(X509ContentType.Pfx), null, X509KeyStorageFlags.DefaultKeySet);
            listener.Start();
            server = ServeAsync();
        }

        public MailKitMailboxClientFactory CreateTrustedFactory() => new(() => new ImapClient
        {
            // Trust only this ephemeral fixture certificate and retain hostname validation.
            ServerCertificateValidationCallback = (_, remote, _, errors) => remote?.GetCertHashString() == certificate.GetCertHashString()
                && (errors & SslPolicyErrors.RemoteCertificateNameMismatch) == 0
        });

        private string EncodeContent()
        {
            if (TransferEncoding == "BASE64")
            {
                return Convert.ToBase64String(Archive);
            }
            const string hex = "0123456789ABCDEF";
            var encoded = new StringBuilder(Archive.Length * 3);
            for (var index = 0; index < Archive.Length; index++)
            {
                encoded.Append('=').Append(hex[Archive[index] >> 4]).Append(hex[Archive[index] & 15]);
                if (index % 24 == 23)
                {
                    encoded.Append("=\r\n");
                }
            }
            return encoded.ToString();
        }

        private async Task ServeAsync()
        {
            try
            {
                using var tcp = await listener.AcceptTcpClientAsync(cancellation.Token);
                await using var stream = new SslStream(tcp.GetStream());
                await stream.AuthenticateAsServerAsync(new SslServerAuthenticationOptions { ServerCertificate = certificate, EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13 }, cancellation.Token);
                using var reader = new StreamReader(stream, Encoding.ASCII, false, 4096, true);
                await ReplyAsync(stream, "* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR] fixture\r\n");
                while (await reader.ReadLineAsync(cancellation.Token) is { } line)
                {
                    Commands.Add(line);
                    var tag = line.Split(' ')[0];
                    var command = line[(tag.Length + 1)..];
                    if (command.StartsWith("CAPABILITY", StringComparison.OrdinalIgnoreCase))
                    {
                        await ReplyAsync(stream, $"* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR\r\n{tag} OK capability\r\n");
                    }
                    else if (command.StartsWith("AUTHENTICATE", StringComparison.OrdinalIgnoreCase))
                    {
                        await ReplyAsync(stream, $"{tag} OK authenticated\r\n");
                    }
                    else if (command.StartsWith("LIST", StringComparison.OrdinalIgnoreCase))
                    {
                        await ReplyAsync(stream, $"* LIST () \"/\" \"INBOX\"\r\n{tag} OK list\r\n");
                    }
                    else if (command.StartsWith("EXAMINE", StringComparison.OrdinalIgnoreCase))
                    {
                        await ReplyAsync(stream, $"* FLAGS (\\Seen)\r\n* 2 EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY 71]\r\n* OK [UIDNEXT 3]\r\n{tag} OK [READ-ONLY] examined\r\n");
                    }
                    else if (command.StartsWith("UID SEARCH", StringComparison.OrdinalIgnoreCase))
                    {
                        await ReplyAsync(stream, $"* SEARCH {(ReturnLowerUid ? 1 : 2)}\r\n{tag} OK search\r\n");
                    }
                    else if (command.Contains("BODYSTRUCTURE", StringComparison.OrdinalIgnoreCase))
                    {
                        var size = Oversized ? 100_000_000 : EncodedContent.Length;
                        await ReplyAsync(stream, $"* 2 FETCH (UID 2 BODYSTRUCTURE ((\"TEXT\" \"PLAIN\" NIL NIL NIL \"7BIT\" 5 1)(\"APPLICATION\" \"ZIP\" (\"NAME\" \"import.ZIP\") NIL NIL \"{TransferEncoding}\" {size} NIL (\"ATTACHMENT\" (\"FILENAME\" \"import.ZIP\"))) \"MIXED\"))\r\n{tag} OK fetch\r\n");
                    }
                    else if (command.Contains("BODY.PEEK[2]", StringComparison.OrdinalIgnoreCase))
                    {
                        var encoded = EncodedContent;
                        await ReplyAsync(stream, $"* 2 FETCH (UID 2 BODY[2]<0> {{{encoded.Length}}}\r\n{encoded})\r\n{tag} OK fetch\r\n");
                    }
                    else if (command.StartsWith("LOGOUT", StringComparison.OrdinalIgnoreCase))
                    {
                        await ReplyAsync(stream, $"* BYE fixture\r\n{tag} OK logout\r\n");
                        break;
                    }
                    else
                    {
                        await ReplyAsync(stream, $"{tag} BAD unsupported fixture command\r\n");
                    }
                }
            }
            catch (Exception exception) when (exception is OperationCanceledException or IOException)
            {
                // Cancellation, client disconnect and deliberately rejected TLS are expected.
            }
        }

        private Task ReplyAsync(Stream stream, string text) => stream.WriteAsync(Encoding.ASCII.GetBytes(text), cancellation.Token).AsTask();

        public async ValueTask DisposeAsync()
        {
            await cancellation.CancelAsync();
            listener.Stop();
            await server;
            certificate.Dispose();
            cancellation.Dispose();
        }
    }
}
