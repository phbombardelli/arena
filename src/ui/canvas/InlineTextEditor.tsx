import { useEffect, useRef, useState } from 'react';
import type { CourseDocument, ObjectId, TituloDaFolha } from '@core/model/types';
import { TITULO_LINHA, tituloLayout } from '@core/model/annotationLayout';
import { recuoDoTexto } from '@render/layers/TituloLayer';
import { familiaCss } from '@render/fontes';
import { deleteObjects } from '@core/commands/ops';
import { mmPerMeter } from '@core/scale/units';
import { useDocumentStore } from '@store/documentStore';

interface Props {
  doc: CourseDocument;
  id: ObjectId;
  onDone: () => void;
}

/**
 * Edição do texto no próprio desenho (B-68, decisão 78): duplo clique no
 * texto abre esta caixa no lugar dele, no mesmo corpo de letra. Enter
 * confirma, Shift+Enter quebra a linha, Esc desiste; clicar fora confirma.
 *
 * Mora num foreignObject dentro do SVG: acompanha zoom e rolagem sem
 * conta nenhuma, porque as unidades ali já são milímetros de papel.
 */
export function InlineTextEditor({ doc, id, onDone }: Props) {
  const label = doc.objects.find((o) => o.id === id);
  const [texto, setTexto] = useState(label?.kind === 'text' || label?.kind === 'titulo' ? label.text : '');
  const campo = useRef<HTMLTextAreaElement>(null);
  const encerrado = useRef(false);

  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
    // Aberto por um botão ou um arrasto (caixa de texto, B-106): o clique
    // ainda termina e levaria o foco embora; foca de novo depois dele, sem
    // selecionar — o que já se digitou não pode ser trocado pela próxima tecla.
    const id = requestAnimationFrame(() => {
      if (campo.current && document.activeElement !== campo.current) campo.current.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  if (label?.kind === 'titulo') {
    return <EditorDoTitulo titulo={label} texto={texto} setTexto={setTexto} campo={campo} encerrado={encerrado} onDone={onDone} />;
  }
  if (label?.kind !== 'text') return null;

  const fim = (confirma: boolean) => {
    if (encerrado.current) return;
    encerrado.current = true;
    if (confirma && texto !== label.text) {
      useDocumentStore.getState().apply('Texto', (d) => {
        const t = d.objects.find((o) => o.id === id);
        if (t?.kind === 'text' && !t.locked) t.text = texto;
      });
    }
    onDone();
  };

  const k = mmPerMeter(doc.page.printScale);
  const x = doc.originMm.x + label.pos.x * k;
  const y = doc.originMm.y + label.pos.y * k;
  const linhas = texto.split('\n');
  const maior = Math.max(4, ...linhas.map((l) => l.length + 1));
  const largura = maior * label.sizeMm * 0.7 + label.sizeMm;
  const altura = linhas.length * label.sizeMm * 1.2 + label.sizeMm * 0.6;
  const esquerda = label.align === 'middle' ? x - largura / 2 : label.align === 'end' ? x - largura : x;

  return (
    <g transform={label.rotation ? `rotate(${label.rotation} ${x} ${y})` : undefined}>
      <foreignObject
        x={esquerda - label.sizeMm * 0.3}
        y={y - label.sizeMm * 0.9}
        width={largura}
        height={altura}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <textarea
          ref={campo}
          className="inline-text"
          value={texto}
          rows={linhas.length}
          spellCheck={false}
          style={{
            fontSize: `${label.sizeMm}px`,
            lineHeight: 1.2,
            fontWeight: label.bold ? 700 : 400,
            color: label.color,
            textAlign: label.align === 'middle' ? 'center' : label.align === 'end' ? 'right' : 'left',
            padding: `${label.sizeMm * 0.15}px ${label.sizeMm * 0.3}px`,
            borderWidth: `${label.sizeMm * 0.08}px`,
          }}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => fim(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              fim(true);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              fim(false);
            }
          }}
        />
      </foreignObject>
    </g>
  );
}

interface PropsDoTitulo {
  titulo: TituloDaFolha;
  texto: string;
  setTexto: (t: string) => void;
  campo: React.RefObject<HTMLTextAreaElement>;
  encerrado: React.MutableRefObject<boolean>;
  onDone: () => void;
}

/**
 * A caixa de texto da folha (B-106) se edita no lugar, com a mesma letra,
 * do tamanho da caixa: é como escrever direto no papel.
 */
function EditorDoTitulo({ titulo, texto, setTexto, campo, encerrado, onDone }: PropsDoTitulo) {
  const fim = (confirma: boolean) => {
    if (encerrado.current) return;
    encerrado.current = true;
    const final = confirma ? texto : titulo.text;
    if (!final.trim()) {
      // Caixa que ficou vazia não fica na folha.
      useDocumentStore.getState().apply('Texto da folha', (d) => deleteObjects(d, [titulo.id]));
    } else if (confirma && texto !== titulo.text) {
      useDocumentStore.getState().apply('Texto da folha', (d) => {
        const t = d.objects.find((o) => o.id === titulo.id);
        if (t?.kind === 'titulo' && !t.locked) t.text = texto;
      });
    }
    onDone();
  };
  // A caixa de edição ocupa exatamente a caixa da folha (a de seleção),
  // crescendo com o texto como a caixa cresce.
  const editado = { ...titulo, text: texto };
  const l = tituloLayout(editado);
  const recuo = recuoDoTexto(editado);
  const borda = titulo.borda?.espessuraMm ?? 0;
  return (
    <foreignObject
      x={titulo.posMm.x}
      y={titulo.posMm.y}
      width={l.widthMm}
      height={l.heightMm}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={campo}
        className="inline-text titulo"
        value={texto}
        spellCheck={false}
        style={{
          width: '100%',
          height: '100%',
          fontSize: `${titulo.sizeMm}px`,
          lineHeight: TITULO_LINHA,
          fontFamily: familiaCss(titulo.fonte),
          fontWeight: titulo.bold ? 700 : 400,
          fontStyle: titulo.italic ? 'italic' : 'normal',
          color: titulo.color,
          background: titulo.fundo ?? 'rgba(255, 255, 255, 0.85)',
          textAlign: titulo.align === 'middle' ? 'center' : titulo.align === 'end' ? 'right' : 'left',
          padding: `${l.padMm + borda}px ${titulo.align === 'middle' ? 0 : recuo}px`,
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => fim(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          // Enter termina, Shift+Enter quebra a linha, Esc desiste.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            fim(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            fim(false);
          }
        }}
      />
    </foreignObject>
  );
}
