import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

// Keep the editable theme in public/, but prevent a new application bundle from
// reading an older cached palette before Ant Design/OpenLayers initialize.
export function themeStylesheet(file: string | URL): Plugin {
  return {
    name: 'version-theme-stylesheet',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const version = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12)
        return html.replace('href="/theme.css"', `href="/theme.css?v=${version}"`)
      },
    },
  }
}
