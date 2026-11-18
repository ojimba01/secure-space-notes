// A demo of the app over made-up data, built as static files: the same app the
// Help guide screenshots use (scripts/help-screenshots), for sharing with a
// designer. Nothing in it talks to the real database.
//   mkdir -p scripts/demo/public && cp -r public/brand public/form-templates public/favicon.ico scripts/demo/public/
//   npx vite build --config scripts/demo/vite.config.ts
// The site is written to demo-dist/. The copy step leaves out the Help
// screenshots and the text reader, which the demo does not need.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

const repo = path.resolve(__dirname, '../..');
const mock = path.join(repo, 'scripts/help-screenshots/mock');

export default defineConfig({
  root: repo,
  base: './',
  define: { __BUILD_ID__: JSON.stringify('demo') },
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@/integrations/supabase/client', replacement: path.join(mock, 'supabase.ts') },
      { find: /^react-router-dom$/, replacement: path.join(__dirname, 'router.ts') },
      { find: '@', replacement: path.join(repo, 'src') },
    ],
  },
  // Only what the pages load: not the Help screenshots or the text reader.
  publicDir: path.join(__dirname, 'public'),
  build: { outDir: path.join(repo, 'demo-dist'), emptyOutDir: true },
});
