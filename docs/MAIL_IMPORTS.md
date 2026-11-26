# Automatic email imports

An administrator configures one IMAP account and folder on the Import page.
Baikor checks that folder in its built-in background worker and sends matching
ZIP attachments directly to the R-KOM importer. No Node-RED deployment, workflow,
Keycloak machine client or special import user is required. The optional external
[import API](IMPORTS.md) remains available independently.

Use implicit TLS (usually port 993) or required STARTTLS (usually port 143), with
a trusted certificate matching the server hostname. Enter an account password or
app password. Certificate checks cannot be disabled. The folder opens read-only;
Baikor does not change read flags, move or delete messages. A new message remains
eligible even if another mail client has already read it.

Test connection checks the edited settings without enabling imports or advancing
the cursor. A blank password field preserves the saved credential for the same
host, port, TLS mode and username, including a change of folder. Enter a password
to test or save a different connection, or explicitly clear the credential
while disabled to save that connection without a password. Reads expose a saved-password indicator,
never the password or encrypted value. All mail settings, controls and history are
restricted to administrators.

On the first successful activation, Baikor records the current mailbox UID
boundary and skips messages already there. Only messages arriving afterwards are
eligible. The activation timestamp is the operational cutover boundary. Pause and
resume on the same source retain the cursor and process mail arriving during the
pause. Changing the host, port, TLS mode, username or folder requires pausing and
starts a new source generation. An unexpected UIDVALIDITY change stops processing;
review the server change before explicitly choosing to start from now.

ZIP filenames are matched case-insensitively. Each attachment is processed
independently, with a decoded size of at most 25 MiB and the existing archive and
buffer validation. Message bodies and non-ZIP attachments are not downloaded for
import. History contains filenames, timestamps, outcomes, counts and safe errors;
it does not retain subjects, senders, recipients or message bodies. Check now
schedules a check. Eligible failures can be retried; completed or duplicate work
cannot be made runnable again.

## Deployment key and network

The CIVITAS addon creates `baikor-r-mail-encryption` once in the application
namespace. Its `key` value is a base64-encoded cryptographically random 32-byte
encryption key. The addon preserves it on upgrades and refuses to replace a
malformed existing key. Database backups and this Secret must be backed up
together. Every app deployment sharing the database must reference the same key,
even if browser-session Data Protection key volumes differ.

For standalone Helm deployments, create the Secret through the operator's normal
secret manager and reference it:

```yaml
mailImports:
  workerEnabled: true
  encryption:
    existingSecret:
      name: baikor-r-mail-encryption
      key: key
```

The chart does not accept or generate the key in values. The environment variable
`MailImports__EncryptionKey` is populated from the Secret. A missing key or a key
that cannot decrypt the saved password makes mail processing unavailable while
the rest of Baikor remains usable. Restore the original Secret rather than
generating a replacement. For deliberate rotation, pause mail processing, retain
the original key and database backup, install the new key on every app instance,
restart them, and re-enter the mailbox password before resuming. Merely replacing
the key does not re-encrypt the saved password.

The worker can be switched off per deployment with `mailImports.workerEnabled`.
Mailbox settings are disabled on a fresh installation regardless of that switch.
No Kubernetes write permissions are added to the application. If NetworkPolicy
is enabled, explicitly permit DNS and the configured IMAP destination and port
alongside the application's existing dependencies. The chart does not open broad
egress automatically. Private mail CAs must be installed through the operator's
trusted CA bundle; never bypass verification.

## Cut over an existing Node-RED mail importer

Keep the existing workflow running while building and testing the native feature.
Perform cutover during a controlled window after isolated native-mail acceptance:

1. Deploy the native-capable application with mail settings disabled. Back up the
   application database and the dedicated mail encryption Secret.
2. Quiesce the dedicated old mail workflow and wait for all in-flight requests.
   Snapshot its durable `/data/context/baikor_mail_import/flow.json` ledger and
   connection settings through a protected operator channel. Retain the original
   snapshot unchanged; it may contain unrelated sensitive settings.
3. Generate a mail-only receipt migration without contacting the database:

   ```shell
   python scripts/mail-import-ledger.py /protected/flow.json --output /protected/mail-receipts.sql
   ```

   The tool validates hash identity and completion timestamps, includes every
   `done` or `duplicate` hash, and stops on unresolved, invalid or empty snapshots.
   Reconcile `processing`, `failed` or `uncertain` entries explicitly before
   continuing. Current construction-site metadata alone is insufficient: completed
   mail hashes may no longer have a retained construction-site record.
4. After native database migrations, execute the generated SQL through the
   database owner's protected connection with stop-on-error enabled, for example
   `psql --set ON_ERROR_STOP=1 --file /protected/mail-receipts.sql`. It inserts only
   mail suppression receipts, is safe to rerun, and verifies every snapshot hash
   before committing. Match `legacy_hashes_verified` to the tool's completed count.
   Retain the reported hash-set fingerprint with the cutover record.
5. Enter or transfer the existing connection settings/password securely into
   Baikor, test the connection, then enable mail processing. Record the activation
   boundary. Messages present at activation are skipped by design, including mail
   received during this switch-over window.
6. Send a controlled new message and verify its history outcome and construction
   sites. Confirm that the message and its flags remain unchanged.
7. Retire only the dedicated mail workflow/deployment and its launcher after
   acceptance. Keep its data volume and ledger for rollback. Preserve unrelated
   Node-RED workflows and API credentials used by other consumers. Do not enable
   `imports.service_account` solely for native mail.

For rollback, pause native processing before restarting the old workflow. Copy
new successful native archive hashes into the old durable ledger as completed
records using the protected operator procedure; reconcile any in-flight work.
Verify that the combined ledger covers both importers before restarting. Do not
run both importers concurrently during cutover or rollback.
