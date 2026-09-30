// Runs the real app over made-up data, for taking the Help guide screenshots.
//   npx vite --config scripts/help-screenshots/vite.config.ts
// Then: node scripts/help-screenshots/capture.mjs
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

const repo = path.resolve(__dirname, '../..');

export default defineConfig({
  root: repo,
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@/integrations/supabase/client', replacement: path.join(__dirname, 'mock/supabase.ts') },
      { find: '@', replacement: path.join(repo, 'src') },
    ],
  },
  server: { port: 5198, strictPort: true },
});
