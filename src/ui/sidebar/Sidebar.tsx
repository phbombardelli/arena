import { useEffect, useRef, useState, type ReactNode } from 'react';
import { OBSTACLES } from '@core/library/obstacles';
import { ORNAMENTS } from '@core/library/ornaments';
import { STRUCTURES } from '@core/library/structures';
import { importBackgroundImage, startMapWizard } from '@ui/actions/imageActions';
import { traceCourse } from '@ui/actions/rideActions';
import { insertHeightTable, insertInfoBox } from '@ui/actions/annotationActions';
import { startGuidedRide } from '@ui/actions/guidedActions';
import { insertLogo } from '@ui/actions/logoActions';
import { insertTimingLine } from '@ui/actions/timingActions';
import { useEditorStore, type Tool } from '@store/editorStore';
import type { OrnamentType } from '@core/model/types';
import {
  IconBarrierBlock,
  IconBooks,
  IconBuilding,
  IconDoorEnter,
  IconFlag,
  IconHandStop,
  IconMap2,
  IconPencil,
  IconPhoto,
  IconPlant,
  IconPointer,
  IconRipple,
  IconRulerMeasure,
  IconSquare,
  IconTable,
  IconTree,
  IconTypography,
  IconWand,
} from '@tabler/icons-react';

/** Ícones do trilho: um conjunto só, de traço fino (decisão 87). */
const ICONE = { size: 19, stroke: 1.6 } as const;
/** Entrada e saída têm botão próprio na Pista: vão em toda pista. */
const PORTOES: OrnamentType[] = ['entrada', 'saida'];

/**
 * Barra de ferramentas da esquerda (decisão 87).
 *
 * Em grupos, na ordem em que o trabalho acontece. No Percurso: Prova,
 * Traçado, Medir e anotar, Folha. Na Pista: Local, Cenário. O que tem
 * variantes abre ao lado, em vez de empurrar a barra para baixo. Mover a
 * vista fica no pé. Nada é colocado sozinho: partida e chegada só quando
 * pedidas.
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
    setDialog,
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
      <RailButton icon={<IconPointer {...ICONE} />} label="Selecionar" shortcut="V" active={tool === 'select'} onClick={() => usa('select')} />

      {mode === 'percurso' ? (
        <>
          <RailGroup title="Prova" />
          <RailFlyout
            icon={<IconBarrierBlock {...ICONE} />}
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
            icon={<IconFlag {...ICONE} />}
            label="Partida e chegada"
            items={[
              { label: 'Partida', hint: 'no eixo do primeiro obstáculo', onSelect: () => insertTimingLine('start') },
              { label: 'Chegada', hint: 'no eixo do último obstáculo', onSelect: () => insertTimingLine('finish') },
            ]}
            footer="Seguem a numeração; a distância se ajusta no painel da linha."
          />
          <RailFlyout
            icon={<IconPlant {...ICONE} />}
            label="Ornamentos"
            active={
              (tool === 'ornament' && ornamentType === 'vaso') ||
              ((tool === 'arena-rect' || tool === 'arena-polygon') && structureType === 'ilha')
            }
            onActivate={() => construcao('ilha', 'arena-rect')}
            items={[
              {
                label: 'Ilha decorativa',
                hint: 'arraste: nasce oval',
                active: tool === 'arena-rect' && structureType === 'ilha',
                onSelect: () => construcao('ilha', 'arena-rect'),
              },
              {
                label: 'Ilha em contorno livre',
                hint: 'clique cada vértice; Enter fecha',
                active: tool === 'arena-polygon' && structureType === 'ilha',
                onSelect: () => construcao('ilha', 'arena-polygon'),
              },
              {
                label: 'Vaso',
                hint: 'clique para colocar',
                active: tool === 'ornament' && ornamentType === 'vaso',
                onSelect: () => {
                  setOrnamentType('vaso');
                  usa('ornament');
                },
              },
            ]}
            footer="Móveis da prova: o assistente contorna, e o traçado por cima vira aviso."
          />

          <RailGroup title="Traçado" />
          <RailFlyout
            icon={<IconPencil {...ICONE} />}
            label="Desenhar"
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
            ]}
          />
          <RailFlyout
            icon={<IconWand {...ICONE} />}
            label="Assistente"
            items={[
              { label: 'Por trechos', hint: 'você escolhe a forma de cada volta', onSelect: startGuidedRide },
              { label: 'Automático', hint: 'traça tudo pela numeração', onSelect: () => traceCourse() },
            ]}
            footer="Seguem a numeração dos obstáculos, da partida à chegada."
          />

          <RailGroup title="Medir e anotar" />
          <RailButton icon={<IconRulerMeasure {...ICONE} />} label="Trena" shortcut="M" active={tool === 'measure'} onClick={() => usa('measure')} />
          <RailButton icon={<IconTypography {...ICONE} />} label="Texto" shortcut="X" active={tool === 'text'} onClick={() => usa('text')} />

          <RailGroup title="Folha" />
          <RailFlyout
            icon={<IconTable {...ICONE} />}
            label="Quadros técnicos"
            items={[
              { label: 'Quadro técnico', hint: 'prova, tabela, altura, velocidade…', onSelect: insertInfoBox },
              { label: 'Tabela de alturas', hint: 'lê as alturas dos obstáculos', onSelect: insertHeightTable },
            ]}
          />
          <RailButton
            icon={<IconPhoto {...ICONE} />}
            label="Logo ou imagem"
            onClick={() => void insertLogo()}
            title="PNG, JPG ou WEBP, posicionado na folha"
          />
        </>
      ) : (
        <>
          <RailGroup title="Local" />
          <RailButton
            icon={<IconMap2 {...ICONE} />}
            label="Pista pelo mapa"
            onClick={() => void startMapWizard()}
            title="Cole ou abra um print do Google Maps com uma medida marcada"
          />
          <RailFlyout
            icon={<IconSquare {...ICONE} />}
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
          <RailButton
            icon={<IconPhoto {...ICONE} />}
            label="Imagem de fundo"
            onClick={() => void importBackgroundImage()}
            title="Importa PNG, JPG ou WEBP como referência. O arquivo fica embutido no projeto."
          />
          <RailButton
            icon={<IconBooks {...ICONE} />}
            label="Modelos de pista"
            onClick={() => setDialog('modelos')}
            title="As pistas do programa e as que você guardou"
          />

          <RailGroup title="Cenário" />
          <RailFlyout
            icon={<IconBuilding {...ICONE} />}
            label="Construção"
            detail={structureType && structureType !== 'rio' && structureType !== 'lago' ? nomeConstrucao : undefined}
            active={desenhandoContorno && structureType !== null && structureType !== 'rio' && structureType !== 'lago'}
            onActivate={() => construcao(structureType && structureType !== 'rio' && structureType !== 'lago' ? structureType : 'arquibancada', formaConstrucao)}
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
              ...STRUCTURES.filter((s) => !s.water).map((s) => ({
                label: s.label,
                hint: construcaoLivre ? 'em contorno livre' : 'em retângulo',
                active: (tool === 'arena-rect' || tool === 'arena-polygon') && structureType === s.type,
                onSelect: () => construcao(s.type, formaConstrucao),
              })),
            ]}
            footer="Referência do local: arquibancada, área de concreto, prédios. Não limita o traçado."
          />
          <RailFlyout
            icon={<IconRipple {...ICONE} />}
            label="Água"
            active={(tool === 'arena-rect' || tool === 'arena-polygon') && (structureType === 'rio' || structureType === 'lago')}
            onActivate={() => construcao('rio', 'arena-rect')}
            items={[
              {
                label: 'Rio',
                hint: 'arraste um retângulo; aceita obstáculo em cima',
                active: tool === 'arena-rect' && structureType === 'rio',
                onSelect: () => construcao('rio', 'arena-rect'),
              },
              {
                label: "Massa d'água",
                hint: 'lago ou córrego: clique cada vértice; Enter fecha',
                active: tool === 'arena-polygon' && structureType === 'lago',
                onSelect: () => construcao('lago', 'arena-polygon'),
              },
            ]}
            footer="Obstáculo sobre massa d'água aparece nos avisos de interferência; sobre o rio, pode."
          />
          <RailFlyout
            icon={<IconDoorEnter {...ICONE} />}
            label="Entrada e saída"
            active={tool === 'ornament' && PORTOES.includes(ornamentType)}
            items={PORTOES.map((t) => ({
              label: ORNAMENTS.find((o) => o.type === t)!.label,
              hint: 'nasce de frente para a cerca mais próxima',
              active: tool === 'ornament' && ornamentType === t,
              onSelect: () => {
                setOrnamentType(t);
                usa('ornament');
              },
            }))}
          />
          <RailFlyout
            icon={<IconTree {...ICONE} />}
            label="Ornamentos"
            detail={tool === 'ornament' && !PORTOES.includes(ornamentType) ? nomeOrnamento : undefined}
            active={tool === 'ornament' && !PORTOES.includes(ornamentType)}
            onActivate={() => {
              if (PORTOES.includes(ornamentType) || ornamentType === 'vaso') setOrnamentType('arvore');
              usa('ornament');
            }}
            items={ORNAMENTS.filter((o) => o.type !== 'vaso' && !PORTOES.includes(o.type)).map((o) => ({
              label: o.label,
              active: tool === 'ornament' && ornamentType === o.type,
              onSelect: () => {
                setOrnamentType(o.type);
                usa('ornament');
              },
            }))}
          />
        </>
      )}

      {/* Mover a vista é recurso, não ferramenta de desenho: fica no pé,
          e Espaço ou o botão do meio fazem o mesmo de qualquer lugar. */}
      <div className="rail-foot">
        <RailButton icon={<IconHandStop {...ICONE} />} label="Mover vista" shortcut="H" active={tool === 'pan'} onClick={() => usa('pan')} />
      </div>
    </nav>
  );
}

/** Título de grupo do trilho (decisão 87). */
function RailGroup({ title }: { title: string }) {
  return <p className="rail-group">{title}</p>;
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
  // O trilho rola em tela baixa, e a rolagem cortaria a lista ao lado: ela
  // se posiciona pela janela, rente ao botão.
  const [onde, setOnde] = useState<{ left: number; top: number } | null>(null);

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
        onClick={(e) => {
          onActivate?.();
          const r = e.currentTarget.getBoundingClientRect();
          setOnde({ left: r.right + 8, top: Math.min(r.top, window.innerHeight - 320) });
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
        <div className="flyout" role="menu" style={onde ? { position: 'fixed', left: onde.left, top: Math.max(8, onde.top) } : undefined}>
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
