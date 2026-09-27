import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const repositoryName=process.env.GITHUB_REPOSITORY?.split('/')[1];
export default defineConfig({base:repositoryName?`/${repositoryName}/`:'/',plugins:[react()],server:{host:'0.0.0.0',proxy:{'/socket.io':{target:'http://localhost:3001',ws:true}}}});
