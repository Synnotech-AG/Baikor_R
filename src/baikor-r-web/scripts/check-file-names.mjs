import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const directoryName = /^\.?[a-z0-9]+(?:-[a-z0-9]+)*$/
const fileName = /^\.?[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/
const excludedDirectories = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.vite',
  'dist-ssr',
  'test-results',
  'playwright-report',
  '.git',
])

export async function findInvalidPaths(root) {
  const invalidPaths = []

  async function visit(directory, segments) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) {
        continue
      }

      const entrySegments = [...segments, entry.name]
      const pattern = entry.isDirectory() ? directoryName : fileName
      if (!pattern.test(entry.name)) {
        invalidPaths.push(entrySegments.join('/'))
      }

      if (entry.isDirectory()) {
        await visit(join(directory, entry.name), entrySegments)
      }
    }
  }

  await visit(resolve(root), [])
  return invalidPaths.sort()
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const root = process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url))
    const invalidPaths = await findInvalidPaths(root)
    if (invalidPaths.length > 0) {
      console.error(`File and directory names must use kebab-case:\n${invalidPaths.join('\n')}`)
      process.exitCode = 1
    } else {
      console.log('All frontend file and directory names use kebab-case.')
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
