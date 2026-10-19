import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const implementation = await import('../../scripts/release/test-bundle.mjs').catch(() => ({}));
const context = { version: '1.7.7', sha: 'a'.repeat(40), source: 'https://github.com/Synnotech-AG/Baikor_R' };
const labels = {
  'org.opencontainers.image.source': context.source,
  'org.opencontainers.image.version': context.version,
  'org.opencontainers.image.revision': context.sha,
};
const image = {
  manifest: { schemaVersion: 2, config: { mediaType: 'application/vnd.docker.container.image.v1+json', digest: `sha256:${'b'.repeat(64)}` }, layers: [] },
  config: { os: 'linux', architecture: 'amd64', config: { Labels: labels } },
};
const chart = {
  manifest: { schemaVersion: 2, config: { mediaType: 'application/vnd.cncf.helm.config.v1+json', digest: `sha256:${'c'.repeat(64)}` }, layers: [{ mediaType: 'application/vnd.cncf.helm.chart.content.v1.tar+gzip', digest: `sha256:${'d'.repeat(64)}` }] },
  config: { name: 'baikor-r-chart', version: '1.7.7', appVersion: '1.7.7', annotations: labels },
};

test('accepts only the digest of the downloaded bytes', () => {
  assert.equal(typeof implementation.assertDigest, 'function', 'bundle digest verification must exist');
  const sha = 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  assert.doesNotThrow(() => implementation.assertDigest(Buffer.from('abc'), sha));
  assert.throws(() => implementation.assertDigest(Buffer.from('changed'), sha));
  for (const invalid of ['', 'sha256:123', sha + '\n']) assert.throws(() => implementation.assertDigest(Buffer.from('abc'), invalid));
});

test('accepts the expected image and chart identities', () => {
  assert.equal(typeof implementation.assertBundleArtifact, 'function', 'bundle artifact validation must exist');
  assert.doesNotThrow(() => implementation.assertBundleArtifact('image', image, context));
  assert.doesNotThrow(() => implementation.assertBundleArtifact('chart', chart, context));
});

test('rejects wrong or missing source, revision and version for both artifacts', () => {
  assert.equal(typeof implementation.assertBundleArtifact, 'function');
  for (const [kind, fixture] of [['image', image], ['chart', chart]]) {
    for (const key of Object.keys(labels)) {
      for (const value of [undefined, 'different']) {
        const changed = structuredClone(fixture);
        const metadata = kind === 'image' ? changed.config.config.Labels : changed.config.annotations;
        metadata[key] = value;
        assert.throws(() => implementation.assertBundleArtifact(kind, changed, context));
      }
    }
  }
});

test('rejects incompatible chart metadata and ambiguous chart content layers', () => {
  assert.equal(typeof implementation.assertBundleArtifact, 'function');
  for (const key of ['name', 'version', 'appVersion']) {
    const changed = structuredClone(chart);
    changed.config[key] = 'wrong';
    assert.throws(() => implementation.assertBundleArtifact('chart', changed, context));
  }
  for (const layers of [[], [...chart.manifest.layers, ...chart.manifest.layers]]) {
    assert.throws(() => implementation.assertBundleArtifact('chart', { ...chart, manifest: { ...chart.manifest, layers } }, context));
  }
});

test('rejects image indexes, unsupported config types and unexpected image platforms', () => {
  assert.equal(typeof implementation.assertBundleArtifact, 'function');
  assert.throws(() => implementation.assertBundleArtifact('image', { ...image, manifest: { schemaVersion: 2, manifests: [] } }, context));
  const changed = structuredClone(image);
  changed.manifest.config.mediaType = 'application/unknown';
  assert.throws(() => implementation.assertBundleArtifact('image', changed, context));
  for (const change of [{ os: 'windows' }, { architecture: 'arm64' }]) {
    assert.throws(() => implementation.assertBundleArtifact('image', { ...image, config: { ...image.config, ...change } }, context));
  }
});

test('bundle metadata covers exported files and its own checksum without including other files', async () => {
  assert.equal(typeof implementation.writeBundleMetadata, 'function', 'bundle manifest writer must exist');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baikor-bundle-test-'));
  try {
    await writeFile(path.join(directory, 'image.tar.gz'), 'abc');
    await writeFile(path.join(directory, 'chart.tgz'), 'abc');
    await writeFile(path.join(directory, 'unrelated-secret'), 'must not enter metadata');
    await implementation.writeBundleMetadata(directory, context,
      { digest: `sha256:${'b'.repeat(64)}`, configDigest: `sha256:${'e'.repeat(64)}` },
      { digest: `sha256:${'c'.repeat(64)}`, layerDigest: `sha256:${'d'.repeat(64)}` });
    const manifest = JSON.parse(await readFile(path.join(directory, 'bundle.json'), 'utf8'));
    assert.equal(manifest.commit, context.sha);
    assert.equal(manifest.source, context.source);
    assert.equal(manifest.version, '1.7.7');
    assert.equal(manifest.image.tag, 'ghcr.io/synnotech-ag/baikor-r:1.7.7');
    assert.equal(manifest.image.digest, `sha256:${'b'.repeat(64)}`);
    assert.equal(manifest.image.configDigest, `sha256:${'e'.repeat(64)}`);
    assert.equal(manifest.chart.digest, `sha256:${'c'.repeat(64)}`);
    assert.equal(manifest.chart.layerDigest, `sha256:${'d'.repeat(64)}`);
    assert.deepEqual(manifest.files, {
      'image.tar.gz': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      'chart.tgz': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    });
    const sums = await readFile(path.join(directory, 'SHA256SUMS'), 'utf8');
    assert.match(sums, /^ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  image.tar.gz\n/);
    assert.match(sums, /^[a-f0-9]{64}  bundle.json$/m);
    assert.equal(sums.trim().split('\n').length, 3);
    assert.doesNotMatch(sums, /unrelated-secret/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
