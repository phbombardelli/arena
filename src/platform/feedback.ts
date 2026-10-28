import { getLang } from '@core/i18n/i18n';
import { APP_VERSION } from '@core/persistence/serialize';

/**
 * "Sugestões e contato", como no SAPH: o formulário vai para um Google Apps
 * Script publicado na conta do desenvolvedor, que repassa por e-mail
 * (código e instruções em feedback/ na raiz do repositório).
 *
 * Por enquanto aponta para o script do SAPH, que já está no ar; o assunto
 * do e-mail sai marcado "(Arena …)". Quando o script próprio do Arena for
 * publicado, basta trocar este endereço.
 */
const FEEDBACK_URL =
  'https://script.google.com/macros/s/AKfycbx8iixZmDiSInGrGHRKCbtx9kz81Nw98RV_fWTdSi5PFGiimEPp_EtiF8TuMetezC1D/exec';

export type TipoContato = 'sugestao' | 'erro' | 'contato';

export interface Contato {
  /** O script ignora id repetido: reenviar não duplica o e-mail. */
  id: string;
  tipo: TipoContato;
  nome: string;
  celular: string;
  email: string;
  mensagem: string;
}

const RASCUNHO = 'arena_contato_rascunho';

export const novoIdContato = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** O que foi digitado e não enviou fica guardado neste navegador. */
export function lerRascunho(): Partial<Contato> {
  try {
    return JSON.parse(window.localStorage.getItem(RASCUNHO) ?? '{}') as Partial<Contato>;
  } catch {
    return {};
  }
}

export function guardarRascunho(c: Contato): void {
  try {
    window.localStorage.setItem(RASCUNHO, JSON.stringify(c));
  } catch {
    // Sem armazenamento (janela anônima): segue sem rascunho.
  }
}

const apagarRascunho = () => {
  try {
    window.localStorage.removeItem(RASCUNHO);
  } catch {
    // idem
  }
};

const contexto = () => ({
  versao: APP_VERSION,
  idioma: getLang().toUpperCase(),
  tela: 'Arena',
  evento: `Arena ${APP_VERSION.replace(/\.0$/, '')}`,
  navegador: navigator.userAgent,
  telaPx: `${screen.width}x${screen.height} (janela ${innerWidth}x${innerHeight})`,
});

/**
 * Envia e, se der certo, apaga o rascunho. A primeira execução do Apps
 * Script às vezes falha "a frio": tenta mais uma vez antes de desistir.
 * Content-Type text/plain evita o preflight de CORS, que o script não
 * responde.
 */
export async function enviarContato(c: Contato): Promise<void> {
  const corpo = JSON.stringify({ ...c, contexto: contexto() });
  const tentar = async () => {
    const r = await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: corpo,
    });
    const j = (await r.json()) as { ok?: boolean; erro?: string };
    if (!j.ok) throw new Error(j.erro ?? 'falha');
  };
  try {
    await tentar();
  } catch {
    await new Promise((ok) => setTimeout(ok, 1500));
    await tentar();
  }
  apagarRascunho();
}
