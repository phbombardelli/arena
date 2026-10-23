import { useSyncExternalStore } from 'react';

/**
 * App instalável (B-34, decisão 84).
 *
 * O service worker só existe no build publicado e por http(s): aberto por
 * file:// (o dist/ sem servidor, requisito antigo) e em desenvolvimento ele
 * fica de fora — em dev guardaria versões velhas do código no meio do
 * trabalho.
 *
 * Duas coisas chegam à interface:
 * - `instalavel`: o navegador ofereceu instalar (Chrome/Edge); o menu
 *   Arquivo mostra "Instalar como app".
 * - `atualizacao`: uma versão nova foi baixada e espera. NÃO recarrega
 *   sozinha — o croqui aberto poderia ter trabalho não salvo; o usuário
 *   escolhe a hora.
 */

interface PromptDeInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface Estado {
  instalavel: boolean;
  atualizacao: boolean;
}

let estado: Estado = { instalavel: false, atualizacao: false };
let pedido: PromptDeInstalacao | null = null;
let esperando: ServiceWorker | null = null;
const ouvintes = new Set<() => void>();

const muda = (parcial: Partial<Estado>) => {
  estado = { ...estado, ...parcial };
  ouvintes.forEach((f) => f());
};

export function usePwa(): Estado {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => estado,
  );
}

/** Abre o pedido de instalação do navegador. */
export async function installApp(): Promise<void> {
  if (!pedido) return;
  await pedido.prompt();
  await pedido.userChoice;
  pedido = null;
  muda({ instalavel: false });
}

/** Troca para a versão nova e recarrega. */
export function applyUpdate(): void {
  if (!esperando) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  esperando.postMessage('assumir');
}

export function setupPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pedido = e as PromptDeInstalacao;
    muda({ instalavel: true });
  });
  window.addEventListener('appinstalled', () => {
    pedido = null;
    muda({ instalavel: false });
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.location.protocol.startsWith('http')) {
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        const avisa = (sw: ServiceWorker | null) => {
          // Só é "atualização" se já havia uma versão no comando; a primeira
          // instalação não precisa de aviso.
          if (sw && navigator.serviceWorker.controller) {
            esperando = sw;
            muda({ atualizacao: true });
          }
        };
        if (reg.waiting) avisa(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const novo = reg.installing;
          novo?.addEventListener('statechange', () => {
            if (novo.state === 'installed') avisa(novo);
          });
        });
        // Quem deixa o app aberto dias seguidos também recebe a versão nova.
        window.setInterval(() => void reg.update(), 60 * 60 * 1000);
      })
      .catch((err) => console.warn('Service worker não registrou:', err));
  });
}
