using BaikorR.Core.Shared.Security;

namespace BaikorR.Core.Features.MailImports.Security;

public sealed class MailImportSecretProtector(ApplicationSecretEncryption encryption) : IMailImportSecretProtector
{
    // Part of the stored format since 0.4.0. Other credential types use their own fixed purpose.
    private const string Purpose = "BaikorR.MailImports.Password.v1";

    public bool IsConfigured => encryption.IsConfigured;
    public string Protect(string plaintext) => encryption.Protect(Purpose, plaintext);
    public string Unprotect(string ciphertext) => encryption.Unprotect(Purpose, ciphertext);
}
