import { useRef, useState } from 'react';
import { setElementHeight, setLiverpool, setMontagem, setObstacleNote } from '@core/commands/obstacleOps';
import { acceptsLiverpool } from '@core/library/obstacles';
import { obstaculosDaEspecificacao } from '@render/FolhaEspecificacao';
import { NumberField } from './NumberField';
import {
  ALTURA_MAX_CM,
  aplicaDisposicao,
  comPecaNova,
  impedimento,
  montagemDe,
  nomePeca,
  topoMontagem,
  topoPeca,
  TIPOS_PECA,
  type Disposicao,
} from '@core/library/montagem';
import { obstacleLabel } from '@core/library/obstacles';
import type { Montagem, Obstacle, PecaMontagem, TipoPeca } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { planosDoObstaculo, VistaFrente, VistaPerfil, escalaCm, type Caixa } from '@render/montagemDesenho';
import { t } from '@core/i18n/i18n';
import type { MessageKey } from '@core/i18n/messages';

const FRENTE: Caixa = { x: 34, y: 8, w: 396, h: 244 };
const PERFIL: Caixa = { x: 8, y: 8, w: 184, h: 244 };
const DISPOSICOES: [Disposicao, MessageKey][] = [
  ['paralelas', 'mont.paralelas'],
  ['leque-dir', 'mont.lequeDir'],
  ['leque-esq', 'mont.lequeEsq'],
  ['z', 'mont.z'],
  ['z-inv', 'mont.zInv'],
  ['espacar', 'mont.espacar'],
];
const AVISO: Record<'leque' | 'z' | 'varas', MessageKey> = {
  leque: 'mont.precisaLeque',
  z: 'mont.precisaZ',
  varas: 'mont.precisaVaras',
};

const limita = (v: number) => Math.max(0, Math.min(ALTURA_MAX_CM, Math.round(v)));
const passo5 = (v: number) => limita(Math.round(v / 5) * 5);

/** Nome do plano: entrada, meio(s) e saída. */
export function nomePlano(i: number, n: number): string {
  if (i === 0) return t('mont.entrada');
  if (i === n - 1) return t('mont.saida');
  return n > 3 ? `${t('mont.meio')} ${i}` : t('mont.meio');
}

/**
 * Janela de montagem do obstáculo (B-108). O 1º plano é uma pilha de
 * peças, cada uma com a altura das duas pontas; os outros planos, uma
 * vara reta na altura do elemento. Tudo vale na hora (o desfazer junta
 * a sequência de uma mesma edição).
 */
export function MontagemEditor() {
  const { doc, apply } = useDocumentStore();
  const id = useEditorStore((s) => s.montagemId);
  const obj = doc.objects.find((o) => o.id === id);
  const [sel, setSel] = useState<number | null>(null);
  const [aviso, setAviso] = useState<MessageKey | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const arraste = useRef<{ k: number; modo: 'esq' | 'dir' | 'tudo'; y0: number; esq0: number; dir0: number } | null>(null);

  if (!obj || obj.kind !== 'obstacle') return null;
  const o: Obstacle = obj;

  // Anterior e próximo, na ordem da folha de especificação.
  const ordem = obstaculosDaEspecificacao(doc);
  const pos = ordem.findIndex((x) => x.id === o.id);
  const vaiPara = (j: number) => {
    const alvo = ordem[j];
    if (!alvo) return;
    const ed = useEditorStore.getState();
    ed.abreMontagem(alvo.id);
    ed.setSelection([alvo.id]);
    setSel(null);
    setAviso(null);
  };
  const travado = o.locked;
  const montagem = montagemDe(o);
  const pecas = montagem.pecas;
  const topo = topoMontagem(montagem);
  const alturasPlanos = o.elements.map((e) => (e.height == null ? null : Math.round(e.height * 100)));
  const maxCm = escalaCm(Math.max(topo, ...alturasPlanos.map((h) => h ?? 0)));
  const chave = `montagem-${o.id}`;

  const grava = (m: Montagem, rotulo = t('mont.titulo')) => {
    if (travado) return;
    apply(rotulo, (d) => setMontagem(d, o.id, m), chave);
  };
  const mudaPeca = (k: number, patch: Partial<PecaMontagem>) => {
    const novas = pecas.map((p, i) => (i === k ? { ...p, ...patch } : p));
    const p = novas[k]!;
    if (p.tipo === 'muro') p.dir = p.esq;
    grava({ pecas: novas });
  };

  /* ---- arraste na vista de frente ---- */
  const emCm = (clientY: number): number => {
    const el = svg.current;
    if (!el) return 0;
    const pt = new DOMPoint(0, clientY).matrixTransform(el.getScreenCTM()!.inverse());
    return ((FRENTE.y + FRENTE.h - pt.y) / FRENTE.h) * maxCm;
  };
  const emX = (clientX: number): number => {
    const el = svg.current;
    if (!el) return 0;
    const pt = new DOMPoint(clientX, 0).matrixTransform(el.getScreenCTM()!.inverse());
    return (pt.x - FRENTE.x) / FRENTE.w;
  };
  const noPonteiro = (e: React.PointerEvent<SVGSVGElement>) => {
    if (travado) return;
    const alvo = (e.target as Element).closest('[data-peca],[data-ponta]');
    const cm = emCm(e.clientY);
    let k: number;
    let modo: 'esq' | 'dir' | 'tudo';
    if (alvo?.hasAttribute('data-ponta')) {
      k = sel!;
      modo = alvo.getAttribute('data-ponta') as 'esq' | 'dir';
    } else if (alvo) {
      k = Number(alvo.getAttribute('data-peca'));
      const f = emX(e.clientX);
      modo = pecas[k]!.tipo === 'muro' ? 'tudo' : f < 0.2 ? 'esq' : f > 0.8 ? 'dir' : 'tudo';
    } else {
      setSel(null);
      return;
    }
    setSel(k);
    setAviso(null);
    arraste.current = { k, modo, y0: cm, esq0: pecas[k]!.esq, dir0: pecas[k]!.dir };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const noMovimento = (e: React.PointerEvent<SVGSVGElement>) => {
    const a = arraste.current;
    if (!a) return;
    const cm = emCm(e.clientY);
    if (a.modo === 'esq') mudaPeca(a.k, { esq: passo5(cm) });
    else if (a.modo === 'dir') mudaPeca(a.k, { dir: passo5(cm) });
    else {
      const d = Math.round((cm - a.y0) / 5) * 5;
      mudaPeca(a.k, { esq: limita(a.esq0 + d), dir: limita(a.dir0 + d) });
    }
  };
  const soltou = () => {
    arraste.current = null;
  };

  const aplica = (d: Disposicao) => {
    const motivo = impedimento(montagem, d);
    if (motivo) {
      setAviso(AVISO[motivo]);
      return;
    }
    setAviso(null);
    grava(aplicaDisposicao(montagem, d));
  };

  const acrescenta = (tipo: TipoPeca) => {
    const { pecas: novas, indice } = comPecaNova(pecas, tipo);
    grava({ pecas: novas });
    setSel(indice);
  };
  const troca = (k: number, j: number) => {
    if (j < 0 || j >= pecas.length) return;
    const novas = [...pecas];
    [novas[k], novas[j]] = [novas[j]!, novas[k]!];
    grava({ pecas: novas });
    setSel(j);
  };
  const remove = (k: number) => {
    if (pecas.length <= 1) return;
    grava({ pecas: pecas.filter((_, i) => i !== k) });
    setSel(null);
  };

  const { planos, deM, ateM, agua } = planosDoObstaculo(o);
  const n = o.elements.length;
  const selPeca = sel !== null ? pecas[sel] : undefined;
  const yDe = (cm: number) => FRENTE.y + FRENTE.h - (cm / maxCm) * FRENTE.h;
  const poste = Math.max(2.4, FRENTE.w * 0.025);

  return (
    <div className="montagem">
      <div className="montagem-topo">
        <button
          className="montagem-nav"
          disabled={pos <= 0}
          onClick={() => vaiPara(pos - 1)}
          title={t('mont.anterior')}
          aria-label={t('mont.anterior')}
        >
          ‹ {pos > 0 ? obstacleLabel(ordem[pos - 1]!) || '' : ''}
        </button>
        {/* As alturas de cada plano, editáveis aqui mesmo (B-108): a entrada
            é o topo da pilha; o meio e a saída são uma vara reta. */}
        <div className="montagem-planos">
          {o.elements.map((_, i) => (
            <label key={i} className={i === 0 ? 'montagem-pilula entrada' : 'montagem-pilula'}>
              <span>{n > 1 ? nomePlano(i, n) : t('mont.altura')}</span>
              <CampoCm
                valor={i === 0 ? (alturasPlanos[0] == null ? null : topo) : alturasPlanos[i] ?? null}
                disabled={travado}
                onCommit={(v) => apply(t('mont.alturaCm'), (d) => setElementHeight(d, o.id, i, v > 0 ? v / 100 : null))}
              />
              <em>cm</em>
            </label>
          ))}
        </div>
        <button
          className="montagem-nav"
          disabled={pos < 0 || pos >= ordem.length - 1}
          onClick={() => vaiPara(pos + 1)}
          title={t('mont.proximo')}
          aria-label={t('mont.proximo')}
        >
          {pos >= 0 && pos < ordem.length - 1 ? obstacleLabel(ordem[pos + 1]!) || '' : ''} ›
        </button>
      </div>

      <div className="montagem-vistas">
        <figure>
          <figcaption>{t('mont.deFrente')}</figcaption>
          <svg
            ref={svg}
            viewBox="0 0 440 260"
            className="montagem-frente"
            onPointerDown={noPonteiro}
            onPointerMove={noMovimento}
            onPointerUp={soltou}
            onPointerCancel={soltou}
          >
            {[0, 50, 100, 150, 200].filter((h) => h <= maxCm).map((h) => (
              <g key={h}>
                <line x1={FRENTE.x} x2={FRENTE.x + FRENTE.w} y1={yDe(h)} y2={yDe(h)} className="montagem-grade" />
                <text x={FRENTE.x - 6} y={yDe(h)} dy="0.35em" textAnchor="end" className="montagem-eixo">
                  {h}
                </text>
              </g>
            ))}
            <VistaFrente
              pecas={pecas}
              caixa={FRENTE}
              maxCm={maxCm}
              traco={2.6}
              selecionada={sel}
              rotulos={(p) => nomePeca(p.tipo)}
            />
            {selPeca && selPeca.tipo !== 'muro' && (
              <>
                <circle data-ponta="esq" cx={FRENTE.x + poste + 4} cy={yDe(selPeca.esq)} r={7} className="montagem-ponta" />
                <circle data-ponta="dir" cx={FRENTE.x + FRENTE.w - poste - 4} cy={yDe(selPeca.dir)} r={7} className="montagem-ponta" />
              </>
            )}
            {selPeca && selPeca.tipo === 'muro' && (
              <circle data-peca={sel!} cx={FRENTE.x + FRENTE.w / 2} cy={yDe(selPeca.esq)} r={7} className="montagem-ponta" />
            )}
          </svg>
        </figure>
        <figure>
          <figcaption>{t('mont.perfil')}</figcaption>
          <svg viewBox="0 0 200 260" className="montagem-perfil">
            <VistaPerfil
              planos={planos}
              deM={deM}
              ateM={ateM}
              agua={agua}
              caixa={PERFIL}
              maxCm={maxCm}
              traco={2.6}
              selecionada={sel}
            />
          </svg>
        </figure>
      </div>

      {/* O liverpool é o mesmo do painel: mudou aqui, muda lá. */}
      {acceptsLiverpool(o.type) && (
        <div className="montagem-liverpool">
          <label className="check">
            <input
              type="checkbox"
              checked={o.liverpool.enabled}
              disabled={travado}
              onChange={(e) => apply('Liverpool', (d) => setLiverpool(d, o.id, { enabled: e.target.checked }))}
            />
            Liverpool
          </label>
          {o.liverpool.enabled && (
            <>
              <NumberField
                label={t('campo.profundidade')}
                unit="m"
                value={o.liverpool.spreadM}
                decimals={2}
                step={0.1}
                min={0.1}
                disabled={travado}
                onCommit={(v) => apply('Profundidade do liverpool', (d) => setLiverpool(d, o.id, { spreadM: v }))}
              />
              <NumberField
                label={t('campo.posicao')}
                unit="m"
                value={o.liverpool.offsetM}
                decimals={2}
                step={0.1}
                disabled={travado}
                onCommit={(v) => apply('Posição do liverpool', (d) => setLiverpool(d, o.id, { offsetM: v }))}
              />
            </>
          )}
        </div>
      )}

      {/* A observação é uma só: painel, montagem, folha e tabela de alturas. */}
      <label className="field montagem-obs" title={t('mont.obsDica')}>
        <span>{t('mont.obs')}</span>
        <input
          type="text"
          value={o.note}
          disabled={travado}
          placeholder="ex.: liverpool"
          onChange={(e) => apply(t('mont.obs'), (d) => setObstacleNote(d, o.id, e.target.value), `obs-${o.id}`)}
        />
      </label>

      <>
          <div className="row-buttons montagem-disposicoes">
            {DISPOSICOES.map(([d, rotulo]) => (
              <button key={d} disabled={travado} onClick={() => aplica(d)}>
                {t(rotulo)}
              </button>
            ))}
            <span className="flex" />
            <select
              value=""
              disabled={travado}
              aria-label={t('mont.maisPeca')}
              onChange={(e) => e.target.value && acrescenta(e.target.value as TipoPeca)}
            >
              <option value="">{t('mont.maisPeca')}</option>
              {TIPOS_PECA.map((tp) => (
                <option key={tp} value={tp}>
                  {nomePeca(tp)}
                </option>
              ))}
            </select>
          </div>
          <p className="montagem-aviso" role="status">{aviso ? t(aviso) : ''}</p>

          <table className="montagem-lista">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('mont.peca')}</th>
                <th>{t('mont.esq')}</th>
                <th>{t('mont.dir')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pecas
                .map((p, k) => ({ p, k }))
                .reverse()
                .map(({ p, k }) => (
                  <tr key={k} className={k === sel ? 'sel' : ''} onClick={() => setSel(k)}>
                    <td>{k + 1}</td>
                    <td>{nomePeca(p.tipo)}</td>
                    <td>
                      <CampoCm valor={p.esq} disabled={travado} onCommit={(v) => mudaPeca(k, { esq: v })} />
                    </td>
                    <td>
                      {p.tipo === 'muro' ? (
                        <span className="dim">{t('mont.igual')}</span>
                      ) : (
                        <CampoCm valor={p.dir} disabled={travado} onCommit={(v) => mudaPeca(k, { dir: v })} />
                      )}
                    </td>
                    <td className="acoes">
                      <button className="mini" title={t('mont.subir')} disabled={travado || k === pecas.length - 1} onClick={(e) => { e.stopPropagation(); troca(k, k + 1); }}>↑</button>
                      <button className="mini" title={t('mont.descer')} disabled={travado || k === 0} onClick={(e) => { e.stopPropagation(); troca(k, k - 1); }}>↓</button>
                      <button className="mini" title={t('mont.remover')} disabled={travado || pecas.length <= 1} onClick={(e) => { e.stopPropagation(); remove(k); }}>×</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="note dim">{t('mont.ordemNota')} {t('mont.legendaPerfil')}</p>
          <div className="row-buttons">
            <span className="note">{t('mont.total', { h: String(Math.max(0, ...pecas.map(topoPeca))) })}</span>
            <span className="flex" />
            <button
              disabled={travado || !o.montagem}
              title={t('mont.padraoDica')}
              onClick={() => {
                apply(t('mont.padrao'), (d) => setMontagem(d, o.id, null));
                setSel(null);
              }}
            >
              {t('mont.padrao')}
            </button>
          </div>
        </>

    </div>
  );
}

/** Número inteiro em cm, gravado ao sair do campo ou no Enter. */
function CampoCm({ valor, disabled, onCommit }: { valor: number | null; disabled?: boolean; onCommit: (v: number) => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  const grava = () => {
    if (texto === null) return;
    const v = Number(texto.replace(',', '.'));
    setTexto(null);
    if (Number.isFinite(v)) onCommit(limita(v));
  };
  return (
    <input
      type="number"
      step={5}
      min={0}
      max={ALTURA_MAX_CM}
      className="campo-cm"
      value={texto ?? (valor == null ? '' : String(valor))}
      placeholder="—"
      disabled={disabled}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={grava}
      onKeyDown={(e) => e.key === 'Enter' && grava()}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** Título da janela: "Montagem · obstáculo 7A". */
export function tituloMontagem(o: Obstacle | undefined): string {
  return t('mont.dialogo', { n: (o && obstacleLabel(o)) || t('mont.semNumero') });
}
