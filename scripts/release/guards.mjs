export function assertReleaseContext({ version, ref, defaultBranch, sha }) {
  if (typeof version !== 'string' || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version) || version.trim() !== version) {
    throw new Error('Version must be a stable, plain X.Y.Z version without a prefix, suffix or leading zero.');
  }
  if (defaultBranch !== 'main' || ref !== 'refs/heads/main') {
    throw new Error('Run Release from the default main branch.');
  }
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Release requires the exact selected source commit.');
}

export function assertReleaseState({ tagSha, releaseExists }, { sha }) {
  if (releaseExists) throw new Error('A GitHub release already exists for this version; choose a new version.');
  if (tagSha && tagSha !== sha) throw new Error('This version tag belongs to a different commit; tags are never moved.');
}

export function assertArtifactIdentity(labels, { version, sha, source }) {
  for (const [key, value] of Object.entries({ source, version, revision: sha })) {
    if (labels?.[`org.opencontainers.image.${key}`] !== value) {
      throw new Error(`Existing artifact has a different or missing ${key}; choose a new version. It will not be overwritten.`);
    }
  }
}

// Only rewrite the three explicitly maintained chart annotations. Missing or
// duplicate fields fail closed instead of guessing at arbitrary YAML structure.
export function prepareChartMetadata(yaml, { version, sha, source }) {
  for (const [key, value] of Object.entries({ source, version, revision: sha })) {
    const pattern = new RegExp(`^  org\\.opencontainers\\.image\\.${key}:.*$`, 'gm');
    if ([...yaml.matchAll(pattern)].length !== 1) throw new Error(`Chart must declare exactly one ${key} annotation.`);
    yaml = yaml.replace(pattern, `  org.opencontainers.image.${key}: ${JSON.stringify(value)}`);
  }
  return yaml;
}

export function chartArchiveName(files) {
  const archives = files.filter(file => file.endsWith('.tgz'));
  if (archives.length !== 1) throw new Error('Expected exactly one downloaded Helm chart archive.');
  return archives[0];
}
