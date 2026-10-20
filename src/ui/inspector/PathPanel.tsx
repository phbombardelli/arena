import {
  removeNode,
  setDistanceMode,
  setTotalLabel,
  sharpenPath,
  smoothPath,
  setAllLegLabels,
  setLegLabel,
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
import type { CoursePath, DashPreset, DistanceMode, Obstacle } from '@core/model/types';
import { obstacleDistancesAlong } from '@core/assist/obstacleDistances';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { NumberField } from './NumberField';

export function PathPanel({ path }: { path: CoursePath }) {
  const { doc, apply } = useDocumentStore();
  const { activeNode, setActiveNode } = useEditorStore();
  const travado = path.locked;
  const total = pathLength(path);
  const pares = obstacleDistancesAlong(
    path,
    doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle'),
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
          title="Transforma os cliques numa curva contínua, sem mover os nós"
          onClick={() => apply('Suavizar traçado', (d) => smoothPath(d, path.id))}
        >
          Suavizar
        </button>
        <button
          disabled={travado}
          title="Volta a segmentos retos entre os nós"
          onClick={() => apply('Endireitar traçado', (d) => sharpenPath(d, path.id))}
        >
          Endireitar
        </button>
      </div>

      <h3>Distâncias</h3>
      <label className="field">
        <span>Mostrar</span>
        <select
          value={path.distanceMode}
          disabled={travado}
          onChange={(e) =>
            apply('Modo das distâncias', (d) =>
              setDistanceMode(d, path.id, e.target.value as DistanceMode),
            )
          }
        >
          <option value="total">Uma, o total</option>
          <option value="trecho">Uma por trecho</option>
          <option value="nenhum">Nenhuma</option>
        </select>
      </label>
      {path.distanceMode === 'total' && (
        <NumberField
          label="Casas"
          value={path.totalLabel.decimals}
          decimals={0}
          step={1}
          min={0}
          max={3}
          disabled={travado}
          onCommit={(v) =>
            apply('Casas decimais', (d) =>
              setTotalLabel(d, path.id, { decimals: Math.round(v) }),
            )
          }
        />
      )}

      <h3>Distâncias entre obstáculos</h3>
      {pares.length === 0 ? (
        <p className="note">
          O traçado ainda não passa por dois obstáculos numerados em sequência.
        </p>
      ) : (
        <>
          <ul className="pair-list">
            {pares.map((p) => (
              <li key={p.key}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(path.obstacleDistances?.[p.key])}
                    disabled={travado}
                    onChange={(e) =>
                      apply(e.target.checked ? 'Mostrar distância' : 'Ocultar distância', (d) =>
                        setObstacleDistances(d, path.id, [p.key], e.target.checked),
                      )
                    }
                  />
                  <span className="pair-name">
                    {p.fromLabel} → {p.toLabel}
                  </span>
                  <span className="pair-value">{formatDistance(p.meters)} m</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="row-buttons">
            <button
              disabled={travado || marcadas === pares.length}
              onClick={() =>
                apply('Mostrar todas as distâncias', (d) =>
                  setObstacleDistances(d, path.id, pares.map((p) => p.key), true),
                )
              }
            >
              Todas
            </button>
            <button
              disabled={travado || marcadas === 0}
              onClick={() =>
                apply('Ocultar as distâncias', (d) =>
                  setObstacleDistances(d, path.id, pares.map((p) => p.key), false),
                )
              }
            >
              Nenhuma
            </button>
          </div>
          <p className="note dim">
            Medidas sobre o traçado, de vara a vara. Marque as que devem aparecer no
            croqui; o rótulo fica no meio do trecho, ao lado da linha.
          </p>
        </>
      )}

      <details className="fold">
        <summary>Trechos e nós · edição fina</summary>
      <h3>Trechos</h3>
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
                  title={`Em linha reta seriam ${formatDistance(reto)} m. O croqui mostra o traçado desenhado.`}
                >
                  reta {formatDistance(reto)}
                </span>
              )}
              <button
                className="mini"
                title={leg.label.visible ? 'Esconder a distância' : 'Mostrar a distância'}
                disabled={travado}
                onClick={() =>
                  apply('Rótulo do trecho', (d) =>
                    setLegLabel(d, path.id, i, { visible: !leg.label.visible }),
                  )
                }
              >
                {leg.label.visible ? '👁' : '–'}
              </button>
              <button
                className="mini"
                title="Endireitar este trecho"
                disabled={travado}
                onClick={() => apply('Endireitar trecho', (d) => straightenLeg(d, path.id, i))}
              >
                ⟋
              </button>
            </div>
          );
        })}
      </div>

      {path.distanceMode === 'trecho' && (
        <div className="row-buttons">
          <button
            disabled={travado}
            onClick={() => apply('Mostrar distâncias', (d) => setAllLegLabels(d, path.id, true))}
          >
            Mostrar todas
          </button>
          <button
            disabled={travado}
            onClick={() => apply('Esconder distâncias', (d) => setAllLegLabels(d, path.id, false))}
          >
            Esconder todas
          </button>
        </div>
      )}

      <h3>Nós</h3>
      <label className="field">
        <span>Nó ativo</span>
        <select
          value={activeNode ?? ''}
          onChange={(e) => setActiveNode(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">nenhum</option>
          {path.nodes.map((_, i) => (
            <option key={i} value={i}>{i + 1}</option>
          ))}
        </select>
      </label>
      {activeNode !== null && path.nodes[activeNode] && (
        <>
          <label className="field">
            <span>Tipo</span>
            <select
              value={path.nodes[activeNode]!.type}
              disabled={travado}
              onChange={(e) =>
                apply('Tipo do nó', (d) =>
                  setNodeType(d, path.id, activeNode, e.target.value as 'corner' | 'smooth'),
                )
              }
            >
              <option value="corner">Canto</option>
              <option value="smooth">Liso</option>
            </select>
          </label>
          <div className="row-buttons">
            <button
              className="danger"
              disabled={travado || path.nodes.length <= 2}
              onClick={() => {
                apply('Remover nó', (d) => {
                  removeNode(d, path.id, activeNode);
                });
                setActiveNode(null);
              }}
            >
              Remover nó
            </button>
          </div>
        </>
      )}
      <p className="note dim">
        Arraste um nó para movê-lo. Arraste a bolinha do meio de um trecho para
        curvá-lo; duplo clique nela insere um nó.
      </p>

      </details>

      <h3>Traço</h3>
      <label className="field">
        <span>Estilo</span>
        <select
          value={path.style.dash}
          disabled={travado}
          onChange={(e) =>
            apply('Estilo do traçado', (d) =>
              setPathStyle(d, path.id, { dash: e.target.value as DashPreset }),
            )
          }
        >
          <option value="dashed">Tracejado</option>
          <option value="solid">Contínuo</option>
          <option value="dotted">Pontilhado</option>
          <option value="dashdot">Traço e ponto</option>
        </select>
      </label>
      <NumberField
        label="Espessura"
        unit="mm"
        value={path.style.strokeMm}
        decimals={2}
        step={0.05}
        min={0.05}
        disabled={travado}
        onCommit={(v) => apply('Espessura do traçado', (d) => setPathStyle(d, path.id, { strokeMm: v }))}
      />
      <label className="field">
        <span>Cor</span>
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
