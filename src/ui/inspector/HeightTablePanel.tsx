import { heightRows } from '@core/model/annotationLayout';
import type { HeightTable, Obstacle } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { NumberField } from './NumberField';

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
          <>Nenhum obstáculo numerado ainda — a tabela nasce vazia.</>
        ) : (
          <>
            <strong>{linhas.length}</strong> linha{linhas.length === 1 ? '' : 's'}, lida
            {linhas.length === 1 ? '' : 's'} do desenho
          </>
        )}
      </p>

      <div className="row-buttons">
        <button className="primary" onClick={() => setDialog('alturas')}>
          Alturas dos obstáculos…
        </button>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={table.showSpread}
          disabled={travado}
          onChange={(e) => edita('Coluna de largura', (t) => { t.showSpread = e.target.checked; })}
        />
        Coluna de largura
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={table.showNote}
          disabled={travado}
          onChange={(e) => edita('Coluna de observação', (t) => { t.showNote = e.target.checked; })}
        />
        Coluna de observação
      </label>

      <NumberField
        label="Letra"
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
        label="Altura da linha"
        unit="mm"
        value={table.style.rowHeightMm}
        decimals={1}
        step={0.5}
        min={3}
        max={15}
        disabled={travado}
        onCommit={(v) => edita('Altura da linha', (t) => { t.style.rowHeightMm = v; })}
      />

    </>
  );
}
