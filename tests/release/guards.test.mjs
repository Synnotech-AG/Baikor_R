import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertReleaseContext, assertReleaseState, assertArtifactIdentity, prepareChartMetadata, chartArchiveName } from '../../scripts/release/guards.mjs';

const context = {
  version: '1.7.6', ref: 'refs/heads/main', defaultBranch: 'main',
  sha: 'a'.repeat(40), source: 'https://github.com/Synnotech-AG/Baikor_R',
};

test('accepts stable application versions independently of the Core minor', () => {
  for (const version of ['0.0.0', '1.7.6', '2.0.0', '12.34.56']) {
    assert.doesNotThrow(() => assertReleaseContext({ ...context, version }));
  }
});

test('rejects ambiguous, prerelease, padded and shell-like versions', () => {
  for (const version of ['', 'v1.7.6', '01.7.6', '1.07.6', '1.7.06', '1.7', '1.7.6-beta', '1.7.6+build', ' 1.7.6', '1.7.6\n', '1.7.6;echo unsafe']) {
    assert.throws(() => assertReleaseContext({ ...context, version }));
  }
});

test('rejects dispatches from tags or non-default branches and invalid commits', () => {
  for (const change of [{ ref: 'refs/heads/feature' }, { ref: 'refs/tags/1.7.6' }, { defaultBranch: 'other' }, { sha: 'main' }]) {
    assert.throws(() => assertReleaseContext({ ...context, ...change }));
  }
});

test('allows a fresh release or recovery with the exact existing source tag', () => {
  assert.doesNotThrow(() => assertReleaseState({ tagSha: null, releaseExists: false }, context));
  assert.doesNotThrow(() => assertReleaseState({ tagSha: context.sha, releaseExists: false }, context));
});

test('refuses an existing release or a tag on any other commit', () => {
  assert.throws(() => assertReleaseState({ tagSha: context.sha, releaseExists: true }, context));
  assert.throws(() => assertReleaseState({ tagSha: 'b'.repeat(40), releaseExists: false }, context));
});

test('only reuses packages carrying this exact source, version and commit', () => {
  const labels = {
    'org.opencontainers.image.source': context.source,
    'org.opencontainers.image.version': context.version,
    'org.opencontainers.image.revision': context.sha,
  };
  assert.doesNotThrow(() => assertArtifactIdentity(labels, context));
  for (const key of Object.keys(labels)) {
    assert.throws(() => assertArtifactIdentity({ ...labels, [key]: 'different' }, context));
    const missing = { ...labels };
    delete missing[key];
    assert.throws(() => assertArtifactIdentity(missing, context));
  }
});

test('prepares release chart annotations without changing other metadata', () => {
  const yaml = 'apiVersion: v2\nname: baikor-r-chart\nannotations:\n  org.opencontainers.image.source: "old"\n  org.opencontainers.image.version: "development"\n  org.opencontainers.image.revision: "development"\n  org.opencontainers.image.licenses: EUPL-1.2\n';
  assert.equal(prepareChartMetadata(yaml, context), `apiVersion: v2\nname: baikor-r-chart\nannotations:\n  org.opencontainers.image.source: "https://github.com/Synnotech-AG/Baikor_R"\n  org.opencontainers.image.version: "1.7.6"\n  org.opencontainers.image.revision: "${'a'.repeat(40)}"\n  org.opencontainers.image.licenses: EUPL-1.2\n`);
  assert.throws(() => prepareChartMetadata('name: baikor-r-chart\n', context));
  assert.throws(() => prepareChartMetadata(yaml + '  org.opencontainers.image.revision: duplicate\n', context));
});

test('finds Helm digest downloads without assuming version-based filenames', () => {
  const filename = 'baikor-r-chart@sha256-217848e72549ed79a88a36ad5e733683254a02df93d0fd6b25b6ffb096833971.tgz';
  assert.equal(chartArchiveName([filename]), filename);
  assert.equal(chartArchiveName(['baikor-r-chart-2.3.4.tgz']), 'baikor-r-chart-2.3.4.tgz');
  assert.throws(() => chartArchiveName([]));
  assert.throws(() => chartArchiveName(['one.tgz', 'two.tgz']));
});
