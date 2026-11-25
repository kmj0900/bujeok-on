import { createServer } from './server.js';
const port = Number(process.env.PORT) || 3000;
const s = await createServer({ port });
console.log(`부적소동 온라인 서버: http://localhost:${s.port}`);
