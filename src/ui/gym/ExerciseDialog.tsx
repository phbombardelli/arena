import { useMemo, useRef, useState } from 'react';
import type { Vec2 } from '@core/geometry/vec';
import {
  generateExercise,
  placeExercise,
  saidaPose,
  updateExercise,
  type CavaletesParams,
  type ExerciseParams,
  type LequeParams,
  type PeDeGalinhaParams,
  type RelogioParams,
  type Saida,
  type Sentido,
} from '@core/library/exercises';
import { OBSTACLES, obstacleDef } from '@core/library/obstacles';
import type { ExerciseKind, ObstacleType } from '@core/model/types';
import { mmPerMeter } from '@core/scale/units';
import { MeasureLayer } from '@render/layers/MeasureLayer';
import { ObstacleLayer } from '@render/layers/ObstacleLayer';
import { PathLayer } from '@render/layers/PathLayer';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { Dialog } from '@ui/common/Popover';
import { NumberField } from '@ui/inspector/NumberField';
import { t } from '@core/i18n/i18n';
import type { MessageKey } from '@core/i18n/messages';

/**
 * Configurador dos exercícios de ginástica (B-37, decisão 89): o desenho
 * ao vivo e os campos. Nas saídas em curva do pé de galinha, o salto se
 * arrasta de lado na prévia, sobre o arco que a distância permite.
 */

const TITULOS: Record<ExerciseKind, MessageKey> = {
  cavaletes: 'rail.cavaletes',
  relogio: 'rail.relogio',
  'pe-de-galinha': 'rail.peDeGalinha',
  leque: 'rail.leque',
};

const LADO: Record<LadoCurva, MessageKey> = { esquerda: 'gin.esquerda', direita: 'gin.direita' };

const PREVIA_ESCALA = 250;

export function ExerciseDialog() {
  const editor = useEditorStore((s) => s.exerciseEditor);
  if (!editor) return null;
  return <Configurador key={editor.editingId ?? editor.kind} {...editor} params={editor.params as ExerciseParams} />;
}

function Configurador({ kind, params: iniciais, editingId }: { kind: ExerciseKind; params: ExerciseParams; editingId: string | null }) {
  const [params, setParams] = useState<ExerciseParams>(() => structuredClone(iniciais));
  // Último lado em curva mexido no pé de galinha: é ele que manda ao igualar (B-89).
  const [ultimo, setUltimo] = useState<LadoCurva>('direita');
  const fecha = () => useEditorStore.getState().setExerciseEditor(null);
  const pg = kind === 'pe-de-galinha' ? (params as PeDeGalinhaParams) : null;
  const titulo = pg ? `${t(TITULOS[kind])}${t(pg.completo ? 'ginp.completo' : 'ginp.simples')}` : t(TITULOS[kind]);

  const aplicar = () => {
    const st = useDocumentStore.getState();
    let ids: string[] = [];
    if (editingId) {
      st.apply('Editar ginástica', (d) => {
        ids = updateExercise(d, editingId, params);
      });
    } else {
      const { viewport } = useEditorStore.getState();
      const k = mmPerMeter(st.doc.page.printScale);
      const alvo = { x: (viewport.centerMm.x - st.doc.originMm.x) / k, y: (viewport.centerMm.y - st.doc.originMm.y) / k };
      const c = centroGerado(kind, params);
      st.apply('Inserir ginástica', (d) => {
        ids = placeExercise(d, kind, params, { x: alvo.x - c.x, y: alvo.y - c.y }, 0);
      });
    }
    // Entra selecionado e com a ferramenta de seleção: pronto para arrastar (B-84).
    useEditorStore.getState().setTool('select');
    useEditorStore.getState().setSelection(ids);
    fecha();
  };

  return (
    <Dialog title={editingId ? t('gin.editarTitulo', { nome: titulo }) : titulo} onClose={fecha}>
      <div className="gym-config">
        <div className="gym-form">
          {kind === 'cavaletes' && <FormCavaletes p={params as CavaletesParams} set={setParams} />}
          {kind === 'relogio' && <FormRelogio p={params as RelogioParams} set={setParams} />}
          {kind === 'leque' && <FormLeque p={params as LequeParams} set={setParams} />}
          {pg && <FormPeDeGalinha p={pg} set={setParams} onLado={setUltimo} />}
        </div>
        <Previa kind={kind} params={params} set={setParams} ultimo={ultimo} onLado={setUltimo} />
      </div>
      <div className="row-buttons">
        <button onClick={fecha}>{t('gin.cancelar')}</button>
        <button className="primary" onClick={aplicar}>
          {editingId ? t('gin.aplicar') : t('gin.inserir')}
        </button>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------- prévia */

function caixa(kind: ExerciseKind, params: ExerciseParams) {
  const g = generateExercise(kind, params);
  const pts: Vec2[] = [];
  for (const o of g.obstacles) {
    const r = obstacleDef(o.type).faceWidthM / 2 + 1;
    pts.push({ x: o.pos.x - r, y: o.pos.y - r }, { x: o.pos.x + r, y: o.pos.y + r });
  }
  for (const e of g.extras) {
    if (e.kind === 'measure') pts.push(e.a, e.b);
    else for (const n of e.nodes) pts.push(n.pos);
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) }, g };
}

function centroGerado(kind: ExerciseKind, params: ExerciseParams): Vec2 {
  const b = caixa(kind, params);
  return { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
}

type LadoCurva = 'esquerda' | 'direita';

function Previa({
  kind,
  params,
  set,
  ultimo,
  onLado,
}: {
  kind: ExerciseKind;
  params: ExerciseParams;
  set: (p: ExerciseParams) => void;
  ultimo: LadoCurva;
  onLado: (lado: LadoCurva) => void;
}) {
  const svg = useRef<SVGSVGElement | null>(null);
  const [arrasto, setArrasto] = useState<{ lado: LadoCurva; quadro: ReturnType<typeof caixa> } | null>(null);
  const atual = useMemo(() => caixa(kind, params), [kind, params]);
  // Arrastando, o enquadramento fica parado: sem isso a prévia "fugia" do dedo.
  const quadro = arrasto?.quadro ?? atual;
  const { g } = atual;
  const k = mmPerMeter(PREVIA_ESCALA);
  const pad = 4;
  const origemMm = { x: -quadro.min.x * k + pad, y: -quadro.min.y * k + pad };
  const largura = (quadro.max.x - quadro.min.x) * k + pad * 2;
  const altura = (quadro.max.y - quadro.min.y) * k + pad * 2;

  const pg = kind === 'pe-de-galinha' ? (params as PeDeGalinhaParams) : null;
  const central = pg ? g.obstacles[lastChainIndex(pg, g.obstacles.length)] : null;
  const saidaDe = central ? { x: central.pos.x + (obstacleDef(central.type).spreadM ?? 0) / 2, y: 0 } : null;

  const paraModelo = (e: React.PointerEvent): Vec2 | null => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: (p.x - origemMm.x) / k, y: (p.y - origemMm.y) / k };
  };

  const moveSaida = (e: React.PointerEvent) => {
    if (!arrasto || !pg || !saidaDe) return;
    const alvo = paraModelo(e);
    if (!alvo) return;
    const s = pg.saidas[arrasto.lado];
    // O ângulo cujo salto cai mais perto do dedo, do lado certo da reta.
    let melhor = s.angleDeg;
    let menor = Infinity;
    for (let a = 1; a <= 120; a += 1) {
      const ang = arrasto.lado === 'esquerda' ? -a : a;
      const pose = saidaPose(saidaDe, { ...s, angleDeg: ang });
      const d = Math.hypot(pose.pos.x - alvo.x, pose.pos.y - alvo.y);
      if (d < menor) {
        menor = d;
        melhor = ang;
      }
    }
    set({ ...pg, saidas: { ...pg.saidas, [arrasto.lado]: { ...s, angleDeg: melhor } } });
  };

  return (
    <div className="gym-preview">
      <svg
        ref={svg}
        viewBox={`0 0 ${largura} ${altura}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={moveSaida}
        onPointerUp={() => setArrasto(null)}
        onPointerLeave={() => setArrasto(null)}
      >
        <rect width={largura} height={altura} fill="#ffffff" />
        {g.extras.map((e) =>
          e.kind === 'measure' ? (
            <MeasureLayer key={e.id} measure={e} printScale={PREVIA_ESCALA} originMm={origemMm} />
          ) : (
            <PathLayer key={e.id} path={e} printScale={PREVIA_ESCALA} originMm={origemMm} />
          ),
        )}
        {g.obstacles.map((o) => (
          <ObstacleLayer key={o.id} obstacle={o} printScale={PREVIA_ESCALA} originMm={origemMm} />
        ))}
        {pg &&
          saidaDe &&
          (['esquerda', 'direita'] as const).map((lado) => {
            const s = pg.saidas[lado];
            if (!s.on) return null;
            const pose = saidaPose(saidaDe, s);
            const cx = origemMm.x + pose.pos.x * k;
            const cy = origemMm.y + pose.pos.y * k;
            // O ângulo fica do lado de fora da curva, longe da reta (B-89).
            const ty = cy + (lado === 'esquerda' ? -9 : 11);
            return (
              <g key={lado}>
                <text x={cx} y={ty} className="gym-angle" textAnchor="middle">
                  {Math.abs(Math.round(s.angleDeg))}°
                </text>
                <circle
                  className="gym-handle"
                  cx={cx}
                  cy={cy}
                  r={4.5}
                  onPointerDown={(e) => {
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    setArrasto({ lado, quadro: atual });
                    onLado(lado);
                  }}
                >
                  <title>{t('gin.arrasteArco')}</title>
                </circle>
              </g>
            );
          })}
      </svg>
      {pg && <p className="note">{t('gin.arrasteCirculos')}</p>}
      {pg && <IgualarAngulos p={pg} set={set} ultimo={ultimo} />}
    </div>
  );
}

/**
 * Igualar ângulos (B-89): o lado mexido por último manda; o outro recebe
 * o mesmo ângulo, espelhado.
 */
function IgualarAngulos({ p, set, ultimo }: { p: PeDeGalinhaParams; set: (p: ExerciseParams) => void; ultimo: LadoCurva }) {
  const { esquerda, direita } = p.saidas;
  if (!esquerda.on || !direita.on) return null;
  const iguais = Math.abs(esquerda.angleDeg) === Math.abs(direita.angleDeg);
  const base = Math.abs(p.saidas[ultimo].angleDeg);
  const outro: LadoCurva = ultimo === 'esquerda' ? 'direita' : 'esquerda';
  return (
    <div className="row-buttons gym-equalize">
      <button
        disabled={iguais}
        title={iguais ? t('gin.mesmoAngulo') : t('gin.leva', { graus: Math.round(base), de: t(LADO[ultimo]), para: t(LADO[outro]) })}
        onClick={() =>
          set({
            ...p,
            saidas: { ...p.saidas, [outro]: { ...p.saidas[outro], angleDeg: outro === 'esquerda' ? -base : base } },
          })
        }
      >
        {iguais ? t('gin.angulosIguais') : t('gin.igualar', { graus: Math.round(base), de: t(LADO[ultimo]) })}
      </button>
    </div>
  );
}

/** Índice do último elemento da linha reta (o central, ou o 2º do duplo). */
function lastChainIndex(p: PeDeGalinhaParams, total: number): number {
  const saidas = [p.saidas.esquerda, p.saidas.reta, p.saidas.direita].filter((s) => s.on).length;
  return total - saidas - 1;
}

/* ------------------------------------------------------------ campos */

const TIPOS_SALTO = OBSTACLES.filter((o) => o.type !== 'cavalete' && o.type !== 'plano');

function Tipo({ value, onChange, opcoes = TIPOS_SALTO }: { value: ObstacleType; onChange: (t: ObstacleType) => void; opcoes?: typeof TIPOS_SALTO }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as ObstacleType)}>
      {opcoes.map((o) => (
        <option key={o.type} value={o.type}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const TIPOS_CHAO = OBSTACLES.filter((o) => o.type === 'cavalete' || o.type === 'plano');

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Metros({ label, value, onChange, min = 0.5 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return <NumberField label={label} unit="m" value={value} decimals={2} step={0.1} min={min} onCommit={onChange} />;
}

function SentidoCampo({ value, onChange }: { value: Sentido; onChange: (s: Sentido) => void }) {
  return (
    <label className="field">
      <span>{t('gin.sentido')}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Sentido)}>
        <option value="ida">{t('gin.indo')}</option>
        <option value="volta">{t('gin.voltando')}</option>
        <option value="duplo">{t('gin.duplo')}</option>
        <option value="sem">{t('gin.semSeta')}</option>
      </select>
    </label>
  );
}

function FormCavaletes({ p, set }: { p: CavaletesParams; set: (p: CavaletesParams) => void }) {
  return (
    <>
      <NumberField label={t('gin.quantidade')} value={p.count} decimals={0} step={1} min={1} max={20} onCommit={(v) => set({ ...p, count: Math.round(v) })} />
      <Metros label={t('gin.entreEles')} value={p.spacingM} onChange={(v) => set({ ...p, spacingM: v })} />
      <label className="field">
        <span>{t('campo.tipo')}</span>
        <Tipo value={p.type} opcoes={TIPOS_CHAO} onChange={(tipo) => set({ ...p, type: tipo as CavaletesParams['type'] })} />
      </label>
      <Check label={t('gin.mostrarCotas')} value={p.cotas} onChange={(v) => set({ ...p, cotas: v })} />
      <Check label={t('gin.numerar')} value={p.numerar} onChange={(v) => set({ ...p, numerar: v })} />
    </>
  );
}

function FormRelogio({ p, set }: { p: RelogioParams; set: (p: RelogioParams) => void }) {
  return (
    <>
      <Metros label={t('gin.diametro')} value={p.diameterM} min={4} onChange={(v) => set({ ...p, diameterM: v })} />
      <label className="field">
        <span>{t('gin.sentido')}</span>
        <select value={p.sentido} onChange={(e) => set({ ...p, sentido: e.target.value as RelogioParams['sentido'] })}>
          <option value="horario">{t('gin.horario')}</option>
          <option value="antihorario">{t('gin.antihorario')}</option>
          <option value="duplo">{t('gin.duploSentido')}</option>
        </select>
      </label>
      <label className="field">
        <span>{t('campo.tipo')}</span>
        <Tipo value={p.type} opcoes={OBSTACLES as typeof TIPOS_SALTO} onChange={(tipo) => set({ ...p, type: tipo })} />
      </label>
      <Check label={t('gin.mostrarDiametro')} value={p.cotas} onChange={(v) => set({ ...p, cotas: v })} />
    </>
  );
}

function FormLeque({ p, set }: { p: LequeParams; set: (p: LequeParams) => void }) {
  return (
    <>
      <NumberField label={t('gin.quantidade')} value={p.count} decimals={0} step={1} min={2} max={16} onCommit={(v) => set({ ...p, count: Math.round(v) })} />
      <Metros label={t('gin.espacamento')} value={p.spacingM} onChange={(v) => set({ ...p, spacingM: v })} />
      <Metros label={t('gin.raio')} value={p.radiusM} min={2} onChange={(v) => set({ ...p, radiusM: v })} />
      <label className="field">
        <span>{t('gin.sentido')}</span>
        <select value={p.sentido} onChange={(e) => set({ ...p, sentido: e.target.value as LequeParams['sentido'] })}>
          <option value="horario">{t('gin.horario')}</option>
          <option value="antihorario">{t('gin.antihorario')}</option>
          <option value="duplo">{t('gin.duploSentido')}</option>
          <option value="sem">{t('gin.semSeta')}</option>
        </select>
      </label>
      <label className="field">
        <span>{t('campo.tipo')}</span>
        <Tipo value={p.type} opcoes={OBSTACLES as typeof TIPOS_SALTO} onChange={(tipo) => set({ ...p, type: tipo })} />
      </label>
      <Check label={t('gin.mostrarAsCotas')} value={p.cotas} onChange={(v) => set({ ...p, cotas: v })} />
      <p className="note">{t('gin.raioMenor')}</p>
    </>
  );
}

function FormPeDeGalinha({ p, set, onLado }: { p: PeDeGalinhaParams; set: (p: PeDeGalinhaParams) => void; onLado: (lado: LadoCurva) => void }) {
  const saida = (lado: 'esquerda' | 'reta' | 'direita', nome: string) => {
    const s = p.saidas[lado];
    const muda = (patch: Partial<Saida>) => set({ ...p, saidas: { ...p.saidas, [lado]: { ...s, ...patch } } });
    return (
      <fieldset className="gym-group" key={lado}>
        <legend>
          <Check label={nome} value={s.on} onChange={(v) => muda({ on: v })} />
        </legend>
        {s.on && (
          <>
            <label className="field">
              <span>{t('campo.tipo')}</span>
              <Tipo value={s.type} onChange={(tipo) => muda({ type: tipo })} />
            </label>
            <Metros label={lado === 'reta' ? t('campo.distancia') : t('gin.distanciaCurva')} value={s.distM} onChange={(v) => muda({ distM: v })} />
            {lado !== 'reta' && (
              <NumberField
                label={t('gin.abertura')}
                unit="°"
                value={Math.abs(s.angleDeg)}
                decimals={0}
                step={1}
                min={1}
                max={120}
                onCommit={(v) => {
                  onLado(lado);
                  muda({ angleDeg: lado === 'esquerda' ? -Math.abs(v) : Math.abs(v) });
                }}
              />
            )}
            <SentidoCampo value={s.sentido} onChange={(v) => muda({ sentido: v })} />
          </>
        )}
      </fieldset>
    );
  };

  return (
    <>
      <div className="row-buttons">
        <button className={p.completo ? 'active' : ''} onClick={() => set({ ...p, completo: true })}>
          {t('gin.completo')}
        </button>
        <button className={!p.completo ? 'active' : ''} onClick={() => set({ ...p, completo: false })}>
          {t('gin.simples')}
        </button>
      </div>

      {p.completo && (
        <>
          <fieldset className="gym-group">
            <legend>
              <Check label={t('gin.cavaletes')} value={p.cavaletes.on} onChange={(v) => set({ ...p, cavaletes: { ...p.cavaletes, on: v } })} />
            </legend>
            {p.cavaletes.on && (
              <>
                <NumberField
                  label={t('gin.quantidade')}
                  value={p.cavaletes.count}
                  decimals={0}
                  step={1}
                  min={1}
                  max={12}
                  onCommit={(v) => set({ ...p, cavaletes: { ...p.cavaletes, count: Math.round(v) } })}
                />
                <Metros label={t('gin.entreElesCurto')} value={p.cavaletes.spacingM} onChange={(v) => set({ ...p, cavaletes: { ...p.cavaletes, spacingM: v } })} />
                <label className="field">
                  <span>{t('campo.tipo')}</span>
                  <Tipo
                    value={p.cavaletes.type}
                    opcoes={TIPOS_CHAO}
                    onChange={(tipo) => set({ ...p, cavaletes: { ...p.cavaletes, type: tipo as PeDeGalinhaParams['cavaletes']['type'] } })}
                  />
                </label>
              </>
            )}
          </fieldset>
          <fieldset className="gym-group">
            <legend>
              <Check label={t('obst.x')} value={p.x.on} onChange={(v) => set({ ...p, x: { ...p.x, on: v } })} />
            </legend>
            {p.x.on && <Metros label={t('gin.doAnterior')} value={p.x.distM} onChange={(v) => set({ ...p, x: { ...p.x, distM: v } })} />}
          </fieldset>
          <fieldset className="gym-group">
            <legend>
              <Check label={t('gin.salto')} value={p.salto.on} onChange={(v) => set({ ...p, salto: { ...p.salto, on: v } })} />
            </legend>
            {p.salto.on && (
              <>
                <label className="field">
                  <span>{t('campo.tipo')}</span>
                  <Tipo value={p.salto.type} onChange={(tipo) => set({ ...p, salto: { ...p.salto, type: tipo } })} />
                </label>
                <Metros label={t('gin.doAnterior')} value={p.salto.distM} onChange={(v) => set({ ...p, salto: { ...p.salto, distM: v } })} />
              </>
            )}
          </fieldset>
        </>
      )}

      <fieldset className="gym-group">
        <legend>{t('gin.central')}</legend>
        <label className="field">
          <span>{t('campo.tipo')}</span>
          <Tipo value={p.central.type} onChange={(tipo) => set({ ...p, central: { ...p.central, type: tipo } })} />
        </label>
        {p.completo && (
          <Metros label={t('gin.doAnterior')} value={p.central.distM} onChange={(v) => set({ ...p, central: { ...p.central, distM: v } })} />
        )}
        <Check
          label={t('gin.duploSalto')}
          value={p.central.duplo.on}
          onChange={(v) => set({ ...p, central: { ...p.central, duplo: { ...p.central.duplo, on: v } } })}
        />
        {p.central.duplo.on && (
          <>
            <label className="field">
              <span>{t('gin.segundo')}</span>
              <Tipo value={p.central.duplo.type} onChange={(tipo) => set({ ...p, central: { ...p.central, duplo: { ...p.central.duplo, type: tipo } } })} />
            </label>
            <Metros
              label={t('gin.entreOsDois')}
              value={p.central.duplo.distM}
              onChange={(v) => set({ ...p, central: { ...p.central, duplo: { ...p.central.duplo, distM: v } } })}
            />
          </>
        )}
      </fieldset>

      {saida('esquerda', t('gin.saidaEsq'))}
      {saida('reta', t('gin.saidaReta'))}
      {saida('direita', t('gin.saidaDir'))}

      <Check label={t('gin.cotasLinhas')} value={p.cotas} onChange={(v) => set({ ...p, cotas: v })} />
      <Check label={t('gin.numerarSaltos')} value={p.numerar} onChange={(v) => set({ ...p, numerar: v })} />
    </>
  );
}
