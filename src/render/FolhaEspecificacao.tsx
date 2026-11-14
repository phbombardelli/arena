import { courseOrder } from '@core/assist/courseRide';
import { variacoesDe } from '@core/library/desempate';
import {
  descreveMaterial,
  espelhaMontagem,
  materialDe,
  montagemDe,
  somaMaterial,
  temMontagem,
  topoMontagem,
  type ItemMaterial,
} from '@core/library/montagem';
import { obstacleLabel } from '@core/library/obstacles';
import type { CourseDocument, Obstacle } from '@core/model/types';
import { pageSize, usableArea } from '@core/scale/units';
import { t } from '@core/i18n/i18n';
import { COR_TRACO, escalaCm, planosDoObstaculo, VistaFrente, VistaPerfil } from './montagemDesenho';

/**
 * Folha de especificação dos obstáculos (B-108): uma linha por obstáculo,
 * na ordem do percurso, com o perfil, a vista de frente do 1º plano, o
 * material e as alturas. Os obstáculos só do desempate entram depois; o
 * que muda no desempate ganha uma linha logo abaixo, com a etiqueta.
 * Tudo numa folha só: as linhas encolhem para caber.
 */

const F = 'Helvetica, Arial, sans-serif';
const CINZA = '#8a9097';
const LINHA = '#c9c6bc';

interface Linha {
  o: Obstacle;
  /** Linha extra do desempate, com o que muda. */
  desempate?: { oxer: boolean; contrario: boolean };
}

/** Os obstáculos da folha, na ordem dela (sem as linhas do desempate). */
export const obstaculosDaEspecificacao = (doc: CourseDocument): Obstacle[] =>
  linhasDaEspecificacao(doc)
    .filter((l) => !l.desempate)
    .map((l) => l.o);

export function linhasDaEspecificacao(doc: CourseDocument): Linha[] {
  const obst = doc.objects.filter((x): x is Obstacle => x.kind === 'obstacle' && x.visible && temMontagem(x.type));
  const naOrdem = courseOrder(obst).flatMap((s) => s.elements);
  const soDesempate = obst
    .filter((o) => o.soDesempate)
    .sort((a, b) => (parseInt(a.number, 10) || 999) - (parseInt(b.number, 10) || 999));
  const resto = obst.filter((o) => !naOrdem.includes(o) && !soDesempate.includes(o));
  const comDesempate = (doc.desempate?.ordem.length ?? 0) > 0;
  const linhas: Linha[] = [];
  for (const o of [...naOrdem, ...soDesempate, ...resto]) {
    linhas.push({ o });
    if (!comDesempate) continue;
    const v = variacoesDe(doc.desempate, o.id);
    if (v.length > 0) linhas.push({ o, desempate: { oxer: v.includes('oxer'), contrario: v.includes('contrario') } });
  }
  return linhas;
}

/** "125-130/140": alturas em cm e, se tiver, a largura. Sem travessão: some no PDF. */
function alturasTexto(o: Obstacle): string {
  const hs = o.elements.map((e) => (e.height == null ? '?' : String(Math.round(e.height * 100))));
  const larg = o.spreadM ? `/${Math.round(o.spreadM * 100)}` : '';
  return hs.join('-') + larg;
}

/** Quebra o texto em linhas que caibam na largura (estimada pela fonte). */
function quebra(texto: string, larguraMm: number, fonte: number): string[] {
  const porLinha = Math.max(8, Math.floor(larguraMm / (fonte * 0.52)));
  const partes = texto.split(', ');
  const linhas: string[] = [];
  let atual = '';
  for (const p of partes) {
    const tenta = atual ? `${atual}, ${p}` : p;
    if (tenta.length > porLinha && atual) {
      linhas.push(`${atual},`);
      atual = p;
    } else atual = tenta;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/**
 * `editavel`: na tela (aba Impressão), a observação vira um campo que se
 * edita ali mesmo. No papel ela é só texto.
 */
export function FolhaEspecificacao({
  doc,
  editavel,
}: {
  doc: CourseDocument;
  editavel?: (o: Obstacle, nota: string) => void;
}) {
  const { widthMm, heightMm } = pageSize(doc.page);
  const u = usableArea(doc.page);
  const linhas = linhasDaEspecificacao(doc);

  const cabecalho = 15;
  const titulos = 6;
  const rodape = 10;
  const yTabela = u.yMm + cabecalho;
  const disponivel = u.heightMm - cabecalho - titulos - rodape;
  const hLinha = linhas.length ? Math.min(24, disponivel / linhas.length) : 0;
  const fonte = Math.max(1.8, Math.min(3, hLinha * 0.2));

  const cols = [0.07, 0.15, 0.27, 0.2, 0.13, 0.18];
  const xs: number[] = [u.xMm];
  for (const c of cols) xs.push(xs[xs.length - 1]! + c * u.widthMm);
  const larg = (i: number) => xs[i + 1]! - xs[i]!;

  const extras: Map<ItemMaterial, number>[] = linhas
    .filter((l) => l.desempate?.oxer)
    .map(() => new Map<ItemMaterial, number>([['vara', 1]]));
  const total = somaMaterial([...linhas.filter((l) => !l.desempate).map((l) => materialDe(l.o)), ...extras]);

  // Uma escala vertical só para a folha toda: as alturas se comparam de
  // uma linha para outra.
  const maxCm = escalaCm(
    Math.max(0, ...linhas.flatMap((l) => [topoMontagem(montagemDe(l.o)), ...l.o.elements.map((e) => Math.round((e.height ?? 0) * 100))])),
  );

  const subtitulo = [doc.meta.title, doc.meta.competition, doc.meta.venue, doc.meta.date].filter((s) => s.trim()).join(' · ');

  return (
    <g data-part="especificacao" fontFamily={F}>
      <rect x={0} y={0} width={widthMm} height={heightMm} fill="#ffffff" />
      <text x={u.xMm} y={u.yMm + 5} fontSize={5} fontWeight="bold" fill="#1a1a1a">
        {t('espec.titulo')}
      </text>
      {subtitulo && (
        <text x={u.xMm} y={u.yMm + 10.5} fontSize={3} fill="#444">
          {subtitulo}
        </text>
      )}
      {doc.meta.designer.trim() && (
        <text x={u.xMm + u.widthMm} y={u.yMm + 5} fontSize={3} fill="#444" textAnchor="end">
          {t('espec.desenhador', { nome: doc.meta.designer.trim() })}
        </text>
      )}

      {linhas.length === 0 ? (
        <text x={u.xMm} y={yTabela + 10} fontSize={3.2} fill={CINZA}>
          {t('espec.vazio')}
        </text>
      ) : (
        <>
          {[t('espec.n'), t('espec.perfil'), t('espec.frente'), t('espec.material'), t('espec.alturas'), t('espec.obs')].map((c, i) => (
            // Perfil e frente vêm centrados na coluna: o título também.
            <text
              key={i}
              x={i === 1 || i === 2 ? xs[i]! + larg(i) / 2 : xs[i]! + 1.5}
              textAnchor={i === 1 || i === 2 ? 'middle' : 'start'}
              y={yTabela + 4}
              fontSize={2.8}
              fontWeight="bold"
              fill="#333"
            >
              {c}
            </text>
          ))}
          <line x1={u.xMm} x2={u.xMm + u.widthMm} y1={yTabela + titulos} y2={yTabela + titulos} stroke={COR_TRACO} strokeWidth={0.3} />
          {linhas.map((l, i) => (
            <LinhaObstaculo
              key={`${l.o.id}-${l.desempate ? 'd' : 'p'}`}
              linha={l}
              y={yTabela + titulos + i * hLinha}
              h={hLinha}
              xs={xs}
              larg={larg}
              fonte={fonte}
              maxCm={maxCm}
              ultima={i === linhas.length - 1}
              x1={u.xMm + u.widthMm}
              editavel={editavel}
            />
          ))}
          <text x={u.xMm} y={yTabela + titulos + linhas.length * hLinha + 6} fontSize={3} fill="#1a1a1a">
            <tspan fontWeight="bold">{t('espec.totalProva')}</tspan> {descreveMaterial(total)}
          </text>
        </>
      )}

      <text
        x={widthMm / 2}
        y={heightMm - Math.max(1.5, doc.page.marginsMm.bottom / 2 - 0.8)}
        textAnchor="middle"
        fontSize={2.2}
        fill={CINZA}
      >
        {t('folha.confeccionado')}
      </text>
    </g>
  );
}

function LinhaObstaculo({
  linha,
  y,
  h,
  xs,
  larg,
  fonte,
  maxCm,
  ultima,
  x1,
  editavel,
}: {
  linha: Linha;
  y: number;
  h: number;
  xs: number[];
  larg: (i: number) => number;
  fonte: number;
  maxCm: number;
  ultima: boolean;
  x1: number;
  editavel?: (o: Obstacle, nota: string) => void;
}) {
  const { o, desempate } = linha;
  const m = desempate?.contrario ? espelhaMontagem(montagemDe(o)) : montagemDe(o);
  const { planos, deM, ateM, agua } = planosDoObstaculo(o, desempate?.oxer ?? false);
  const pad = Math.min(1.5, h * 0.1);
  const traco = Math.max(0.12, Math.min(0.35, h * 0.018));
  const meioY = y + h / 2;
  const caixa = (i: number, aspecto: number) => {
    const hh = h - 2 * pad;
    const ww = Math.min(larg(i) - 3, hh * aspecto);
    return { x: xs[i]! + (larg(i) - ww) / 2, y: y + pad, w: ww, h: hh };
  };
  const material = desempate
    ? [desempate.oxer && t('espec.viraOxer'), desempate.contrario && t('espec.contrario')].filter(Boolean).join('; ')
    : descreveMaterial(materialDe(o));
  const linhasMat = quebra(material, larg(3) - 3, fonte);
  const etiqueta = t('espec.desempate');
  const fundo = desempate ? '#eef3fb' : undefined;

  return (
    <g>
      {fundo && <rect x={xs[0]} y={y} width={x1 - xs[0]!} height={h} fill={fundo} />}
      {desempate ? (
        <g>
          {/* O número se repete: a linha do desempate não fica solta. */}
          <text x={xs[0]! + 1.5} y={meioY - fonte * 0.9} dy="0.35em" fontSize={fonte * 1.1} fontWeight="bold" fill="#1a1a1a">
            {obstacleLabel(o)}
          </text>
          <rect
            x={xs[0]! + 1}
            y={meioY + fonte * 0.05}
            width={Math.min(larg(0) - 1.5, etiqueta.length * fonte * 0.5 + 2)}
            height={fonte * 1.5}
            rx={fonte * 0.4}
            fill="#1f5fa8"
          />
          <text x={xs[0]! + 2} y={meioY + fonte * 0.8} dy="0.35em" fontSize={fonte * 0.8} fill="#ffffff">
            {etiqueta}
          </text>
        </g>
      ) : (
        <>
          <text x={xs[0]! + 1.5} y={meioY} dy="0.35em" fontSize={fonte * 1.25} fontWeight="bold" fill="#1a1a1a">
            {obstacleLabel(o)}
          </text>
          {o.soDesempate && (
            <text x={xs[0]! + 1.5} y={meioY + fonte * 1.3} dy="0.35em" fontSize={fonte * 0.65} fill="#1f5fa8">
              {t('dsp.soDesempate')}
            </text>
          )}
        </>
      )}
      <VistaPerfil planos={planos} deM={deM} ateM={ateM} agua={agua} caixa={caixa(1, 1.3)} maxCm={maxCm} traco={traco} />
      <VistaFrente pecas={m.pecas} caixa={caixa(2, 2.6)} maxCm={maxCm} traco={traco} />
      <text x={xs[3]! + 1.5} y={meioY - ((linhasMat.length - 1) * fonte * 1.2) / 2} fontSize={fonte} fill="#1a1a1a">
        {linhasMat.map((s, i) => (
          <tspan key={i} x={xs[3]! + 1.5} dy={i === 0 ? '0.35em' : `${fonte * 1.2}`}>
            {s}
          </tspan>
        ))}
      </text>
      {!desempate && (
        <text x={xs[4]! + 1.5} y={meioY} dy="0.35em" fontSize={fonte * 1.05} fill="#1a1a1a">
          {alturasTexto(o)}
        </text>
      )}
      {!desempate && (
        <CelulaObs o={o} x={xs[5]! + 1} y={y + pad} w={larg(5) - 2} h={h - 2 * pad} fonte={fonte} editavel={editavel} />
      )}
      <line x1={xs[0]} x2={x1} y1={y + h} y2={y + h} stroke={ultima ? COR_TRACO : LINHA} strokeWidth={ultima ? 0.3 : 0.15} />
    </g>
  );
}

/**
 * A observação do obstáculo (a mesma do painel, da janela de montagem e da
 * tabela de alturas). Na tela é um campo; no papel, texto quebrado.
 */
function CelulaObs({
  o,
  x,
  y,
  w,
  h,
  fonte,
  editavel,
}: {
  o: Obstacle;
  x: number;
  y: number;
  w: number;
  h: number;
  fonte: number;
  editavel?: (o: Obstacle, nota: string) => void;
}) {
  if (editavel) {
    return (
      <foreignObject x={x} y={y} width={w} height={h} pointerEvents="auto">
        <textarea
          key={o.note}
          className="espec-obs-campo"
          defaultValue={o.note}
          placeholder="+"
          style={{ fontSize: `${fonte}px` }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          onBlur={(e) => {
            if (e.target.value !== o.note) editavel(o, e.target.value);
          }}
        />
      </foreignObject>
    );
  }
  const linhas = quebraPalavras(o.note.trim(), w, fonte);
  return (
    <text x={x + 0.5} y={y + h / 2 - ((linhas.length - 1) * fonte * 1.2) / 2} fontSize={fonte} fill="#1a1a1a">
      {linhas.map((l, i) => (
        <tspan key={i} x={x + 0.5} dy={i === 0 ? '0.35em' : `${fonte * 1.2}`}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

/** Quebra por palavras na largura estimada da coluna. */
function quebraPalavras(texto: string, larguraMm: number, fonte: number): string[] {
  if (!texto) return [];
  const porLinha = Math.max(6, Math.floor(larguraMm / (fonte * 0.52)));
  const linhas: string[] = [];
  let atual = '';
  for (const p of texto.split(/\s+/)) {
    const tenta = atual ? `${atual} ${p}` : p;
    if (tenta.length > porLinha && atual) {
      linhas.push(atual);
      atual = p;
    } else atual = tenta;
  }
  if (atual) linhas.push(atual);
  return linhas;
}
