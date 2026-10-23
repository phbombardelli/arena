import type { TextLabel } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { NumberField } from './NumberField';

/**
 * Propriedades do texto livre.
 *
 * O tamanho é em milímetros de PAPEL: 3,5 mm sai 3,5 mm na folha, seja o
 * croqui 1:200 ou 1:500. É a mesma regra de toda anotação, e é o que
 * garante que o texto continue legível quando a escala muda.
 */
export function TextPanel({ label }: { label: TextLabel }) {
  const { apply } = useDocumentStore();
  const travado = label.locked;

  const edita = (rotulo: string, recipe: (t: TextLabel) => void, mergeKey?: string) =>
    apply(
      rotulo,
      (d) => {
        const alvo = d.objects.find((o) => o.id === label.id);
        if (alvo?.kind === 'text') recipe(alvo);
      },
      mergeKey,
    );

  return (
    <>
      <label className="field">
        <span>Texto</span>
      </label>
      <textarea
        className="full"
        rows={Math.min(6, Math.max(2, label.text.split('\n').length))}
        value={label.text}
        disabled={travado}
        placeholder="Entrada, aquecimento, observação..."
        onChange={(e) => edita('Texto', (t) => { t.text = e.target.value; }, `txt-${label.id}`)}
      />

      <NumberField
        label="Tamanho"
        unit="mm"
        value={label.sizeMm}
        decimals={1}
        step={0.5}
        min={1}
        max={40}
        disabled={travado}
        onCommit={(v) => edita('Tamanho do texto', (t) => { t.sizeMm = v; })}
      />

      <label className="field">
        <span>Alinhamento</span>
        <select
          value={label.align}
          disabled={travado}
          onChange={(e) =>
            edita('Alinhamento', (t) => {
              t.align = e.target.value as TextLabel['align'];
            })
          }
        >
          <option value="start">À esquerda</option>
          <option value="middle">Centralizado</option>
          <option value="end">À direita</option>
        </select>
      </label>

      <label className="field">
        <span>Cor</span>
        <input
          type="color"
          value={label.color}
          disabled={travado}
          onChange={(e) => edita('Cor do texto', (t) => { t.color = e.target.value; })}
        />
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={label.bold}
          disabled={travado}
          onChange={(e) => edita('Negrito', (t) => { t.bold = e.target.checked; })}
        />
        Negrito
      </label>
    </>
  );
}
