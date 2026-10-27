import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const lintBin = fileURLToPath(new URL('../node_modules/oxlint/bin/oxlint', import.meta.url))
const lintConfig = fileURLToPath(new URL('../.oxlintrc.json', import.meta.url))
const formatBin = fileURLToPath(
  new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url),
)
const formatConfig = fileURLToPath(new URL('../.prettierrc.json', import.meta.url))

async function fixture(t, files) {
  const root = await mkdtemp(join(tmpdir(), 'baikor-r-conventions-'))
  t.after(async () => {
    assert.equal(dirname(root), resolve(tmpdir()))
    await rm(root, { recursive: true, force: true })
  })
  await copyFile(lintConfig, join(root, '.oxlintrc.json'))
  for (const [path, content] of Object.entries(files)) {
    const destination = join(root, path)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, content)
  }
  return root
}

function lint(root) {
  return spawnSync(process.execPath, [lintBin, '--config', join(root, '.oxlintrc.json'), '.'], {
    cwd: root,
    encoding: 'utf8',
  })
}

test('lint rejects unbraced conditionals without relying on a repository gitignore', async (t) => {
  const root = await fixture(t, {
    'src/entry.js': "if (Math.random() > 0.5) console.log('fixture')\n",
  })
  const result = lint(root)
  assert.equal(result.status, 1, result.stderr + result.stdout)
  assert.match(result.stderr + result.stdout, /curly/)
})

test('lint excludes vendor and generated code even without a gitignore file', async (t) => {
  const root = await fixture(t, {
    'src/entry.js': 'export const enabled = true\n',
    'node_modules/vendor/dependency.js': "if (Math.random()) console.log('vendor')\n",
    'dist/bundle.js': "if (Math.random()) console.log('generated')\n",
  })
  const result = lint(root)
  assert.equal(result.status, 0, result.stderr + result.stdout)
})

test('formatting checks reject inline if blocks and expand them into multiline blocks', async (t) => {
  const root = await fixture(t, {
    'entry.js': "if (Math.random() > 0.5) { console.log('fixture') }\n",
  })
  const format = (mode) =>
    spawnSync(process.execPath, [formatBin, '--config', formatConfig, mode, 'entry.js'], {
      cwd: root,
      encoding: 'utf8',
    })
  assert.equal(format('--check').status, 1)
  const fixed = format('--write')
  assert.equal(fixed.status, 0, fixed.stderr + fixed.stdout)
  assert.equal(
    await readFile(join(root, 'entry.js'), 'utf8'),
    "if (Math.random() > 0.5) {\n  console.log('fixture')\n}\n",
  )
  assert.equal(format('--check').status, 0)
  const result = lint(root)
  assert.equal(result.status, 0, result.stderr + result.stdout)
})
