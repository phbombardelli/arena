import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Vec2 } from '@core/geometry/vec';
import type { ImportedImage } from '@core/commands/imageOps';
import { buildFromMap } from '@core/mapImport/buildFromMap';
import {
  findIslands,
  findMeasureMarkers,
  findRoofs,
  fitRectangle,
  segmentArena,
  type ArenaGuess,
  type MeasureMarkers,
  type Pixels,
} from '@core/mapImport/mapImport';
import type { StructureType } from '@core/model/types';
import { readMeasureDistance } from '@platform/ocr';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { placeAsBackground } from '@ui/actions/imageActions';
import { Dialog } from '@ui/common/Popover';

/**
 * Assistente "Montar pista pelo mapa" (B-40, decisão 64).
 *
 * 1. Medida: acha os dois marcadores do "Medir distância" do Maps e lê o
 *    número por OCR; o desenhador confirma ou corrige.
 * 2. Pista: propõe o contorno da areia — livre ou ajustado a retângulo —,
 *    com os vértices para arrastar.
 * 3. Sugestões: ilhas e telhados vizinhos, para marcar quais entram.
 * 4. Outros elementos: o que o assistente não viu, à mão.
 * Ao confirmar, tudo entra vinculado e na escala.
 *
 * A análise roda numa cópia reduzida do print (lado maior até 1400 px),
 * para ficar rápida com prints de tela retina; as coordenadas voltam para
 * o tamanho original no fim.
 */

const LADO_MAX = 1400;
const PREVIEW_W = 760;
const PREVIEW_H = 470;
const PEGA_PX = 11;

type Passo = 'inicio' | 'medida' | 'pista' | 'sugestoes' | 'extras';
type Ferramenta = 'construcao' | 'ilha' | 'arvore' | null;

interface Item {
  type: StructureType;
  outline: Vec2[];
  on: boolean;
  origem: 'sugestao' | 'manual';
}

const ROTULO: Record<string, string> = { ilha: 'Ilha', edificacao: 'Construção', outra: 'Construção' };

export function MapWizardHost() {
  const img = useEditorStore((s) => s.mapWizard);
  if (!img) return null;
  return <MapWizard key={img.asset.dataUrl.length + img.widthPx} image={img} />;
}

function MapWizard({ image }: { image: ImportedImage }) {
  const fecha = useCallback(() => useEditorStore.getState().setMapWizard(null), []);
  const [passo, setPasso] = useState<Passo>('inicio');
  const [pixels, setPixels] = useState<{ px: Pixels; f: number; bitmap: HTMLCanvasElement } | null>(null);
  const [marcas, setMarcas] = useState<MeasureMarkers | null>(null);
  const [metros, setMetros] = useState('');
  const [ocr, setOcr] = useState<'parado' | 'lendo' | 'lido' | 'falhou'>('parado');
  const [semente, setSemente] = useState<Vec2 | null>(null);
  const [palpite, setPalpite] = useState<ArenaGuess | null>(null);
  const [retangulo, setRetangulo] = useState(false);
  const [pista, setPista] = useState<Vec2[]>([]);
  const [escolhendoPonto, setEscolhendoPonto] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [arvores, setArvores] = useState<Vec2[]>([]);
  const [ferramenta, setFerramenta] = useState<Ferramenta>(null);

  // Decodifica o print numa cópia reduzida.
  useEffect(() => {
    const el = new Image();
    el.onload = () => {
      const f = Math.min(1, LADO_MAX / Math.max(el.naturalWidth, el.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(el.naturalWidth * f);
      c.height = Math.round(el.naturalHeight * f);
      const g = c.getContext('2d')!;
      g.drawImage(el, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height);
      setPixels({ px: { data: d.data, width: c.width, height: c.height }, f, bitmap: c });
    };
    el.src = image.asset.dataUrl;
  }, [image]);

  // Passo 1: marcadores e OCR.
  useEffect(() => {
    if (passo !== 'medida' || !pixels || marcas) return;
    const m = findMeasureMarkers(pixels.px);
    setMarcas(m);
    if (!m) return;
    setOcr('lendo');
    void readMeasureDistance(pixels.px, m).then((v) => {
      if (v) {
        setMetros(String(Math.round(v * 100) / 100).replace('.', ','));
        setOcr('lido');
      } else setOcr('falhou');
    });
  }, [passo, pixels, marcas]);

  // Passo 2: contorno a partir da semente (o meio da medida, de início).
  const refazPista = useCallback(
    (p: Vec2) => {
      if (!pixels) return;
      const g = segmentArena(pixels.px, p);
      setSemente(p);
      setPalpite(g);
      setPista(g ? (retangulo ? fitRectangle(g.outline) : g.outline) : []);
    },
    [pixels, retangulo],
  );
  useEffect(() => {
    if (passo !== 'pista' || palpite || !marcas || semente) return;
    refazPista({ x: (marcas.a.x + marcas.b.x) / 2, y: (marcas.a.y + marcas.b.y) / 2 + marcas.radiusPx * 3 });
  }, [passo, palpite, marcas, semente, refazPista]);

  // Passo 3: sugestões, calculadas uma vez ao chegar.
  const sugeriu = useRef(false);
  useEffect(() => {
    if (passo !== 'sugestoes' || sugeriu.current || !pixels || !palpite) return;
    sugeriu.current = true;
    const ilhas = findIslands(palpite, pixels.px, marcas ? [marcas.a, marcas.b] : []);
    const telhados = findRoofs(pixels.px, pista);
    setItens((atual) => [
      ...atual,
      ...ilhas.map((s) => ({ type: 'ilha' as const, outline: s.outline, on: true, origem: 'sugestao' as const })),
      ...telhados.map((s) => ({ type: 'edificacao' as const, outline: s.outline, on: true, origem: 'sugestao' as const })),
    ]);
  }, [passo, pixels, palpite, marcas, pista]);

  const mpp = useMemo(() => {
    const n = Number(metros.replace(',', '.'));
    if (!marcas || !(n > 0)) return null;
    return n / Math.hypot(marcas.b.x - marcas.a.x, marcas.b.y - marcas.a.y);
  }, [metros, marcas]);

  /* ------------------------------------------------------- preview */

  const canvas = useRef<HTMLCanvasElement>(null);
  const escala = pixels ? Math.min(PREVIEW_W / pixels.px.width, PREVIEW_H / pixels.px.height) : 1;
  const arrasto = useRef<{ alvo: 'a' | 'b' | number; } | null>(null);
  const desenho = useRef<{ de: Vec2; ate: Vec2 } | null>(null);
  const [, redesenha] = useState(0);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !pixels) return;
    const g = c.getContext('2d')!;
    c.width = Math.round(pixels.px.width * escala);
    c.height = Math.round(pixels.px.height * escala);
    g.clearRect(0, 0, c.width, c.height);
    g.globalAlpha = passo === 'inicio' || passo === 'medida' ? 1 : 0.55;
    g.drawImage(pixels.bitmap, 0, 0, c.width, c.height);
    g.globalAlpha = 1;
    const P = (p: Vec2) => [p.x * escala, p.y * escala] as const;
    const poligono = (pts: Vec2[], traco: string, fundo: string | null, larg = 2) => {
      if (pts.length < 2) return;
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
      g.closePath();
      if (fundo) {
        g.fillStyle = fundo;
        g.fill();
      }
      g.strokeStyle = traco;
      g.lineWidth = larg;
      g.stroke();
    };
    const bolinha = (p: Vec2, cor: string, r = 6) => {
      g.beginPath();
      g.arc(...P(p), r, 0, Math.PI * 2);
      g.fillStyle = cor;
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.stroke();
    };
    if (passo !== 'inicio' && passo !== 'medida') {
      poligono(pista, '#d0193a', 'rgba(208, 25, 58, 0.08)', 3);
      if (passo === 'pista') pista.forEach((p) => bolinha(p, '#f2b705'));
      for (const it of itens) {
        if (!it.on) continue;
        poligono(it.outline, it.type === 'ilha' ? '#2e7d32' : '#7a4b1f', it.type === 'ilha' ? 'rgba(46,125,50,0.25)' : 'rgba(122,75,31,0.25)');
      }
      for (const t of arvores) bolinha(t, '#2e7d32', 7);
      const d = desenho.current;
      if (d) {
        g.setLineDash([5, 4]);
        g.strokeStyle = '#111';
        g.strokeRect(d.de.x * escala, d.de.y * escala, (d.ate.x - d.de.x) * escala, (d.ate.y - d.de.y) * escala);
        g.setLineDash([]);
      }
    }
    if (marcas && (passo === 'medida' || passo === 'inicio')) {
      g.beginPath();
      g.moveTo(...P(marcas.a));
      g.lineTo(...P(marcas.b));
      g.strokeStyle = '#d0193a';
      g.lineWidth = 3;
      g.stroke();
      bolinha(marcas.a, '#d0193a', 8);
      bolinha(marcas.b, '#d0193a', 8);
    }
  });

  // O CSS pode encolher o canvas para caber no diálogo: converte pelo
  // tamanho mostrado, não pelo desenhado.
  const naTela = () => {
    const c = canvas.current!;
    return c.getBoundingClientRect().width / c.width;
  };
  const noPrint = (e: React.PointerEvent): Vec2 => {
    const r = canvas.current!.getBoundingClientRect();
    const k = escala * naTela();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };
  const perto = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) * escala * naTela() < PEGA_PX;

  const aoApertar = (e: React.PointerEvent) => {
    const p = noPrint(e);
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* segue sem captura */
    }
    if (passo === 'medida') {
      if (marcas && perto(p, marcas.a)) arrasto.current = { alvo: 'a' };
      else if (marcas && perto(p, marcas.b)) arrasto.current = { alvo: 'b' };
      else if (!marcas) {
        // Sem marcadores achados: a medida se marca à mão, arrastando.
        setMarcas({ a: p, b: p, radiusPx: 7 });
        arrasto.current = { alvo: 'b' };
      }
      return;
    }
    if (passo === 'pista') {
      if (escolhendoPonto) {
        setEscolhendoPonto(false);
        setRetangulo(false);
        refazPista(p);
        return;
      }
      const i = pista.findIndex((q) => perto(p, q));
      if (i >= 0) arrasto.current = { alvo: i };
      return;
    }
    if (passo === 'extras') {
      if (ferramenta === 'arvore') setArvores((a) => [...a, p]);
      else if (ferramenta) desenho.current = { de: p, ate: p };
    }
  };
  const aoMover = (e: React.PointerEvent) => {
    const p = noPrint(e);
    const a = arrasto.current;
    if (a && passo === 'medida' && marcas) setMarcas({ ...marcas, [a.alvo as 'a' | 'b']: p });
    else if (a && passo === 'pista' && typeof a.alvo === 'number') {
      const i = a.alvo;
      setPista((pts) => pts.map((q, k) => (k === i ? p : q)));
    } else if (desenho.current) {
      desenho.current.ate = p;
      redesenha((n) => n + 1);
    }
  };
  const aoSoltar = () => {
    arrasto.current = null;
    const d = desenho.current;
    desenho.current = null;
    if (d && ferramenta && ferramenta !== 'arvore' && Math.abs(d.ate.x - d.de.x) > 3 && Math.abs(d.ate.y - d.de.y) > 3) {
      const [x0, x1] = [Math.min(d.de.x, d.ate.x), Math.max(d.de.x, d.ate.x)];
      const [y0, y1] = [Math.min(d.de.y, d.ate.y), Math.max(d.de.y, d.ate.y)];
      setItens((it) => [
        ...it,
        {
          type: ferramenta === 'ilha' ? 'ilha' : 'outra',
          outline: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
          on: true,
          origem: 'manual',
        },
      ]);
    }
    redesenha((n) => n + 1);
  };

  /* ------------------------------------------------------- confirmar */

  const confirma = () => {
    if (!pixels || !marcas || !mpp || pista.length < 3) return;
    const volta = (p: Vec2) => ({ x: p.x / pixels.f, y: p.y / pixels.f });
    let ids: string[] = [];
    useDocumentStore.getState().apply('Montar pista pelo mapa', (d) => {
      ids = buildFromMap(d, {
        image,
        measure: { a: volta(marcas.a), b: volta(marcas.b), meters: Number(metros.replace(',', '.')) },
        arena: pista.map(volta),
        structures: itens.filter((i) => i.on).map((i) => ({ type: i.type, outline: i.outline.map(volta) })),
        trees: arvores.map(volta),
      });
    });
    const ed = useEditorStore.getState();
    ed.setMode('pista');
    ed.setSelection(ids);
    fecha();
  };

  const tamanho = (() => {
    if (!mpp || pista.length < 3) return null;
    const xs = pista.map((p) => p.x);
    const ys = pista.map((p) => p.y);
    const f = (v: number) => Math.round(v * mpp);
    return `${f(Math.max(...xs) - Math.min(...xs))} × ${f(Math.max(...ys) - Math.min(...ys))} m`;
  })();

  const passos: Passo[] = ['medida', 'pista', 'sugestoes', 'extras'];
  const indice = passos.indexOf(passo);

  return (
    <Dialog title="Montar pista pelo mapa" onClose={fecha}>
      <div className="map-wizard">
        {passo !== 'inicio' && (
          <ol className="wizard-steps">
            {['Medida', 'Pista', 'Sugestões', 'Outros elementos'].map((n, i) => (
              <li key={n} className={i === indice ? 'atual' : i < indice ? 'feito' : ''}>{n}</li>
            ))}
          </ol>
        )}

        <div className="wizard-preview">
          {pixels ? (
            <canvas
              ref={canvas}
              onPointerDown={aoApertar}
              onPointerMove={aoMover}
              onPointerUp={aoSoltar}
              style={{ cursor: escolhendoPonto || (passo === 'extras' && ferramenta) ? 'crosshair' : 'default' }}
            />
          ) : (
            <p className="note">Abrindo o print…</p>
          )}
        </div>

        {passo === 'inicio' && (
          <>
            <p className="note">
              Com a medida do <strong>Medir distância</strong> do Google Maps no print, o assistente
              acerta a escala e propõe o contorno da pista.
            </p>
            <div className="row-buttons">
              <button className="primary" onClick={() => setPasso('medida')}>Montar pista pelo mapa</button>
              <button
                onClick={() => {
                  placeAsBackground(image);
                  fecha();
                }}
              >
                Só usar como imagem de fundo
              </button>
            </div>
          </>
        )}

        {passo === 'medida' && (
          <>
            <p className="note">
              {marcas
                ? 'Os pontos vermelhos são as pontas da medida. Arraste se estiverem fora do lugar.'
                : 'Não achei a medida do Maps. Clique numa ponta e arraste até a outra.'}
            </p>
            <label className="field">
              <span>
                {ocr === 'lendo'
                  ? 'Lendo a distância…'
                  : ocr === 'lido'
                    ? 'A distância é esta? Corrija se não for.'
                    : 'Distância da medida'}
              </span>
              <span className="input-unit">
                <input
                  type="text"
                  inputMode="decimal"
                  value={metros}
                  placeholder="ex.: 27,03"
                  onChange={(e) => setMetros(e.target.value)}
                />
                <em>m</em>
              </span>
            </label>
            {ocr === 'falhou' && <p className="note dim-always">Não consegui ler o número: digite o que aparece no print.</p>}
          </>
        )}

        {passo === 'pista' && (
          <>
            <p className="note">
              {palpite
                ? `Contorno sugerido${tamanho ? ` · ${tamanho}` : ''}. Arraste os pontos amarelos para ajustar.`
                : 'Não reconheci a pista a partir da medida. Clique em "Escolher um ponto da pista".'}
            </p>
            <div className="row-buttons">
              <button
                className={!retangulo ? 'active' : ''}
                disabled={!palpite}
                onClick={() => {
                  setRetangulo(false);
                  if (palpite) setPista(palpite.outline);
                }}
              >
                Contorno livre
              </button>
              <button
                className={retangulo ? 'active' : ''}
                disabled={!palpite}
                onClick={() => {
                  setRetangulo(true);
                  setPista(fitRectangle(pista.length >= 3 ? pista : palpite!.outline));
                }}
              >
                Ajustar a retângulo
              </button>
              <button className={escolhendoPonto ? 'active' : ''} onClick={() => setEscolhendoPonto((v) => !v)}>
                Escolher um ponto da pista
              </button>
            </div>
          </>
        )}

        {passo === 'sugestoes' && (
          <>
            {itens.filter((i) => i.origem === 'sugestao').length === 0 ? (
              <p className="note">Não encontrei ilhas nem construções vizinhas.</p>
            ) : (
              <>
                <p className="note">Encontrei estes elementos. Marque os que entram.</p>
                <ul className="wizard-list">
                  {itens.map((it, i) =>
                    it.origem !== 'sugestao' ? null : (
                      <li key={i}>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={it.on}
                            onChange={(e) => setItens((l) => l.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))}
                          />
                          {ROTULO[it.type]} {i + 1}
                        </label>
                      </li>
                    ),
                  )}
                </ul>
              </>
            )}
          </>
        )}

        {passo === 'extras' && (
          <>
            <p className="note">Inclua o que faltou: escolha o tipo e desenhe no print.</p>
            <div className="row-buttons">
              {(
                [
                  ['construcao', 'Construção (arraste)'],
                  ['ilha', 'Ilha (arraste)'],
                  ['arvore', 'Árvore (clique)'],
                ] as const
              ).map(([f, n]) => (
                <button key={f} className={ferramenta === f ? 'active' : ''} onClick={() => setFerramenta(ferramenta === f ? null : f)}>
                  {n}
                </button>
              ))}
            </div>
            {(itens.some((i) => i.origem === 'manual') || arvores.length > 0) && (
              <ul className="wizard-list">
                {itens.map((it, i) =>
                  it.origem !== 'manual' ? null : (
                    <li key={i}>
                      {ROTULO[it.type]}
                      <button className="mini" onClick={() => setItens((l) => l.filter((_, k) => k !== i))}>×</button>
                    </li>
                  ),
                )}
                {arvores.map((_, i) => (
                  <li key={`t${i}`}>
                    Árvore
                    <button className="mini" onClick={() => setArvores((l) => l.filter((_, k) => k !== i))}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {passo !== 'inicio' && (
          <div className="row-buttons wizard-nav">
            <button onClick={() => setPasso(indice > 0 ? passos[indice - 1]! : 'inicio')}>Voltar</button>
            {passo !== 'extras' ? (
              <button
                className="primary"
                disabled={(passo === 'medida' && !mpp) || (passo === 'pista' && pista.length < 3)}
                onClick={() => setPasso(passos[indice + 1]!)}
              >
                Próximo
              </button>
            ) : (
              <button className="primary" disabled={!mpp || pista.length < 3} onClick={confirma}>
                Confirmar e montar a pista
              </button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
