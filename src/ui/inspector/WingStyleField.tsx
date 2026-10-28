import type { WingsAppearance, WingStyle } from '@core/model/types';
import { NumberField } from './NumberField';
import { t } from '@core/i18n/i18n';

interface Props {
  wings: WingsAppearance;
  disabled?: boolean;
  onChange: (patch: Partial<WingsAppearance>, label: string) => void;
  /** A profundidade do obstáculo já vem da largura de salto. */
  showDepth?: boolean;
}

/**
 * Campos do paraflanco, compartilhados pelo obstáculo e pela linha de
 * cronometragem — os dois desenham o mesmo painel lateral.
 */
export function WingStyleField({ wings, disabled, onChange, showDepth = true }: Props) {
  return (
    <>
      <label className="field">
        <span>{t('obstp.suporte')}</span>
        <select
          value={wings.style}
          disabled={disabled}
          onChange={(e) => onChange({ style: e.target.value as WingStyle }, 'Suporte das varas')}
        >
          <option value="paraflanco">{t('obstp.paraflanco')}</option>
          <option value="pilar">{t('obstp.soMontante')}</option>
          <option value="nenhum">{t('obstp.varaNoChao')}</option>
        </select>
      </label>

      {wings.style === 'paraflanco' && (
        <>
          <NumberField
            label={t('campo.espessura')}
            unit="m"
            value={wings.widthM}
            decimals={2}
            step={0.05}
            min={0.05}
            disabled={disabled}
            onCommit={(v) => onChange({ widthM: v }, 'Espessura do paraflanco')}
          />
          {showDepth && (
            <NumberField
              label={t('campo.profundidade')}
              unit="m"
              value={wings.depthM}
              decimals={2}
              step={0.1}
              min={0.1}
              disabled={disabled}
              onCommit={(v) => onChange({ depthM: v }, 'Profundidade do paraflanco')}
            />
          )}
          <label className="field">
            <span>{t('campo.cor')}</span>
            <input
              type="color"
              value={wings.color}
              disabled={disabled}
              onChange={(e) => onChange({ color: e.target.value }, 'Cor do paraflanco')}
            />
          </label>
        </>
      )}
    </>
  );
}
