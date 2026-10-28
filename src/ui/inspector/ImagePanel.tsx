import {
  calibrateImage,
  imageHeightM,
  imageWidthM,
  removeImage,
  setImageOpacity,
  setImageWidthM,
} from '@core/commands/imageOps';
import { distance } from '@core/geometry/vec';
import type { BackgroundImage } from '@core/model/types';
import { formatMeters } from '@core/scale/units';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { NumberField } from './NumberField';
import { t } from '@core/i18n/i18n';

export function ImagePanel({ image }: { image: BackgroundImage }) {
  const { doc, apply } = useDocumentStore();
  const { calibration, beginCalibration, cancelCalibration, clearSelection } = useEditorStore();
  const asset = doc.assets[image.assetId];
  const calibrando = calibration?.imageId === image.id;

  const confirmar = () => {
    const a = calibration?.pointA;
    const b = calibration?.pointB;
    if (!a || !b) return;
    const medida = distance(a, b);
    const resposta = window.prompt(
      t('imagemp.pergunta', { m: formatMeters(medida) }),
      formatMeters(medida),
    );
    if (resposta === null) return;
    const valor = Number(resposta.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) {
      window.alert(t('imagemp.maiorZero'));
      return;
    }
    apply('Calibrar escala', (d) => {
      calibrateImage(d, image.id, a, b, valor);
    });
    cancelCalibration();
  };

  return (
    <>
      <p className="note">
        {asset?.name ?? t('imagemp.ausente')} · {image.widthPx}×{image.heightPx} px
      </p>

      <h3>{t('imagemp.escala')}</h3>
      <NumberField
        label={t('campo.largura')}
        unit="m"
        value={imageWidthM(image)}
        decimals={2}
        step={1}
        min={0.1}
        disabled={image.locked}
        onCommit={(v) => apply('Largura da imagem', (d) => setImageWidthM(d, image.id, v))}
      />
      <p className="note">
        {t('imagemp.alturaPx', { altura: formatMeters(imageHeightM(image)), px: formatMeters(image.metersPerPixel, 4) })}
      </p>

      {calibrando ? (
        <div className="calibration-box">
          <p className="note">
            {!calibration?.pointA
              ? t('imagemp.primeiraPonta')
              : !calibration?.pointB
                ? t('imagemp.outraPonta')
                : t('imagemp.medidaAtual', { m: formatMeters(distance(calibration.pointA, calibration.pointB)) })}
          </p>
          <div className="row-buttons">
            <button
              disabled={!calibration?.pointA || !calibration?.pointB}
              onClick={confirmar}
            >
              {t('imagemp.informar')}
            </button>
            <button onClick={cancelCalibration}>{t('imagemp.cancelar')}</button>
          </div>
        </div>
      ) : (
        <div className="row-buttons">
          <button disabled={image.locked} onClick={() => beginCalibration(image.id)}>
            {t('imagemp.calibrar')}
          </button>
        </div>
      )}

      {image.calibration && !calibrando && (
        <p className="note dim">
          Calibrada com {formatMeters(image.calibration.knownDistanceM)} m de referência.
        </p>
      )}

      <h3>{t('imagemp.aparencia')}</h3>
      <label className="field">
        <span>{t('imagemp.opacidadeCampo')}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(image.opacity * 100)}
          disabled={image.locked}
          onChange={(e) =>
            apply(
              'Transparência da imagem',
              (d) => setImageOpacity(d, image.id, Number(e.target.value) / 100),
              'opacidade-imagem',
            )
          }
        />
      </label>
      <p className="note">{t('imagemp.opacidade', { n: Math.round(image.opacity * 100) })}</p>

      <div className="row-buttons">
        <button
          className="danger"
          onClick={() => {
            apply(t('imagemp.remover'), (d) => removeImage(d, image.id));
            clearSelection();
          }}
        >
          {t('imagemp.remover')}
        </button>
      </div>
    </>
  );
}
