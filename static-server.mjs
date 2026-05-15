#!/usr/bin/env node
/*
   Static server pra QA local — serve a pasta public/ sem dependência externa.

   Uso:
     node tools/static-server.mjs              # default: porta 4173
     node tools/static-server.mjs 8080         # porta custom
     PORT=3000 node tools/static-server.mjs    # via env var

   Sem build. Sem npm install. Só Node 18+.
*/

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', 'public');
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.mjs':  'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif':  'image/gif',
    '.ico':  'image/x-icon',
    '.ttf':  'font/ttf',
    '.otf':  'font/otf',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.txt':  'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
    try {
        let urlPath = decodeURIComponent(req.url.split('?')[0]);
        if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

        // Path traversal guard
        const safe = normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
        let filePath = join(ROOT, safe);
        if (!filePath.startsWith(ROOT + sep) && filePath !== ROOT) {
            res.writeHead(403); res.end('Forbidden');
            return;
        }

        let st;
        try { st = await stat(filePath); } catch { st = null; }

        // Directory → tenta index.html dentro
        if (st && st.isDirectory()) {
            filePath = join(filePath, 'index.html');
            try { st = await stat(filePath); } catch { st = null; }
        }

        if (!st || !st.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`404 — ${urlPath} não encontrado em public/`);
            console.log(`  ${req.method} ${urlPath} → 404`);
            return;
        }

        const body = await readFile(filePath);
        const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': type,
            'Cache-Control': 'no-cache',
            'Content-Length': body.length,
        });
        res.end(body);
        console.log(`  ${req.method} ${urlPath} → 200 (${body.length}B)`);
    } catch (err) {
        res.writeHead(500); res.end('500 — ' + err.message);
        console.error('  ERROR:', err);
    }
});

server.listen(PORT, () => {
    console.log('');
    console.log('  ▌ INTRUSIVE — static QA server');
    console.log('  ▌ servindo:  ' + ROOT);
    console.log('  ▌ url:       http://localhost:' + PORT);
    console.log('  ▌ Ctrl+C pra parar.');
    console.log('');
});
