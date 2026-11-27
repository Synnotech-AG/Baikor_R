# Automatic email imports

Anyone with the `baikor_admin` role can open **Import → Settings** to configure
one IMAP account and folder, including while automatic import is running.
On CIVITAS the addon provisions Baikor's application encryption key during deployment. The
administrator can enter or change the mailbox later without restarting Baikor.
Baikor checks that folder in its built-in background worker and sends matching
ZIP attachments directly to the R-KOM importer. No Node-RED deployment, workflow,
Keycloak machine client or special import user is required. The optional external
[import API](IMPORTS.md) remains available independently.

Use implicit TLS (usually port 993) or required STARTTLS (usually port 143), with
a trusted certificate matching the server hostname. Enter an account password or
app password. Certificate checks cannot be disabled. The folder opens read-only;
Baikor does not change read flags, move or delete messages. A new message remains
eligible even if another mail client has already read it.

**Test connection** checks the edited settings without enabling imports or advancing
the cursor. **Check now** in the settings dialog schedules the next check of the
saved mailbox. A blank password field preserves the saved credential for the same
host, port, TLS mode and username, including a change of folder. Enter a password
to test or save a different connection. To save that connection without a
password, turn import off and select **Clear the saved password**. The API
reports whether a password is saved. Only administrators can access mail
settings, controls and history.

On the first successful activation, Baikor records the current mailbox UID
boundary and skips messages already there. Only messages arriving afterwards are
eligible. Turning import off and back on for the same source retains its position.
When an administrator changes the host, port, TLS mode, username or folder of an
active source, Baikor verifies the new connection and saves its current mailbox
position. A failed switch leaves the saved mailbox in place. An unexpected
change to the folder's IMAP identity (UIDVALIDITY) stops processing. Review
the server change before choosing **Start from now**.

ZIP filenames are matched case-insensitively. Each attachment is processed
independently, with a decoded size of at most 25 MiB and the existing archive and
buffer validation. New configurations use a 60-second check interval and the
same one-metre buffer as a manual import. Editing the mailbox preserves existing
values for both.

The Import page lists the filename, completion time and result for each ZIP that
succeeded or failed. Baikor skips messages that have no ZIP attachment and
stores no history row for them. It retains the worker position, duplicate
receipts and retry data.
New email imports do not store importer warning text. Earlier records stay
available through the administrative history API. Subjects, senders, recipients
and message bodies are not stored in import history.

## Deployment key and network

Baikor uses one application encryption key for stored credentials. Each
credential type has its own encryption purpose. The first use is the IMAP
password. Browser sessions keep their existing ASP.NET Core Data Protection
keys.

On a fresh CIVITAS installation the addon creates the Kubernetes Secret
`baikor-r-encryption` in the application namespace. Its `key` field contains
a base64-encoded random 32-byte key. On an upgrade from 0.4.0 or 0.4.1 the
addon preserves the original key bytes, including a custom Secret reference,
so saved passwords remain readable without re-entry. An installation with no
previous key or saved password gets a key during the normal addon deployment.
If automatic creation fails, a platform administrator can provision the same
Kubernetes Secret and rerun Ansible. The [addon key recovery instructions](https://github.com/Synnotech-AG/Baikor_R.Addon/blob/0.4.2/README.md#application-encryption)
give the command and explain when the original key must be restored.
Keep the Secret with your database backups and configure every Baikor
deployment sharing those credentials to use the same key.

For standalone Helm deployments, create the Secret through the operator's normal
secret manager and reference it:

```yaml
encryption:
  required: true
  existingSecret:
    name: baikor-r-encryption
    key: key
```

The chart passes the Secret to the app as `Encryption__Key`. Standalone
installations upgrading with the old `mailImports.encryption.existingSecret`
values can continue using that reference. The addon waits for the new pods to
pass `/health/ready/encryption.v1`, which checks the active key against its
expected fingerprint and decrypts any saved IMAP password.
If a deployment reports a key mismatch or decryption failure, recover the
original key bytes from backup. If a failed upgrade already recorded a newly
generated key, roll back to the previous Helm revision first, restore the
original bytes to the Secret references used by both revisions, then rerun
the addon. A newly generated key cannot decrypt an existing password.

If mail settings still report an unavailable key after a successful deployment,
check which Service and pods the Baikor hostname routes to. Compare their
image, namespace and `Encryption__Key` Secret reference with the deployment
the addon verified. The mail settings response exposes the
`encryptionConfigured` flag to administrators. The Secret value and IMAP
password are unnecessary for this diagnosis.

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
   application database and Baikor's application encryption Secret.
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
