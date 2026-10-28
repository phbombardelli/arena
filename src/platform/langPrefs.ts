import { getLang, isLang, onLangChange, setLang, t } from '@core/i18n/i18n';

/**
 * A língua escolhida fica guardada no aparelho e volta na próxima vez que o
 * Arena abrir. Sem escolha guardada, português.
 */

const CHAVE = 'arena.lingua';

/** Língua da página (leitores de tela, tradutor do navegador) e título da aba. */
function marcaPagina(): void {
  document.documentElement.lang = getLang() === 'pt' ? 'pt-BR' : getLang();
  document.title = t('aviso.tituloAba');
}

export function setupLangPrefs(): void {
  try {
    const guardada = window.localStorage.getItem(CHAVE);
    if (isLang(guardada)) setLang(guardada);
  } catch {
    // Armazenamento bloqueado: fica em português nesta sessão.
  }
  marcaPagina();
  onLangChange(() => {
    marcaPagina();
    try {
      window.localStorage.setItem(CHAVE, getLang());
    } catch {
      // Sem onde guardar: a troca vale só até fechar.
    }
  });
}
