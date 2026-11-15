import { addObject } from '@core/commands/ops';
import { newId } from '@core/model/ids';
import type { TituloDaFolha } from '@core/model/types';
import type { RectMm } from '@core/model/document';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { t } from '@core/i18n/i18n';
import { folhaAtiva, temDuasFolhas } from '@core/library/folhas';

/**
 * Caixa de texto na folha (B-106): escolhe-se a ferramenta e desenha-se a
 * caixa arrastando sobre a folha, onde se quiser. A caixa flutua por cima
 * de tudo: não mexe na pista nem nos quadros.
 */
export function ferramentaCaixaDeTexto(): void {
  const ed = useEditorStore.getState();
  if (ed.mode !== 'impressao') ed.setMode('impressao');
  useEditorStore.getState().setTool('caixa-texto');
}

/** Abaixo disto o arrasto foi um clique: a caixa nasce num tamanho padrão. */
const ARRASTO_MIN_MM = 4;
const LARGURA_PADRAO_MM = 70;
const LETRA_PADRAO_MM = 5;

/** Cria a caixa no retângulo arrastado (mm da folha) e já abre para escrever. */
export function criaCaixaDeTexto(r: RectMm): void {
  const { doc, apply } = useDocumentStore.getState();
  const clique = r.widthMm < ARRASTO_MIN_MM;
  const caixa: TituloDaFolha = {
    id: newId('tit'),
    kind: 'titulo',
    layer: 'annotations',
    locked: false,
    visible: true,
    scope: 'percurso',
    z: 0,
    posMm: { x: Math.round(r.xMm * 10) / 10, y: Math.round(r.yMm * 10) / 10 },
    widthMm: Math.round((clique ? LARGURA_PADRAO_MM : r.widthMm) * 10) / 10,
    ...(clique || r.heightMm < ARRASTO_MIN_MM ? {} : { heightMm: Math.round(r.heightMm * 10) / 10 }),
    text: '',
    sizeMm: LETRA_PADRAO_MM,
    fonte: 'padrao',
    bold: false,
    italic: false,
    align: 'start',
    color: '#111111',
    // Desempate em folha própria (B-107): nasce só na folha em que se está.
    ...(temDuasFolhas(doc) ? { folha: folhaAtiva(doc) } : {}),
  };
  apply(t('titulo.inserir'), (d) => addObject(d, caixa));
  const ed = useEditorStore.getState();
  ed.setTool('select');
  ed.setSelection([caixa.id]);
  ed.setEditarTexto(caixa.id);
}
