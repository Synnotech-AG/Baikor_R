import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertArtifactIdentity, assertReleaseContext, assertReleaseState, prepareChartMetadata, chartArchiveName } from './guards.mjs';

const env = process.env;
const context = {
  version: env.RELEASE_VERSION, ref: env.GITHUB_REF,
  defaultBranch: env.DEFAULT_BRANCH, sha: env.GITHUB_SHA,
  source: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`,
};
const imageName = 'ghcr.io/synnotech-ag/baikor-r';
const chartName = 'ghcr.io/synnotech-ag/baikor-r-chart';
const imageRef = `${imageName}:${context.version}`;
const chartRef = `oci://${chartName}`;
const output = '.release';
const workspace = env.GITHUB_WORKSPACE;
const dockerConfig = path.join(env.RUNNER_TEMP || '.', 'baikor-release-docker');
const anonymousConfig = path.join(env.RUNNER_TEMP || '.', 'baikor-release-anonymous');
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function command(executable, args, options = {}) {
  return execFileSync(executable, args, { stdio: 'inherit', ...options });
}

function helm(args, anonymous = false) {
  return command('docker', ['run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`,
    '--env', 'HOME=/tmp', '--volume', `${workspace}:/workspace`,
    '--volume', `${anonymous ? anonymousConfig : dockerConfig}:/registry:ro`,
    '--workdir', '/workspace', env.HELM_CLI_IMAGE,
    ...args, '--registry-config', '/registry/config.json']);
}

async function github(resource, options = {}) {
  const response = await fetch(`${env.GITHUB_API_URL}/repos/${env.GITHUB_REPOSITORY}/${resource}`, {
    ...options,
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404 && !options.method) return null;
  if (!response.ok) throw new Error(`GitHub ${resource}: HTTP ${response.status}.`);
  return response.json();
}

async function releaseState() {
  const release = await github(`releases/tags/${context.version}`);
  const tag = await github(`git/ref/tags/${context.version}`);
  let object = tag?.object;
  for (let depth = 0; object?.type === 'tag' && depth < 10; depth++) {
    object = (await github(`git/tags/${object.sha}`))?.object;
  }
  if (object && object.type !== 'commit') throw new Error('Existing tag does not resolve to a commit.');
  const state = { releaseExists: release !== null, tagSha: object?.sha || null };
  assertReleaseState(state, context);
  return state;
}

// A failed lookup is never interpreted as a free version. Only an authenticated
// registry 404 means that a version can be created; 401/403/5xx stop the release.
async function registrySnapshot(name, anonymous = false) {
  const repository = name.replace(/^ghcr\.io\//, '');
  const tokenUrl = new URL('https://ghcr.io/token');
  tokenUrl.searchParams.set('service', 'ghcr.io');
  tokenUrl.searchParams.set('scope', `repository:${repository}:${anonymous ? 'pull' : 'pull,push'}`);
  const tokenResponse = await fetch(tokenUrl, {
    headers: anonymous ? {} : { Authorization: `Basic ${Buffer.from(`${env.GITHUB_ACTOR}:${env.GH_TOKEN}`).toString('base64')}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!tokenResponse.ok) throw new Error(`GHCR token for ${name}: HTTP ${tokenResponse.status}.`);
  const { token } = await tokenResponse.json();
  if (!token) throw new Error('GHCR did not return a registry token.');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' };
  const manifestResponse = await fetch(`https://ghcr.io/v2/${repository}/manifests/${context.version}`, {
    headers, signal: AbortSignal.timeout(30000),
  });
  if (manifestResponse.status === 404 && !anonymous) return null;
  if (!manifestResponse.ok) throw new Error(`GHCR manifest ${name}:${context.version}: HTTP ${manifestResponse.status}.`);
  const bytes = Buffer.from(await manifestResponse.arrayBuffer());
  const manifest = JSON.parse(bytes);
  if (!manifest.config?.digest) throw new Error(`${name} must contain a single image or Helm chart manifest.`);
  const configResponse = await fetch(`https://ghcr.io/v2/${repository}/blobs/${manifest.config.digest}`, {
    headers, signal: AbortSignal.timeout(30000),
  });
  if (!configResponse.ok) throw new Error(`GHCR configuration ${name}: HTTP ${configResponse.status}.`);
  const config = await configResponse.json();
  assertArtifactIdentity(name === imageName ? config.config?.Labels : config.annotations, context);
  if (name === chartName && (config.name !== 'baikor-r-chart' || config.version !== context.version || config.appVersion !== context.version)) {
    throw new Error('Existing chart version or appVersion does not match this release.');
  }
  return { digest: digest(bytes), manifest };
}

function summary(text) {
  console.log(text);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

function downloadChart(chart, destination, anonymous = false) {
  mkdirSync(destination, { recursive: true });
  helm(['pull', `${chartRef}@${chart.digest}`, '--destination', destination], anonymous);
  const archive = path.join(destination, chartArchiveName(readdirSync(destination)));
  const layer = chart.manifest.layers.find(item => item.mediaType === 'application/vnd.cncf.helm.chart.content.v1.tar+gzip');
  if (!layer || digest(readFileSync(archive)) !== layer.digest) throw new Error('Downloaded chart archive does not match its OCI layer digest.');
  return archive;
}

async function publishRelease() {
  if (env.GITHUB_ACTIONS !== 'true' || !env.GH_TOKEN) throw new Error('Publication requires GitHub Actions and its GITHUB_TOKEN.');
  if (command('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: 'pipe' }).trim() !== context.sha) {
    throw new Error('Checkout does not match the selected source commit.');
  }
  await releaseState();
  // Check both namespaces before publishing either artifact.
  let image = await registrySnapshot(imageName);
  let chart = await registrySnapshot(chartName);
  mkdirSync(output, { recursive: true });
  mkdirSync(dockerConfig, { recursive: true });
  mkdirSync(anonymousConfig, { recursive: true });
  writeFileSync(path.join(anonymousConfig, 'config.json'), '{}\n');
  const chartPackage = `${output}/baikor-r-chart-${context.version}.tgz`;

  command('docker', ['--config', dockerConfig, 'login', 'ghcr.io', '--username', env.GITHUB_ACTOR, '--password-stdin'], {
    input: env.GH_TOKEN, stdio: ['pipe', 'inherit', 'inherit'],
  });
  try {
    if (!image) {
      command('docker', ['--config', dockerConfig, 'build', '--platform', 'linux/amd64',
        '--build-arg', `VERSION=${context.version}`, '--build-arg', `REVISION=${context.sha}`,
        '--label', `org.opencontainers.image.source=${context.source}`,
        '--label', `org.opencontainers.image.version=${context.version}`,
        '--label', `org.opencontainers.image.revision=${context.sha}`,
        '--tag', imageRef, '.'], { env: { ...env, BUILDX_NO_DEFAULT_ATTESTATIONS: '1' } });
      if (await registrySnapshot(imageName)) throw new Error('Image version appeared during the build; rerun to verify it without overwriting.');
      command('docker', ['--config', dockerConfig, 'push', imageRef]);
      image = await registrySnapshot(imageName);
      if (!image) throw new Error('Published image is not available from GHCR.');
    } else {
      console.log(`Reusing matching image ${imageName}@${image.digest}.`);
    }

    if (!chart) {
      cpSync('deploy/helm/baikor-r', `${output}/chart`, { recursive: true });
      cpSync('LICENSE', `${output}/chart/LICENSE`);
      const metadataPath = `${output}/chart/Chart.yaml`;
      writeFileSync(metadataPath, prepareChartMetadata(readFileSync(metadataPath, 'utf8'), context));
      helm(['package', `${output}/chart`, '--version', context.version, '--app-version', context.version, '--destination', output]);
      if (await registrySnapshot(chartName)) throw new Error('Chart version appeared while packaging; rerun to verify it without overwriting.');
      helm(['push', chartPackage, 'oci://ghcr.io/synnotech-ag']);
      chart = await registrySnapshot(chartName);
      if (!chart) throw new Error('Published chart is not available from GHCR.');
    } else {
      console.log(`Reusing matching chart ${chartName}@${chart.digest}.`);
      // Download the original bytes, since repackaging can change tar timestamps.
      cpSync(downloadChart(chart, `${output}/recovered`), chartPackage);
    }

    const artifacts = {
      version: context.version, source: context.source, commit: context.sha,
      image: imageRef, imageDigest: `${imageName}@${image.digest}`,
      chart: chartRef, chartDigest: chart.digest,
      chartPackage: path.basename(chartPackage),
    };
    writeFileSync(`${output}/release.json`, `${JSON.stringify(artifacts, null, 2)}\n`);
    const checksumFiles = [chartPackage, `${output}/release.json`];
    writeFileSync(`${output}/SHA256SUMS`, checksumFiles.map(file => `${digest(readFileSync(file)).slice(7)}  ${path.basename(file)}\n`).join(''));
    summary(`## Baikor-R ${context.version}\n\nSource: ${context.sha}\n\nImage: ${artifacts.imageDigest}\n\nChart: ${chartRef}@${chart.digest}\n\nIf anonymous verification fails, make both GHCR packages public and **Re-run failed jobs on this same run**. Matching artifacts are reused; versions are never overwritten. A new dispatch on a different commit requires a new version.`);

    // Independent empty credentials ensure private packages cannot accidentally
    // pass verification using the publishing token or Helm's cached credentials.
    const publicImage = await registrySnapshot(imageName, true);
    const publicChart = await registrySnapshot(chartName, true);
    if (publicImage.digest !== image.digest || publicChart.digest !== chart.digest) throw new Error('Published version changed during release verification.');
    command('docker', ['--config', anonymousConfig, 'pull', artifacts.imageDigest]);
    const anonymousChart = downloadChart(chart, `${output}/anonymous`, true);
    if (digest(readFileSync(anonymousChart)) !== digest(readFileSync(chartPackage))) {
      throw new Error('Anonymous chart download differs from the release asset.');
    }

    // Reserve the tag only after CI and anonymous verification. A failed release
    // creation may be retried with this exact SHA; existing tags are never moved.
    const state = await releaseState();
    if (!state.tagSha) await github('git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/tags/${context.version}`, sha: context.sha }) });
    const notes = `Baikor-R application and Helm chart, licensed under EUPL-1.2.\n\n` +
      `- Source: [${context.sha}](${context.source}/commit/${context.sha})\n` +
      `- Image: \`${imageRef}\` (linux/amd64)\n- Immutable image: \`${artifacts.imageDigest}\`\n` +
      `- Helm chart: \`${chartRef}\`, version \`${context.version}\`\n- Chart digest: \`${chart.digest}\`\n\n` +
      `Both artifacts were downloaded anonymously before this release was created. Chart archive and SHA256SUMS are attached.\n\n` +
      `Follow the [CIVITAS/CORE addon installation instructions](https://github.com/Synnotech-AG/Baikor_R.Addon/blob/main/README.md).\n\n` +
      `Application versions are independent of the supported CIVITAS/CORE version.\n`;
    writeFileSync(`${output}/notes.md`, notes);
    command('gh', ['release', 'create', context.version, chartPackage, `${output}/SHA256SUMS`, `${output}/release.json`,
      '--repo', env.GITHUB_REPOSITORY, '--verify-tag', '--title', `Baikor-R ${context.version}`,
      '--generate-notes', '--notes-file', `${output}/notes.md`]);
    summary(`\nPublished: ${context.source}/releases/tag/${context.version}\n\nAnonymous image and chart downloads verified.`);
  } finally {
    command('docker', ['--config', dockerConfig, 'logout', 'ghcr.io']);
  }
}

try {
  assertReleaseContext(context);
  if (process.argv[2] === 'validate') {
    console.log(`Release ${context.version} will use ${context.sha}.`);
  } else if (process.argv[2] === 'publish') {
    await publishRelease();
  } else {
    throw new Error('Usage: node scripts/release/release.mjs validate|publish');
  }
} catch (error) {
  summary(`Release stopped: ${error.message}`);
  process.exitCode = 1;
}
