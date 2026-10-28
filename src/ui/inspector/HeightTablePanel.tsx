import { heightRows } from '@core/model/annotationLayout';
import type { HeightTable, Obstacle } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { NumberField } from './NumberField';
import { t } from '@core/i18n/i18n';

export function HeightTablePanel({ table }: { table: HeightTable }) {
  const { doc, apply } = useDocumentStore();
  const setDialog = useEditorStore((s) => s.setDialog);
  const travado = table.locked;
  const linhas = heightRows(doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle'));

  const edita = (rotulo: string, recipe: (t: HeightTable) => void) =>
    apply(rotulo, (d) => {
      const alvo = d.objects.find((o) => o.id === table.id);
      if (alvo?.kind === 'heighttable') recipe(alvo);
    });

  return (
    <>
      <p className="note total-distance">
        {linhas.length === 0 ? (
          <>{t('tabelap.vazia')}</>
        ) : (
          <>
            {t(linhas.length === 1 ? 'tabelap.umaLinha' : 'tabelap.nLinhas', { n: linhas.length })}
          </>
        )}
      </p>

      <div className="row-buttons">
        <button className="primary" onClick={() => setDialog('alturas')}>
          {t('tabelap.alturas')}
        </button>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={table.showSpread}
          disabled={travado}
          onChange={(e) => edita(t('tabelap.colLargura'), (t) => { t.showSpread = e.target.checked; })}
        />
        {t('tabelap.colLargura')}
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={table.showNote}
          disabled={travado}
          onChange={(e) => edita(t('tabelap.colObs'), (t) => { t.showNote = e.target.checked; })}
        />
        {t('tabelap.colObs')}
      </label>

      <NumberField
        label={t('campo.letra')}
        unit="mm"
        value={table.style.sizeMm}
        decimals={1}
        step={0.2}
        min={1.5}
        max={8}
        disabled={travado}
        onCommit={(v) => edita('Letra da tabela', (t) => { t.style.sizeMm = v; })}
      />
      <NumberField
        label={t('tabelap.alturaLinha')}
        unit="mm"
        value={table.style.rowHeightMm}
        decimals={1}
        step={0.5}
        min={3}
        max={15}
        disabled={travado}
        onCommit={(v) => edita(t('tabelap.alturaLinha'), (t) => { t.style.rowHeightMm = v; })}
      />

    </>
  );
}
