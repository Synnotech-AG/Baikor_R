using System.Security.Cryptography;
using System.Text;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Shared.Results;
using FluentResults;

namespace BaikorR.Core.Features.MailImports;

public sealed class MailImportService(IMailImportStore store, IMailboxClientFactory factory,
    IMailImportSecretProtector protector, TimeProvider timeProvider)
{
    public async Task<Result<MailImportSettingsResponse>> GetAsync(CancellationToken cancellationToken) =>
        Result.Ok(Response(await store.GetAsync(cancellationToken)));

    public async Task<Result<MailImportSettingsResponse>> SaveAsync(MailImportSettingsRequest request, CancellationToken cancellationToken)
    {
        if (!ValidConnection(request.Host, request.Port, request.Security, request.Username, request.Folder)
            || request.PollIntervalSeconds is < 30 or > 3600 || !double.IsFinite(request.BufferMetres)
            || request.BufferMetres is < 0.1 or > 20 || Encoding.UTF8.GetByteCount(request.Password ?? "") > 4096)
        {
            return Invalid<MailImportSettingsResponse>("mailImport.settingsInvalid");
        }
        var current = await store.GetAsync(cancellationToken);
        if (current.Version != request.Version)
        {
            return Conflict<MailImportSettingsResponse>();
        }
        var destinationChanged = !SameCredentialDestination(current, request.Host, request.Port, request.Security, request.Username);
        var sourceChanged = destinationChanged || current.Folder != request.Folder;
        if (sourceChanged && current.Enabled)
        {
            return Invalid<MailImportSettingsResponse>("mailImport.pauseBeforeSourceChange");
        }
        if (request.ClearPassword && request.Enabled)
        {
            return Invalid<MailImportSettingsResponse>("mailImport.pauseBeforeClearingPassword");
        }
        if ((request.Enabled || !string.IsNullOrEmpty(request.Password)) && !protector.IsConfigured)
        {
            return Unavailable<MailImportSettingsResponse>("mailImport.encryptionUnavailable");
        }
        var password = current.EncryptedPassword;
        if (request.ClearPassword)
        {
            password = null;
        }
        else if (!string.IsNullOrEmpty(request.Password))
        {
            password = protector.Protect(request.Password);
        }
        else if (destinationChanged && password is not null)
        {
            return Invalid<MailImportSettingsResponse>("mailImport.passwordDestinationChanged");
        }
        if (request.Enabled && password is null)
        {
            return Invalid<MailImportSettingsResponse>("mailImport.passwordRequired");
        }
        var next = new MailImportConfiguration
        {
            Version = current.Version, Enabled = request.Enabled, Host = request.Host.Trim(), Port = request.Port,
            Security = request.Security, Username = request.Username, Folder = request.Folder,
            PollIntervalSeconds = request.PollIntervalSeconds, BufferMetres = request.BufferMetres,
            EncryptedPassword = password, Generation = sourceChanged ? Guid.NewGuid() : current.Generation,
            UidValidity = sourceChanged ? null : current.UidValidity, NextUid = sourceChanged ? null : current.NextUid,
            ActivatedAt = sourceChanged ? null : current.ActivatedAt,
            ErrorKey = sourceChanged ? null : current.ErrorKey
        };
        var rebaseline = request.Enabled && (next.NextUid is null || request.ResetCursor);
        if (rebaseline)
        {
            try
            {
                await using var mailbox = await factory.ConnectAsync(Connection(next, protector.Unprotect(password!)), cancellationToken);
                if (mailbox.UidValidity == 0 || mailbox.NextUid == 0)
                {
                    return Unavailable<MailImportSettingsResponse>("mailImport.baselineUnavailable");
                }
                next.Generation = Guid.NewGuid();
                next.UidValidity = mailbox.UidValidity;
                next.NextUid = mailbox.NextUid;
                next.ActivatedAt = timeProvider.GetUtcNow();
                next.ErrorKey = null;
            }
            catch (MailImportTransportException exception)
            {
                return Unavailable<MailImportSettingsResponse>(exception.ErrorKey);
            }
            catch (Exception exception) when (exception is CryptographicException or FormatException or InvalidOperationException)
            {
                return Unavailable<MailImportSettingsResponse>("mailImport.encryptionUnavailable");
            }
        }
        // UIDVALIDITY changes require the explicit start-from-now action, not a pause/resume.
        if (request.Enabled && next.ErrorKey == "mailImport.uidValidityChanged" && !request.ResetCursor)
        {
            return Invalid<MailImportSettingsResponse>("mailImport.uidValidityChanged");
        }
        if (!await store.SaveConfigurationAsync(next, request.Version, sourceChanged || rebaseline, cancellationToken))
        {
            return Conflict<MailImportSettingsResponse>();
        }
        return Result.Ok(Response(next));
    }

    public async Task<Result<MailImportTestResponse>> TestAsync(MailImportTestRequest request, CancellationToken cancellationToken)
    {
        if (!ValidConnection(request.Host, request.Port, request.Security, request.Username, request.Folder) || Encoding.UTF8.GetByteCount(request.Password ?? "") > 4096)
        {
            return Invalid<MailImportTestResponse>("mailImport.settingsInvalid");
        }
        string? password = request.Password;
        if (string.IsNullOrEmpty(password) && request.UseSavedPassword)
        {
            if (!protector.IsConfigured)
            {
                return Unavailable<MailImportTestResponse>("mailImport.encryptionUnavailable");
            }
            var current = await store.GetAsync(cancellationToken);
            if (current.EncryptedPassword is not null
                && !SameCredentialDestination(current, request.Host, request.Port, request.Security, request.Username))
            {
                return Invalid<MailImportTestResponse>("mailImport.passwordDestinationChanged");
            }
            try
            {
                password = current.EncryptedPassword is null ? null : protector.Unprotect(current.EncryptedPassword);
            }
            catch (Exception exception) when (exception is CryptographicException or FormatException or InvalidOperationException)
            {
                return Unavailable<MailImportTestResponse>("mailImport.encryptionUnavailable");
            }
        }
        if (string.IsNullOrEmpty(password))
        {
            return Invalid<MailImportTestResponse>("mailImport.passwordRequired");
        }
        try
        {
            await using var mailbox = await factory.ConnectAsync(new(request.Host.Trim(), request.Port, request.Security,
                request.Username, password, request.Folder), cancellationToken);
            return Result.Ok(new MailImportTestResponse(true));
        }
        catch (MailImportTransportException exception)
        {
            return Unavailable<MailImportTestResponse>(exception.ErrorKey);
        }
    }

    public async Task<MailImportStatusResponse> StatusAsync(CancellationToken cancellationToken)
    {
        var status = await store.StatusAsync(cancellationToken);
        if (!status.Enabled) { return status; }
        if (!protector.IsConfigured)
        {
            return status with { State = "unavailable", ErrorKey = "mailImport.encryptionUnavailable" };
        }
        var settings = await store.GetAsync(cancellationToken);
        try
        {
            protector.Unprotect(settings.EncryptedPassword ?? "");
        }
        catch (Exception exception) when (exception is CryptographicException or FormatException or InvalidOperationException)
        {
            return status with { State = "unavailable", ErrorKey = "mailImport.encryptionUnavailable" };
        }
        return status;
    }
    public Task<MailImportHistoryResponse> HistoryAsync(int page, int pageSize, CancellationToken cancellationToken) =>
        store.HistoryAsync(Math.Clamp(page, 1, 100000), Math.Clamp(pageSize, 1, 100), cancellationToken);
    public async Task<Result<bool>> CheckAsync(CancellationToken cancellationToken) =>
        await store.ScheduleCheckAsync(cancellationToken) ? Result.Ok(true) : Invalid<bool>("mailImport.notEnabled");
    public async Task<Result<bool>> RetryAsync(Guid id, CancellationToken cancellationToken) =>
        await store.RetryAsync(id, cancellationToken) ? Result.Ok(true) : Invalid<bool>("mailImport.retryUnavailable");

    internal static MailboxConnection Connection(MailImportConfiguration configuration, string password) =>
        new(configuration.Host, configuration.Port, configuration.Security, configuration.Username, password, configuration.Folder);

    private MailImportSettingsResponse Response(MailImportConfiguration configuration) =>
        new(configuration.Enabled, configuration.Host, configuration.Port, configuration.Security, configuration.Username,
            configuration.Folder, configuration.PollIntervalSeconds, configuration.BufferMetres,
            configuration.EncryptedPassword is not null, protector.IsConfigured, configuration.Version);

    private static bool SameCredentialDestination(MailImportConfiguration current, string host, int port, string security, string username) =>
        string.Equals(current.Host, host.Trim(), StringComparison.OrdinalIgnoreCase)
        && current.Port == port && current.Security == security && current.Username == username;

    private static bool ValidConnection(string? host, int port, string security, string? username, string? folder) =>
        !string.IsNullOrWhiteSpace(host) && host.Length <= 253 && !host.Any(char.IsWhiteSpace)
        && !host.Contains('/') && !host.Contains('\\') && port is >= 1 and <= 65535
        && security is "sslOnConnect" or "startTls"
        && !string.IsNullOrWhiteSpace(username) && username.Length <= 320
        && !string.IsNullOrWhiteSpace(folder) && folder.Length <= 512
        && !username.Any(char.IsControl) && !folder.Any(char.IsControl);

    private static Result<T> Invalid<T>(string key) => Result.Fail<T>(ApiError.Validation(key, "The mail import settings or action are invalid.", "mailImport"));
    private static Result<T> Conflict<T>() => Result.Fail<T>(ApiError.Conflict("mailImport.conflict", "The settings changed. Reload before saving."));
    private static Result<T> Unavailable<T>(string key) => Result.Fail<T>(new ApiError(key, "The mail connection or encryption is unavailable.", ApiErrorType.Unavailable));
}
