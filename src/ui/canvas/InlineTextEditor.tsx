import { useEffect, useRef, useState } from 'react';
import type { CourseDocument, ObjectId } from '@core/model/types';
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
  const [texto, setTexto] = useState(label?.kind === 'text' ? label.text : '');
  const campo = useRef<HTMLTextAreaElement>(null);
  const encerrado = useRef(false);

  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, []);

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
