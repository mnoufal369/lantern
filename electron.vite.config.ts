import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

/** Commit this build was made from — the in-app update check compares it to origin. */
function buildCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { timeout: 5000 }).toString().trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __BUILD_COMMIT__: JSON.stringify(buildCommit()),
      // Where this build was made from — self-update pulls and rebuilds there.
      __BUILD_SOURCE_DIR__: JSON.stringify(process.cwd())
    },
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: { format: 'cjs' }
      }
    },
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@': resolve('src/renderer/src')
      }
    }
  }
})
