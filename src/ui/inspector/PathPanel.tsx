import {
  removeNode,
  setTotalLabel,
  sharpenPath,
  smoothPath,
  setNodeType,
  setObstacleDistances,
  setPathStyle,
  straightenLeg,
} from '@core/commands/pathOps';
import {
  formatDistance,
  legLength,
  legStraightDistance,
  pathLength,
} from '@core/model/path';
import type { CoursePath, DashPreset, Obstacle, TimingLine } from '@core/model/types';
import { distanceFontMm } from '@core/assist/labelLayout';
import { courseDistancesAlong } from '@core/assist/obstacleDistances';
import { canSetDistance, lockDistance, setCourseDistance } from '@core/commands/distanceOps';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { NumberField } from './NumberField';
import { t } from '@core/i18n/i18n';

export function PathPanel({ path }: { path: CoursePath }) {
  const { doc, apply } = useDocumentStore();
  const { activeNode, setActiveNode } = useEditorStore();
  const travado = path.locked;
  const total = pathLength(path);
  const pares = courseDistancesAlong(
    path,
    doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle'),
    doc.objects.filter((o): o is TimingLine => o.kind === 'timing'),
  );
  const marcadas = pares.filter((p) => path.obstacleDistances?.[p.key]).length;

  return (
    <>
      <p className="note total-distance">
        Traçado: <strong>{formatDistance(total)} m</strong> em {path.legs.length} trecho
        {path.legs.length === 1 ? '' : 's'}
      </p>

      <div className="row-buttons">
        <button
          disabled={travado}
          title={t('tracadop.suavizarDica')}
          onClick={() => apply('Suavizar traçado', (d) => smoothPath(d, path.id))}
        >
          {t('tracadop.suavizar')}
        </button>
        <button
          disabled={travado}
          title={t('tracadop.endireitarDica')}
          onClick={() => apply('Endireitar traçado', (d) => sharpenPath(d, path.id))}
        >
          {t('tracadop.endireitar')}
        </button>
      </div>

      <h3>{t('tracadop.entreEsforcos')}</h3>
      {pares.length === 0 ? (
        <p className="note">{t('tracadop.semPares')}</p>
      ) : (
        <>
          <ul className="pair-list">
            {pares.map((p) => {
              const trava = path.lockedDistances?.[p.key];
              const editavel = !travado && trava === undefined && canSetDistance(doc, path, p);
              return (
                <li key={p.key} className="pair-row">
                  <input
                    type="checkbox"
                    title={t('campo.mostrarCroqui')}
                    checked={Boolean(path.obstacleDistances?.[p.key])}
                    disabled={travado}
                    onChange={(e) =>
                      apply(e.target.checked ? 'Mostrar distância' : 'Ocultar distância', (d) =>
                        setObstacleDistances(d, path.id, [p.key], e.target.checked),
                      )
                    }
                  />
                  <span
                    className="pair-edit"
                    title={
                      editavel
                        ? t('tracadop.digiteDica')
                        : trava !== undefined
                          ? t('tracadop.travada')
                          : t('tracadop.soAssistente')
                    }
                  >
                    <NumberField
                      label={`${p.fromLabel} → ${p.toLabel}`}
                      value={Math.round(p.meters * 100) / 100}
                      unit="m"
                      decimals={2}
                      step={0.1}
                      min={0.5}
                      disabled={!editavel}
                      onCommit={(v) =>
                        apply('Distância', (d) => {
                          setCourseDistance(d, path.id, p.key, v);
                        })
                      }
                    />
                  </span>
                  <button
                    className={`mini${trava !== undefined ? ' active' : ''}`}
                    disabled={travado}
                    title={
                      trava !== undefined
                        ? t('tracadop.travadaEm', { m: formatDistance(trava) })
                        : t('tracadop.travarDica')
                    }
                    onClick={() =>
                      apply(trava !== undefined ? 'Destravar distância' : 'Travar distância', (d) =>
                        lockDistance(d, path.id, p.key, trava !== undefined ? null : p.meters),
                      )
                    }
                  >
                    {trava !== undefined ? '🔒' : '🔓'}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="row-buttons">
            <button
              disabled={travado || marcadas === pares.length}
              onClick={() =>
                apply(t('tracadop.mostrarTodas'), (d) =>
                  setObstacleDistances(d, path.id, pares.map((p) => p.key), true),
                )
              }
            >
              {t('tracadop.todas')}
            </button>
            <button
              disabled={travado || marcadas === 0}
              onClick={() =>
                apply(t('tracadop.ocultarTodas'), (d) =>
                  setObstacleDistances(d, path.id, pares.map((p) => p.key), false),
                )
              }
            >
              {t('tracadop.nenhuma')}
            </button>
          </div>
          <NumberField
            label={t('tracadop.tamanhoLetras')}
            unit="mm"
            value={distanceFontMm(path)}
            decimals={1}
            step={0.2}
            min={1}
            max={10}
            disabled={travado}
            onCommit={(v) =>
              apply('Tamanho das distâncias', (d) => {
                const p = d.objects.find((o) => o.id === path.id);
                if (p?.kind === 'path') p.distanceSizeMm = v;
              })
            }
          />
          <label className="field">
            <span>{t('tracadop.corLetras')}</span>
            <input
              type="color"
              value={path.totalLabel.color}
              disabled={travado}
              onChange={(e) =>
                apply(
                  'Cor das distâncias',
                  (d) => setTotalLabel(d, path.id, { color: e.target.value }),
                  `cor-dist-${path.id}`,
                )
              }
            />
          </label>
          <p className="note dim">{t('tracadop.paresNota')}</p>
        </>
      )}

      <details className="fold">
        <summary>{t('tracadop.edicaoFina')}</summary>
      <h3>{t('tracadop.trechos')}</h3>
      <div className="leg-list">
        {path.legs.map((leg, i) => {
          const curvo = legLength(path, i);
          const reto = legStraightDistance(path, i);
          const desvio = curvo - reto;
          return (
            <div className="leg-row" key={i}>
              <span className="leg-index">{i + 1}</span>
              <span className="leg-value">{formatDistance(curvo, leg.label.decimals)} m</span>
              {desvio > 0.005 && (
                <span
                  className="leg-straight"
                  title={t('tracadop.emLinhaReta', { m: formatDistance(reto) })}
                >
                  {t('tracadop.reta', { m: formatDistance(reto) })}
                </span>
              )}
              <button
                className="mini"
                title={t('tracadop.endireitarTrecho')}
                disabled={travado}
                onClick={() => apply('Endireitar trecho', (d) => straightenLeg(d, path.id, i))}
              >
                ⟋
              </button>
            </div>
          );
        })}
      </div>

      <h3>{t('tracadop.nos')}</h3>
      <label className="field">
        <span>{t('tracadop.noAtivo')}</span>
        <select
          value={activeNode ?? ''}
          onChange={(e) => setActiveNode(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">{t('tracadop.nenhum')}</option>
          {path.nodes.map((_, i) => (
            <option key={i} value={i}>{i + 1}</option>
          ))}
        </select>
      </label>
      {activeNode !== null && path.nodes[activeNode] && (
        <>
          <label className="field">
            <span>{t('campo.tipo')}</span>
            <select
              value={path.nodes[activeNode]!.type}
              disabled={travado}
              onChange={(e) =>
                apply('Tipo do nó', (d) =>
                  setNodeType(d, path.id, activeNode, e.target.value as 'corner' | 'smooth'),
                )
              }
            >
              <option value="corner">{t('tracadop.canto')}</option>
              <option value="smooth">{t('tracadop.liso')}</option>
            </select>
          </label>
          <div className="row-buttons">
            <button
              className="danger"
              disabled={travado || path.nodes.length <= 2}
              onClick={() => {
                apply(t('tracadop.removerNo'), (d) => {
                  removeNode(d, path.id, activeNode);
                });
                setActiveNode(null);
              }}
            >
              {t('tracadop.removerNo')}
            </button>
          </div>
        </>
      )}
      <p className="note dim">{t('tracadop.nosNota')}</p>

      </details>

      <h3>{t('campo.traco')}</h3>
      <label className="field">
        <span>{t('campo.estilo')}</span>
        <select
          value={path.style.dash}
          disabled={travado}
          onChange={(e) =>
            apply('Estilo do traçado', (d) =>
              setPathStyle(d, path.id, { dash: e.target.value as DashPreset }),
            )
          }
        >
          <option value="dashed">{t('tracadop.tracejado')}</option>
          <option value="solid">{t('tracadop.continuo')}</option>
          <option value="dotted">{t('tracadop.pontilhado')}</option>
          <option value="dashdot">{t('tracadop.tracoPonto')}</option>
        </select>
      </label>
      <NumberField
        label={t('campo.espessura')}
        unit="mm"
        value={path.style.strokeMm}
        decimals={2}
        step={0.05}
        min={0.05}
        disabled={travado}
        onCommit={(v) => apply('Espessura do traçado', (d) => setPathStyle(d, path.id, { strokeMm: v }))}
      />
      <label className="field">
        <span>{t('campo.cor')}</span>
        <input
          type="color"
          value={path.style.color}
          disabled={travado}
          onChange={(e) =>
            apply(
              'Cor do traçado',
              (d) => setPathStyle(d, path.id, { color: e.target.value }),
              `pathcor-${path.id}`,
            )
          }
        />
      </label>
    </>
  );
}
