# Real Keycloak and IMAP smoke tests

Run the same disposable integration test used by CI from the repository root:

```sh
python tests/platform/run_ci.py
```

Requires Python 3.10+, Docker with Linux containers and Compose, and OpenSSL.
Linux GitHub-hosted runners provide Docker and OpenSSL; on Windows the script
also detects OpenSSL bundled with Git for Windows. No Python packages, Core
checkout, Kubernetes context, platform secrets or host certificate changes are
required. To reuse an already built local application image:

```sh
python tests/platform/run_ci.py --image baikor-r:local
```

The runner builds the real application Dockerfile, generates a short-lived TLS
certificate and random fixture credentials, and starts a uniquely named Compose
project with PostGIS, Keycloak, Dovecot, database migrations, the application and
the Python smoke client. TLS uses private Docker service names (`app`, `keycloak`, `imap`)
with explicit certificate trust. No ports are published. PostGIS data is kept in
container-local temporary storage; no existing containers or volumes are reused.
The imported `baikor-ci` realm is synthetic and its client matches the addon's
role mapper, role scope and login/logout configuration. The fixture has no real
credentials or users. Do not use it as a deployment configuration.

Before application startup, the runner creates an unrelated marker table in the
`baikor` schema. It checks that initial migrations preserve that table and its
data while creating the application tables, metadata column and current public
views. This uses the real PostGIS container and application migration command.

The smoke checks real authorization-code login, distinct account identities and
roles, denied-account recovery, shared records and attachments, authorization,
CSRF, optimistic concurrency, Keycloak logout and account switching. Its normal
cleanup removes only the users and records created by that run. The runner also
removes the entire disposable Compose project and volumes in `finally`, including
on failure, then removes the temporary certificate and its own built image.

`artifacts/platform-tests/summary.txt` contains assertion results only. CI uploads
that file, never raw authentication logs, tokens, credentials or certificates.
An interrupted Docker daemon or force-killed runner may prevent cleanup; identify
any leftover resources by the printed `baikor-platform-<random>` Compose project
name before removing that project. Ordinary failures return a nonzero exit code.

Native email checks use the pinned official rootless `dovecot/dovecot:2.4.3`
image with a container-local temporary mail store. The runner generates a random
mail password and a separate 32-byte mail encryption key for every run. Its TLS
certificate is explicitly trusted by both the application and Python client;
the tests exercise implicit TLS and required STARTTLS without bypassing
certificate checks. No IMAP port is published and no real mailbox is used.

The mail checks verify administrator permissions and cookie CSRF, saved-password
redaction and connection testing, a first-enable baseline that skips old mail,
new read/unread messages, independent attachment failures, duplicate receipts,
explicit retry, pause/resume, and imported records in the normal construction-site
API. They compare original message bytes and read/flagged flags afterwards, and
verify that messages were neither moved nor deleted. These checks run only in
the disposable `baikor-ci` environment mode, never against the existing Core profile.

Run the CLI guard checks separately:

```sh
python -m unittest discover -s tests/platform -p test_smoke_configuration.py
```

## Existing local CIVITAS Core deployment

The original invocation retains its local defaults and still creates/removes
disposable accounts and records in the selected existing local realm:

```sh
python tests/platform/test_keycloak_accounts.py
```

Override the local Core context or CA as needed:

```sh
python tests/platform/test_keycloak_accounts.py --kube-context k3d-civitas-local --core-path ../civitas-core
```

`--base-url`, `--keycloak-url`, `--realm`, `--client-id`, `--ca-file`,
`--kube-namespace` and `--kube-secret` are also configurable. HTTPS remains
required. For a separately provisioned disposable environment, select
`--admin-source environment` and provide both `BAIKOR_TEST_ADMIN_USERNAME` and
`BAIKOR_TEST_ADMIN_PASSWORD` through the environment. This mode never falls back
to Kubernetes. The isolated CI runner sets these values automatically and never
invokes `kubectl`.

## Routes and alerts

The backend CI job also starts its own disposable PostGIS service and sets
`BAIKOR_TEST_POSTGIS` for the .NET database tests. Each test creates a uniquely
named database, applies the migration chain and drops that database afterwards.
Without this variable, local `dotnet test` skips the PostGIS tests. To run them
locally, set it to an administrator connection on a disposable test server;
never point it at a shared application database.

The disposable `baikor-ci` run also verifies private routes/alerts with real OIDC
accounts: Viewer reads, Editor route changes and evidence-bound handling,
Administrator settings/full scans, and Importer denial across all new endpoints.
It checks future inclusive overlap, review preservation through an unchanged scan,
material geometry reopening, and retained evidence after route removal. Those
retained-history checks are gated to the disposable realm/environment mode and
do not run against the existing Core profile.
