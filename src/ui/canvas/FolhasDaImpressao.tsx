import { folhaEm, folhaRectMm, indiceDaFolhaAtiva, paginasDaSaida, type PaginaDaSaida } from '@core/library/paginas';
import { docDaFolha } from '@core/library/folhas';
import type { CourseDocument } from '@core/model/types';
import { RenderDocument } from '@render/renderDocument';
import { FolhaEspecificacao } from '@render/FolhaEspecificacao';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { irParaFolha, verTodasAsFolhas } from '@ui/actions/viewActions';
import { t } from '@core/i18n/i18n';
import { setObstacleNote } from '@core/commands/obstacleOps';

/**
 * Aba Impressão como visualização de impressão: as folhas que saem no PDF
 * ficam empilhadas, uma embaixo da outra. A que se edita o Canvas desenha;
 * estas são as outras. A do croqui com outra diagramação (desempate em
 * folha própria, B-107) vira a que se edita com um clique.
 */
export function FolhasExtras({ doc, zoom }: { doc: CourseDocument; zoom: number }) {
  const paginas = paginasDaSaida(doc);
  if (paginas.length < 2) return null;
  const ativa = indiceDaFolhaAtiva(doc);
  return (
    // Só a observação da especificação responde ao clique; o resto é para ver.
    <g pointerEvents="none" data-layer="folhas-extras">
      {paginas.map((p, i) => {
        if (i === ativa) return null;
        const r = folhaRectMm(doc, i);
        const croqui = p !== 'especificacao';
        const daFolha = croqui ? docDaFolha(doc, p) : doc;
        return (
          <g key={`${p}-${i}`} transform={`translate(${r.x} ${r.y})`}>
            <rect
              x={0}
              y={0}
              width={r.width}
              height={r.height}
              fill="#ffffff"
              stroke="#9aa0a6"
              strokeWidth={1 / zoom}
              {...(croqui
                ? {
                    pointerEvents: 'all',
                    style: { cursor: 'pointer' },
                    onPointerDown: (e: React.PointerEvent) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      irParaFolha(i);
                    },
                  }
                : {})}
            >
              {croqui && <title>{t('folhas.cliqueParaEditar')}</title>}
            </rect>
            <svg x={0} y={0} width={r.width} height={r.height} viewBox={`0 0 ${r.width} ${r.height}`} overflow="hidden">
              {p === 'especificacao' ? (
                <FolhaEspecificacao
                  doc={doc}
                  editavel={(o, nota) => useDocumentStore.getState().apply(t('mont.obs'), (d) => setObstacleNote(d, o.id, nota))}
                />
              ) : (
                <RenderDocument
                  mode="paper"
                  doc={daFolha}
                  vista={p}
                  selection={[]}
                  viewBoxMm={{ x: 0, y: 0, width: r.width, height: r.height }}
                  metersPerPixel={0}
                  showPageFrame={false}
                />
              )}
            </svg>
          </g>
        );
      })}
    </g>
  );
}

export function nomeDaFolha(p: PaginaDaSaida): string {
  if (p === 'especificacao') return t('espec.titulo');
  if (p === 'ambos') return t('folhas.croqui');
  return `${t('folhas.croqui')} · ${t(`vista.${p}`)}`;
}

/** No pé da tela: em que folha se está, setas para as outras e "todas". */
export function NavegaFolhas() {
  const doc = useDocumentStore((s) => s.doc);
  const centroY = useEditorStore((s) => s.viewport.centerMm.y);
  const paginas = paginasDaSaida(doc);
  if (paginas.length < 2) return null;
  const i = folhaEm(doc, centroY);
  return (
    <div className="folhas-nav" role="group" aria-label={t('folhas.grupo')}>
      <button onClick={() => irParaFolha(i - 1)} disabled={i === 0} title={t('folhas.anterior')} aria-label={t('folhas.anterior')}>
        ‹
      </button>
      <span className="folhas-nav-rotulo">
        {t('folhas.deN', { i: i + 1, n: paginas.length })} · {nomeDaFolha(paginas[i]!)}
      </span>
      <button
        onClick={() => irParaFolha(i + 1)}
        disabled={i === paginas.length - 1}
        title={t('folhas.proxima')}
        aria-label={t('folhas.proxima')}
      >
        ›
      </button>
      <button onClick={verTodasAsFolhas} title={t('folhas.todasDica')}>
        {t('folhas.todas')}
      </button>
    </div>
  );
}
