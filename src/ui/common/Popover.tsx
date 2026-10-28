import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '@core/i18n/i18n';

interface PopoverProps {
  /** Conteúdo do botão que abre. */
  trigger: ReactNode;
  title?: string;
  className?: string;
  /** Para onde abre: abaixo (barra de cima) ou acima (barra de baixo). */
  placement?: 'down' | 'up';
  align?: 'left' | 'right';
  children: ReactNode | ((close: () => void) => ReactNode);
}

/**
 * Painel suspenso preso a um botão.
 *
 * É o lugar do que se ajusta uma vez por croqui — folha, grade —:
 * precisa estar a um clique, mas não merece espaço fixo na tela. Fecha ao
 * clicar fora ou no Esc, como o menu.
 */
export function Popover({
  trigger,
  title,
  className,
  placement = 'down',
  align = 'left',
  children,
}: PopoverProps) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const foraDaqui = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const noEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAberto(false);
      }
    };
    document.addEventListener('pointerdown', foraDaqui, true);
    document.addEventListener('keydown', noEsc, true);
    return () => {
      document.removeEventListener('pointerdown', foraDaqui, true);
      document.removeEventListener('keydown', noEsc, true);
    };
  }, [aberto]);

  const fecha = () => setAberto(false);

  return (
    <div className={`popover ${className ?? ''}`} ref={raiz}>
      <button
        className={aberto ? 'popover-trigger active' : 'popover-trigger'}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        {trigger}
      </button>
      {aberto && (
        <div className={`popover-panel ${placement} ${align}`} role="dialog">
          {typeof children === 'function' ? children(fecha) : children}
        </div>
      )}
    </div>
  );
}

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Janela modal simples, para o que precisa de mais espaço que um popover. */
export function Dialog({ title, onClose, children }: DialogProps) {
  useEffect(() => {
    const noEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', noEsc, true);
    return () => document.removeEventListener('keydown', noEsc, true);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} title={t('comum.fechar')}>
            ✕
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
