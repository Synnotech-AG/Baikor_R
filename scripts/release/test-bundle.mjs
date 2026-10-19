import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { assertArtifactIdentity, assertReleaseContext } from './guards.mjs';

const imageName = 'ghcr.io/synnotech-ag/baikor-r';
const chartName = 'ghcr.io/synnotech-ag/baikor-r-chart';
const chartLayerType = 'application/vnd.cncf.helm.chart.content.v1.tar+gzip';
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export function assertDigest(bytes, expected) {
  if (!digestPattern.test(expected) || expected.length !== 71 || digest(bytes) !== expected) {
    throw new Error('Downloaded bytes do not match the expected SHA256 digest.');
  }
}

export function assertBundleArtifact(kind, { manifest, config }, context) {
  if (manifest.schemaVersion !== 2 || manifest.manifests || !digestPattern.test(manifest.config?.digest)) {
    throw new Error('Expected a single image or chart manifest with a SHA256 configuration.');
  }
  if (kind === 'image') {
    if (!['application/vnd.oci.image.config.v1+json', 'application/vnd.docker.container.image.v1+json'].includes(manifest.config.mediaType)) {
      throw new Error('Unexpected image configuration media type.');
    }
    assertArtifactIdentity(config.config?.Labels, context);
    if (config.os !== 'linux' || config.architecture !== 'amd64') throw new Error('Expected a linux/amd64 application image.');
  } else if (kind === 'chart') {
    if (manifest.config.mediaType !== 'application/vnd.cncf.helm.config.v1+json') throw new Error('Unexpected Helm configuration media type.');
    assertArtifactIdentity(config.annotations, context);
    if (config.name !== 'baikor-r-chart' || config.version !== context.version || config.appVersion !== context.version) {
      throw new Error('Chart name, version or appVersion does not match the requested bundle.');
    }
    if (manifest.layers?.length !== 1 || manifest.layers[0].mediaType !== chartLayerType || !digestPattern.test(manifest.layers[0].digest)) {
      throw new Error('Expected exactly one SHA256 Helm chart content layer.');
    }
  } else {
    throw new Error('Unknown bundle artifact kind.');
  }
}

async function fileSha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export async function writeBundleMetadata(directory, context, image, chart) {
  const files = {};
  for (const name of ['image.tar.gz', 'chart.tgz']) files[name] = await fileSha256(path.join(directory, name));
  const bundle = {
    schemaVersion: 1, version: context.version, source: context.source, commit: context.sha,
    platform: 'linux/amd64',
    image: { tag: `${imageName}:${context.version}`, digest: image.digest, configDigest: image.configDigest, ref: `${imageName}@${image.digest}`, file: 'image.tar.gz' },
    chart: { repository: `oci://${chartName}`, digest: chart.digest, layerDigest: chart.layerDigest, ref: `oci://${chartName}@${chart.digest}`, file: 'chart.tgz' },
    files,
  };
  await writeFile(path.join(directory, 'bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`);
  const checksums = { ...files, 'bundle.json': await fileSha256(path.join(directory, 'bundle.json')) };
  await writeFile(path.join(directory, 'SHA256SUMS'), Object.entries(checksums).map(([name, sha]) => `${sha}  ${name}\n`).join(''));
}

async function registryResponse(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Registry download failed: HTTP ${response.status}.`);
  return response;
}

async function registrySnapshot(name, kind, context, env) {
  const repository = name.replace(/^ghcr\.io\//, '');
  const tokenUrl = new URL('https://ghcr.io/token');
  tokenUrl.searchParams.set('service', 'ghcr.io');
  tokenUrl.searchParams.set('scope', `repository:${repository}:pull`);
  const tokenResponse = await registryResponse(tokenUrl, {
    Authorization: `Basic ${Buffer.from(`${env.GITHUB_ACTOR}:${env.GH_TOKEN}`).toString('base64')}`,
  });
  const { token } = await tokenResponse.json();
  if (!token) throw new Error('GHCR did not return a registry pull token.');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
  };
  const base = `https://ghcr.io/v2/${repository}`;
  // Resolve the tag once, then retrieve and verify the immutable manifest.
  const tagResponse = await registryResponse(`${base}/manifests/${context.version}`, headers);
  const tagBytes = Buffer.from(await tagResponse.arrayBuffer());
  const manifestDigest = digest(tagBytes);
  const advertisedDigest = tagResponse.headers.get('docker-content-digest');
  if (advertisedDigest) assertDigest(tagBytes, advertisedDigest);
  const pinnedResponse = await registryResponse(`${base}/manifests/${manifestDigest}`, headers);
  const pinnedBytes = Buffer.from(await pinnedResponse.arrayBuffer());
  assertDigest(pinnedBytes, manifestDigest);
  const manifest = JSON.parse(pinnedBytes);
  if (!digestPattern.test(manifest.config?.digest)) throw new Error('Expected a single manifest with a SHA256 configuration.');
  const configResponse = await registryResponse(`${base}/blobs/${manifest.config.digest}`, headers);
  const configBytes = Buffer.from(await configResponse.arrayBuffer());
  assertDigest(configBytes, manifest.config.digest);
  const config = JSON.parse(configBytes);
  assertBundleArtifact(kind, { manifest, config }, context);
  return { digest: manifestDigest, manifest, base, headers };
}

async function exportBundle() {
  const env = process.env;
  const context = {
    version: env.RELEASE_VERSION, sha: env.EXPECTED_COMMIT,
    ref: env.GITHUB_REF, defaultBranch: env.DEFAULT_BRANCH,
    source: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`,
  };
  assertReleaseContext(context);
  if (env.GITHUB_ACTIONS !== 'true' || !env.GH_TOKEN || context.source !== 'https://github.com/Synnotech-AG/Baikor_R') {
    throw new Error('Test bundles require this repository\'s GitHub Actions GITHUB_TOKEN.');
  }
  const temporaryRoot = await realpath(env.RUNNER_TEMP);
  const workspace = await realpath(env.GITHUB_WORKSPACE);
  const relative = path.relative(workspace, temporaryRoot);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Runner temporary storage must be outside the checkout.');
  }
  const output = path.join(temporaryRoot, 'baikor-test-bundle');
  await mkdir(output);
  const temporary = await mkdtemp(path.join(temporaryRoot, 'baikor-bundle-private-'));
  const dockerConfig = path.join(temporary, 'docker');
  const docker = (args, options = {}) => execFileSync('docker', ['--config', dockerConfig, ...args], { stdio: 'inherit', ...options });
  try {
    await mkdir(dockerConfig);
    const image = await registrySnapshot(imageName, 'image', context, env);
    const chart = await registrySnapshot(chartName, 'chart', context, env);
    docker(['login', 'ghcr.io', '--username', env.GITHUB_ACTOR, '--password-stdin'], {
      input: env.GH_TOKEN, stdio: ['pipe', 'inherit', 'inherit'],
    });
    const immutableImage = `${imageName}@${image.digest}`;
    const publishedTag = `${imageName}:${context.version}`;
    docker(['pull', '--platform', 'linux/amd64', immutableImage]);
    const [loaded] = JSON.parse(docker(['image', 'inspect', immutableImage], { encoding: 'utf8', stdio: 'pipe' }));
    if (loaded.Id !== image.manifest.config.digest) throw new Error('Docker image configuration differs from the verified OCI manifest.');
    assertArtifactIdentity(loaded.Config?.Labels, context);
    docker(['tag', immutableImage, publishedTag]);
    const imageTar = path.join(temporary, 'image.tar');
    docker(['save', '--output', imageTar, publishedTag]);
    await pipeline(createReadStream(imageTar), createGzip(), createWriteStream(path.join(output, 'image.tar.gz'), { flags: 'wx' }));

    const layer = chart.manifest.layers[0];
    const chartResponse = await registryResponse(`${chart.base}/blobs/${layer.digest}`, chart.headers);
    const chartFile = path.join(output, 'chart.tgz');
    await pipeline(Readable.fromWeb(chartResponse.body), createWriteStream(chartFile, { flags: 'wx' }));
    if (`sha256:${await fileSha256(chartFile)}` !== layer.digest) throw new Error('Chart archive differs from its verified OCI content layer.');
    await writeBundleMetadata(output, context,
      { digest: image.digest, configDigest: image.manifest.config.digest },
      { digest: chart.digest, layerDigest: layer.digest });
    const summary = `## Test bundle ${context.version}\n\nSource: ${context.sha}\n\nImage: ${immutableImage}\n\nChart: oci://${chartName}@${chart.digest}\n\nAuthenticated registry downloads verified in Actions. This does not verify anonymous access or direct local registry access, and does not create a GitHub release.\n`;
    console.log(summary);
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summary);
  } finally {
    // The upload step selects only four output files, never this credential directory.
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await exportBundle();
  } catch (error) {
    console.error(`Test bundle stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
