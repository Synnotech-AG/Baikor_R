import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { findInvalidPaths } from '../scripts/check-file-names.mjs'

const checkerPath = fileURLToPath(new URL('../scripts/check-file-names.mjs', import.meta.url))

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'baikor-r-file-names-'))
  t.after(async () => {
    assert.equal(dirname(root), resolve(tmpdir()))
    await rm(root, { recursive: true, force: true })
  })
  return root
}

async function writePaths(root, paths) {
  for (const path of paths) {
    const destination = join(root, path)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, '')
  }
}

test('accepts kebab-case files, config dotfiles, and dot-separated filename suffixes', async (t) => {
  const root = await createFixture(t)
  await writePaths(root, [
    '.oxlintrc.json',
    '.prettierrc.json',
    '.gitignore',
    'tsconfig.app.json',
    'vite.config.ts',
    'tests/file-name.test.mjs',
    'src/feature-2/route-3.tsx',
    '.storybook/main.ts',
    'public/fonts/ofl.txt',
    'readme.md',
  ])

  assert.deepEqual(await findInvalidPaths(root), [])
})

test('finds invalid nested names, empty directories, and non-code assets', async (t) => {
  const root = await createFixture(t)
  await mkdir(join(root, 'EmptyFolder'))
  await writePaths(root, [
    'BadFolder/inner-folder/badAsset.svg',
    'src/good-folder/BadFile.tsx',
    'public/fonts/OFL.txt',
    'README.md',
  ])

  assert.deepEqual(await findInvalidPaths(root), [
    'BadFolder',
    'BadFolder/inner-folder/badAsset.svg',
    'EmptyFolder',
    'README.md',
    'public/fonts/OFL.txt',
    'src/good-folder/BadFile.tsx',
  ])
})

test('rejects malformed kebab tokens and uppercase extensions', async (t) => {
  const root = await createFixture(t)
  await mkdir(join(root, 'bad.folder'))
  await writePaths(root, [
    '-leading.ts',
    'trailing-.ts',
    'double--dash.ts',
    'two..dots.ts',
    'snake_case.ts',
    'space name.svg',
    'photo.JPG',
  ])

  assert.deepEqual(await findInvalidPaths(root), [
    '-leading.ts',
    'bad.folder',
    'double--dash.ts',
    'photo.JPG',
    'snake_case.ts',
    'space name.svg',
    'trailing-.ts',
    'two..dots.ts',
  ])
})

test('skips generated and vendor directories at every depth', async (t) => {
  const root = await createFixture(t)
  await writePaths(root, [
    'node_modules/BadPackage/BadFile.js',
    'dist/BadFile.js',
    'coverage/BadFile.json',
    '.vite/BadFile.json',
    'dist-ssr/BadFile.js',
    'test-results/BadFile.txt',
    'playwright-report/BadFile.html',
    '.git/BadFile',
    'src/nested/node_modules/BadFile.js',
  ])

  assert.deepEqual(await findInvalidPaths(root), [])
})

test('does not exempt files or directory prefixes that resemble exclusions', async (t) => {
  const root = await createFixture(t)
  await writePaths(root, ['node_modules', 'node_modules-extra/BadFile.js'])

  assert.deepEqual(await findInvalidPaths(root), [
    'node_modules',
    'node_modules-extra',
    'node_modules-extra/BadFile.js',
  ])
})

test('does not follow directory symlinks outside the checked root', async (t) => {
  const root = await createFixture(t)
  const outside = await createFixture(t)
  await writePaths(outside, ['BadFile.ts'])
  await symlink(
    outside,
    join(root, 'linked-directory'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )

  assert.deepEqual(await findInvalidPaths(root), [])
})

test('CLI fails with invalid relative paths and succeeds after those paths are removed', async (t) => {
  const root = await createFixture(t)
  await writePaths(root, ['BadFile.ts', 'nested/bad_name.svg'])

  const invalid = spawnSync(process.execPath, [checkerPath, root], { encoding: 'utf8' })
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /BadFile\.ts/)
  assert.match(invalid.stderr, /nested\/bad_name\.svg/)

  await rm(join(root, 'BadFile.ts'))
  await rm(join(root, 'nested', 'bad_name.svg'))
  const valid = spawnSync(process.execPath, [checkerPath, root], { encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
})

test('CLI defaults to its frontend root regardless of the working directory', async (t) => {
  const root = await createFixture(t)
  const fixtureCheckerPath = join(root, 'scripts', 'check-file-names.mjs')
  await mkdir(dirname(fixtureCheckerPath))
  await copyFile(checkerPath, fixtureCheckerPath)
  await writePaths(root, ['BadFile.ts'])

  const result = spawnSync(process.execPath, [fixtureCheckerPath], {
    cwd: tmpdir(),
    encoding: 'utf8',
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /BadFile\.ts/)
})
