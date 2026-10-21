import { useEffect, useRef, useState, type ReactNode } from 'react';
import { OBSTACLES } from '@core/library/obstacles';
import { ORNAMENTS } from '@core/library/ornaments';
import { STRUCTURES } from '@core/library/structures';
import { importBackgroundImage } from '@ui/actions/imageActions';
import { traceCourse } from '@ui/actions/rideActions';
import { insertHeightTable, insertInfoBox } from '@ui/actions/annotationActions';
import { startGuidedRide } from '@ui/actions/guidedActions';
import { insertLogo } from '@ui/actions/logoActions';
import { insertTimingLine } from '@ui/actions/timingActions';
import { useEditorStore, type Tool } from '@store/editorStore';

/**
 * Barra de ferramentas da esquerda.
 *
 * Só ferramentas de desenhar, cada uma com um atalho de uma tecla. O que
 * tem variantes — tipo de obstáculo, modo do traçado, o que vai na folha —
 * abre ao lado, em vez de empurrar a barra para baixo. Partida e chegada
 * têm botão próprio (B-51), mas continuam só quando pedidas: nada é
 * colocado sozinho.
 */
export function Sidebar() {
  const {
    mode,
    tool,
    setTool,
    ornamentType,
    setOrnamentType,
    obstacleType,
    setObstacleType,
    pathSmooth,
    setPathSmooth,
    structureType,
    setStructureType,
  } = useEditorStore();

  const usa = (alvo: Tool) => setTool(alvo);
  const desenhandoContorno = tool === 'arena-rect' || tool === 'arena-polygon';
  // A pista e as construções usam as mesmas ferramentas de contorno; o que
  // muda é o que se cria. Escolher pista zera o tipo de construção.
  const contornoDaPista = (alvo: Tool) => {
    setStructureType(null);
    usa(alvo);
  };
  const construcao = (tipo: (typeof STRUCTURES)[number]['type'], alvo: Tool) => {
    setStructureType(tipo);
    usa(alvo);
  };
  const nomeConstrucao = STRUCTURES.find((s) => s.type === structureType)?.label ?? 'Arquibancada';
  // Forma da construção (decisão 69): vale para o tipo que se escolher
  // depois — antes só a arquibancada parecia ter contorno livre.
  const [construcaoLivre, setConstrucaoLivre] = useState(false);
  const formaConstrucao: Tool = construcaoLivre ? 'arena-polygon' : 'arena-rect';
  const nomeObstaculo = OBSTACLES.find((o) => o.type === obstacleType)?.label ?? '';
  const nomeOrnamento = ORNAMENTS.find((o) => o.type === ornamentType)?.label ?? '';

  return (
    <nav className="rail" aria-label="Ferramentas">
      <RailButton icon="⬉" label="Selecionar" shortcut="V" active={tool === 'select'} onClick={() => usa('select')} />
      <RailButton icon="✋" label="Mover vista" shortcut="H" active={tool === 'pan'} onClick={() => usa('pan')} />
      <hr />

      {mode === 'percurso' ? (
        <>
          <RailFlyout
            icon="▬"
            label="Obstáculo"
            shortcut="O"
            detail={nomeObstaculo}
            active={tool === 'obstacle'}
            onActivate={() => usa('obstacle')}
            items={OBSTACLES.map((o) => ({
              label: o.label,
              hint: o.hint,
              active: tool === 'obstacle' && obstacleType === o.type,
              onSelect: () => {
                setObstacleType(o.type);
                usa('obstacle');
              },
            }))}
            footer="Clique na pista para inserir. Shift mantém a ferramenta."
          />
          <RailFlyout
            icon="✎"
            label="Traçado"
            shortcut="T"
            active={tool === 'path'}
            onActivate={() => usa('path')}
            items={[
              {
                label: 'À mão, curvo',
                hint: 'clique a clique; os cliques viram curva',
                active: tool === 'path' && pathSmooth,
                onSelect: () => {
                  setPathSmooth(true);
                  usa('path');
                },
              },
              {
                label: 'À mão, reto',
                hint: 'clique a clique, em segmentos retos',
                active: tool === 'path' && !pathSmooth,
                onSelect: () => {
                  setPathSmooth(false);
                  usa('path');
                },
              },
              'separator',
              {
                label: 'Por trechos',
                hint: 'você escolhe a forma de cada volta',
                onSelect: startGuidedRide,
              },
              {
                label: 'Automático',
                hint: 'traça tudo pela numeração',
                onSelect: () => traceCourse(),
              },
            ]}
            footer="Por trechos e Automático seguem a numeração dos obstáculos."
          />
          <RailButton icon="T" label="Texto" shortcut="X" active={tool === 'text'} onClick={() => usa('text')} />
          <RailFlyout
            icon="⚑"
            label="Partida e chegada"
            items={[
              { label: 'Partida', hint: 'no eixo do primeiro obstáculo', onSelect: () => insertTimingLine('start') },
              { label: 'Chegada', hint: 'no eixo do último obstáculo', onSelect: () => insertTimingLine('finish') },
            ]}
            footer="Seguem a numeração; a distância se ajusta no painel da linha."
          />
          <hr />
          <RailFlyout
            icon="▤"
            label="Informações técnicas"
            items={[
              { label: 'Quadro técnico', hint: 'prova, tabela, altura, velocidade…', onSelect: insertInfoBox },
              { label: 'Tabela de alturas', hint: 'lê as alturas dos obstáculos', onSelect: insertHeightTable },
              { label: 'Logo ou imagem', hint: 'PNG, JPG ou WEBP, posicionado na folha', onSelect: () => void insertLogo() },
            ]}
          />
        </>
      ) : (
        <>
          <RailFlyout
            icon="▭"
            label="Contorno"
            active={desenhandoContorno && structureType === null}
            onActivate={() => contornoDaPista('arena-rect')}
            items={[
              {
                label: 'Retângulo',
                hint: 'arraste; as medidas se digitam no painel',
                active: tool === 'arena-rect' && structureType === null,
                onSelect: () => contornoDaPista('arena-rect'),
              },
              {
                label: 'Contorno livre',
                hint: 'clique cada vértice; Enter fecha',
                active: tool === 'arena-polygon' && structureType === null,
                onSelect: () => contornoDaPista('arena-polygon'),
              },
            ]}
          />
          <RailFlyout
            icon="▦"
            label="Construção"
            detail={structureType ? nomeConstrucao : undefined}
            active={desenhandoContorno && structureType !== null}
            onActivate={() => construcao(structureType ?? 'arquibancada', formaConstrucao)}
            items={[
              {
                label: 'Retângulo',
                hint: 'arraste um retângulo',
                active: !construcaoLivre,
                onSelect: () => {
                  setConstrucaoLivre(false);
                  construcao(structureType ?? 'arquibancada', 'arena-rect');
                },
              },
              {
                label: 'Contorno livre',
                hint: 'clique cada vértice; Enter fecha',
                active: construcaoLivre,
                onSelect: () => {
                  setConstrucaoLivre(true);
                  construcao(structureType ?? 'arquibancada', 'arena-polygon');
                },
              },
              'separator' as const,
              ...STRUCTURES.map((s) => ({
                label: s.label,
                hint: construcaoLivre ? 'em contorno livre' : 'em retângulo',
                active: (tool === 'arena-rect' || tool === 'arena-polygon') && structureType === s.type,
                onSelect: () => construcao(s.type, formaConstrucao),
              })),
            ]}
            footer="Referência do local: arquibancada, área de concreto, prédios. Não limita o traçado."
          />
          <RailFlyout
            icon="🌳"
            label="Ornamento"
            detail={nomeOrnamento}
            active={tool === 'ornament'}
            onActivate={() => usa('ornament')}
            items={ORNAMENTS.map((o) => ({
              label: o.label,
              active: tool === 'ornament' && ornamentType === o.type,
              onSelect: () => {
                setOrnamentType(o.type);
                usa('ornament');
              },
            }))}
          />
          <RailButton
            icon="🖼"
            label="Imagem"
            onClick={() => void importBackgroundImage()}
            title="Importa PNG, JPG ou WEBP como referência. O arquivo fica embutido no projeto."
          />
        </>
      )}
    </nav>
  );
}

interface RailButtonProps {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  active?: boolean;
  title?: string;
  onClick: () => void;
}

function RailButton({ icon, label, shortcut, active, title, onClick }: RailButtonProps) {
  return (
    <button
      className={active ? 'rail-button active' : 'rail-button'}
      onClick={onClick}
      title={title ?? (shortcut ? `${label} (${shortcut})` : label)}
      aria-pressed={active}
    >
      <span className="rail-icon">{icon}</span>
      <span className="rail-label">{label}</span>
      {shortcut && <kbd className="rail-key">{shortcut}</kbd>}
    </button>
  );
}

type FlyoutItem =
  | { label: string; hint?: string; active?: boolean; onSelect: () => void }
  | 'separator';

interface RailFlyoutProps {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  /** Variante escolhida, mostrada sob o nome: "Oxer", "Árvore". */
  detail?: string;
  active?: boolean;
  /** Clicar no botão já ativa a ferramenta, com a variante atual. */
  onActivate?: () => void;
  items: FlyoutItem[];
  footer?: string;
}

/**
 * Botão com opções ao lado. Clicar ativa a ferramenta (quando há uma) e
 * abre a lista; escolher fecha. O "◢" no canto avisa que há mais.
 */
function RailFlyout({ icon, label, shortcut, detail, active, onActivate, items, footer }: RailFlyoutProps) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const foraDaqui = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const noEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('pointerdown', foraDaqui, true);
    document.addEventListener('keydown', noEsc, true);
    return () => {
      document.removeEventListener('pointerdown', foraDaqui, true);
      document.removeEventListener('keydown', noEsc, true);
    };
  }, [aberto]);

  return (
    <div className="rail-flyout" ref={raiz}>
      <button
        className={active || aberto ? 'rail-button active' : 'rail-button'}
        onClick={() => {
          onActivate?.();
          setAberto((v) => !v);
        }}
        title={shortcut ? `${label} (${shortcut})` : label}
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        <span className="rail-icon">{icon}</span>
        <span className="rail-label">{label}</span>
        {detail && <span className="rail-detail">{detail}</span>}
        {shortcut && <kbd className="rail-key">{shortcut}</kbd>}
        <span className="rail-more" aria-hidden="true">◢</span>
      </button>
      {aberto && (
        <div className="flyout" role="menu">
          <p className="flyout-title">{label}</p>
          {items.map((item, i) =>
            item === 'separator' ? (
              <hr key={`s${i}`} />
            ) : (
              <button
                key={item.label}
                role="menuitem"
                className={item.active ? 'active' : ''}
                onClick={() => {
                  setAberto(false);
                  item.onSelect();
                }}
              >
                <span>{item.label}</span>
                {item.hint && <em>{item.hint}</em>}
              </button>
            ),
          )}
          {footer && <p className="flyout-footer">{footer}</p>}
        </div>
      )}
    </div>
  );
}
