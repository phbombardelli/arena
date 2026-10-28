import { LANGS, setLang, t } from '@core/i18n/i18n';
import { Popover } from '@ui/common/Popover';
import { useLang } from './useLang';

/**
 * Seletor de língua na barra de cima (B-10). Troca a qualquer momento: o
 * croqui aberto não muda, só as palavras da tela e da folha.
 */
export function LanguageSwitcher() {
  const lang = useLang();
  const atual = LANGS.find((l) => l.code === lang)!;
  return (
    <Popover
      className="lang-popover"
      align="right"
      title={t('lingua.titulo')}
      trigger={
        <>
          {atual.sigla} <span className="caret">▾</span>
        </>
      }
    >
      {(fecha) => (
        <div className="menu-list" role="menu" aria-label={t('lingua.titulo')}>
          {LANGS.map((l) => (
            <button
              key={l.code}
              role="menuitemradio"
              aria-checked={l.code === lang}
              lang={l.code === 'pt' ? 'pt-BR' : l.code}
              onClick={() => {
                fecha();
                setLang(l.code);
              }}
            >
              <span>{l.nome}</span>
              <em>{l.code === lang ? '✓' : l.sigla}</em>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
