import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages ではリポジトリ名のパス配下で公開されるため合わせる
  base: '/trip-splitter/',
})
