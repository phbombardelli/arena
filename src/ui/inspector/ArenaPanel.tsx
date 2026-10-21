import { useRef } from 'react';
import {
  convertArenaToPolygon,
  removeArenaVertex,
  setArenaCorner,
  setArenaSize,
  setArenaStyle,
  setPerimeterRuler,
  setStructure,
  setStructureAngle,
} from '@core/commands/arenaOps';
import { STRUCTURES, STRUCTURE_LABEL_MM, structureAngle, structureDef, structureLabelAngle } from '@core/library/structures';
import { arenaArea, arenaPerimeter } from '@core/model/arena';
import type { Arena, CornerStyle, StructureType } from '@core/model/types';
import { formatMeters } from '@core/scale/units';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { NumberField } from './NumberField';

const CORNER_LABEL: Record<CornerStyle, string> = {
  square: 'Reto',
  chamfer: 'Chanfrado',
  rounded: 'Arredondado',
};

export function ArenaPanel({ arena }: { arena: Arena }) {
  const { apply } = useDocumentStore();
  const { editingVertices, setEditingVertices } = useEditorStore();
  const ruler = arena.perimeterRuler;
  const obra = arena.structure ?? null;
  const nome = obra ? 'da construção' : 'da pista';

  return (
    <>
      {obra && (
        <>
          <label className="field">
            <span>Tipo</span>
            <select
              value={obra.type}
              disabled={arena.locked}
              onChange={(e) => {
                const tipo = e.target.value as StructureType;
                apply('Tipo da construção', (d) => {
                  // Trocar o tipo traz o preenchimento dele, e o rótulo se
                  // ainda era o padrão do tipo anterior.
                  const padraoAntigo = structureDef(obra.type).label;
                  setStructure(d, arena.id, {
                    type: tipo,
                    ...(obra.label === padraoAntigo ? { label: structureDef(tipo).label } : {}),
                  });
                  setArenaStyle(d, arena.id, { fill: structureDef(tipo).fill });
                });
              }}
            >
              {STRUCTURES.map((s) => (
                <option key={s.type} value={s.type}>{s.label}</option>
              ))}
            </select>
          </label>
          <NumberField
            label="Ângulo"
            unit="°"
            value={structureAngle(arena)}
            decimals={1}
            step={1}
            min={-90}
            max={90}
            disabled={arena.locked}
            onCommit={(v) => apply('Ângulo da construção', (d) => setStructureAngle(d, arena.id, v))}
          />
          <AnguloObra arena={arena} />
          <label className="field">
            <span>Rótulo</span>
            <input
              type="text"
              value={obra.label}
              disabled={arena.locked}
              placeholder="sem rótulo"
              onChange={(e) =>
                apply('Rótulo da construção', (d) => setStructure(d, arena.id, { label: e.target.value }), `rotulo-${arena.id}`)
              }
            />
          </label>
          {obra.label.trim() !== '' && (
            <>
              <div className="field-pair">
                <NumberField
                  label="Letra"
                  unit="mm"
                  value={obra.labelSizeMm ?? STRUCTURE_LABEL_MM}
                  decimals={1}
                  step={0.2}
                  min={1.5}
                  max={20}
                  disabled={arena.locked}
                  onCommit={(v) => apply('Letra do rótulo', (d) => setStructure(d, arena.id, { labelSizeMm: v }))}
                />
                <NumberField
                  label="Giro"
                  unit="°"
                  value={structureLabelAngle(arena)}
                  decimals={0}
                  step={15}
                  disabled={arena.locked}
                  onCommit={(v) => apply('Giro do rótulo', (d) => setStructure(d, arena.id, { labelRotation: v }))}
                />
              </div>
              <RotuloGiro arena={arena} />
            </>
          )}
        </>
      )}
      {arena.shape === 'rectangle' ? (
        <>
          <NumberField
            label="Largura"
            unit="m"
            value={arena.widthM}
            decimals={2}
            step={1}
            min={1}
            disabled={arena.locked}
            onCommit={(v) => apply(`Largura ${nome}`, (d) => setArenaSize(d, arena.id, v, arena.heightM))}
          />
          <NumberField
            label="Comprimento"
            unit="m"
            value={arena.heightM}
            decimals={2}
            step={1}
            min={1}
            disabled={arena.locked}
            onCommit={(v) => apply(`Comprimento ${nome}`, (d) => setArenaSize(d, arena.id, arena.widthM, v))}
          />
        </>
      ) : (
        <>
          <p className="note">{arena.points.length} vértices.</p>
          <div className="row-buttons">
            <button
              className={editingVertices ? 'active' : ''}
              onClick={() => setEditingVertices(!editingVertices)}
            >
              {editingVertices ? 'Concluir vértices' : 'Editar vértices'}
            </button>
          </div>
          {editingVertices && (
            <p className="note dim">
              Arraste um vértice para movê-lo. Duplo clique no meio de uma aresta
              insere um vértice novo.
            </p>
          )}
        </>
      )}

      <h3>Cantos</h3>
      <label className="field">
        <span>Tipo</span>
        <select
          value={arena.corner.style}
          disabled={arena.locked}
          onChange={(e) =>
            apply('Canto da pista', (d) =>
              setArenaCorner(d, arena.id, { style: e.target.value as CornerStyle }),
            )
          }
        >
          {(Object.keys(CORNER_LABEL) as CornerStyle[]).map((s) => (
            <option key={s} value={s}>{CORNER_LABEL[s]}</option>
          ))}
        </select>
      </label>
      {arena.corner.style !== 'square' && (
        <NumberField
          label="Corte"
          unit="m"
          value={arena.corner.radiusM}
          decimals={2}
          step={0.5}
          min={0}
          disabled={arena.locked}
          onCommit={(v) => apply('Corte do canto', (d) => setArenaCorner(d, arena.id, { radiusM: v }))}
        />
      )}

      {!obra && (
        <>
      <h3>Régua de perímetro</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={ruler.visible}
          onChange={() =>
            apply('Régua de perímetro', (d) =>
              setPerimeterRuler(d, arena.id, { visible: !ruler.visible }),
            )
          }
        />
        Mostrar no croqui
      </label>
      {ruler.visible && (
        <>
          <NumberField
            label="Marca a cada"
            unit="m"
            value={ruler.stepM}
            decimals={1}
            step={1}
            min={0.5}
            onCommit={(v) => apply('Passo da régua', (d) => setPerimeterRuler(d, arena.id, { stepM: v }))}
          />
          <NumberField
            label="Número a cada"
            unit="m"
            value={ruler.labelEveryM}
            decimals={1}
            step={1}
            min={0}
            onCommit={(v) =>
              apply('Rótulos da régua', (d) => setPerimeterRuler(d, arena.id, { labelEveryM: v }))
            }
          />
          <div className="side-toggles">
            {(['top', 'left', 'right', 'bottom'] as const).map((side) => (
              <label key={side} className="check">
                <input
                  type="checkbox"
                  checked={ruler.sides[side]}
                  onChange={() =>
                    apply('Lados da régua', (d) =>
                      setPerimeterRuler(d, arena.id, {
                        sides: { ...ruler.sides, [side]: !ruler.sides[side] },
                      }),
                    )
                  }
                />
                {SIDE_LABEL[side]}
              </label>
            ))}
          </div>
        </>
      )}

        </>
      )}

      <h3>Traço</h3>
      <NumberField
        label="Espessura"
        unit="mm"
        value={arena.style.strokeMm}
        decimals={2}
        step={0.05}
        min={0.05}
        disabled={arena.locked}
        onCommit={(v) => apply('Traço da pista', (d) => setArenaStyle(d, arena.id, { strokeMm: v }))}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={arena.style.fill !== 'none'}
          disabled={arena.locked}
          onChange={(e) =>
            apply('Preenchimento da pista', (d) =>
              setArenaStyle(d, arena.id, { fill: e.target.checked ? '#ffffff' : 'none' }),
            )
          }
        />
        Preenchimento
      </label>
      {arena.style.fill !== 'none' && (
        <label className="field">
          <span>Cor</span>
          <input
            type="color"
            value={arena.style.fill}
            disabled={arena.locked}
            onChange={(e) =>
              apply('Cor da pista', (d) => setArenaStyle(d, arena.id, { fill: e.target.value }))
            }
          />
        </label>
      )}
      <p className="note dim">
        Desligue o preenchimento para a imagem de fundo aparecer sob a pista.
      </p>

      <p className="note">
        Perímetro {formatMeters(arenaPerimeter(arena), 1)} m · área{' '}
        {formatMeters(arenaArea(arena), 0)} m²
      </p>

      {arena.shape === 'rectangle' && (
        <div className="row-buttons">
          <button
            disabled={arena.locked}
            title="Materializa os quatro vértices para edição livre. Não tem volta."
            onClick={() => {
              apply('Converter em contorno livre', (d) => convertArenaToPolygon(d, arena.id));
              setEditingVertices(true);
            }}
          >
            Converter em contorno livre
          </button>
        </div>
      )}
      {arena.shape === 'polygon' && editingVertices && arena.points.length > 3 && (
        <div className="row-buttons">
          <button
            onClick={() =>
              apply('Remover vértice', (d) => {
                removeArenaVertex(d, arena.id, arena.points.length - 1);
              })
            }
          >
            Remover último vértice
          </button>
        </div>
      )}
    </>
  );
}

const SIDE_LABEL = {
  top: 'Cima',
  left: 'Esq.',
  right: 'Dir.',
  bottom: 'Baixo',
} as const;

/**
 * Barra de giro do rótulo da construção e a volta ao automático (que
 * acompanha a aresta mais longa).
 */
function RotuloGiro({ arena }: { arena: Arena }) {
  const { apply } = useDocumentStore();
  const arrasto = useRef(0);
  const manual = arena.structure?.labelRotation !== undefined;
  const graus = Math.round(structureLabelAngle(arena));
  return (
    <div className="check-row">
      <input
        type="range"
        className="rotation-slider"
        aria-label="Girar o rótulo"
        min={-90}
        max={90}
        step={1}
        value={graus}
        disabled={arena.locked}
        onPointerDown={() => {
          arrasto.current += 1;
        }}
        onChange={(e) =>
          apply(
            'Giro do rótulo',
            (d) => setStructure(d, arena.id, { labelRotation: Number(e.target.value) }),
            `giro-rotulo-${arena.id}-${arrasto.current}`,
          )
        }
      />
      {manual && (
        <button
          className="mini neutral"
          title="Volta a acompanhar a aresta mais longa"
          disabled={arena.locked}
          onClick={() =>
            apply('Giro automático do rótulo', (d) => {
              const a = d.objects.find((o) => o.id === arena.id);
              if (a?.kind === 'arena' && a.structure) delete a.structure.labelRotation;
            })
          }
        >
          auto
        </button>
      )}
    </div>
  );
}

/** Barra do ângulo da construção: gira ao vivo, um desfazer por arrasto. */
function AnguloObra({ arena }: { arena: Arena }) {
  const { apply } = useDocumentStore();
  const arrasto = useRef(0);
  return (
    <input
      type="range"
      className="rotation-slider"
      aria-label="Girar a construção"
      min={-90}
      max={90}
      step={1}
      value={Math.round(structureAngle(arena))}
      disabled={arena.locked}
      onPointerDown={() => {
        arrasto.current += 1;
      }}
      onChange={(e) =>
        apply(
          'Ângulo da construção',
          (d) => setStructureAngle(d, arena.id, Number(e.target.value)),
          `angulo-obra-${arena.id}-${arrasto.current}`,
        )
      }
    />
  );
}
