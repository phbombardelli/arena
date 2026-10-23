import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Todos os arquivos de `public/`, com caminho relativo e barras normais. */
function publicFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return publicFiles(caminho, base);
    return [relative(base, caminho).split(sep).join('/')];
  });
}

/**
 * Service worker do app instalável (B-34, decisão 84). Gerado no build com
 * a lista exata do que foi publicado — os nomes com hash e o que está em
 * `public/` (ícones, banco de pistas) —, e uma versão tirada dessa lista:
 * cada publicação nova troca o arquivo e o navegador baixa a atualização.
 */
function serviceWorker(): Plugin {
  return {
    name: 'arena-service-worker',
    apply: 'build',
    generateBundle(_opcoes, bundle) {
      const arquivos = [
        './',
        ...Object.keys(bundle),
        ...publicFiles(r('./public')),
      ].filter((f) => f !== 'sw.js');
      const corpo = `/* Arena — service worker gerado no build. Não editar. */
const CACHE = 'arena-__VERSAO__';
const ARQUIVOS = ${JSON.stringify(arquivos)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('arena-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// A página pede para a versão nova assumir (quando o usuário aceita recarregar).
self.addEventListener('message', (e) => {
  if (e.data === 'assumir') self.skipWaiting();
});

// Primeiro o que está guardado: abre sem rede. O que não está (o leitor de
// texto do mapa, que vem de fora) vai à rede como sempre.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // ignoreVary: o script do app vai com crossorigin, e a cópia guardada
  // (pedida sem Origin) não casaria com ele quando o servidor manda Vary.
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./', { ignoreVary: true }).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreVary: true }).then((r) => r || fetch(req)));
});
`;
      // A versão sai da lista E do próprio código: mudar só o service
      // worker também tem de trocar o cache.
      const versao = createHash('sha256').update(arquivos.join('\n') + corpo).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: corpo.replace('__VERSAO__', versao) });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  // base relativa: o build em dist/ abre por file:// sem servidor (requisito offline)
  base: './',
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@render': r('./src/render'),
      '@ui': r('./src/ui'),
      '@store': r('./src/store'),
      '@platform': r('./src/platform'),
    },
  },
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
