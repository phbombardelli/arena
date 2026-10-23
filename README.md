# Arena

Editor gráfico vetorial para croquis de percurso de salto de equitação.
Aplicação web local, offline, sem servidor e sem nuvem.

## Rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

```bash
npm test          # testes do núcleo (geometria, escala, coordenadas)
npm run build     # gera dist/ estático, abre por file:// sem servidor
```

## Estrutura

```
src/core/       modelo, geometria, escala, comandos — puro, sem DOM, testável
src/render/     doc → SVG, modo tela ou papel — a mesma função para PDF
src/ui/         React: toolbars, canvas, painéis
src/store/      documento (salvo) + editor (efêmero)
src/platform/   arquivo, PDF, impressão
```

Dependência unidirecional: `ui → render → core`. `core` não importa React
nem toca no DOM.

## Estado

| Fase | Entrega | Status |
|---|---|---|
| 0 | Scaffold, store, camadas | ✅ |
| 1 | Coordenadas em metros, viewport, grid, régua, snap | ✅ |
| 2 | Exportação PDF vetorial, impressão, página e escala | ✅ |
| 3 | Objetos: seleção, mover, girar, undo/redo | ✅ |
| 4 | Persistência: novo/abrir/salvar + migrações | ✅ |
| 5 | Pista: retângulo, polígono, desenho livre | ✅ |
| 6 | Imagem de fundo + calibração de escala | ✅ |
| 7 | Obstáculos + propriedades + setas | ✅ |
| 8 | Traçados, curvas, comprimento | ✅ |
| 9 | Detecção de interferência | ✅ |
| 10 | Textos, quadro técnico, tabela de alturas | ✅ |
| 11 | Ornamentação | — |
| 12 | Impressão, PDF, ajustar ao papel | ✅ |
| 13 | Assistente de traçado | ✅ automático e por trechos |

Decisões técnicas em [docs/DECISOES.md](docs/DECISOES.md).
O que falta em [docs/PENDENCIAS.md](docs/PENDENCIAS.md).

## Atalhos

A lista completa fica em Ajuda › Atalhos do teclado (tecla `?`).

| | |
|---|---|
| V / H | selecionar / mover a vista |
| O / T / X | obstáculo / traçado / texto |
| roda do mouse | zoom sob o cursor |
| espaço ou botão do meio | mover a vista |
| G / S | grade / ímã |
| Alt | soltar o ímã na hora |
| Ctrl+Z / Ctrl+Y | desfazer / refazer |
| Ctrl+N / Ctrl+O | novo / abrir |
| Ctrl+S / Ctrl+Shift+S | salvar / salvar como |
| Ctrl+E / Ctrl+P | exportar PDF / imprimir |
| Ctrl+C / V / D | copiar / colar / duplicar |
| setas / Shift+setas | mover pelo passo do ímã / 10x |
| Delete | excluir a seleção |
| Ctrl+0 | ajustar à página |
| Esc | limpar seleção |
