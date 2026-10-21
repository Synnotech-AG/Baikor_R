# Releasing Baikor_R

Use the GitHub **Release** workflow to publish a version. You enter one version;
the workflow tests the selected source commit, builds the application image,
packages the Helm chart, verifies anonymous downloads, and creates the GitHub
release. Docker Hub credentials and manually created Git tags are not needed.

## Create a release

1. Merge the changes to `main`.
2. Open [Actions > Release](https://github.com/Synnotech-AG/Baikor_R/actions/workflows/release.yml).
3. Select **Run workflow**, keep branch `main`, and enter an unused stable
   semantic version.
4. Run the workflow and wait for the checks and publication to finish.

Use a stable semantic version `MAJOR.MINOR.PATCH`, without a `v` prefix.
Application versions are independent of CIVITAS/CORE versions. The release
always uses the exact source commit selected when the workflow was started.

The version input sets the .NET assembly version, image tag, chart version,
chart `appVersion`, Git tag and GitHub release. No version files need to be
edited for each release. The chart's empty `image.tag` defaults to its
`appVersion`, so application and migration pods select the same released image.

Normal pushes and pull requests run CI only. They never publish deployment
artifacts. Manually pushing a Git tag also does not publish a release.

## Published artifacts

| Artifact | Address |
| --- | --- |
| Application image | `ghcr.io/synnotech-ag/baikor-r:<version>` |
| OCI Helm chart | `oci://ghcr.io/synnotech-ag/baikor-r-chart` |
| Release notes and downloads | [GitHub Releases](https://github.com/Synnotech-AG/Baikor_R/releases) |

The image targets `linux/amd64`. The release includes the chart archive,
`SHA256SUMS`, and `release.json` with the source commit and artifact digests.
Both artifacts carry source, revision, version and EUPL-1.2 metadata; the image
and packaged chart include the license text. Deploy explicit versions or
digests; there is no moving `latest` tag.

## One-time GitHub setup

The existing `baikor-r` and `baikor-r-chart` packages are public. Anonymous Docker
and Helm downloads of **1.7.9** were verified on **2026-10-21**. Package visibility
applies to future versions of these same packages; it does not need to be changed
for each release. The instructions below also apply if a new package is created.

The release job uses the repository's automatic `GITHUB_TOKEN` with
`packages: write` and `contents: write`. Validation jobs have read access only.
The organization must allow package creation and GitHub Actions publication.
No personal token or separately configured registry secret is required.

If **Public** is disabled in package settings, an organization owner must allow
public packages under **Organization Settings > Packages > Package Creation**.
This does not block CI or local development tests. Public release can be deferred
while the source and local development image continue to be tested.

New GHCR packages are private by default, even when the source repository is
public. On the first release:

1. Let the workflow publish the image and chart. Anonymous verification will
   stop publication if either package is still private.
2. Open the organization's **Packages** page and the settings of `baikor-r` and
   `baikor-r-chart`. Make both packages **Public**. Check that both are linked
   to `Synnotech-AG/Baikor_R` and that this repository has Actions access.
3. On the original workflow run, choose **Re-run failed jobs**.

The retry checks the existing artifacts' source commit and version and reuses
their original bytes and digests. The Git tag and release are created only
after both artifacts can be downloaded without credentials.

## Failed runs and immutable versions

Use **Re-run failed jobs** on the same run to recover from a network or
visibility failure. An artifact is reused only if its source repository,
revision and version match that run. Conflicting artifacts or tags stop the
workflow. Existing releases are never overwritten.

If a runner is interrupted while GitHub is creating the release, it can leave
an unpublished draft. Inspect that draft and remove only the incomplete draft
before retrying the original run. Keep the matching tag and package versions.

If a code or workflow fix is required, merge it and start a new release with a
new version. Do not move or reuse an already published version. Keep published
versions available for deployments pinned to them.

The initial `1.7.6` run uploaded packages before public verification was blocked
by organization policy. Those artifacts remain reserved for their original
source commit. The October 20 review fixes were released in **1.7.7**; its
original release run is
[39239993018](https://github.com/Synnotech-AG/Baikor_R/actions/runs/39239993018).
After the visibility change, attempt 2 completed on **2026-10-20**, preserving
the tested source revision `6afbbaed75f4c201c584d88eaee1e196b15a2720` and package
digests. The [1.7.7 release](https://github.com/Synnotech-AG/Baikor_R/releases/tag/1.7.7)
includes the chart archive, checksums and source metadata. Rerunning the older
`1.7.6` workflow would not include the review fixes.

Maintain the [changelog](../CHANGELOG.md) alongside changes. Its Unreleased section
describes work awaiting publication; a successful release also receives generated
GitHub release notes. Move the relevant entries into a dated version section
after that release succeeds.

## Verify and deploy

Verify the artifacts from a client without stored GHCR credentials:

```shell
docker pull ghcr.io/synnotech-ag/baikor-r:1.7.9
helm show chart oci://ghcr.io/synnotech-ag/baikor-r-chart --version 1.7.9
```

The release workflow performs its own checks using an empty credential store.
Operators must allow registry and artifact downloads from GHCR or mirror the
artifacts into their own registry.

The [CIVITAS/CORE addon](https://github.com/Synnotech-AG/Baikor_R.Addon) pins the
application/chart version in `vars/software_references.yml`. An application
release does not automatically upgrade customer installations. Update the
addon's version pin, run its CI, and publish the compatible addon revision.
Operators then update their addon revision and run the normal Core playbook.

Addon and application release numbers are independent. Application/chart
**1.7.9** pairs with addon **1.7.10**. The earlier addon **1.7.9** pairs with
application/chart **1.7.8**, and addon **1.7.8** pairs with application/chart
**1.7.7**; the addon `1.7.7` tag identifies an older revision.
Keep all existing release tags unchanged.

Local development may continue to use `helm.local_chart_path` and an imported
local image. That mode does not verify the public release download path.

## Test already-published private packages

The current public packages can be downloaded directly. This fallback documents
the authenticated bundle used for the October 19 tests and remains available for
future cases where direct registry access is unavailable.

The [Published package test bundle workflow](https://github.com/Synnotech-AG/Baikor_R/actions/workflows/test-bundle.yml)
exports existing packages for an authorized local test when direct GHCR access
is unavailable. Run it from `main` with the published `version` and its exact
40-character `expected_commit`. The expected commit identifies the packages;
it can differ from the newer commit containing the bundle workflow.

The job uses only the runner's automatic `GITHUB_TOKEN`, with `contents: read`
and `packages: read`. It resolves both version tags to immutable digests, checks
source/version/revision metadata and chart name/version/appVersion, then downloads
those digests. It never builds, pushes, changes package visibility, or creates a
release. The normal Release workflow's anonymous-download gate remains required.

Download the run's `baikor-r-test-bundle-<version>-<run-id>` artifact within seven
days using authenticated GitHub Actions access. It contains only `image.tar.gz`
(a Docker image archive retaining the published tag), `chart.tgz`, `bundle.json`
and `SHA256SUMS`. No registry credentials are included.

Before loading it, verify the file checksums and compare `bundle.json` source,
commit and both immutable digests with the intended publication run:

```shell
gh run download <run-id> --repo Synnotech-AG/Baikor_R \
  --name baikor-r-test-bundle-<version>-<run-id> --dir test-bundle
cd test-bundle
sha256sum --check SHA256SUMS
docker load --input image.tar.gz
helm show chart chart.tgz
```

`bundle.json` also records `image.configDigest` for comparison with Docker's
loaded image ID, and `chart.layerDigest` for comparison with the chart archive's
SHA256. Docker image export/import can change the manifest representation; the
verified image configuration provides a stable identity across that transfer.

Use the imported published image and this exact chart archive for the local
deployment. Record that this is **indirect registry verification**: Actions
downloaded the packages with its token, and the local operator downloaded the
checked bundle through GitHub. It does not prove anonymous package availability
or direct local GHCR authentication, and runtime acceptance is a separate step.
