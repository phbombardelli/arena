import type { TextLabel } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { NumberField } from './NumberField';
import { t } from '@core/i18n/i18n';

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
        <span>{t('campo.texto')}</span>
      </label>
      <textarea
        className="full"
        rows={Math.min(6, Math.max(2, label.text.split('\n').length))}
        value={label.text}
        disabled={travado}
        placeholder={t('textop.exemplo')}
        onChange={(e) => edita(t('campo.texto'), (t) => { t.text = e.target.value; }, `txt-${label.id}`)}
      />

      <NumberField
        label={t('campo.tamanho')}
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
        <span>{t('textop.alinhamento')}</span>
        <select
          value={label.align}
          disabled={travado}
          onChange={(e) =>
            edita(t('textop.alinhamento'), (t) => {
              t.align = e.target.value as TextLabel['align'];
            })
          }
        >
          <option value="start">{t('textop.esquerda')}</option>
          <option value="middle">{t('textop.centro')}</option>
          <option value="end">{t('textop.direita')}</option>
        </select>
      </label>

      <label className="field">
        <span>{t('campo.cor')}</span>
        <input
          type="color"
          value={label.color}
          disabled={travado}
          onChange={(e) => edita('Cor do texto', (t) => { t.color = e.target.value; }, `cor-txt-${label.id}`)}
        />
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={label.bold}
          disabled={travado}
          onChange={(e) => edita(t('textop.negrito'), (t) => { t.bold = e.target.checked; })}
        />
        {t('textop.negrito')}
      </label>
    </>
  );
}
