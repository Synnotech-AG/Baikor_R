# Releasing Baikor_R

Use the GitHub **Release** workflow to publish a version. You enter one version;
the workflow tests the selected source commit, builds the application image,
packages the Helm chart, verifies anonymous downloads, and creates the GitHub
release. Docker Hub credentials and manually created Git tags are not needed.

## Create a release

1. Merge the changes to `main`.
2. Open [Actions > Release](https://github.com/Synnotech-AG/Baikor_R/actions/workflows/release.yml).
3. Select **Run workflow**, keep branch `main`, and enter an unused version such
   as `1.7.6`.
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

The release job uses the repository's automatic `GITHUB_TOKEN` with
`packages: write` and `contents: write`. Validation jobs have read access only.
The organization must allow package creation and GitHub Actions publication.
No personal token or separately configured registry secret is required.

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

## Verify and deploy

Verify the artifacts from a client without stored GHCR credentials:

```shell
docker pull ghcr.io/synnotech-ag/baikor-r:1.7.6
helm show chart oci://ghcr.io/synnotech-ag/baikor-r-chart --version 1.7.6
```

The release workflow performs its own checks using an empty credential store.
Operators must allow registry and artifact downloads from GHCR or mirror the
artifacts into their own registry.

The [CIVITAS/CORE addon](https://github.com/Synnotech-AG/Baikor_R.Addon) pins the
application/chart version in `vars/software_references.yml`. An application
release does not automatically upgrade customer installations. Update the
addon's version pin, run its CI, and publish the compatible addon revision.
Operators then update their addon revision and run the normal Core playbook.

Local development may continue to use `helm.local_chart_path` and an imported
local image. That mode does not verify the public release download path.
