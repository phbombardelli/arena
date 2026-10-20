import { useRef } from 'react';
import { setLocked, setObjectPosition, setObjectRotation, deleteObjects } from '@core/commands/ops';
import { ORNAMENTS } from '@core/library/ornaments';
import { getPosition, getRotation } from '@core/model/transform';
import { measureFrame } from '@core/model/measureFrame';
import type { Obstacle, OrnamentType, SceneObject } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { ArenaPanel } from './ArenaPanel';
import { ImagePanel } from './ImagePanel';
import { ObstacleMore, ObstaclePanel } from './ObstaclePanel';
import { PathPanel } from './PathPanel';
import { CombinationPanel } from './CombinationPanel';
import { HeightTablePanel } from './HeightTablePanel';
import { InfoBoxPanel } from './InfoBoxPanel';
import { TextPanel } from './TextPanel';
import { TimingPanel } from './TimingPanel';
import { LogoPanel } from './LogoPanel';
import { NumberField } from './NumberField';

const KIND_LABEL: Record<SceneObject['kind'], string> = {
  arena: 'Pista',
  obstacle: 'Obstáculo',
  path: 'Traçado',
  text: 'Texto',
  infobox: 'Quadro técnico',
  heighttable: 'Tabela de alturas',
  image: 'Imagem de fundo',
  ornament: 'Ornamento',
  timing: 'Linha de cronometragem',
  logo: 'Logo ou imagem',
};

export function ObjectPanel() {
  const { doc, apply } = useDocumentStore();
  const { selection, clearSelection } = useEditorStore();
  const objs = doc.objects.filter((o) => selection.includes(o.id));

  if (objs.length === 0) return null;

  const single = objs.length === 1 ? objs[0]! : null;
  // Dois ou três obstáculos selecionados é o gesto de quem vai montar uma
  // combinação ou uma linha reta: a ferramenta aparece sozinha.
  const combinacao = objs.filter((o): o is Obstacle => o.kind === 'obstacle');
  const ehCombinacao =
    !single && combinacao.length === objs.length && combinacao.length >= 2 && combinacao.length <= 3;
  const todosTravados = objs.every((o) => o.locked);
  // X e Y contam do canto superior esquerdo da pista, como as réguas.
  const canto = measureFrame(doc).originM;

  if (ehCombinacao) return <CombinationPanel obstacles={combinacao} />;

  return (
    <section className="object-panel">
      <div className="panel-head">
        <h3>
          {single
            ? single.kind === 'arena' && single.structure
              ? 'Construção'
              : KIND_LABEL[single.kind]
            : `${objs.length} objetos selecionados`}
        </h3>
        {/* Frente e Trás ficam no menu Editar; aqui só o que se usa sempre. */}
        <button
          className="icon-button"
          title={todosTravados ? 'Desbloquear' : 'Bloquear'}
          aria-label={todosTravados ? 'Desbloquear' : 'Bloquear'}
          onClick={() =>
            apply(todosTravados ? 'Desbloquear' : 'Bloquear', (d) =>
              setLocked(d, selection, !todosTravados),
            )
          }
        >
          {todosTravados ? '🔒' : '🔓'}
        </button>
        <button
          className="icon-button danger"
          title="Excluir (Delete)"
          aria-label="Excluir"
          onClick={() => {
            apply('Excluir', (d) => deleteObjects(d, selection));
            clearSelection();
          }}
        >
          🗑
        </button>
      </div>

      {single && (
        <>
          {single.kind === 'arena' && <ArenaPanel arena={single} />}
          {single.kind === 'image' && <ImagePanel image={single} />}
          {single.kind === 'obstacle' && <ObstaclePanel obstacle={single} />}
          {single.kind === 'timing' && <TimingPanel line={single} />}
          {single.kind === 'path' && <PathPanel path={single} />}
          {single.kind === 'text' && <TextPanel label={single} />}
          {single.kind === 'infobox' && <InfoBoxPanel box={single} />}
          {single.kind === 'heighttable' && <HeightTablePanel table={single} />}
          {single.kind === 'logo' && <LogoPanel logo={single} />}
          {single.kind === 'ornament' && (
            <>
              <label className="field">
                <span>Tipo</span>
                <select
                  value={single.type}
                  disabled={single.locked}
                  onChange={(e) =>
                    apply('Tipo do ornamento', (d) => {
                      const o = d.objects.find((x) => x.id === single.id);
                      if (o?.kind === 'ornament') o.type = e.target.value as OrnamentType;
                    })
                  }
                >
                  {ORNAMENTS.map((o) => (
                    <option key={o.type} value={o.type}>{o.label}</option>
                  ))}
                </select>
              </label>
              <NumberField
                label="Tamanho"
                unit="m"
                value={single.sizeM}
                decimals={2}
                step={0.1}
                min={0.1}
                disabled={single.locked}
                onCommit={(v) =>
                  apply('Tamanho do ornamento', (d) => {
                    const o = d.objects.find((x) => x.id === single.id);
                    if (o?.kind === 'ornament') o.sizeM = v;
                  })
                }
              />
              <label className="field">
                <span>Cor</span>
                <input
                  type="color"
                  value={single.color}
                  disabled={single.locked}
                  onChange={(e) =>
                    apply('Cor do ornamento', (d) => {
                      const o = d.objects.find((x) => x.id === single.id);
                      if (o?.kind === 'ornament') o.color = e.target.value;
                    })
                  }
                />
              </label>
            </>
          )}
          {getRotation(single) !== null && (
            <>
              <NumberField
                label="Rotação"
                unit="°"
                value={getRotation(single)!}
                decimals={1}
                step={1}
                disabled={single.locked}
                onCommit={(v) => apply('Rotação', (d) => setObjectRotation(d, single.id, v))}
              />
              <RotationSlider
                id={single.id}
                value={getRotation(single)!}
                disabled={single.locked}
              />
            </>
          )}
          <details className="fold">
            <summary>Mais opções</summary>
            <h3>Posição</h3>
            <NumberField
              label="X"
              unit="m"
              value={getPosition(single, doc.page.printScale).x - canto.x}
              decimals={3}
              step={0.1}
              disabled={single.locked}
              onCommit={(v) =>
                apply('Posição X', (d) =>
                  setObjectPosition(d, single.id, {
                    x: v + canto.x,
                    y: getPosition(single, d.page.printScale).y,
                  }),
                )
              }
            />
            <NumberField
              label="Y"
              unit="m"
              value={getPosition(single, doc.page.printScale).y - canto.y}
              decimals={3}
              step={0.1}
              disabled={single.locked}
              onCommit={(v) =>
                apply('Posição Y', (d) =>
                  setObjectPosition(d, single.id, {
                    x: getPosition(single, d.page.printScale).x,
                    y: v + canto.y,
                  }),
                )
              }
            />
            {single.kind === 'obstacle' && <ObstacleMore obstacle={single} />}
          </details>
        </>
      )}
    </section>
  );
}

/**
 * Barra de giro: arrastar gira o objeto ao vivo, de 0 a 360°. Cada arrasto
 * vira UM passo de desfazer — a chave de mescla muda a cada vez que a barra
 * é pega, então dois arrastos seguidos continuam separados.
 */
function RotationSlider({ id, value, disabled }: { id: string; value: number; disabled: boolean }) {
  const { apply } = useDocumentStore();
  const arrasto = useRef(0);
  const graus = Math.round(((value % 360) + 360) % 360);
  return (
    <input
      type="range"
      className="rotation-slider"
      aria-label="Girar"
      min={0}
      max={360}
      step={1}
      value={graus}
      disabled={disabled}
      onPointerDown={() => {
        arrasto.current += 1;
      }}
      onChange={(e) =>
        apply(
          'Rotação',
          (d) => setObjectRotation(d, id, Number(e.target.value)),
          `giro-barra-${id}-${arrasto.current}`,
        )
      }
    />
  );
}
