import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build } from 'vite'
import { themeStylesheet } from '../scripts/theme-stylesheet.ts'

test('production HTML changes the theme URL whenever theme contents change', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'baikor-theme-'))
  try {
    const publicDir = path.join(root, 'public')
    await mkdir(publicDir)
    const themeFile = path.join(publicDir, 'theme.css')
    await writeFile(path.join(root, 'index.html'), '<link rel="stylesheet" href="/theme.css">')
    const render = async () => {
      await build({
        root,
        configFile: false,
        plugins: [themeStylesheet(themeFile)],
        logLevel: 'silent',
        build: { outDir: 'dist' },
      })
      return readFile(path.join(root, 'dist', 'index.html'), 'utf8')
    }
    await writeFile(themeFile, ':root { --color: #fff; }')
    const first = await render()
    assert.match(first, /href="\/theme\.css\?v=[a-f0-9]+"/)
    assert.equal(await render(), first)
    await writeFile(themeFile, ':root { --color: #000; }')
    assert.notEqual(await render(), first)
    assert.equal(
      await readFile(path.join(root, 'dist', 'theme.css'), 'utf8'),
      ':root { --color: #000; }',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
