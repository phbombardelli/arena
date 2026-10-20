import { add, type Vec2 } from '@core/geometry/vec';
import { legMidpoint, pathD } from '@core/model/path';
import type { CoursePath, PathNode } from '@core/model/types';
import { color } from '@render/style/tokens';

interface Props {
  path: CoursePath;
  toPaper: (p: Vec2) => Vec2;
  zoom: number;
  activeNode: number | null;
  onNodeDown: (e: React.PointerEvent, index: number) => void;
  onHandleDown: (e: React.PointerEvent, index: number, which: 'in' | 'out') => void;
  onLegDoubleClick: (legIndex: number, at: Vec2) => void;
  onLegDown: (e: React.PointerEvent, legIndex: number) => void;
}

const NODE_PX = 9;

/**
 * Nós e alças do traçado selecionado. Cromo de tela: fica fora do grupo
 * exportável, como todo o resto do overlay.
 */
export function PathHandles({
  path,
  toPaper,
  zoom,
  activeNode,
  onNodeDown,
  onHandleDown,
  onLegDoubleClick,
  onLegDown,
}: Props) {
  const mm = (px: number) => px / zoom;
  const meio = mm(NODE_PX) / 2;

  return (
    <g data-part="path-handles">
      {/* Meio de cada trecho: arrastar curva o trecho; duplo clique insere um nó. */}
      {path.legs.map((_, i) => {
        const p = toPaper(legMidpoint(path, i));
        return (
          <circle
            key={`m${i}`}
            cx={p.x}
            cy={p.y}
            r={mm(NODE_PX) / 3}
            fill="#ffffff"
            stroke={color.selection}
            strokeWidth={mm(0.8)}
            opacity={0.55}
            pointerEvents="all"
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onLegDown(e, i);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onLegDoubleClick(i, legMidpoint(path, i));
            }}
          />
        );
      })}

      {path.nodes.map((node, i) => (
        <NodeHandles
          key={i}
          node={node}
          index={i}
          active={activeNode === i}
          toPaper={toPaper}
          mm={mm}
          meio={meio}
          onNodeDown={onNodeDown}
          onHandleDown={onHandleDown}
        />
      ))}
    </g>
  );
}

function NodeHandles({
  node,
  index,
  active,
  toPaper,
  mm,
  meio,
  onNodeDown,
  onHandleDown,
}: {
  node: PathNode;
  index: number;
  active: boolean;
  toPaper: (p: Vec2) => Vec2;
  mm: (px: number) => number;
  meio: number;
  onNodeDown: (e: React.PointerEvent, index: number) => void;
  onHandleDown: (e: React.PointerEvent, index: number, which: 'in' | 'out') => void;
}) {
  const centro = toPaper(node.pos);

  return (
    <g>
      {/* Alças só do nó ativo: mostrar todas polui o desenho. */}
      {active &&
        (['in', 'out'] as const).map((which) => {
          const h = which === 'in' ? node.handleIn : node.handleOut;
          if (!h) return null;
          const ponta = toPaper(add(node.pos, h));
          return (
            <g key={which}>
              <line
                x1={centro.x}
                y1={centro.y}
                x2={ponta.x}
                y2={ponta.y}
                stroke={color.selection}
                strokeWidth={mm(0.8)}
              />
              <circle
                cx={ponta.x}
                cy={ponta.y}
                r={mm(3)}
                fill={color.selection}
                stroke="#ffffff"
                strokeWidth={mm(1)}
                pointerEvents="all"
                style={{ cursor: 'grab' }}
                data-handle={`${index}-${which}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onHandleDown(e, index, which);
                }}
              />
            </g>
          );
        })}

      {/* Canto é quadrado, liso é redondo — a forma diz o tipo do nó. */}
      {node.type === 'corner' ? (
        <rect
          x={centro.x - meio}
          y={centro.y - meio}
          width={meio * 2}
          height={meio * 2}
          fill={active ? color.selection : '#ffffff'}
          stroke={color.selection}
          strokeWidth={mm(1.2)}
          pointerEvents="all"
          style={{ cursor: 'move' }}
          data-node={index}
          onPointerDown={(e) => {
            e.stopPropagation();
            onNodeDown(e, index);
          }}
        />
      ) : (
        <circle
          cx={centro.x}
          cy={centro.y}
          r={meio}
          fill={active ? color.selection : '#ffffff'}
          stroke={color.selection}
          strokeWidth={mm(1.2)}
          pointerEvents="all"
          style={{ cursor: 'move' }}
          data-node={index}
          onPointerDown={(e) => {
            e.stopPropagation();
            onNodeDown(e, index);
          }}
        />
      )}
    </g>
  );
}

/** Traçado em construção, enquanto o desenhador clica os nós. */
export function PathDraft({
  nodes,
  cursor,
  toPaper,
  zoom,
}: {
  nodes: PathNode[];
  cursor: Vec2 | null;
  toPaper: (p: Vec2) => Vec2;
  zoom: number;
}) {
  if (nodes.length === 0) return null;
  const mm = (px: number) => px / zoom;

  // Traçado provisório com o mesmo desenho do definitivo, mais a borracha
  // até o cursor: o desenhador vê a curva antes de fixar o nó.
  const provisorio: CoursePath = {
    id: 'draft',
    kind: 'path',
    layer: 'paths',
    locked: false,
    visible: true,
    scope: 'percurso',
    z: 0,
    nodes: cursor ? [...nodes, { pos: cursor, type: 'corner', handleIn: null, handleOut: null, anchor: null }] : nodes,
    legs: [],
    distanceMode: 'nenhum',
    totalLabel: { visible: false, offsetM: { x: 0, y: 0 }, decimals: 2, color: '#d32020' },
    style: { dash: 'dashed', strokeMm: 0.4, color: color.selection },
    obstacleDistances: {},
  };

  return (
    <g data-part="path-draft" pointerEvents="none">
      <path
        d={pathD(provisorio, toPaper)}
        fill="none"
        stroke={color.selection}
        strokeWidth={mm(1.5)}
        strokeDasharray={`${mm(6)} ${mm(4)}`}
      />
      {nodes.map((n, i) => {
        const p = toPaper(n.pos);
        return <circle key={i} cx={p.x} cy={p.y} r={mm(3.5)} fill={color.selection} />;
      })}
    </g>
  );
}
