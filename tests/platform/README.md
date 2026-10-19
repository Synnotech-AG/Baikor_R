# Real Keycloak account smoke tests

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
project with PostGIS, Keycloak, database migrations, the application and the
Python smoke client. HTTPS uses private Docker service names (`app`, `keycloak`)
with explicit certificate trust. No ports are published. PostGIS data is kept in
container-local temporary storage; no existing containers or volumes are reused.
The imported `baikor-ci` realm is synthetic and its client matches the addon's
role mapper, role scope and login/logout configuration. The fixture has no real
credentials or users. Do not use it as a deployment configuration.

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
