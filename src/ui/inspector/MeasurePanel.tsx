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
        ? 'paralela à cerca'
        : desvio > 89.95
          ? 'perpendicular à cerca'
          : `${formatDistance(desvio, 1)}° da cerca`;

  const edita = (rotulo: string, recipe: (m: MeasureLine) => void) =>
    apply(rotulo, (d) => {
      const alvo = d.objects.find((o) => o.id === measure.id);
      if (alvo?.kind === 'measure' && !alvo.locked) recipe(alvo);
    });

  return (
    <>
      <NumberField
        label="Comprimento"
        unit="m"
        value={Math.round(measureLength(measure) * 1000) / 1000}
        decimals={2}
        step={0.1}
        min={0.1}
        disabled={travado}
        onCommit={(v) => apply('Comprimento da trena', (d) => setMeasureLength(d, measure.id, v))}
      />
      <NumberField
        label="Ângulo"
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
          title="Gira em torno da primeira ponta até ficar a 90° da cerca mais próxima"
          onClick={() => apply('Trena perpendicular', (d) => alignMeasureToFence(d, measure.id, 'perpendicular'))}
        >
          Perpendicular à borda
        </button>
        <button
          disabled={travado || desvio === null}
          title="Gira em torno da primeira ponta até ficar ao longo da cerca mais próxima"
          onClick={() => apply('Trena paralela', (d) => alignMeasureToFence(d, measure.id, 'paralela'))}
        >
          Paralela à borda
        </button>
      </div>
      <NumberField
        label="Casas"
        value={measure.decimals}
        decimals={0}
        step={1}
        min={0}
        max={3}
        disabled={travado}
        onCommit={(v) => edita('Casas da trena', (m) => { m.decimals = Math.round(v); })}
      />
      <NumberField
        label="Texto"
        unit="mm"
        value={measure.sizeMm}
        decimals={1}
        step={0.2}
        min={1}
        max={10}
        disabled={travado}
        onCommit={(v) => edita('Tamanho da trena', (m) => { m.sizeMm = v; })}
      />
      <p className="note dim">
        Ao desenhar, segure Shift para a trena sair perpendicular ou paralela à
        cerca mais próxima.
      </p>
    </>
  );
}
