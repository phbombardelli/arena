import { useEffect, useRef, useState, type ReactNode } from 'react';
import { OBSTACLES, obstacleTypesFor } from '@core/library/obstacles';
import { DEFAULT_CAVALETES, DEFAULT_LEQUE, DEFAULT_RELOGIO, defaultPeDeGalinha } from '@core/library/exercises';
import { useDocumentStore } from '@store/documentStore';
import { ORNAMENTS } from '@core/library/ornaments';
import { STRUCTURES } from '@core/library/structures';
import { importBackgroundImage, startMapWizard } from '@ui/actions/imageActions';
import { traceCourse } from '@ui/actions/rideActions';
import { insertHeightTable, insertInfoBox } from '@ui/actions/annotationActions';
import { startGuidedRide } from '@ui/actions/guidedActions';
import { insertLogo } from '@ui/actions/logoActions';
import { insertTimingLine } from '@ui/actions/timingActions';
import { useEditorStore, type Tool } from '@store/editorStore';
import type { ExerciseKind, OrnamentType } from '@core/model/types';
import {
  IconBarrierBlock,
  IconArrowsSplit,
  IconBooks,
  IconChartArcs,
  IconClockHour3,
  IconGripHorizontal,
  IconTrafficCone,
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
import { t } from '@core/i18n/i18n';

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
  const nomeConstrucao = STRUCTURES.find((s) => s.type === structureType)?.label ?? STRUCTURES.find((s) => s.type === 'arquibancada')!.label;
  // Forma da construção (decisão 69): vale para o tipo que se escolher
  // depois — antes só a arquibancada parecia ter contorno livre.
  const [construcaoLivre, setConstrucaoLivre] = useState(false);
  const formaConstrucao: Tool = construcaoLivre ? 'arena-polygon' : 'arena-rect';
  const nomeObstaculo = OBSTACLES.find((o) => o.type === obstacleType)?.label ?? '';
  const nomeOrnamento = ORNAMENTS.find((o) => o.type === ornamentType)?.label ?? '';
  const ginastica = useDocumentStore((st) => st.doc.kind === 'ginastica');
  const abreExercicio = (kind: ExerciseKind, completo = true) =>
    useEditorStore.getState().setExerciseEditor({
      kind,
      params:
        kind === 'cavaletes'
          ? DEFAULT_CAVALETES
          : kind === 'relogio'
            ? DEFAULT_RELOGIO
            : kind === 'leque'
              ? DEFAULT_LEQUE
              : defaultPeDeGalinha(completo),
      editingId: null,
    });

  return (
    <nav className="rail" aria-label={t('rail.ferramentas')}>
      <RailButton icon={<IconPointer {...ICONE} />} label={t('rail.selecionar')} shortcut="V" active={tool === 'select'} onClick={() => usa('select')} />

      {mode === 'percurso' && ginastica ? (
        <>
          <RailGroup title={t('rail.elementos')} />
          <RailFlyout
            icon={<IconBarrierBlock {...ICONE} />}
            label={t('rail.obstaculo')}
            shortcut="O"
            detail={nomeObstaculo}
            active={tool === 'obstacle'}
            onActivate={() => usa('obstacle')}
            items={obstacleTypesFor('ginastica').map((o) => ({
              label: o.label,
              hint: o.hint,
              active: tool === 'obstacle' && obstacleType === o.type,
              onSelect: () => {
                setObstacleType(o.type);
                usa('obstacle');
              },
            }))}
            footer={t('rail.inserirRodape')}
          />
          <RailFlyout
            icon={<IconTrafficCone {...ICONE} />}
            label={t('rail.ornamentos')}
            active={tool === 'ornament' || ((tool === 'arena-rect' || tool === 'arena-polygon') && structureType === 'ilha')}
            onActivate={() => {
              setOrnamentType('cone');
              usa('ornament');
            }}
            items={[
              ...(['cone', 'vaso'] as OrnamentType[]).map((tipo) => ({
                label: ORNAMENTS.find((o) => o.type === tipo)!.label,
                hint: t('rail.cliqueColocar'),
                active: tool === 'ornament' && ornamentType === tipo,
                onSelect: () => {
                  setOrnamentType(tipo);
                  usa('ornament');
                },
              })),
              {
                label: t('rail.ilhaDecorativa'),
                hint: t('rail.arrasteOval'),
                active: tool === 'arena-rect' && structureType === 'ilha',
                onSelect: () => construcao('ilha', 'arena-rect'),
              },
            ]}
          />

          <RailGroup title={t('rail.exercicios')} />
          <RailButton icon={<IconGripHorizontal {...ICONE} />} label={t('rail.cavaletes')} onClick={() => abreExercicio('cavaletes')} />
          <RailFlyout
            icon={<IconArrowsSplit {...ICONE} />}
            label={t('rail.peDeGalinha')}
            items={[
              { label: t('rail.completo'), hint: t('rail.completoDica'), onSelect: () => abreExercicio('pe-de-galinha', true) },
              { label: t('rail.simples'), hint: t('rail.simplesDica'), onSelect: () => abreExercicio('pe-de-galinha', false) },
            ]}
          />
          <RailButton icon={<IconClockHour3 {...ICONE} />} label={t('rail.relogio')} onClick={() => abreExercicio('relogio')} />
          <RailButton icon={<IconChartArcs {...ICONE} />} label={t('rail.leque')} onClick={() => abreExercicio('leque')} />

          <RailGroup title={t('rail.medirAnotar')} />
          <RailButton icon={<IconRulerMeasure {...ICONE} />} label={t('rail.trena')} shortcut="M" active={tool === 'measure'} onClick={() => usa('measure')} />
          <RailButton icon={<IconTypography {...ICONE} />} label={t('rail.texto')} shortcut="X" active={tool === 'text'} onClick={() => usa('text')} />
        </>
      ) : mode === 'percurso' ? (
        <>
          <RailGroup title={t('rail.prova')} />
          <RailFlyout
            icon={<IconBarrierBlock {...ICONE} />}
            label={t('rail.obstaculo')}
            shortcut="O"
            detail={nomeObstaculo}
            active={tool === 'obstacle'}
            onActivate={() => usa('obstacle')}
            items={obstacleTypesFor('percurso').map((o) => ({
              label: o.label,
              hint: o.hint,
              active: tool === 'obstacle' && obstacleType === o.type,
              onSelect: () => {
                setObstacleType(o.type);
                usa('obstacle');
              },
            }))}
            footer={t('rail.inserirRodape')}
          />
          <RailFlyout
            icon={<IconFlag {...ICONE} />}
            label={t('rail.partidaChegada')}
            items={[
              { label: t('rail.partida'), hint: t('rail.partidaDica'), onSelect: () => insertTimingLine('start') },
              { label: t('rail.chegada'), hint: t('rail.chegadaDica'), onSelect: () => insertTimingLine('finish') },
            ]}
            footer={t('rail.partidaRodape')}
          />
          <RailFlyout
            icon={<IconPlant {...ICONE} />}
            label={t('rail.ornamentos')}
            active={
              (tool === 'ornament' && ornamentType === 'vaso') ||
              ((tool === 'arena-rect' || tool === 'arena-polygon') && structureType === 'ilha')
            }
            onActivate={() => construcao('ilha', 'arena-rect')}
            items={[
              {
                label: t('rail.ilhaDecorativa'),
                hint: t('rail.arrasteOval'),
                active: tool === 'arena-rect' && structureType === 'ilha',
                onSelect: () => construcao('ilha', 'arena-rect'),
              },
              {
                label: t('rail.ilhaContornoLivre'),
                hint: t('rail.contornoLivreDica'),
                active: tool === 'arena-polygon' && structureType === 'ilha',
                onSelect: () => construcao('ilha', 'arena-polygon'),
              },
              {
                label: t('rail.vaso'),
                hint: t('rail.cliqueColocar'),
                active: tool === 'ornament' && ornamentType === 'vaso',
                onSelect: () => {
                  setOrnamentType('vaso');
                  usa('ornament');
                },
              },
            ]}
            footer={t('rail.ornamentosProvaRodape')}
          />

          <RailGroup title={t('rail.tracado')} />
          <RailFlyout
            icon={<IconPencil {...ICONE} />}
            label={t('rail.desenhar')}
            shortcut="T"
            active={tool === 'path'}
            onActivate={() => usa('path')}
            items={[
              {
                label: t('rail.maoCurvo'),
                hint: t('rail.maoCurvoDica'),
                active: tool === 'path' && pathSmooth,
                onSelect: () => {
                  setPathSmooth(true);
                  usa('path');
                },
              },
              {
                label: t('rail.maoReto'),
                hint: t('rail.maoRetoDica'),
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
            label={t('rail.assistente')}
            items={[
              { label: t('rail.porTrechos'), hint: t('rail.porTrechosDica'), onSelect: startGuidedRide },
              { label: t('rail.automatico'), hint: t('rail.automaticoDica'), onSelect: () => traceCourse() },
            ]}
            footer={t('rail.assistenteRodape')}
          />

          <RailGroup title={t('rail.medirAnotar')} />
          <RailButton icon={<IconRulerMeasure {...ICONE} />} label={t('rail.trena')} shortcut="M" active={tool === 'measure'} onClick={() => usa('measure')} />
          <RailButton icon={<IconTypography {...ICONE} />} label={t('rail.texto')} shortcut="X" active={tool === 'text'} onClick={() => usa('text')} />

          <RailGroup title={t('rail.folha')} />
          <RailFlyout
            icon={<IconTable {...ICONE} />}
            label={t('rail.quadrosTecnicos')}
            items={[
              { label: t('rail.quadroTecnico'), hint: t('rail.quadroTecnicoDica'), onSelect: insertInfoBox },
              { label: t('rail.tabelaAlturas'), hint: t('rail.tabelaAlturasDica'), onSelect: insertHeightTable },
            ]}
          />
          <RailButton
            icon={<IconPhoto {...ICONE} />}
            label={t('rail.logo')}
            onClick={() => void insertLogo()}
            title={t('rail.logoDica')}
          />
        </>
      ) : (
        <>
          <RailGroup title={t('rail.local')} />
          <RailButton
            icon={<IconMap2 {...ICONE} />}
            label={t('rail.pistaPeloMapa')}
            onClick={() => void startMapWizard()}
            title={t('rail.pistaPeloMapaDica')}
          />
          <RailFlyout
            icon={<IconSquare {...ICONE} />}
            label={t('rail.contorno')}
            active={desenhandoContorno && structureType === null}
            onActivate={() => contornoDaPista('arena-rect')}
            items={[
              {
                label: t('rail.retangulo'),
                hint: t('rail.retanguloPistaDica'),
                active: tool === 'arena-rect' && structureType === null,
                onSelect: () => contornoDaPista('arena-rect'),
              },
              {
                label: t('rail.contornoLivre'),
                hint: t('rail.contornoLivreDica'),
                active: tool === 'arena-polygon' && structureType === null,
                onSelect: () => contornoDaPista('arena-polygon'),
              },
            ]}
          />
          <RailButton
            icon={<IconPhoto {...ICONE} />}
            label={t('rail.imagemFundo')}
            onClick={() => void importBackgroundImage()}
            title={t('rail.imagemFundoDica')}
          />
          <RailButton
            icon={<IconBooks {...ICONE} />}
            label={t('rail.modelosPista')}
            onClick={() => setDialog('modelos')}
            title={t('rail.modelosPistaDica')}
          />

          <RailGroup title={t('rail.cenario')} />
          <RailFlyout
            icon={<IconBuilding {...ICONE} />}
            label={t('rail.construcao')}
            detail={structureType && structureType !== 'rio' && structureType !== 'lago' ? nomeConstrucao : undefined}
            active={desenhandoContorno && structureType !== null && structureType !== 'rio' && structureType !== 'lago'}
            onActivate={() => construcao(structureType && structureType !== 'rio' && structureType !== 'lago' ? structureType : 'arquibancada', formaConstrucao)}
            items={[
              {
                label: t('rail.retangulo'),
                hint: t('rail.arrasteRetangulo'),
                active: !construcaoLivre,
                onSelect: () => {
                  setConstrucaoLivre(false);
                  construcao(structureType ?? 'arquibancada', 'arena-rect');
                },
              },
              {
                label: t('rail.contornoLivre'),
                hint: t('rail.contornoLivreDica'),
                active: construcaoLivre,
                onSelect: () => {
                  setConstrucaoLivre(true);
                  construcao(structureType ?? 'arquibancada', 'arena-polygon');
                },
              },
              'separator' as const,
              ...STRUCTURES.filter((s) => !s.water).map((s) => ({
                label: s.label,
                hint: construcaoLivre ? t('rail.emContornoLivre') : t('rail.emRetangulo'),
                active: (tool === 'arena-rect' || tool === 'arena-polygon') && structureType === s.type,
                onSelect: () => construcao(s.type, formaConstrucao),
              })),
            ]}
            footer={t('rail.construcaoRodape')}
          />
          <RailFlyout
            icon={<IconRipple {...ICONE} />}
            label={t('rail.agua')}
            active={(tool === 'arena-rect' || tool === 'arena-polygon') && (structureType === 'rio' || structureType === 'lago')}
            onActivate={() => construcao('rio', 'arena-rect')}
            items={[
              {
                label: t('rail.rio'),
                hint: t('rail.rioDica'),
                active: tool === 'arena-rect' && structureType === 'rio',
                onSelect: () => construcao('rio', 'arena-rect'),
              },
              {
                label: t('rail.massaAgua'),
                hint: t('rail.massaAguaDica'),
                active: tool === 'arena-polygon' && structureType === 'lago',
                onSelect: () => construcao('lago', 'arena-polygon'),
              },
            ]}
            footer={t('rail.aguaRodape')}
          />
          <RailFlyout
            icon={<IconDoorEnter {...ICONE} />}
            label={t('rail.entradaSaida')}
            active={tool === 'ornament' && PORTOES.includes(ornamentType)}
            items={PORTOES.map((tipo) => ({
              label: ORNAMENTS.find((o) => o.type === tipo)!.label,
              hint: t('rail.portaoDica'),
              active: tool === 'ornament' && ornamentType === tipo,
              onSelect: () => {
                setOrnamentType(tipo);
                usa('ornament');
              },
            }))}
          />
          <RailFlyout
            icon={<IconTree {...ICONE} />}
            label={t('rail.ornamentos')}
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
        <RailButton icon={<IconHandStop {...ICONE} />} label={t('rail.moverVista')} shortcut="H" active={tool === 'pan'} onClick={() => usa('pan')} />
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
