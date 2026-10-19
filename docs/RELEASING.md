# Releasing Baikor_R

Baikor_R source code and its GitHub Actions workflow are maintained in
[Synnotech-AG/Baikor_R](https://github.com/Synnotech-AG/Baikor_R).
The workflow validates pushes and pull requests. Only supported stable release
tags publish deployable artifacts and create a GitHub release.

## Public artifact contract

The addon pins these coordinates; changing them requires a coordinated addon
release:

- Image: `docker.io/synnotech-ag/baikor-r:<version>`
- Helm chart: `oci://registry-1.docker.io/synnotech-ag/baikor-r-chart`

The image and chart repositories must be public. Customer installations pull
them anonymously and do not receive Synnotech registry credentials.

## One-time Docker Hub setup

1. Create or verify the Docker Hub organization namespace `synnotech-ag`.
2. Create the public repository `synnotech-ag/baikor-r`.
3. Create the public repository `synnotech-ag/baikor-r-chart`.
4. Create a dedicated access token that can push to both repositories. Do not
   use a personal password.

## One-time GitHub setup

In the application repository, open **Settings > Secrets and variables > Actions**
and add these repository secrets:

| Secret | Value |
| --- | --- |
| `DOCKERHUB_USERNAME` | Docker Hub automation user |
| `DOCKERHUB_TOKEN` | Dedicated Docker Hub access token |

Restrict creation, updates and deletion of release tags matching `1.7.*` through
repository rulesets, and protect the default branch. Keep access to these
credentials limited to release maintainers. GitHub-hosted Ubuntu runners supply
Docker; the workflow uses the pinned Helm CLI container.

The workflow's default token permission is `contents: read`. Only the GitHub
release job receives `contents: write` through the automatic `GITHUB_TOKEN`.
No personal GitHub token is required. Branch and pull-request validation does not
need the Docker Hub secrets. A normal push to `main` never publishes a release.

## Create a release

Release tags must be on the default branch and use the supported `1.7.x`
version line. Never move or reuse a published tag.

```shell
git switch main
git pull --ff-only
git tag -a 1.7.5 -m "Baikor_R 1.7.5"
git push origin 1.7.5
```

The tag pipeline runs all validation first. It then builds the image once,
publishes the versioned image and `latest`, packages and publishes the OCI Helm
chart, records both digests, logs out, and verifies that both artifacts can be
read anonymously. A private or inaccessible Docker Hub repository therefore
causes the release job to fail.

## Verify and deploy

Verify the public artifacts without credentials:

```shell
docker logout registry-1.docker.io || true
docker pull docker.io/synnotech-ag/baikor-r:1.7.5
helm show chart oci://registry-1.docker.io/synnotech-ag/baikor-r-chart --version 1.7.5
```

Use addon `1.7.7`, which pins application/chart `1.7.5`, then run the normal
CIVITAS/CORE addon deployment. No package-registry variables or image pull
Secret are required for the public artifacts.
