import {
  alignMeasureToFence,
  angleToFence,
  measureAngle,
  measureLength,
  setMeasureAngle,
  setMeasureLength,
} from '@core/library/measures';
import { formatDistance } from '@core/model/path';
import type { MeasureLine } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { NumberField } from './NumberField';
import { t } from '@core/i18n/i18n';

/**
 * Trena (B-64). Comprimento e ângulo se ajustam a partir da primeira
 * ponta. Os dois botões esquadram com a cerca mais próxima — só quando
 * pedidos: a trena nunca puxa ângulo sozinha.
 */
export function MeasurePanel({ measure }: { measure: MeasureLine }) {
  const { doc, apply } = useDocumentStore();
  const travado = measure.locked;
  const desvio = angleToFence(doc, measure);
  const esquadro =
    desvio === null
      ? null
      : desvio < 0.05
        ? t('trenap.paralela')
        : desvio > 89.95
          ? t('trenap.perpendicular')
          : t('trenap.grausCerca', { graus: formatDistance(desvio, 1) });

  const edita = (rotulo: string, recipe: (m: MeasureLine) => void) =>
    apply(rotulo, (d) => {
      const alvo = d.objects.find((o) => o.id === measure.id);
      if (alvo?.kind === 'measure' && !alvo.locked) recipe(alvo);
    });

  return (
    <>
      <NumberField
        label={t('campo.comprimento')}
        unit="m"
        value={Math.round(measureLength(measure) * 1000) / 1000}
        decimals={2}
        step={0.1}
        min={0.1}
        disabled={travado}
        onCommit={(v) => apply('Comprimento da trena', (d) => setMeasureLength(d, measure.id, v))}
      />
      <NumberField
        label={t('campo.angulo')}
        unit="°"
        value={Math.round(measureAngle(measure) * 10) / 10}
        decimals={1}
        step={1}
        disabled={travado}
        onCommit={(v) => apply('Ângulo da trena', (d) => setMeasureAngle(d, measure.id, v))}
      />
      {esquadro && <p className="note">Hoje: {esquadro}.</p>}
      <div className="row-buttons stacked">
        <button
          disabled={travado || desvio === null}
          title={t('trenap.perpDica')}
          onClick={() => apply('Trena perpendicular', (d) => alignMeasureToFence(d, measure.id, 'perpendicular'))}
        >
          {t('trenap.perp')}
        </button>
        <button
          disabled={travado || desvio === null}
          title={t('trenap.paraDica')}
          onClick={() => apply('Trena paralela', (d) => alignMeasureToFence(d, measure.id, 'paralela'))}
        >
          {t('trenap.para')}
        </button>
      </div>
      <NumberField
        label={t('trenap.casas')}
        value={measure.decimals}
        decimals={0}
        step={1}
        min={0}
        max={3}
        disabled={travado}
        onCommit={(v) => edita('Casas da trena', (m) => { m.decimals = Math.round(v); })}
      />
      <NumberField
        label={t('campo.texto')}
        unit="mm"
        value={measure.sizeMm}
        decimals={1}
        step={0.2}
        min={1}
        max={10}
        disabled={travado}
        onCommit={(v) => edita('Tamanho da trena', (m) => { m.sizeMm = v; })}
      />
      <label className="field">
        <span>{t('campo.cor')}</span>
        <input
          type="color"
          value={measure.color}
          disabled={travado}
          onChange={(e) =>
            apply(
              'Cor da trena',
              (d) => {
                const alvo = d.objects.find((o) => o.id === measure.id);
                if (alvo?.kind === 'measure' && !alvo.locked) alvo.color = e.target.value;
              },
              `cor-trena-${measure.id}`,
            )
          }
        />
      </label>
      <p className="note dim">
        {t('trenap.shiftNota')}
      </p>
    </>
  );
}
