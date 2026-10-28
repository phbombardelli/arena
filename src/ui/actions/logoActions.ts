import { addObject } from '@core/commands/ops';
import { newId } from '@core/model/ids';
import type { Logo } from '@core/model/types';
import { pageSize, usableArea } from '@core/scale/units';
import { ImageImportError, pickImage } from '@platform/imageImport';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { t } from '@core/i18n/i18n';

/** Largura com que o logo nasce na folha, em mm. Ajusta-se no painel. */
const LARGURA_INICIAL_MM = 30;

/**
 * Insere um logo ou imagem na folha (decisão 55).
 *
 * Nasce no canto superior direito da área útil, que é onde os croquis
 * oficiais põem a marca do evento; o quadro técnico fica no esquerdo. O
 * arquivo é embutido no projeto, como a imagem de fundo: o .pcs continua
 * autossuficiente.
 */
export async function insertLogo(): Promise<void> {
  try {
    const imported = await pickImage();
    if (!imported) return;

    const { doc, apply } = useDocumentStore.getState();
    const area = usableArea(doc.page);
    const folha = pageSize(doc.page);
    const largura = Math.min(LARGURA_INICIAL_MM, folha.widthMm / 4);
    const assetId = newId('ass');
    const logo: Logo = {
      id: newId('logo'),
      kind: 'logo',
      layer: 'annotations',
      locked: false,
      visible: true,
      scope: 'percurso',
      z: 0,
      posMm: { x: area.xMm + area.widthMm - largura, y: area.yMm },
      widthMm: largura,
      assetId,
      widthPx: imported.widthPx,
      heightPx: imported.heightPx,
    };

    apply('Inserir logo', (d) => {
      d.assets[assetId] = imported.asset;
      addObject(d, logo);
    });
    const ed = useEditorStore.getState();
    if (ed.mode !== 'percurso') ed.setMode('percurso');
    ed.setSelection([logo.id]);
  } catch (err) {
    if (err instanceof ImageImportError) {
      window.alert(err.message);
      return;
    }
    console.error(err);
    window.alert(t('aviso.naoInseriu'));
  }
}
