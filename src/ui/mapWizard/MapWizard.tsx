import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Vec2 } from '@core/geometry/vec';
import type { ImportedImage } from '@core/commands/imageOps';
import { buildFromMap } from '@core/mapImport/buildFromMap';
import {
  findIslands,
  findMeasureMarkers,
  findRoofs,
  fitRectangle,
  rotationFrame,
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
 * Assistente "Montar pista pelo mapa" (decisões 64 e 66).
 *
 * 1. Girar: o print do Maps vem com o norte para cima; gira-se até a pista
 *    ficar reta. A análise toda roda na imagem já girada.
 * 2. Medida: os dois marcadores do "Medir distância" e o número, lidos no
 *    print ORIGINAL (o OCR não lê texto inclinado) e levados para a
 *    imagem girada; o desenhador confirma ou corrige.
 * 3. Pista: contorno da areia — livre ou ajustado a retângulo —, com
 *    vértices para arrastar, inserir (duplo clique na aresta) e remover
 *    (duplo clique no vértice).
 * 4. Sugestões: ilhas e telhados vizinhos, para marcar quais entram.
 * 5. Outros elementos: construção e ilha em retângulo ou contorno livre, e
 *    árvores, para o que o assistente não viu.
 * Ao confirmar, tudo entra vinculado e na escala.
 *
 * A análise roda numa cópia reduzida (lado maior até 1400 px); as
 * coordenadas voltam ao tamanho original no fim.
 */

const LADO_MAX = 1400;
const PREVIEW_W = 760;
const PREVIEW_H = 470;
const PEGA_PX = 11;

type Passo = 'inicio' | 'girar' | 'medida' | 'pista' | 'sugestoes' | 'extras';
type Ferramenta = 'construcao' | 'construcao-livre' | 'ilha' | 'ilha-livre' | 'arvore' | null;

interface Item {
  type: StructureType;
  outline: Vec2[];
  on: boolean;
  origem: 'sugestao' | 'manual';
}

const ROTULO: Record<string, string> = { ilha: 'Ilha', edificacao: 'Construção', outra: 'Construção' };
const PASSOS: Passo[] = ['girar', 'medida', 'pista', 'sugestoes', 'extras'];
const NOMES = ['Girar', 'Medida', 'Pista', 'Sugestões', 'Outros elementos'];

export function MapWizardHost() {
  const img = useEditorStore((s) => s.mapWizard);
  if (!img) return null;
  return <MapWizard key={img.asset.dataUrl.length + img.widthPx} image={img} />;
}

/** Desenha `src` girado em `graus` numa tela do tamanho da envoltória. */
function girado(
  src: HTMLCanvasElement | HTMLImageElement,
  w: number,
  h: number,
  graus: number,
  fundo = '#7f7f7f',
): HTMLCanvasElement {
  const r = rotationFrame(w, h, graus);
  const c = document.createElement('canvas');
  c.width = r.width;
  c.height = r.height;
  const g = c.getContext('2d')!;
  // Cantos que sobram: cinza na análise (não se confunde com areia, grama
  // nem com o branco da medida); branco na imagem final, que some na folha.
  g.fillStyle = fundo;
  g.fillRect(0, 0, c.width, c.height);
  g.translate(r.width / 2, r.height / 2);
  g.rotate((graus * Math.PI) / 180);
  g.drawImage(src, -w / 2, -h / 2, w, h);
  return c;
}

function MapWizard({ image }: { image: ImportedImage }) {
  const fecha = useCallback(() => useEditorStore.getState().setMapWizard(null), []);
  const [passo, setPasso] = useState<Passo>('inicio');
  const [original, setOriginal] = useState<{ el: HTMLImageElement; reduzido: HTMLCanvasElement; px: Pixels; f: number } | null>(null);
  const [angulo, setAngulo] = useState(0);
  const [marcasOrig, setMarcasOrig] = useState<MeasureMarkers | null | undefined>(undefined);
  const [marcas, setMarcas] = useState<MeasureMarkers | null>(null);
  const [metros, setMetros] = useState('');
  const [ocr, setOcr] = useState<'parado' | 'lendo' | 'lido' | 'falhou'>('parado');
  const [palpite, setPalpite] = useState<ArenaGuess | null>(null);
  const [retangulo, setRetangulo] = useState(false);
  const [pista, setPista] = useState<Vec2[]>([]);
  const [escolhendoPonto, setEscolhendoPonto] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [arvores, setArvores] = useState<Vec2[]>([]);
  const [ferramenta, setFerramenta] = useState<Ferramenta>(null);
  const [livre, setLivre] = useState<Vec2[]>([]);

  // Print original, reduzido; marcadores e OCR já começam aqui, no original.
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
      const px = { data: d.data, width: c.width, height: c.height };
      setOriginal({ el, reduzido: c, px, f });
      const m = findMeasureMarkers(px);
      setMarcasOrig(m);
      if (m) {
        setOcr('lendo');
        void readMeasureDistance(px, m).then((v) => {
          if (v) {
            setMetros(String(Math.round(v * 100) / 100).replace('.', ','));
            setOcr('lido');
          } else setOcr('falhou');
        });
      }
    };
    el.src = image.asset.dataUrl;
  }, [image]);

  // A imagem de trabalho: o print reduzido, girado.
  const trabalho = useMemo(() => {
    if (!original) return null;
    const c = girado(original.reduzido, original.reduzido.width, original.reduzido.height, angulo);
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    const quadro = rotationFrame(original.reduzido.width, original.reduzido.height, angulo);
    return { bitmap: c, px: { data: d.data, width: c.width, height: c.height } as Pixels, map: quadro.map };
  }, [original, angulo]);

  // Mudou o giro: medida e pista se refazem a partir do original.
  useEffect(() => {
    if (!trabalho || marcasOrig === undefined) return;
    setMarcas(marcasOrig ? { ...marcasOrig, a: trabalho.map(marcasOrig.a), b: trabalho.map(marcasOrig.b) } : null);
    setPalpite(null);
    setPista([]);
    setRetangulo(false);
  }, [trabalho, marcasOrig]);

  const refazPista = useCallback(
    (p: Vec2, ret: boolean) => {
      if (!trabalho) return;
      const g = segmentArena(trabalho.px, p);
      setPalpite(g);
      setPista(g ? (ret ? fitRectangle(g.outline) : g.outline) : []);
    },
    [trabalho],
  );
  useEffect(() => {
    if (passo !== 'pista' || palpite || pista.length || !marcas) return;
    refazPista({ x: (marcas.a.x + marcas.b.x) / 2, y: (marcas.a.y + marcas.b.y) / 2 + marcas.radiusPx * 3 }, false);
  }, [passo, palpite, pista.length, marcas, refazPista]);

  // Sugestões, uma vez ao chegar ao passo.
  const sugeriu = useRef(false);
  useEffect(() => {
    if (passo !== 'sugestoes' || sugeriu.current || !trabalho || !palpite) return;
    sugeriu.current = true;
    const ilhas = findIslands(palpite, trabalho.px, marcas ? [marcas.a, marcas.b] : []);
    const telhados = findRoofs(trabalho.px, pista);
    setItens((atual) => [
      ...atual,
      ...ilhas.map((s) => ({ type: 'ilha' as const, outline: s.outline, on: true, origem: 'sugestao' as const })),
      ...telhados.map((s) => ({ type: 'edificacao' as const, outline: s.outline, on: true, origem: 'sugestao' as const })),
    ]);
  }, [passo, trabalho, palpite, marcas, pista]);

  const mpp = useMemo(() => {
    const n = Number(metros.replace(',', '.'));
    if (!marcas || !(n > 0)) return null;
    return n / Math.hypot(marcas.b.x - marcas.a.x, marcas.b.y - marcas.a.y);
  }, [metros, marcas]);

  /* ------------------------------------------------------- preview */

  const canvas = useRef<HTMLCanvasElement>(null);
  const escala = trabalho ? Math.min(PREVIEW_W / trabalho.px.width, PREVIEW_H / trabalho.px.height) : 1;
  const arrasto = useRef<{ alvo: 'a' | 'b' | number } | null>(null);
  const desenho = useRef<{ de: Vec2; ate: Vec2 } | null>(null);
  const [, redesenha] = useState(0);
  // Zoom e deslocamento da prévia (decisão 67): z = 1 mostra o print
  // inteiro; o deslocamento é em pixels do canvas.
  const [vista, setVista] = useState({ z: 1, ox: 0, oy: 0 });
  const arrastoVista = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  useEffect(() => setVista({ z: 1, ox: 0, oy: 0 }), [trabalho]);
  // Com zoom, desenha o print em resolução cheia (a análise segue na cópia
  // reduzida): prints de tela retina passam de 1400 px e ficariam borrados.
  const nitida = vista.z > 1.3 && !!original && original.f < 1;
  const cheio = useMemo(
    () => (nitida && original ? girado(original.el, original.el.naturalWidth, original.el.naturalHeight, angulo) : null),
    [nitida, original, angulo],
  );

  useEffect(() => {
    const c = canvas.current;
    if (!c || !trabalho) return;
    const g = c.getContext('2d')!;
    c.width = Math.round(trabalho.px.width * escala);
    c.height = Math.round(trabalho.px.height * escala);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    const { z, ox, oy } = vista;
    g.setTransform(z, 0, 0, z, -ox, -oy);
    const forte = passo === 'inicio' || passo === 'girar' || passo === 'medida';
    g.globalAlpha = forte ? 1 : 0.55;
    g.drawImage(cheio ?? trabalho.bitmap, 0, 0, c.width, c.height);
    g.globalAlpha = 1;
    const P = (p: Vec2) => [p.x * escala, p.y * escala] as const;
    const poligono = (pts: Vec2[], traco: string, fundo: string | null, larg = 2, fechar = true) => {
      if (pts.length < 2) return;
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
      if (fechar) g.closePath();
      if (fundo) {
        g.fillStyle = fundo;
        g.fill();
      }
      g.strokeStyle = traco;
      g.lineWidth = larg / z;
      g.stroke();
    };
    const bolinha = (p: Vec2, cor: string, r = 6) => {
      g.beginPath();
      g.arc(...P(p), r / z, 0, Math.PI * 2);
      g.fillStyle = cor;
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2 / z;
      g.stroke();
    };
    if (passo === 'girar') {
      // Quadriculado de referência para alinhar a cerca, fixo na tela.
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 1;
      for (let x = 0; x < c.width; x += 40) {
        g.beginPath();
        g.moveTo(x + 0.5, 0);
        g.lineTo(x + 0.5, c.height);
        g.stroke();
      }
      for (let y = 0; y < c.height; y += 40) {
        g.beginPath();
        g.moveTo(0, y + 0.5);
        g.lineTo(c.width, y + 0.5);
        g.stroke();
      }
      g.setTransform(z, 0, 0, z, -ox, -oy);
    }
    if (!forte) {
      poligono(pista, '#d0193a', 'rgba(208, 25, 58, 0.08)', 3);
      if (passo === 'pista') pista.forEach((p) => bolinha(p, '#f2b705'));
      for (const it of itens) {
        if (!it.on) continue;
        poligono(it.outline, it.type === 'ilha' ? '#2e7d32' : '#7a4b1f', it.type === 'ilha' ? 'rgba(46,125,50,0.25)' : 'rgba(122,75,31,0.25)');
      }
      for (const t of arvores) bolinha(t, '#2e7d32', 7);
      if (livre.length) {
        poligono(livre, '#111', null, 2, false);
        livre.forEach((p) => bolinha(p, '#111', 4));
      }
      const d = desenho.current;
      if (d) {
        g.setLineDash([5 / z, 4 / z]);
        g.strokeStyle = '#111';
        g.lineWidth = 1.5 / z;
        g.strokeRect(d.de.x * escala, d.de.y * escala, (d.ate.x - d.de.x) * escala, (d.ate.y - d.de.y) * escala);
        g.setLineDash([]);
      }
    }
    if (marcas && passo === 'medida') {
      g.beginPath();
      g.moveTo(...P(marcas.a));
      g.lineTo(...P(marcas.b));
      g.strokeStyle = '#d0193a';
      g.lineWidth = 3 / z;
      g.stroke();
      bolinha(marcas.a, '#d0193a', 8);
      bolinha(marcas.b, '#d0193a', 8);
    }
  });

  // O CSS pode encolher o canvas: converte pelo tamanho mostrado.
  const naTela = () => {
    const c = canvas.current!;
    return c.getBoundingClientRect().width / c.width;
  };
  /** Ponto do evento em pixels do canvas (antes do zoom). */
  const noCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / naTela(), y: (e.clientY - r.top) / naTela() };
  };
  const noPrint = (e: React.PointerEvent | React.MouseEvent): Vec2 => {
    const c = noCanvas(e);
    return { x: (c.x + vista.ox) / (vista.z * escala), y: (c.y + vista.oy) / (vista.z * escala) };
  };
  const perto = (a: Vec2, b: Vec2) =>
    Math.hypot(a.x - b.x, a.y - b.y) * escala * vista.z * naTela() < PEGA_PX;

  /** Limita o deslocamento para o print não sair da prévia. */
  const limita = (z: number, ox: number, oy: number) => {
    const c = canvas.current;
    if (!c) return { z, ox, oy };
    return {
      z,
      ox: Math.min(Math.max(0, ox), c.width * (z - 1)),
      oy: Math.min(Math.max(0, oy), c.height * (z - 1)),
    };
  };
  /** Zoom em torno de um ponto do canvas (o cursor, ou o centro). */
  const zoomEm = (fator: number, em?: { x: number; y: number }) => {
    const c = canvas.current;
    if (!c) return;
    setVista((v) => {
      const z = Math.min(10, Math.max(1, v.z * fator));
      const p = em ?? { x: c.width / 2, y: c.height / 2 };
      return limita(z, ((p.x + v.ox) * z) / v.z - p.x, ((p.y + v.oy) * z) / v.z - p.y);
    });
  };
  // Roda do mouse: listener nativo, porque o do React é passivo e não
  // consegue impedir a rolagem do diálogo.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      zoomEm(e.deltaY < 0 ? 1.2 : 1 / 1.2, noCanvas(e));
    };
    c.addEventListener('wheel', roda, { passive: false });
    return () => c.removeEventListener('wheel', roda);
  });
  const comecaArrastoVista = (e: React.PointerEvent) => {
    arrastoVista.current = { x: e.clientX, y: e.clientY, ox: vista.ox, oy: vista.oy };
  };

  const aoApertar = (e: React.PointerEvent) => {
    if (e.detail > 1) return; // o duplo clique tem tratamento próprio
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
      } else comecaArrastoVista(e);
      return;
    }
    if (passo === 'pista') {
      if (escolhendoPonto) {
        setEscolhendoPonto(false);
        setRetangulo(false);
        refazPista(p, false);
        return;
      }
      const i = pista.findIndex((q) => perto(p, q));
      if (i >= 0) arrasto.current = { alvo: i };
      else comecaArrastoVista(e);
      return;
    }
    if (passo === 'extras' && ferramenta) {
      if (ferramenta === 'arvore') setArvores((a) => [...a, p]);
      else if (ferramenta === 'construcao-livre' || ferramenta === 'ilha-livre') setLivre((l) => [...l, p]);
      else desenho.current = { de: p, ate: p };
      return;
    }
    // Sem nada para pegar: arrastar desloca a vista.
    comecaArrastoVista(e);
  };

  const aoDuploClique = (e: React.MouseEvent) => {
    const p = noPrint(e);
    if (passo === 'pista') {
      // Duplo clique no vértice remove; perto de uma aresta, insere.
      const i = pista.findIndex((q) => perto(p, q));
      if (i >= 0) {
        if (pista.length > 3) setPista((pts) => pts.filter((_, k) => k !== i));
        return;
      }
      let melhor = -1;
      let dmin = Infinity;
      pista.forEach((a, k) => {
        const b = pista[(k + 1) % pista.length]!;
        const ab = { x: b.x - a.x, y: b.y - a.y };
        const len2 = ab.x * ab.x + ab.y * ab.y || 1;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / len2));
        const d = Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t));
        if (d < dmin) {
          dmin = d;
          melhor = k;
        }
      });
      if (melhor >= 0 && dmin * escala * vista.z * naTela() < PEGA_PX * 2) {
        setPista((pts) => [...pts.slice(0, melhor + 1), p, ...pts.slice(melhor + 1)]);
      }
      return;
    }
    if (passo === 'extras' && (ferramenta === 'construcao-livre' || ferramenta === 'ilha-livre')) fechaLivre();
  };

  const aoMover = (e: React.PointerEvent) => {
    const v = arrastoVista.current;
    if (v) {
      const k = naTela();
      setVista((atual) => limita(atual.z, v.ox - (e.clientX - v.x) / k, v.oy - (e.clientY - v.y) / k));
      return;
    }
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
    arrastoVista.current = null;
    const d = desenho.current;
    desenho.current = null;
    if (d && (ferramenta === 'construcao' || ferramenta === 'ilha') && Math.abs(d.ate.x - d.de.x) > 3 && Math.abs(d.ate.y - d.de.y) > 3) {
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

  function fechaLivre() {
    setLivre((pts) => {
      // O duplo clique também entrou como ponto: tira a repetição do fim.
      const limpos = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) > 1);
      if (limpos.length >= 3) {
        setItens((it) => [
          ...it,
          { type: ferramenta === 'ilha-livre' ? 'ilha' : 'outra', outline: limpos, on: true, origem: 'manual' },
        ]);
      }
      return [];
    });
  }

  /* ------------------------------------------------------- confirmar */

  const confirma = () => {
    if (!original || !marcas || !mpp || pista.length < 3) return;
    // O asset é o print inteiro, girado como na tela; sem giro, o original.
    let imagem = image;
    if (angulo !== 0) {
      const c = girado(original.el, original.el.naturalWidth, original.el.naturalHeight, angulo, '#ffffff');
      imagem = {
        widthPx: c.width,
        heightPx: c.height,
        asset: { ...image.asset, mime: 'image/jpeg', dataUrl: c.toDataURL('image/jpeg', 0.9), width: c.width, height: c.height },
      };
    }
    const volta = (p: Vec2) => ({ x: p.x / original.f, y: p.y / original.f });
    let ids: string[] = [];
    useDocumentStore.getState().apply('Montar pista pelo mapa', (d) => {
      ids = buildFromMap(d, {
        image: imagem,
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

  const indice = PASSOS.indexOf(passo);
  const desenhaLivre = ferramenta === 'construcao-livre' || ferramenta === 'ilha-livre';

  return (
    <Dialog title="Montar pista pelo mapa" onClose={fecha}>
      <div className="map-wizard">
        {passo !== 'inicio' && (
          <ol className="wizard-steps">
            {NOMES.map((n, i) => (
              <li key={n} className={i === indice ? 'atual' : i < indice ? 'feito' : ''}>{n}</li>
            ))}
          </ol>
        )}

        <div className="wizard-preview">
          {trabalho && (
            <div className="wizard-zoom">
              <button onClick={() => zoomEm(1 / 1.5)} disabled={vista.z <= 1} title="Afastar">−</button>
              <span className="mono">{Math.round(vista.z * 100)}%</span>
              <button onClick={() => zoomEm(1.5)} disabled={vista.z >= 10} title="Aproximar (ou roda do mouse)">+</button>
              <button onClick={() => setVista({ z: 1, ox: 0, oy: 0 })} disabled={vista.z === 1} title="Ver o print inteiro">Ajustar</button>
            </div>
          )}
          {trabalho ? (
            <canvas
              ref={canvas}
              onPointerDown={aoApertar}
              onPointerMove={aoMover}
              onPointerUp={aoSoltar}
              onDoubleClick={aoDuploClique}
              style={{
                cursor:
                  escolhendoPonto || (passo === 'extras' && ferramenta)
                    ? 'crosshair'
                    : vista.z > 1
                      ? 'grab'
                      : 'default',
              }}
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
              <button className="primary" onClick={() => setPasso('girar')}>Montar pista pelo mapa</button>
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

        {passo === 'girar' && (
          <>
            <p className="note">Gire até a cerca da pista ficar paralela ao quadriculado.</p>
            <div className="wizard-rotate">
              <button onClick={() => setAngulo((a) => a - 90)} title="90° para a esquerda">⟲ 90°</button>
              <button onClick={() => setAngulo((a) => Math.round((a - 1) * 10) / 10)}>−1°</button>
              <input
                type="range"
                className="rotation-slider"
                aria-label="Giro do print"
                min={-180}
                max={180}
                step={0.5}
                value={((angulo + 540) % 360) - 180}
                onChange={(e) => setAngulo(Number(e.target.value))}
              />
              <button onClick={() => setAngulo((a) => Math.round((a + 1) * 10) / 10)}>+1°</button>
              <button onClick={() => setAngulo((a) => a + 90)} title="90° para a direita">⟳ 90°</button>
              <span className="mono">{(((angulo + 540) % 360) - 180).toFixed(1).replace('.', ',')}°</span>
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
              {palpite || pista.length >= 3
                ? `Contorno sugerido${tamanho ? ` · ${tamanho}` : ''}. Arraste os pontos amarelos; duplo clique numa aresta acrescenta um ponto, num ponto o remove.`
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
                disabled={pista.length < 3}
                onClick={() => {
                  setRetangulo(true);
                  setPista(fitRectangle(pista));
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
            <p className="note">
              {desenhaLivre
                ? 'Clique cada ponto do contorno; duplo clique ou "Fechar contorno" termina.'
                : 'Inclua o que faltou: escolha o tipo e desenhe no print.'}
            </p>
            <div className="row-buttons wrap">
              {(
                [
                  ['construcao', 'Construção ▭'],
                  ['construcao-livre', 'Construção livre'],
                  ['ilha', 'Ilha ▭'],
                  ['ilha-livre', 'Ilha livre'],
                  ['arvore', 'Árvore'],
                ] as const
              ).map(([f, n]) => (
                <button
                  key={f}
                  className={ferramenta === f ? 'active' : ''}
                  onClick={() => {
                    setLivre([]);
                    setFerramenta(ferramenta === f ? null : f);
                  }}
                >
                  {n}
                </button>
              ))}
              {desenhaLivre && livre.length >= 3 && <button onClick={fechaLivre}>Fechar contorno</button>}
              {desenhaLivre && livre.length > 0 && <button onClick={() => setLivre((l) => l.slice(0, -1))}>Desfazer ponto</button>}
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
            <button onClick={() => setPasso(indice > 0 ? PASSOS[indice - 1]! : 'inicio')}>Voltar</button>
            {passo !== 'extras' ? (
              <button
                className="primary"
                disabled={(passo === 'medida' && !mpp) || (passo === 'pista' && pista.length < 3)}
                onClick={() => {
                  // Voltar ao giro e girar de novo invalida as sugestões feitas.
                  if (passo === 'pista') sugeriu.current = false;
                  if (passo === 'pista') setItens((l) => l.filter((i) => i.origem === 'manual'));
                  setPasso(PASSOS[indice + 1]!);
                }}
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
