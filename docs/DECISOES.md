# Decisões técnicas

Registro das decisões que não são óbvias no código. Cada uma explica o
*porquê*, para que uma futura alteração seja consciente e não acidental.

---

## 1. Geometria em metros, anotação em milímetros de papel

Um croqui tem dois tipos de medida que se comportam de forma oposta ao
mudar a escala:

- **Geometria real** (pista, obstáculo, traçado) escala com o desenho → metros.
- **Anotação** (espessura de linha, corpo de texto, seta) **não** escala →
  milímetros de papel.

Em 1:500 o número "7" precisa continuar com ~3 mm de altura impressa. Se a
anotação vivesse em metros, viraria um ponto ilegível.

Consequência: `render/style/tokens.ts` está todo em mm de papel, e a
conversão passa por `page.printScale`.

## 2. Eixo Y cresce para baixo

Igual ao SVG. A alternativa cartesiana obriga a inverter a matriz em toda
ida e volta e é fonte permanente de bugs de rotação e texto espelhado.

Rotação: **graus, sentido horário, 0° = leste**.

Custo aceito: `y = 17,40 m` significa 17,40 m a partir da borda superior.

## 3. A tela é WYSIWYG com o papel

O espaço de coordenadas do SVG é **milímetro de papel**. O zoom do viewport
é `px por mm`. Trocar a escala de impressão muda visivelmente a proporção
entre anotação e desenho — exatamente como sairá impresso. O desenhador vê
o problema de legibilidade na tela, não no papel.

## 4. Rotação e posição são absolutas, nunca acumuladas

Girar 5° dez vezes grava `rotation = 50`, jamais `rotation += 5` dez vezes.
Evita deriva de ponto flutuante e mantém o painel de propriedades honesto.

## 5. Uma única função de renderização

`render/renderDocument.tsx` recebe `mode: 'screen' | 'paper'`. Tela,
impressão e PDF consomem a mesma função. Não existe gerador de PDF paralelo
que possa divergir do que se vê na tela — a causa nº 1 de "na tela está
certo, no papel sai diferente".

## 6. Restrições de SVG impostas pela exportação em PDF

Verificadas na fase 2 com PDFs reais gerados e inspecionados
(`svg2pdf.js` 2.x + `jsPDF` 4.2.1). Valem desde o primeiro commit, porque
retroagi-las depois é caro.

**Funciona, confirmado no PDF:**

- Acentuação completa em Helvetica/WinAnsi (`Obstáculo`, `Combinação`,
  `Três`, `Água`, `Ângulo`, `°`, `×`, `·`).
- Corpo de texto de 1,8 mm a 7 mm; espessuras de 0,13 mm a 1,0 mm.
- Tracejados, inclusive sobre curva de Bézier.
- `transform` com `rotate` em grupo e em texto; `text-anchor` e
  `dominant-baseline`.
- Imagem raster embutida por data URL — vira `/Subtype /Image` de verdade.
- Página em milímetros exatos: A4 paisagem sai `MediaBox` 841,89 × 595,28 pt
  e A3 paisagem 1190,55 × 841,89 pt.

**Não funciona — proibido na árvore exportável:**

1. **`<foreignObject>`.** Quadro técnico e tabela de alturas são `<rect>` +
   `<text>` + `<line>` nativos.
2. **`<symbol>` + `<use>`.** Gera um Form XObject com `BBox [0 0 0 0]`: o
   conteúdo some do PDF. Símbolos de obstáculo são **grupos `<g>` diretos**,
   repetidos por instância. Com ~40 obstáculos o custo de DOM é irrelevante
   perto do risco.
3. **Travessão `—`, meia-risca `–` e sinal de menos `−`.** O travessão e a
   meia-risca desaparecem; o `−` sai como `"`. Usar hífen ASCII `-`.
   Vale para "não informado" na tabela de alturas.
4. **Estilo por classe CSS externa** — usar atributos de apresentação inline.
5. **`filter`, `mask`, gradiente complexo.**

Fonte única com métricas conhecidas (Helvetica no MVP; embutir TTF depois,
se necessário).

O overlay de seleção fica **fora** do grupo exportável.

Ao atualizar `svg2pdf.js` ou `jsPDF`, reexecutar a folha de diagnóstico
(`exportDiagnosticPdf`) e reconferir esta lista.

## 7. Estado de edição separado do documento

`documentStore` é o que se salva. `editorStore` (zoom, pan, seleção,
ferramenta ativa) é efêmero: não entra no arquivo nem no histórico.

## 8. Histórico por patches do Immer

`produceWithPatches` devolve patch e patch inverso. Undo/redo em ~60 linhas,
transacional e correto. `mergeKey` coalesce um gesto contínuo (arrastar,
girar) em **uma única entrada de undo**, não uma por pixel.

## 9. Gestos contínuos são limitados a um quadro, com flush no fim

Arrastar e girar aplicam a alteração no documento no máximo uma vez por
`requestAnimationFrame`, todas coalescidas em **uma** entrada de desfazer
pela decisão 8. Ao soltar o ponteiro, o gesto faz *flush* do último valor
pendente de forma síncrona: sem isso, o movimento final se perde quando o
quadro não chega a rodar (aba em segundo plano) — falha encontrada na
verificação da fase 3.

O plano original era escrever `transform` direto no nó DOM durante o gesto
e só tocar o modelo ao soltar. Não foi necessário: com algumas dezenas de
objetos, a reconciliação do React por quadro é barata. A otimização
continua possível sem mudar nada fora de `useObjectGestures`, e só deve
ser feita se a medição em um croqui real acusar perda de quadros.

Complemento: `setPointerCapture` **nunca pode derrubar um gesto**. Ele
lança quando o ponteiro já foi liberado, e o gesto precisa estar
registrado antes da chamada, não depois.

## 10. Toda a matemática de viewport usa o tamanho do SVG, não do contêiner

O contêiner do canvas inclui as réguas da interface; o SVG não. Usar um em
um lugar e outro em outro desloca cursor e zoom em meia régua — bug real
encontrado na verificação da fase 1. `Canvas.tsx` deriva `size` uma vez e
usa em todos os pontos.

## 11. O laço de seleção seleciona por contenção

Selecionar por interseção arrastaria a pista junto em qualquer laço
desenhado sobre ela — a pista cobre toda a área de trabalho. Só entra na
seleção o objeto inteiramente contido no retângulo, como em qualquer
editor gráfico.

## 12. Escalas redondas

"Ajustar ao papel" nunca devolve 1:237. Arredonda para a escala redonda
imediatamente superior (`STANDARD_SCALES`), como em desenho técnico.

## 13. Trocar escala ou formato não move o desenho sozinho

`centerOnPage` é uma ação explícita do usuário. Reposicionamento automático
é surpresa ruim em ferramenta técnica.

## 14. Arquivo de projeto em JSON legível, com envelope versionado

`.pcs` é JSON indentado, não um binário nem um zip. Um croqui é documento
de trabalho que pode precisar ser recuperado anos depois, possivelmente
sem este programa à mão; formato legível é seguro de graça, e o custo em
tamanho é irrelevante (um croqui completo dá alguns kB, e as imagens de
fundo já vão embutidas como data URL de todo jeito).

O envelope (`format`, `schemaVersion`, `savedAt`, `appVersion`) fica
separado do documento para que a versão possa ser lida **antes** de
qualquer tentativa de interpretar o conteúdo. A ordem na leitura é:
analisar → conferir envelope → **migrar** → validar. Migrar antes de
validar é o que permite abrir um arquivo antigo que já não passaria na
validação de hoje.

Migrações são funções sobre JSON cru, nunca sobre os tipos do modelo — os
tipos vão continuar mudando, e uma migração antiga escrita sobre eles
deixaria de compilar. Uma vez publicada, uma migração nunca mais muda.

## 15. Na leitura, geometria é erro; acessório é aviso

- Página, escala, coordenadas, rotações: **erro**, a abertura para. Abrir
  em silêncio um croqui com medidas erradas é pior do que não abrir.
- Camada faltando, objeto de tipo desconhecido (gravado por versão mais
  nova), campo acessório ausente: **aviso**, o resto do arquivo abre.

Nunca "consertar" uma coordenada em silêncio.

## 16. Gravar por cima quando o navegador permite

Com a File System Access API (Chrome, Edge), "Salvar" grava no mesmo
arquivo. Sem ela (Firefox, Safari), cai para download — o usuário perde o
"salvar por cima", não o trabalho. É por isso que o estado "não salvo"
precisa ficar visível na barra superior, e que existe confirmação antes de
descartar alterações e aviso do navegador ao fechar.

Não há salvamento automático nem rascunho local, por pedido explícito: o
usuário decide quando salvar.

## 17. Uma única fonte para o contorno da pista

`arenaPoints()` é a única forma de obter os vértices. O desenho, a
envoltória, o teste de clique, o perímetro e a área consomem essa função —
antes o retângulo era reconstruído em cada lugar, e bastaria um deles
esquecer o caso do polígono para o clique deixar de bater com o traço.

A régua de perímetro usa a **caixa envolvente**, não o contorno: mesmo num
contorno irregular ela continua sendo uma referência retilínea, como nos
croquis impressos.

Converter retângulo em contorno livre é caminho de mão única. O contrário
teria de jogar fora o desenho do usuário para caber num retângulo.

## 18. Estado que o evento consulta, e não o que o render capturou

Manipuladores de ponteiro leem a ferramenta ativa de
`useEditorStore.getState()` no instante do evento. Lida do render, o
primeiro clique logo depois de trocar de ferramenta ainda usaria a
anterior — o React só re-renderiza no microtask seguinte. Falha real
encontrada na verificação da fase 5.

## 19. A escala da imagem é um número só

`metersPerPixel` relaciona o pixel do arquivo ao metro do terreno. Todas as
formas de ajustar — calibrar pela barra do mapa, digitar a largura em
metros — desembocam nele, e o desenho aplica esse único fator num único
`transform`. Guardar largura e escala em separado seria convidar os dois a
divergirem.

Na calibração, o **ponto A fica parado**: é o que o usuário acabou de
mirar, e vê-lo saltar ao confirmar a distância seria desconcertante. A
origem da imagem é recalculada em torno dele.

O clique da calibração **não usa snap**. Alinhar a mira ao grid falsearia
a própria medição de referência.

## 20. O arquivo da imagem fica embutido no projeto

Data URL dentro do `.pcs`. O requisito é funcionar offline, e um croqui
que depende de um arquivo solto na pasta do usuário deixa de abrir no
primeiro backup mal feito. Em troca: limite de 12 MB por imagem, e o
arquivo é apagado junto quando nenhuma imagem o referencia mais.

O preenchimento da pista pode ser desligado — de outro modo, o branco
opaco taparia a imagem de referência.

## 21. O obstáculo tem sistema local proprio

X ao longo da frente, Y na profundidade, salto para -Y. Rotacao 0 significa
frente horizontal com o cavalo saltando para cima na tela. A seta, as
barras e a largura de salto seguem essa convencao; muda-la depois exigiria
revisar cada simbolo.

Os simbolos sao desenhados em MILIMETROS DE PAPEL, recebendo `k` (mm por
metro), e nunca dentro de um `scale()`. A escala do grupo engordaria junto
a espessura do traco, que e anotacao e precisa ficar constante em qualquer
escala de impressao.

## 22. Geometria que o desenho usa mora no nucleo

A seta saia na diagonal em vez de perpendicular, e nenhum teste podia
pegar isso porque a geometria estava dentro do componente. `arrowGeometry`
passou para `core/library/obstacles`: "a seta e perpendicular e centrada"
e uma afirmacao sobre numeros, nao sobre pixels, e agora ha teste dizendo
isso.

Vale como regra: se um requisito e verificavel em numeros, a conta sai do
componente.

## 23. Os rotulos do obstaculo nao giram

Numero e alturas ficam fora do grupo rotacionado. Com o obstaculo a 127
graus, um rotulo girado junto ficaria de cabeca para baixo. O deslocamento
do rotulo e em metros a partir do centro, para acompanhar o obstaculo ao
move-lo.

## 24. Liverpool e opcao, nao tipo de obstaculo

Na pista o liverpool aparece acoplado a um vertical ou a um oxer, e nao
como obstaculo a parte. Vira `liverpool` dentro do obstaculo: ligar,
profundidade, deslocamento e sobra nos lados.

Ele e desenhado no sistema LOCAL do obstaculo, com os lados alinhados aos
eixos. Por construcao fica sempre paralelo a frente — nao existe opcao de
angulo, porque nao existe como desalinha-lo.

## 25. Rotulo do obstaculo se posiciona sozinho

Com `auto` ligado, o numero vai para o LADO (alem da meia-largura da
frente) e as alturas vao para TRAS — nunca para a frente, que e por onde a
seta sai. O deslocamento e local: gira com o obstaculo, entao continua
fugindo do corpo e da seta em qualquer angulo. Foi assim que se resolveu o
numero ficar encoberto em obstaculo largo ou inclinado.

Mexer na posicao pelo painel desliga o automatico; um botao devolve.

O texto em si nunca gira (decisao 23).

## 26. Paraflanco e o suporte padrao

Sem o painel lateral o obstaculo parece uma vara solta no chao. O suporte
tem tres formas: `paraflanco` (padrao), `pilar` (so o montante) e `nenhum`
— a vara no chao existe em pista de verdade e continua disponivel.

A profundidade do paraflanco acompanha a largura de salto, para o oxer
ficar apoiado dos dois lados, e entra na envoltoria: e ele, nao a vara,
quem define ate onde vai o corpo do obstaculo.

## 27. Dimensoes que vem da pista, nao do desenho

Vara: 3,50 m. Liverpool: 3,00 x 0,50 m — mais estreito que a vara de
proposito, para as pontas dela ficarem para fora da agua, como se monta na
pista. Os dois sao ajustaveis.

O comprimento da lamina e proprio, nao derivado da vara. Quando ele passa
da vara, e ele quem manda na extensao do obstaculo; quando e menor, manda
a vara.

## 28. Linha de cronometragem e entidade propria

Partida e chegada nao sao obstaculo: nao tem altura, nao recebem numero de
percurso e nao entram na tabela de alturas. Compartilham o sistema local e
o paraflanco, entao a seta continua perpendicular por construcao.

## 29. O comprimento e do tracado desenhado

Cubica nao tem comprimento em forma fechada. `cubicLength` usa subdivisao
adaptativa: enquanto o poligono de controle e a corda discordarem mais que
a tolerancia, parte a curva ao meio — e DIVIDE a tolerancia a cada nivel,
para o erro total continuar limitado. Padrao de 0,1 mm, verificado contra
integracao por forca bruta com 200 mil passos.

`flattenPath` NAO serve para medir: a tolerancia dela vale por segmento e
o desvio se acumula, entao a poligonal subestima o arco. Ela existe para
teste de clique e, na fase 9, para procurar interferencia.

Trecho sem alca vira cubica degenerada com os controles sobre as pontas —
o comprimento sai exato, sem aproximacao, no caso mais comum de todos.

## 30. Alca espelhada nao e arredondada

Posicoes digitadas pelo usuario sao arredondadas ao milimetro. A alca
oposta de um no liso, nao: ela e derivada, e arredonda-la quebraria a
colinearidade — ou seja, deixaria um bico de 0,0001 rad num no que o
desenhador pediu liso. Quem e calculado guarda precisao cheia.

A alca tambem nao usa snap ao ser arrastada: ela molda a curva, e alinhar
ao grid daria saltos justamente onde se quer ajuste fino.

## 31. Tracado nasce curvo, com um numero so

Duas escolhas vindas do uso real, nao do plano.

Clicar ponto a ponto produzia uma poligonal angulosa — "bebada". Ao
concluir, os nos ganham tangentes coerentes com os vizinhos (Catmull-Rom
em forma de Bezier) e viram curva continua, SEM sair do lugar. O botao
"Suavizar" faz o mesmo depois, e "Endireitar" desfaz. Ha a opcao Reto para
quem quer segmentos.

Distancia: um numero por LINHA, no meio do percurso medido em comprimento
— como no croqui impresso, onde o que interessa e a distancia entre dois
obstaculos. Um numero por trecho so faz sentido em tracado de poucos nos,
e vira poluicao quando a curva foi feita com muitos cliques. Os dois modos
continuam disponiveis.

## 32. Cenario e percurso sao escopos separados

Todo objeto declara a que parte pertence: `pista` (contorno, imagem de
referencia, arvores, fixos do local) ou `percurso` (obstaculos, tracados,
cronometragem, textos).

O editor tem um modo ativo, e SO o escopo ativo recebe clique — o resto
fica esmaecido e intocavel. Nasceu de uma dificuldade real de operacao: a
pista cobre toda a area de trabalho, entao qualquer clique no vazio pegava
o fundo em vez do obstaculo que se queria. Nao ha como resolver isso so
com ordem de empilhamento; e uma questao de intencao, e intencao precisa
ser declarada.

A barra lateral tambem filtra por modo, e trocar de modo limpa a selecao:
manter selecionado o que deixou de ser selecionavel confunde mais do que
ajuda.

## 33. Repositorio de pistas

O cenario de um local pode ser guardado e reaplicado em outra prova.
Aplicar TROCA o cenario e PRESERVA o percurso — e para isso que os escopos
existem. Os ids sao renovados na aplicacao, entao o mesmo modelo pode ser
usado duas vezes sem colidir.

Guarda em dois lugares, de proposito: `localStorage` para reuso rapido na
maquina, e arquivo `.pista` para levar embora. A cota do localStorage gira
em torno de 5 MB e uma imagem de satelite estoura sozinha, entao a
gravacao avisa e oferece a exportacao em arquivo, em vez de falhar calada.

---

## Ordem das fases

Três ajustes em relação ao plano original, para reduzir retrabalho:

- **Escala antes do editor** — construir em pixels e converter depois
  obrigaria a reescrever o núcleo de coordenadas.
- **Spike de PDF na fase 2** — o maior risco do projeto precisa ser
  validado com 800 linhas, não com 8.000.
- **Persistência na fase 4** — cada fase seguinte já nasce serializável e
  testada como tal.

## Fora do MVP

Multi-página; editor de símbolos customizados; exportação DXF/SVG/PNG;
templates; camadas do usuário; numeração automática pela ordem do traçado;
tabela automática de distâncias; agrupamento; Electron/Tauri; i18n; modo
escuro. A arquitetura preserva o caminho de volta para todos.

## 34. Barra superior em menus

Novo, Abrir, Salvar, Salvar como, Exportar PDF e Imprimir viraram o menu
Arquivo; grid, snap, limites da página e enquadramentos viraram o menu
Exibir. Continuam em botão apenas os comandos de uso contínuo: desfazer,
modo Pista/Percurso, seleção e zoom.

O critério é esse: comando frequente o bastante para precisar de nome, mas
raro o bastante para não merecer espaço permanente, é caso de menu. O menu
ainda ensina os atalhos, que antes existiam sem ninguém poder descobrir.

O nome do arquivo ficou por último e encolhe com reticências. Com barra de
rolagem, quem sumia da tela era comando, e sumia sem aviso; o nome é
informação, então é ele quem cede espaço.

## 35. Traçado do cavaleiro: geometria, não aprendizado

O assistente de traçado desenha a linha que um cavaleiro faria. A tentação
seria aprender o estilo de croquis existentes; a escolha foi outra, porque
a linha do cavaleiro obedece a regras físicas e não a estilo: chega
perpendicular e centrado no obstáculo, com reta antes e depois, e liga um
salto ao outro com a curva de maior raio que couber.

Isso é exatamente o caminho de Dubins — o mais curto entre duas poses com
raio mínimo de curva —, que tem solução fechada e exata. Não há
treinamento, não há modelo estatístico, não há dependência nova, e o
resultado é reprodutível: o mesmo percurso dá sempre o mesmo traçado. O
§44 proíbe IA no produto, e aqui ela não faria falta nenhuma.

Croquis reais entram como CALIBRAÇÃO (quanto de reta, que raio, que
margem até o alambrado) e como verificação: rodar o assistente sobre um
percurso de distância total conhecida e comparar os números.

Duas decisões internas que sustentam o resto:

- `dubinsPaths` devolve TODOS os candidatos ordenados, não só o mais
  curto. O mais curto pode sair da pista ou passar por cima de outro
  obstáculo, e quem sabe disso é o assistente, não a geometria.
- Candidato só entra na lista depois de a geometria ser remontada e
  medida. As fórmulas fechadas têm casos degenerados — uma reta de
  comprimento zero faz um `atan2(0, 0)` decidir no ruído —, e conferir o
  destino é mais barato e mais seguro que confiar na álgebra.

O caminho vira traçado NORMAL, de nós e alças editáveis: arco em pedaços
de 45 graus, cada um uma cúbica, com desvio medido de 0,09 mm no terreno.
Não é um objeto especial e não é caixa-preta — quem não gostou de uma
volta arrasta o nó, e a distância recalcula.

## 36. Duas formas de volta, um juiz só

O primeiro assistente ligava as poses pelo caminho mais curto de raio
mínimo (Dubins). Na pista de verdade o croqui saiu cheio de LAÇADAS.

O diagnóstico, medido e não suposto: para a volta do obstáculo 1 ao 2 de
um percurso real, TODOS os caminhos possíveis giravam 330 graus ou mais.
Não era escolha ruim entre opções boas — não havia opção boa. Exigir reta
perpendicular de tamanho fixo nas duas pontas E raio mínimo entre elas é
restritivo demais: quando dois saltos não estão bem alinhados, que é o
caso quase sempre, a geometria só sabe responder com laçada.

A cúbica de Hermite resolve o outro extremo: sai na direção do salto,
chega na direção do próximo, e nunca laça. Mas numa volta grande ela
responde com um BICO, porque não gira tanto sem se dobrar.

Nenhuma das duas serve sozinha, e as duas juntas servem. Os dois
geradores convivem e um juiz só decide, pelo mesmo critério: cabe na
pista, não atropela obstáculo, e o ponto mais fechado ainda se galopa —
vence quem tem menos problema e, no empate, a curva mais ampla. Na
prática a cúbica ganha as voltas mansas e o arco-reta-arco as grandes.

Duas correções que vieram do mesmo teste:

- As retas se atropelavam. Partida e obstáculo 1 costumam distar menos de
  16 m; com 8 m de reta de cada lado, o ponto de chegada nascia ATRÁS do
  de partida, e voltar com raio mínimo exige uma volta completa. Cada vão
  agora dá no máximo um terço de si para cada reta.
- O raio tem teto no vão. Curva de 11 m não cabe em 10 m de vão, e a
  geometria responde com laçada em vez de admitir que não cabe.

Aprendizado de método, não de código: os testes unitários diziam
"chegou no destino", e as laçadas chegavam ao destino. Faltava medir a
FORMA — giro total e raio mínimo. São essas duas medidas que hoje
reprovam a laçada e o bico.

## 37. O juiz aprendeu a enxergar troca de mão

Reclamação da prova real: "do 2 para o 3 ficou com uma ligeira inflexão à
esquerda desnecessária antes da curva propriamente dita à direita".

Cavaleiro que vai virar à direita não começa torcendo à esquerda. A
cúbica produz essa inversão sozinha quando as tangentes puxam demais, e
nenhuma das medidas que o juiz tinha — comprimento, raio mínimo, cabe na
pista — enxergava o defeito. Agora conta-se a troca de mão, e ela entra
no critério.

Três armadilhas apareceram ao ajustar isso, todas por medir:

- Pôr a inflexão antes do raio elegeu o BICO, que tecnicamente não troca
  de mão porque inverte passando pelo zero. A ordem certa separa antes o
  que dá para galopar: entre as galopáveis vence a que troca menos de
  mão; entre as ingalopáveis, o aperto é que manda.
- Uma curva que sobe e volta pela MESMA reta era medida como reta
  perfeita, curvatura zero em todo ponto. É o pior traçado possível e
  passava limpo. Agora a inversão de sentido é detectada.
- Faltava o limite físico: entre duas poses que diferem de Δ, nenhuma
  curva tem raio maior que vão / (2·sen(Δ/2)). Sem ele, poses quase
  coladas e opostas passavam como impecáveis, porque a medição ponto a
  ponto de um trecho degenerado não acusa nada.

E uma liberdade nova, que é o que o cavaleiro realmente faz: ceder reta
para ganhar curva. Virar 70 graus em 11 m entre duas retas de 8 m não
cabe; encurtando as retas, cabe. Reta demais com curva impossível é pior
que reta menor com curva galopável — mas nunca abaixo do mínimo, senão o
cavalo chega torto no salto.

## 38. Anotações: dois sistemas de coordenadas, de propósito

O texto livre mora em METROS do terreno; o quadro técnico e a tabela de
alturas moram em MILÍMETROS de papel.

Não é inconsistência, é a diferença entre o que cada um nomeia. O texto
aponta um lugar da pista ("entrada", "aquecimento") e tem que andar junto
quando a escala muda. O quadro é cabeçalho da folha: passar o croqui de
1:200 para 1:500 encolhe a pista e não pode encolher a letra do quadro
nem tirá-lo do canto onde foi posto. Os dois modelos já previam isso
desde a fase 0, e o `transform` já sabia converter.

A tabela de alturas NÃO guarda alturas próprias: lê os obstáculos do
documento. É o que impede o erro clássico de manter duas fontes — o
croqui imprimindo uma altura que o desenho não tem. Mudou a vara, mudou a
tabela.

O leiaute dos dois vive no núcleo, e não no componente de desenho, porque
tem dois consumidores: o desenho e a SELEÇÃO. Antes disso a envoltória
era estimada (uma conta de "mais ou menos 5 mm por linha") e mentia sobre
o que estava desenhado — clicar acertava o vazio e errava a letra. Uma
conta só, dois consumidores, como já vale para o desenho de tela e papel.

O quadro traz um "preencher do desenho" que escreve distância, número de
obstáculos e de esforços. São justamente os três campos que ficam errados
quando digitados à mão e o percurso muda depois. Preenche só quando
pedido: o §44 proíbe validação esportiva, e sobrescrever o que o
desenhador digitou seria pior que deixar em branco.

Verificado com PDF real, não presumido: os textos saem como TEXTO
selecionável, e os acentos e o ordinal (Distância, Esforços, Nº)
sobrevivem à conversão — a armadilha que já tinha mordido nas fases
anteriores com travessão e sinal de menos.

## 39. A folha: escala declarada e espaço negociado

Duas coisas fechavam a fase 12.

**A escala impressa.** Croqui sem escala declarada não se confere com
régua, e quem recebe a folha de outra pessoa pergunta isso primeiro. Vai
o "1:250" escrito E a barra gráfica, porque as duas resolvem problemas
diferentes: o número diz o que o milímetro vale, e a barra continua certa
mesmo quando a folha é fotocopiada com redução — situação em que o número
escrito passa a mentir. A barra procura um comprimento redondo (10, 20,
25, 50 ou 100 m) que dê entre 2 e 6 cm de papel: barra em número quebrado
não se lê.

**O ajuste ao papel.** Antes reservava 25% da altura "para o cabeçalho",
sempre, houvesse quadro ou não — demais quando a folha estava limpa, de
menos quando havia uma tabela comprida. Agora mede-se a área realmente
livre.

A regra é a invasão por borda, e o detalhe que a fez funcionar custou uma
falha de teste: uma anotação no canto superior esquerdo invade pela
esquerda E pelo topo, e a primeira versão escolhia sempre a primeira que
testava. O certo é o lado de MENOR invasão, que é o lado a que ela está
encostada — é o que separa uma faixa larga e baixa, que é cabeçalho e
custa só a sua altura, de uma caixa alta e estreita, que é lateral e
custa só a sua largura. Descontar pelo lado errado jogava fora meia
folha.

Consequência boa e não planejada: a tabela de alturas muda de papel
sozinha conforme cresce. Vazia é baixa e larga, e desconta como
cabeçalho; com doze obstáculos vira alta e estreita, e passa a descontar
como lateral.

Anotação no meio da folha não desconta nada: quem a pôs ali quis que
ficasse sobre o desenho.

O PDF também ganhou ficha (título, assunto com a escala, criador). Croqui
circula por e-mail e acaba numa pasta com dezenas de outros; sem isso ele
aparece como "Untitled" na lista do leitor.

## 40. O traçado ideal obriga o programa, não o desenhador

Regra do ofício, dita pelo desenhador: **a linha passa pelo CENTRO do
obstáculo, a 90 graus, 100% das vezes. O croqui é o traçado ideal, não o
traçado mais rápido.**

E a delimitação que veio junto, e que muda tudo: *"se o desenhador
desenhar à mão, o programa aceita. O que não pode é o programa ser
programado para desenhar errado."*

A regra obriga o PROGRAMA. Quem desenha à mão desenha como quiser.

Errei duas vezes seguidas nisso, em direções opostas. Primeiro modelei
tolerância de cavaleiro — até 40 graus de desvio, passagem a meia vara do
centro — como se o croqui registrasse o que um cavalo fez; não registra,
declara o que ele deve fazer. Depois, corrigindo, passei a ACUSAR salto
fora do centro e fora do esquadro no desenho manual, e aí o programa
estava opinando sobre desenho alheio. Os dois avisos foram removidos.

Então a regra vive dos dois lados, cada um no seu lugar:

- Do lado do PROGRAMA, é teste: o traçado gerado pelo assistente cruza
  todo obstáculo a menos de 1 mm do centro e menos de 0,01 grau do
  esquadro. Um segundo teste fecha o círculo — percurso traçado pelo
  assistente não se acusa na detecção.
- Do lado do DESENHO, é silêncio: linha manual fora do centro ou torta
  passa sem comentário.

A detecção acusa corpo no caminho, e só: obstáculo por cima de obstáculo,
obstáculo fora da pista, e linha atravessando um obstáculo que não está
saltando. Cruzar na faixa do paraflanco conta como estorvo, porque ali é
bater no pilar, não saltar. Passado 45 graus de desvio, o cruzamento
deixa de ser salto e vira travessia no comprimento — o caso extremo, uma
linha deitada sobre a vara, mede 90 graus e precisa do nome certo.

O aviso vive no OVERLAY e nunca sai no PDF nem na impressão: alerta
impresso viraria erro na folha entregue à comissão. Verificado no SVG do
papel, que é o mesmo que alimenta PDF e impressora.

### O bug que a regra desenterrou

Exigir a linha ideal do programa achou um defeito real que nenhum teste
anterior pegava: um nó do traçado gerado caía a 21 cm do centro do
obstáculo, com a reta do salto empurrada para além da vara.

A causa: a volta pode ceder parte da reta para caber a curva, e o limite
dessa cessão era calculado contra os 8 m NOMINAIS, não contra a reta que
aquele salto realmente tinha. Ceder 6 m de uma reta de 1,5 m atravessa o
obstáculo.

O conserto criou outro defeito na hora, e vale registrar: passando a
respeitar o mínimo de reta, uma reta já curta não tinha opção de cessão
NENHUMA, e a volta ficava sem solução — trecho inteiro sumia do traçado.
Ceder zero precisa ser sempre uma opção.

## 41. Curva para trás

Conceito do ofício que faltava no modelo, e que uma prova real expôs: no
percurso do desenhador, o obstáculo 6 fica logo ao lado do 5 e virado
para outra direção. Entre a saída de um e a entrada do outro sobram menos
de 4 m, com 90 graus de diferença. Não existe ligação curta possível, e a
volta que o assistente desenhava ali era impossível de galopar.

A saída do cavaleiro é a CURVA PARA TRÁS: seguir em frente depois do
salto, dar a volta por fora e voltar numa aproximação bem mais longa.

O programa tinha perdido a capacidade de fazer isso. O solucionador só
sabia ENCURTAR a reta para caber a curva; alongá-la, que é o que cria o
espaço da volta, não era opção. Agora a reta mexe nos dois sentidos:
negativo cede, positivo afasta o ponto do obstáculo.

E havia uma proibição que atrapalhava junto. Para caçar as laçadas de uma
versão anterior eu tinha posto um teto de 270 graus de giro — e a curva
para trás gira mais que isso por definição. O teto proibia a única volta
possível.

O que separa a laçada da curva para trás não é o tamanho do giro: é a
NECESSIDADE. Então o teto virou generoso (420 graus, só para barrar
absurdo) e quem decide passou a ser o custo: giro total mais uma taxa de
90 graus por troca de mão. A laçada aparecia onde havia opção mansa e
perde no custo; a curva para trás só aparece quando não havia nenhuma, e
ganha por falta de concorrente. Uma medida resolve os dois casos sem
proibir nenhum.

Dois ajustes que a medição exigiu:

- O custo é comparado em degraus de 5 graus. No valor cru, meio grau
  decidia antes da amplitude e TODA volta caía no raio de aperto — uma
  curva de raio 6 gira um tiquinho menos que a mesma de raio 11 e ganhava
  por isso. Com o degrau, o empate devolve a decisão à curva mais ampla.
- Alongar os dois lados em medidas diferentes quase nunca ajuda e
  multiplicava a busca: o percurso inteiro levava 1,6 s. Alongando só de
  um lado por vez, mais dois simétricos, caiu para 0,69 s com o mesmo
  resultado.

No percurso da prova real: 8 voltas, nenhum problema, e o 5 para o 6
resolvido com 30 m de reta a mais e uma volta de 251 graus.

## 42. A volta por fora é recurso, não alternativa

A primeira versão da curva para trás virou caos no percurso real: laçadas
por toda parte, linhas se cruzando, o croqui ilegível.

A causa foi trocar uma proibição rígida (teto de giro) por uma comparação
GLOBAL de custo. Com isso a volta por fora passou a disputar de igual
para igual com a linha direta, e ganhava sempre que a direta ficava um
pouco apertada — não só quando era impossível.

A ordem do ofício não é uma comparação, é uma escala de recurso:

1. Volta direta MANSA — até 200 graus de giro, galopável e limpa. Se
   existir, é ela. Cavaleiro não dá a volta por fora quando dá para ir
   direto.
2. Curva para trás, quando a direta mansa não existe.
3. Volta direta com giro grande, em último caso.

A busca ficou em estágios, nessa ordem, em vez de um balcão único. O
degrau dos 200 graus é o que faltava: sem ele, uma laçada de 350 graus
passava como "direta, limpa e galopável" e era aceita, quando a volta por
fora teria resolvido com elegância.

De quebra, a busca em estágios é mais rápida — quase sempre para no
primeiro. O percurso inteiro caiu de 1,6 s para meio segundo.

O relatório passou a nomear as voltas feitas por fora. Curva para trás é
decisão visível: o desenhador precisa saber que ali a linha sai e volta de
propósito, e não por defeito do assistente.

## 43. A cruzada de tempo não se larga: coloca-se

Regra do ofício: entre a partida e o primeiro obstáculo, e entre o último
e a chegada, NUNCA existe volta. O cavalo cruza a partida já apontado
para o primeiro salto, e segue reto do último para a chegada.

Enquanto a cruzada podia ser largada em qualquer ponto da pista com um
clique, o assistente tinha de inventar uma ligação entre ela e o
obstáculo — e inventava, com laçada e tudo. O aviso da prova real
denunciou exatamente isso: "partida para 1" e "7 para chegada" listadas
como curvas para trás.

Consertar o solucionador seria remendo. O erro estava um passo antes: a
cruzada não é um objeto que se posiciona livremente, é uma consequência
do percurso.

Agora se escolhe a DISTÂNCIA, entre 9 e 15 m, e o resto sai por
construção: a cruzada fica no eixo do salto, paralela à face, com os
centros coincidindo — as duas unidas por uma reta perpendicular aos seus
comprimentos. A partida atrás do primeiro obstáculo, a chegada à frente
do último, e a seta acompanhando a do salto.

Uma de cada por percurso: recolocar substitui, em vez de empilhar.

E o assistente ganhou a garantia correspondente: perna que toca uma
cruzada de tempo é RETA, sem procurar curva nenhuma. Não é otimização, é
a regra — procurar curva ali era o defeito.

Efeito colateral bom: os testes que largavam a cruzada num ponto
arbitrário passaram a acusar bico na emenda, porque agora a reta é
imposta. Estavam modelando um percurso que o programa não constrói mais.

## 44. A cruzada segue o obstáculo

Quatro afinações da regra 43, todas do desenhador:

**Cada cruzada tem a sua distância.** Partida e chegada não precisam ficar
à mesma distância dos seus obstáculos, e agora cada uma guarda a sua. O
campo da barra lateral é só o padrão da inserção; depois de colocada,
cada linha se ajusta no próprio painel.

**Décimo de metro.** O passo era de meio metro, que é grosso demais para
um número que sai impresso.

**A medida é da VARA, não do centro.** Da partida até a vara de entrada,
e da vara de saída até a chegada. Num vertical dá no mesmo; num oxer de
1,50 m a diferença é de 75 cm de cada lado. Medido no programa: com a
distância em 12 m, a cruzada fica a 12,75 m do centro do oxer — 12,00 m
da vara, que é o número que o desenhador pediu.

**A cruzada acompanha o obstáculo.** Esta foi a que mexeu no modelo: a
linha passou a guardar o VÍNCULO (a que obstáculo pertence e a que
distância), e não só a posição. Mover ou girar o obstáculo 1 recoloca a
partida sozinha.

A invariante é garantida num lugar só — depois de qualquer alteração do
documento, no `apply` da loja. Não em cada comando que move obstáculo: são
oito caminhos diferentes (mover, girar, colar, duplicar, desfazer,
refazer, aplicar modelo de pista, arrastar no canvas) e bastaria esquecer
um para a regra de "nunca há volta na cronometragem" se perder em
silêncio. Invariante que depende de lembrança não é invariante.

Cruzada cujo obstáculo foi apagado perde o vínculo e fica onde está.
Apagar a linha junto seria decidir pelo desenhador.

## 45. Vínculo não pode ser opcional em silêncio

O desenhador moveu o primeiro e o último obstáculo, e as cruzadas não
acompanharam — apesar de o mecanismo estar certo e testado.

O motivo: as linhas dele tinham sido colocadas ANTES de a cruzada
aprender a seguir, e por isso não tinham vínculo. Na tela ficavam
idênticas às vinculadas. Uma armadilha silenciosa, e culpa da decisão
anterior: eu tinha resolvido que migração não vincularia sozinha, "para
não adivinhar".

Só que aqui não há o que adivinhar. A partida pertence ao primeiro
obstáculo e a chegada ao último — é a definição, não uma inferência.

Então a cruzada sem vínculo é ADOTADA na sincronização, com a distância
que ela já tinha, trazida para dentro dos 9 a 15 m. Conserta sozinho o
croqui antigo e fecha a armadilha: não existe mais cruzada que parece
igual e não anda.

Fica solta só quando não há obstáculo numerado, porque aí não há a quem
pertencer.

Segunda correção, de uso: a distância ganhou um controle deslizante. O
campo numérico só confirma no Enter ou ao sair, e o desenhador quer
PROCURAR a distância olhando o croqui, não digitar um número e conferir
depois. Arrastar move a linha a cada décimo, e o arrasto inteiro entra no
histórico como um gesto só.

## 46. Composto e linha reta

Ferramenta para montar duplo, triplo e linha reta: selecionam-se 2 ou 3
obstáculos, digita-se a distância de cada vão, e os elementos se ajustam
no croqui na hora.

O cerne é a MEDIDA. A distância entre dois saltos não é de centro a
centro: é da vara de saída do anterior até a vara de entrada do seguinte,
que é o vão que o cavalo galopa e o número que vai para o croqui. Medido
no programa, com oxer nas duas pontas: vãos de 7,60 e 10,90 m saem com
8,35 e 11,65 m entre os centros — a meia largura do oxer em cada ponta.
Errar isso é errar quase uma passada inteira.

A ordem é a da NUMERAÇÃO do percurso: 1, 2, 3a, 3b, 4, 5a, 5b, 5c. A
primeira versão ordenava pela projeção no eixo do salto, o que dava na
mesma quando os elementos já estavam em linha — e dava resultado confuso
justamente quando não estavam, que é quando a ferramenta é usada. Um
campo rotulado "5b - 5a" não quer dizer nada. Sem número, aí sim vale a
geometria: não há numeração a respeitar.

Digitar a distância JÁ aplica. O painel não guarda rascunho: os campos
mostram o que o documento tem, e mudar um deles move os obstáculos. Um
rascunho interno criaria duas verdades, e a do painel ficaria velha assim
que alguém arrastasse um obstáculo.

Duas decisões de comportamento:

- O PRIMEIRO elemento não se move. Alinhar acerta os outros em relação a
  ele. Se todos se movessem, cada ajuste arrastaria a combinação pela
  pista e o desenhador perderia o lugar que escolheu.
- O botão "Endireitar" põe em linha sem mudar distância, para o caso de
  os números já estarem certos e a inclinação não.

O vão pode ser negativo, e isso é informação: quer dizer que os corpos
estão sobrepostos, ou que a numeração contradiz a posição no terreno. A
ferramenta mostra o número em vez de esconder.

## 47. A calibração respondeu outra pergunta

Montei a calibração do assistente contra croqui oficial: transcrever um
percurso de distância conhecida, rodar o assistente e varrer os
parâmetros até bater. Começou pelo FEI World Challenge 2020 (pista 65x45,
420 m impressos), que é o croqui de grade mais limpa.

Primeiro acerto do método: o croqui imprime algumas distâncias entre
obstáculos, e usá-las para CONFERIR a transcrição pegou três posições
minhas erradas antes de qualquer calibração — uma delas por 3,5 m. Onde o
croqui declara o número, o número manda; leitura de pixel só onde não há
alternativa.

Depois disso, três medidas, e nenhuma foi a esperada:

**O assistente dá 587 m contra 420 oficiais: 40% a mais.**

**Nenhum parâmetro conserta.** Das 240 combinações varridas, a melhor
ainda dá 523 m, 24% acima. Variar reta, raio, aperto e margem move o
total entre 569 e 618 m — cinco por cento de amplitude para explicar um
erro de quarenta.

**E o ruído da minha leitura é do tamanho do erro.** Sacudindo as
inclinações em apenas 5 graus, que é menos do que se erra lendo uma
imagem, o total varia 156 m. O erro a explicar é 167 m.

A conclusão que importa: calibrar parâmetros contra croqui lido a olho
não conclui nada, porque o ruído do método é do tamanho do sinal. Insistir
seria fingir precisão.

Mas sobrou um sinal robusto, e é ele que vale: mesmo a amostra mais
favorável do ruído dá 562 m, 34% acima. O excesso não vem da leitura, vem
do MODELO. E o relatório por perna mostra onde: giros de 287, 356 e 399
graus, e uma volta com raio de 0,1 m, que é um bico aceito como solução.
Percurso real não tem volta de 400 graus.

Então o próximo passo não é ajustar parâmetro, é reduzir giro — e a
medida que guia isso é o GIRO POR PERNA, que eu já tenho, e não a
distância total, que eu não consigo medir com precisão.

Erro de ordem que vale registrar: eu devia ter medido o ruído do método
ANTES de construir a varredura de 240 combinações. Varri parâmetros com
uma régua que não tinha resolução para a pergunta.

## 48. O assistente gera; o desenhador escolhe

A calibração deixou o assistente automático num impasse: ele erra 40% na
distância de uma prova real, nenhum parâmetro conserta, e desenhar à mão
sai irregular mesmo suavizando. O desenhador precisava de algo que
funcionasse já.

A saída veio dele, e é melhor que a minha: o assistente não sabe
ESCOLHER, mas sabe GERAR. Então o percurso é percorrido pernada a
pernada, e onde há mais de uma forma de fazer, as formas são apresentadas
e quem decide é quem assina o croqui.

Isso contorna o impasse pela raiz. A escolha automática é um palpite meu
sobre o que um cavaleiro faria; a escolha à mão é conhecimento de ofício.
E onde só existe uma forma — reta absoluta, cruzada de tempo — não há o
que perguntar, e não se pergunta.

O trabalho técnico foi PODAR. A busca produz centenas de candidatos,
quase todos o mesmo desenho com meio grau de diferença. Três regras
reduzem isso a no máximo seis opções de verdade:

- Havendo caminho limpo, caminho com problema não é opção — é o mesmo
  trajeto com um defeito.
- Caminho que gira meia volta a mais que o melhor não é outra maneira de
  fazer a pernada, é um desvio. Numa reta absoluta, sem esta regra, vinham
  seis "opções", cinco delas voltas por fora desnecessárias.
- O que resta se agrupa pela FORMA: para que lado vira primeiro, quantas
  vezes troca de mão, e quanto gira em degraus de 45 graus. De cada grupo
  fica o melhor exemplar.

O preparo do percurso — degraus, poses, retas — passou a ser função
própria, com dois consumidores: o assistente automático e o guiado. Os
dois partem exatamente das mesmas pontas, senão a linha escolhida à mão
não encaixaria nas retas dos saltos.

A escolha se faz olhando a LINHA, não a lista: as opções aparecem no
desenho, a escolhida forte e as outras finas, e clicar na linha escolhe.
Os números (giro, raio, comprimento) estão no painel para conferir, não
para decidir.

O rascunho vive no editor, não no documento: some ao sair, e nada vai
para o arquivo até aplicar.


## 49. Limites do traçado, ditos pelo desenhador

Depois de estudar 16 croquis reais (FEI, CCI, Copa do Mundo, provas
nacionais), o desenhador fixou os limites. São dele, não da calibração:

- **Raio mínimo de 5 m** (10 m de diâmetro), e ele é PISO: volta abaixo
  disso não é entregue como solução. Raio preferido continua 11 m. O
  primeiro número dito foi 8 m; era o diâmetro confundido com o raio, e
  foi corrigido no mesmo dia.
- **Giro até 300 graus por pernada.** Voltas de 200 a 270 graus são
  desenho de percurso — muitas vezes o percurso é pensado nelas —, e
  entre saltos próximos e quase perpendiculares a de 270 é a saída.
  Acima de 300 praticamente não existe.
- **Folga da cerca: 1 m** basta quando é preciso encostar.
- **Partida e chegada entre 6 e 15 m** do primeiro e do último
  obstáculo (era 9 a 15).
- **Composto entre 7 e 12 m** de vara a vara, com um ou dois galopes à
  escolha do desenhador. Linha entre números diferentes é livre: não há
  regra para linhas de mais de dois galopes.
- **Cruzamento sempre a 90 graus**, como já era (decisão 40).
- **Valor único.** O programa não sabe se a prova é indoor ou outdoor, a
  altura nem o piso. O motor só precisa fazer traçados exequíveis.

O limite do composto é regra esportiva aplicada pelo programa, o que o
§44 evita. É exceção deliberada, pedida pelo desenhador, e fica só no
campo da ferramenta de composto.

Três consequências no juiz das voltas:

1. **Galopável vem antes de tudo.** O juiz punha "sai da pista" e "passa
   por obstáculo" à frente do raio, e por isso um bico de 0,1 m limpo
   ganhava de qualquer volta de verdade que encostasse na cerca. Agora
   volta abaixo de 5 m só aparece quando não existe nenhuma galopável.
2. **Acima de 300 graus a volta é marcada, não descartada.** Entre dois
   saltos lado a lado no mesmo sentido, a única volta galopável gira 360
   graus; descartá-la deixava o bico como única resposta. Ela é desenhada
   e denunciada ("a volta gira mais de 300 graus").
3. **A direta até 270 graus é aceita** antes de tentar a volta por fora
   (era 200). Com 200, o assistente trocava uma direta limpa de 240 por
   uma volta por fora de 285.

No traçado por trechos, a lista de opções perdeu as curvas abaixo de 5 m
e as laçadas de 450 graus que vinham junto quando não havia caminho
limpo.

A bancada de calibração passou de 587 m para 714 m, contra 420 m
oficiais. Não é regressão: três pernadas da transcrição (3-4, 6-7, 9-10)
pedem voltas de 330 a 356 graus com as posições lidas, e antes eram
"resolvidas" com bicos. Isso reforça a decisão 47: com a transcrição a
olho, cuja leitura das inclinações sozinha move o total em 156 m, a
bancada não serve de gabarito.

## 50. Volta redonda, não esquina

O desenhador apontou, num traçado do assistente, quebras de quase 90
graus que não se galopam: de um salto ao seguinte a linha andava reta,
virava de uma vez e seguia reta de novo.

Não era emenda mal feita — a direção da linha é contínua em todos os
nós. Era a FORMA escolhida. Nas três pernadas apontadas havia uma curva
contínua melhor (raio mínimo de 19,7 m contra um arco de 11 m; 9,1 m
contra 5,7 m; 15,1 m contra um arco de 11 entre retas), e ela perdia
porque o juiz só olhava giro, em degraus de 5 graus, e depois raio:
dois graus a mais de giro bastavam para perder.

O que o olho lê como quebra é a curvatura saltando de zero ao máximo de
uma vez, que é o que o arco-reta-arco faz nas pontas do arco. Na curva
contínua ela cresce e diminui aos poucos, como o cavalo vira.

O custo do juiz ganhou duas taxas de redondeza:

- **Quebra:** o arco-reta-arco paga 20 graus.
- **Aperto:** toda volta abaixo do raio preferido paga 30 graus por
  raio preferido inteiro de diferença.

O arco-reta-arco continua ganhando onde é insubstituível — voltas por
fora e meias-voltas —, porque ali a curva contínua bica e sai do páreo.

**Aprendizado de método.** Os croquis reais que o desenhador manda são
para observar e ajustar o mecanismo, não para transcrever e comparar
distância com o oficial. A transcrição a olho do World Challenge saiu
muito diferente do original; comparar totais em cima dela mediria o erro
de leitura. A validação do motor é o desenho — onde quebra, onde aperta —
e os testes de geometria.

## 51. A volta grande usa o espaço

O desenhador apontou a meia-volta do 3 para o 4 em Normandia: no croqui
original ela é uma volta só, ampla e redonda, que sobe pela lateral e
vira no alto. O assistente fazia arco apertado, reta diagonal cortando a
pista e outro arco.

Três causas, três mudanças:

- **O raio nunca passava de 11 m.** Agora se tentam 16,5 e 13,75 antes
  do preferido. Onde a volta larga não cabe, a pista a recusa.
- **A curva contínua não fazia volta grande.** A cúbica única bica acima
  de uns 180 graus, e só sobrava o arco-reta-arco. Agora cada rota em
  arcos ganha uma versão ARREDONDADA: poses tiradas ao longo dela, a cada
  60 graus de giro, ligadas por cúbicas de arco. A rota é a mesma; a
  curvatura deixa de saltar na junta da reta com o arco.
- **Alongar a reta era sempre "volta por fora".** A volta do original
  alonga a aproximação do 4 para virar no alto, sem girar mais. Uma volta
  que alonga reta mas não gira mais de 10 graus além da direta agora
  concorre com ela no mesmo balcão; a volta por fora que gira MAIS
  continua sendo recurso de último caso.

Para a volta larga não ganhar à toa, cada metro de reta alongada custa
meio grau. Sem isso, no empate de custo o desempate pelo raio levava toda
volta ao maior raio possível, e a linha encostava na cerca por nada.

Na bancada, os compostos passaram a ser endireitados com a ferramenta de
composto ao montar o percurso — como o desenhador faz no editor. Lidos a
olho, os elementos saíam tortos e a linha zigue-zagueava dentro do 8abc.

## 52. Três zonas, cada uma com um papel

A interface cresceu fase a fase e virou uma coleção de botões: o painel
da direita empilhava folha, margens, escala, grade e interferências o
tempo todo, e o que importava ficava no fundo; a barra da esquerda
misturava ferramenta, ação imediata e processo com a mesma cara; havia
comando repetido ("Ajustar" e "Ajustar à página").

A reorganização separa por FREQUÊNCIA e por PAPEL:

- **Em cima, o arquivo e a vista.** Menus Arquivo, Editar, Inserir,
  Exibir e Ajuda; desfazer; o modo Pista/Percurso; o botão **Folha**
  (formato, escala, margens, legenda), que mostra a escala no próprio
  rótulo; e um controle de zoom só.
- **À esquerda, só ferramentas de desenhar**, cada uma com uma tecla
  (V, H, O, T, X). O que tem variantes abre ao lado. Assistente e Por
  trechos viraram modos da ferramenta Traçado (À mão, Por trechos,
  Automático).
- **À direita, só o que está selecionado.** Sem seleção, um resumo da
  prova. No obstáculo, ficam abertos número, tipo, alturas e direção do
  salto; suporte, varas, liverpool e rótulos ficam em "Aparência",
  recolhida. As explicações dos campos só aparecem no "?".
- **Embaixo, o estado das ajudas de desenho**: Grade, Ímã e
  Interferências são botões que mostram o estado e abrem os ajustes.

Partida e chegada saíram da barra, com a caixa de distância. Colocam-se
QUANDO PEDIDAS — menu Inserir, resumo da prova ou painel do primeiro e
do último obstáculo —, nunca sozinhas. A distância, padrão 12 m, se
ajusta no painel da própria linha.

"Snap" virou **Ímã** e "Grid" virou **Grade**, por escolha do desenhador.

## 53. Identidade visual do SAPH

O Percurso adotou o tema claro do SAPH: fundo de papel quente, dourado
como cor de ação (botão primário com texto escuro), seleção dourada,
rótulos em maiúsculas pequenas e a fonte Bahnschrift. As cores de
interface viraram tokens em `:root`.

A barra de cima começou preta, como a navegação do SAPH, e o desenhador
recusou: pesava sobre o desenho. Ficou clara, no mesmo bege das réguas,
com o dourado só nos destaques. Todo texto da interface passa de 5:1 de
contraste (o mínimo de leitura é 4,5:1): por isso o dourado e o verde e
o laranja do SAPH ganharam versões mais escuras para quando são TEXTO
sobre fundo claro.

Só a tela muda. O que vai para o PDF e a impressão — traços, cores dos
obstáculos, textos da folha — continua como era.

## 54. Construções, distâncias escolhidas e bandeirolas

Três pedidos do desenhador, do uso real.

**Construções no cenário.** Arquibancada, área de concreto, edificação —
dentro ou fora da pista, como referência do local. Usam a MESMA geometria
da pista (retângulo ou contorno livre, com edição de vértices), marcada
com `structure`. Assim herdam de graça desenhar, mover, girar e editar
vértices; os pontos que procuram "a pista" (assistente de traçado,
interferências, modelos de pista) passaram a ignorar as construções.
Cada tipo tem um preenchimento que se lê em preto e branco: degraus na
arquibancada (paralelos à aresta mais longa, que é a que dá para a pista),
hachura no concreto, cinza cheio na edificação. As linhas saem já
recortadas no contorno, sem <pattern> nem recorte — o PDF não garante
nenhum dos dois.

**Distâncias entre obstáculos, escolhidas.** Com o percurso pronto, o
desenhador decide quais distâncias vão para o croqui. O painel do traçado
lista cada par de obstáculos consecutivos pela numeração — incluindo os
de dentro dos compostos — com a distância medida SOBRE o traçado, de vara
a vara, e uma caixa para mostrar. O traçado guarda só as chaves marcadas;
a medida é sempre recalculada, então mover um obstáculo corrige o número.

**Bandeirolas.** Opção do documento (Folha › Sinalização, ou Inserir):
vermelha à direita e branca à esquerda de quem salta, nos obstáculos e
nas linhas de partida e chegada. O lado vem do sentido do salto, então
inverter a seta troca as bandeirolas junto. Com elas ligadas, o número do
obstáculo passa por fora, em vez de ficar por cima.

O formato do arquivo foi para a versão 8. Croqui antigo abre sem
bandeirola e sem distância entre obstáculos — exatamente como era impresso.

## 55. Rótulos que não cobrem o desenho, e logos na folha

**Rótulos automáticos.** Números, alturas, "Partida"/"Chegada" e as
distâncias entre obstáculos nasciam numa posição fixa em relação ao
objeto e caíam em cima da linha do traçado, de outro obstáculo, das
bandeirolas ou de outro rótulo. O desenhador apontou: dificulta a leitura.

Agora um leiaute único decide todos juntos (`layoutLabels`). Cada rótulo
tem candidatos — em volta do objeto, da posição preferida à menos usual,
em três distâncias; as distâncias, ao longo do trecho e dos dois lados da
linha — e fica com o de menor custo. O custo pesa o que mais atrapalha:
cobrir obstáculo ou outro rótulo, depois seta, linha do traçado,
bandeirola e, por último, o contorno da pista. A posição preferida ganha
quando está livre, então o croqui só muda onde havia choque. Rótulo
arrastado à mão não se move e entra como obstáculo para os outros.

Conferido em Normandia com traçado, alturas, todas as distâncias e
bandeirolas: 32 rótulos, nenhum sobre a linha nem sobre outro, de 1:300 a
1:500.

**Logos.** Logo ou imagem (da federação, do clube, do evento) entra pelo
menu Inserir ou pelo botão Folha. Mora em milímetros de PAPEL, como o
quadro técnico: não muda quando a escala do desenho muda. Nasce no canto
superior direito da área útil, com a proporção do arquivo; a largura se
ajusta no painel. O arquivo vai embutido no projeto, como a imagem de
fundo — o .pcs continua autossuficiente.

## 56. Distância escrita sobre a linha

Todo número de distância do traçado — o total, os trechos e as distâncias
escolhidas entre obstáculos — é escrito SOBRE a linha tracejada, paralelo
a ela, como uma cota: a linha serve de pauta para o número. O texto nunca
fica de cabeça para baixo (o ângulo é sempre entre −90° e 90°) e fica meio
milímetro acima do traço.

O leiaute de rótulos (decisão 55) escolhe ONDE ao longo do trecho o número
vai: tenta o meio e depois pontos cada vez mais afastados, até achar um
lugar que não cubra obstáculo, seta, bandeirola, outra linha ou outro
rótulo. A seta de salto corre sobre a própria linha, então conta com a
largura da ponta, não só com o eixo.

## 57. Colar imagem da área de transferência

Ctrl+V com uma imagem na área de transferência (um print do Google Maps,
por exemplo) cola essa imagem como IMAGEM DE FUNDO: o editor passa ao modo
Pista e a imagem nasce cobrindo a pista, selecionada, pronta para calibrar
a escala e desenhar o contorno por cima. É o caminho mais curto para
começar uma pista nova a partir do local real.

Sem imagem na área de transferência, Ctrl+V continua colando os objetos
copiados dentro do editor. Quem decide é o evento `paste` do navegador,
o único que enxerga o que veio de fora; o menu Editar › Colar lê a área de
transferência pela API e cai no colar interno se não houver imagem ou se o
navegador negar a permissão. A imagem colada segue as regras da importada
por arquivo (PNG, JPG ou WEBP, até 12 MB, embutida no .pcs).

## 58. Bloco 1 do backlog: padrões, clique, giro, sem ímã

**Documento novo** (B-29, B-30, B-31). Abre VAZIO, sem pista, em folha A4
paisagem na escala 1:300, já no modo Pista — o primeiro passo é desenhar
ou colar o local. A origem fica onde cairia uma pista 80×40 centralizada.
Obstáculo novo nasce com 4 m de frente, em todos os tipos.

**Área de clique** (B-27, B-39). O obstáculo responde no retângulo
inteiro — vão do oxer e paraflancos incluídos — mais uma folga de 9 px de
TELA. A linha da pista e a do traçado ganham uma faixa invisível de 16 px
de tela. As duas usam `non-scaling-stroke`: valem o mesmo em 1:200 ou
1:1000, de perto ou de longe. Nada disso vai para o PDF.

**Barra de giro** (B-41). Uma barra de 0 a 360° embaixo do campo
Rotação. Gira ao vivo; cada arrasto é um passo de desfazer.

**Sem ímã** (B-38). Saiu tudo: menu, atalho S, Alt, indicador da barra
de baixo e o popover de passos. O objeto vai onde se solta, arredondado
ao milímetro. As setas do teclado movem 10 cm (1 m com Shift). O giro com
Shift segurado continua em passos de 15° — é um modificador do gesto, não
o ímã. Esquema 9: a migração apaga `grid.snap` e `grid.snapStepM`.

**Escala digitável** (B-32). O campo aceita qualquer denominador entre 10
e 5000 (1:350, por exemplo); a setinha ao lado oferece as escalas
redondas.

**Assistente não empilha** (B-04). O traçado feito pelo automático ou por
trechos leva a marca `assistant`. Rodar de novo SUBSTITUI esse traçado,
num passo só de desfazer, e o novo herda estilo, modo de distância e
distâncias escolhidas do anterior. Traçado à mão, cópia ou colado nunca é
substituído. Traçados de assistente salvos antes desta versão não têm a
marca: na primeira vez, o novo ainda entra ao lado deles.

## 59. Bloco 2 do backlog: painel enxuto, alturas à parte, curvar trecho

**Legenda de escala** só entra quando pedida: documento novo nasce sem
ela, e o menu Inserir › Escala liga e desliga. Croqui antigo mantém o que
tinha.

**Painel do obstáculo enxuto** (B-33). À vista: tipo, número e letra,
frente e largura, seta (com o botão de inverter ao lado), giro com a
barra. O resto — posição X/Y, suporte, varas, liverpool, rótulos e
observação — fica em "Mais opções", fechado. Sai o campo de tamanho da
seta (6 mm fixos), o checkbox "Tem largura de salto" (o tipo decide; o
campo Largura só aparece quando há largura), os textos explicativos
(viraram dica do mouse), os títulos de seção, a linha de tamanho e os
botões Frente/Trás (estão no menu Editar). Bloquear e Excluir viram
ícones no topo — e isso vale para todo objeto, porque o ObjectPanel é
comum. Pelo mesmo motivo, X/Y foi para "Mais opções" em todo objeto.
Colocar partida e chegada saiu do painel do obstáculo: aparece só com
nada selecionado.

**Alturas à parte.** As alturas saíram do painel do obstáculo e moram no
diálogo "Alturas dos obstáculos", aberto pela tabela de alturas: todos os
obstáculos na ordem do percurso (os sem número no fim), com os elementos
e o botão de acrescentar.

**Curvar um trecho** (B-28). A bolinha do meio de cada trecho do traçado
selecionado agora se arrasta: o meio da curva segue o cursor. Duplo
clique nela continua inserindo nó. Nó preso a obstáculo mantém a direção
da alça, então o traçado segue cruzando a 90°; entre dois saltos em linha
o trecho não curva. A distância continua medida sobre a curva desenhada,
e os números se atualizam durante o arrasto. Um arrasto = um desfazer.

**Hachura no canto arredondado** (B-24). A hachura das construções e o
centro do rótulo passaram a usar o contorno com os cantos redondos, e não
o polígono de cantos vivos — as linhas não saem mais pela curva.

**Giro de texto.** O texto livre já girava; o campo Giro do painel de
texto saiu porque o campo Rotação e a barra comuns fazem o mesmo.

## 60. A folha imprime o que se vê; a grade mora na pista

**Escala padrão 1:600** para documento novo (substitui o 1:300 da
decisão 58).

**O que se vê é o que sai** (B-03). Não há opção de exportação: o PDF e a
impressão levam a grade quando ela está visível, e não levam quando está
desligada em Exibir › Grade. As setas de salto continuam saindo sempre.

**Grade só dentro da pista**, recortada no contorno real (cantos
arredondados e chanfrados incluídos), sem <clipPath> — cada linha é
cortada na geometria, como a hachura. Fica por cima do piso da pista e
por baixo de todo o resto. Sem pista, cobre a área toda.

**Tudo conta do canto superior esquerdo da pista**: a primeira linha da
grade (grossa) está nele, os quadrados seguem dali, as réguas marcam 0
ali, e a coordenada do cursor e os campos X/Y do painel também. Na tela o
passo acompanha o zoom; no papel o menor quadrado nunca fica abaixo de
4 mm na escala de impressão.

## 61. Rótulo das construções e elementos vinculados

**Rótulo das construções** (B-23). O desenhador escolhe o tamanho da letra
(padrão 2,8 mm) e o giro do rótulo, com campo e barra. Sem giro escolhido,
o rótulo acompanha a aresta mais longa, nunca de cabeça para baixo; o
botão "auto" volta a esse comportamento.

**Vincular** (Ctrl+G, menu Editar ou o botão do painel). Objetos
vinculados levam o mesmo `group`: clicar em um seleciona todos, e por
isso se movem, giram, copiam e se apagam juntos. Alt + clique pega um só,
para editar um elemento — o contorno da pista, por exemplo — sem desfazer
o vínculo. Desvincular (Ctrl+Shift+G) solta o grupo inteiro. Cópia de
vinculados fica vinculada entre si, não aos originais. O campo é opcional:
arquivos antigos abrem sem vínculo, sem migração.

**Modelo de pista entra vinculado.** Aplicar um modelo traz pista,
construções, árvores e imagem num grupo só, que se arrasta inteiro.

## 62. Sem bandeirolas

As bandeirolas (decisão 54) saíram do editor: a seta de salto já diz a
direção, e o desenho delas não convenceu. Sai o item do menu Inserir, a
opção da folha, o desenho nos obstáculos e nas cruzadas de tempo e a
folga que o leiaute de rótulos reservava para elas. Esquema 10: a
migração apaga `flags` do arquivo.

## 63. Entrada e saída da pista

Entrada e Saída viram itens próprios do menu Ornamento (B-13, B-21),
usando a mesma seta que já existia. Ao colocar, a seta nasce
perpendicular à cerca mais próxima: para dentro na entrada (verde), para
fora na saída (vermelha). Por padrão escrevem "ENTRADA" ou "SAÍDA" do
lado de fora da pista, em texto horizontal; o painel tem a opção de
esconder. Depois de colocada, a seta gira e se move como qualquer
ornamento.

O editor de cabeçalho (B-07) foi descartado: o nome da prova vai com a
ferramenta de texto, e logos com a inserção de imagem.

## 64. Montar a pista pelo print do Maps

Colar um print (Ctrl+V), o menu Arquivo › Pista pelo mapa… ou o botão do
painel da Pista abrem um assistente. Ele também oferece "Só usar como
imagem de fundo", o caminho da decisão 57.

1. **Medida.** O assistente acha os dois marcadores do "Medir distância"
   do Google Maps (discos brancos de contorno escuro, com a linha branca
   entre eles) e lê o número por OCR (Tesseract.js). O valor lido aparece
   para confirmar ou corrigir; se não achar os marcadores, a medida se
   arrasta à mão. O Maps escreve sempre duas casas e o OCR costuma perder
   a vírgula ("27 03 m"): um espaço antes de dois dígitos colados na
   unidade é a vírgula.
2. **Pista.** A areia é separada pela cor a partir de um ponto (o meio da
   medida, ou outro que o desenhador escolher). Areia de fora da cerca tem
   a mesma cor e vaza pelas frestas das réguas, por isso a máscara é
   encolhida antes de preencher e devolvida ao tamanho depois. O contorno
   é o casco simplificado — livre — ou o menor retângulo que o contém
   ("Ajustar a retângulo"), que devolve o canto escondido por copa de
   árvore. Os vértices se arrastam.
3. **Sugestões.** Ilhas (o que não é areia e está cercado por ela) e
   telhados vizinhos (telha de barro: vermelho bem acima de verde e azul),
   para marcar quais entram.
4. **Outros elementos.** Construção e ilha (arrastando um retângulo) e
   árvore (clique), para o que o assistente não viu.

Ao confirmar: a escala vem da medida, o canto superior esquerdo da pista
vira a origem, o cenário anterior sai, e imagem (a 50%), pista (sem
preenchimento), construções, ilhas e árvores entram vinculados. A folha
ajusta a escala e centraliza.

Novo tipo de construção **Ilha** (verde, sem rótulo escrito). A análise
roda numa cópia de até 1400 px do print. O OCR é carregado só pelo
assistente (chunk próprio de 16 kB; motor e dados vêm da CDN no primeiro
uso, cerca de 4 MB). "Ajustar ao papel" e "Centralizar" passaram a usar a
envoltória dos vértices — com contorno livre, liam uma pista 0×0.

## 65. Seleção certa e folgada; partida e chegada à mão

**Moldura dos elementos da folha** (B-48). Quadro técnico, tabela de
alturas e logo moram em mm de papel; a envoltória deles era convertida
para metros sem descontar a origem do desenho na folha, e a moldura de
seleção saía deslocada exatamente dessa distância. `boundsIn` agora
desconta — vale para a moldura, o laço e o giro.

**Área de clique folgada em tudo** (B-50). Partida/chegada, ornamentos,
textos, quadro, tabela e logo ganham, por baixo do desenho, um retângulo
invisível da envoltória com 9 px de tela de folga (`non-scaling-stroke`),
como os obstáculos (decisão 58).

**Barra da esquerda** (B-51, B-52). No modo Percurso, um botão "Partida e
chegada" com as duas opções — continuam só quando pedidas. "Folha" passa
a se chamar "Informações técnicas".

**Painel da partida/chegada** (B-53). A linha é solidária ao obstáculo:
saem inverter direção, paraflancos, rotação (campo, barra e alça no
desenho) e "Mais opções"/posição. Ficam distância até a vara, papel,
largura, texto, seta e traço. Quadro, tabela e logo também deixam de
mostrar X/Y em metros — arrastam-se na folha.

## 66. Girar o print, editar o contorno, girar o cenário inteiro

**Assistente** (ajustes da decisão 64):
- Primeiro passo novo, **Girar**: barra de −180° a 180°, ±1° e ±90°, com
  quadriculado para alinhar a cerca. A análise roda na imagem girada; a
  medida e o OCR rodam no print ORIGINAL (o OCR não lê texto inclinado) e
  os pontos são levados para a imagem girada — a distância não muda com o
  giro. A imagem que fica no croqui é o print inteiro girado (JPEG, cantos
  brancos); na análise os cantos são cinza, para não parecerem areia.
- **Contorno da pista**: duplo clique numa aresta acrescenta um ponto; num
  ponto, remove (mínimo de três).
- **Outros elementos**: construção e ilha também em contorno livre
  (clique cada ponto; duplo clique ou "Fechar contorno" termina), além do
  retângulo — o que dá qualquer ângulo.

**Girar o cenário vinculado.** O giro de vários objetos girava a posição
de cada um em torno do centro comum, mas contorno (pista, construção,
ilha) e traçado não têm ângulo guardado: só o ponto de referência andava,
e cada peça parecia girar no próprio eixo. Agora os pontos do contorno e
os nós (e alças) do traçado giram em torno do centro comum — o conjunto
gira como uma peça só. Quadro, tabela e logo, que moram na folha, não
giram.

**Ângulo da construção.** Construção e ilha ganham alça de giro no
desenho e, no painel, "Ângulo" com barra: é o ângulo da aresta mais
longa (−90° a 90°), e mudá-lo gira o contorno em torno do centro.
Sozinha, uma construção gira em torno do próprio centro.

## 67. Zoom no assistente; clicar uma peça da seleção pega só ela

**Zoom na prévia do assistente.** Roda do mouse (em torno do cursor) e os
botões −, + e Ajustar, de 100% a 1000%; arrastar um espaço vazio desloca
a vista. Pontos e traços mantêm o tamanho na tela em qualquer zoom, e
com zoom o print é desenhado em resolução cheia (a análise continua na
cópia reduzida) — dá para seguir a cerca de perto.

**Clique numa peça de uma seleção maior** (B-55). Clicar sem arrastar
num objeto que já fazia parte de uma seleção de vários deixa selecionado
só ele (e os vinculados a ele, se houver). Antes a seleção inteira
continuava: depois do assistente, mesmo desvinculando o cenário, clicar
numa construção mantinha as oito peças selecionadas e o painel nunca
mostrava os campos dela (rótulo, tipo, ângulo). Arrastar continua
movendo a seleção toda.

## 68. Confirmar antes de sair do assistente

Esc, clique fora da janela ou ✕ no meio do assistente "Montar pista pelo
mapa" perguntam antes: "Sair do assistente? O que foi feito até aqui se
perde." No primeiro passo, antes de começar, fecha direto.

## 69. Contorno livre pelo teclado no assistente; forma da construção

**No assistente**, o contorno livre de construção e ilha responde ao
teclado como no editor: Enter fecha, Backspace tira o último ponto, Esc
cancela o contorno em andamento — e só o contorno, sem fechar o
assistente nem perguntar. Antes só fechava com duplo clique ou pelo
botão, e o Esc fechava a janela inteira.

**No editor**, o menu Construção ganhou a escolha da forma no topo —
Retângulo ou Contorno livre — que vale para o tipo escolhido em seguida
(arquibancada, concreto, edificação, ilha, construção). Antes havia um
item só, "Arquibancada em contorno livre", que dependia do último tipo
usado.

## 70. Régua do perímetro na borda real, legível sobre as construções

- **Mais perto da cerca.** Traço menor de 1,0 mm, maior de 1,6 mm, folga
  de 0,5 mm: o número fica a cerca de 3,5 mm da borda (eram ~5 mm), no
  mesmo tamanho de letra.
- **Por cima das construções, com contorno branco.** A régua é desenhada
  depois das construções e da grade; o número leva uma cópia branca com
  traço por baixo (seguro no PDF). Arquibancada encostada na cerca não
  esconde mais a metragem — e a construção fica onde está, em escala.
- **Acompanha a borda real.** Os traços continuam nos múltiplos do passo
  contados do canto superior esquerdo (como a grade), verticais em cima e
  embaixo e horizontais nos lados, mas saem do ponto da CERCA à frente de
  cada um — também nos trechos inclinados e nos cantos redondos —, e não
  mais da caixa retangular da pista. O número fica sempre de pé.
- Fora do modo Pista, a régua esmaece junto com a pista.

Descartado: passar os números para dentro da pista onde houver
construção — toma espaço do percurso.

**Posição do texto da construção.** O painel da construção ganhou "Texto
↔ / ↕", em metros, para afastar o rótulo de outra escrita (o "Júri" de
cima da metragem) sem mover a construção.

**Ajuste (decisão 70).** Perto de um canto, a linha de um traço lateral
pode cortar a cerca de cima (inclinada) em vez da lateral, e o número
caía em cima da cerca. Agora o traço só sai de um lado quando o trecho de
cerca cortado ali é daquele lado: mais em pé que deitado para as
laterais, mais deitado que em pé para cima e para baixo.

## 71. Confirmar composto; linha reta ou curva/quebrada

Com 2 ou 3 obstáculos selecionados, o painel "Composto ou linha reta"
ganha **Confirmar composto (4A, 4B…)**: todos recebem o mesmo número — o
menor que já tinham, ou, sem número, o seguinte ao maior do croqui — e as
letras A, B, C na ordem do salto (a da numeração, se houver; senão o
sentido do salto do primeiro). Os demais obstáculos não são renumerados.

O painel também escolhe a forma da linha:
- **Linha reta** — como antes: o vão se mede no eixo do primeiro e
  "Endireitar" põe todos em linha.
- **Curva ou quebrada** — cada elemento mantém a própria direção; o vão
  (de vara a vara) se mede na reta entre os centros de cada par, e mudar
  um vão empurra o elemento seguinte nessa reta, levando os de depois
  junto. Ninguém é girado nem endireitado.

## 72. Água no cenário; sai o obstáculo rio

No modo Pista, botão **Água** (fora de Construção), com:
- **Rio** — retângulo de água sobre o qual se monta obstáculo;
- **Massa d'água** — lago ou córrego, em contorno livre; obstáculo sobre
  ela aparece nos avisos de interferência.

São construções de tipos próprios: azul-claro com contorno azul, sem
texto, e com tudo o que construção tem (vértices, ângulo, vínculo).

O tipo de obstáculo **rio** saiu. Esquema 11: na abertura, cada obstáculo
rio vira um rio do cenário no mesmo lugar, tamanho e giro, e os vínculos
de traçado e de partida/chegada com ele se soltam.

## 73. Identidade "âmbar ensolarado" (1c)

Escolhida entre cinco paletas e quatro variações da atual (B-42). Mantém a
família da decisão 53 — papel quente, barra de cima clara — e fica mais
alegre:

- **Âmbar vivo** (#E3A52A) no botão principal, no modo ativo e na barra
  de giro, com texto escuro por cima (7,8:1).
- **Coral** (#D9603B; texto #A3401F) no que está ativo ou selecionado:
  ferramenta, item de menu, título do painel, passo do assistente e a
  moldura de seleção no desenho. Sobre o coral-claro, 5,3:1.
- Papel #FBF5EA, superfícies brancas, borda #EEDFC4, texto #241A0E e
  secundário #62553F (7,3:1). Mesa em areia (#EAD9B8) em volta da folha.
- O verde de "tudo certo" escureceu (#1F6B49 sobre #DDF1E7, 5,5:1).
- No traçado por trechos, as alternativas não escolhidas passaram a
  cinza-azulado, para não se confundirem com a escolhida em coral.

A FOLHA não muda: o croqui impresso tem as mesmas cores de antes.

## 74. Ornamentos móveis da prova: ilha decorativa e vaso

Dos achados da pesquisa (B-17), entram só dois ornamentos MÓVEIS, no
botão Ornamento do modo Percurso — fazem parte da prova, não do local, e
não entram nos modelos de pista:
- **Ilha decorativa** — arrastando nasce oval (inscrita no retângulo
  arrastado); também em contorno livre. É uma ilha como a fixa (verde,
  sem texto, com vértices, ângulo e vínculo), só que no escopo Percurso.
  A ilha fixa da pista, arrastada, também passa a nascer oval.
- **Vaso** — o ornamento que já existia, agora da prova.

Nada de novo entre os fixos.

**Influenciam o traçado.** Ilhas (fixas e decorativas) e vasos são corpos
no chão:
- o assistente não passa por cima deles — nem na curva nem na reta
  esticada da volta por fora — e ganha opções de DESVIO: um ponto de
  passagem de cada lado do corpo que está no caminho, a 2 m da borda, com
  a direção da corda. Entre dois saltos alinhados com uma ilha no meio, a
  volta passa ao lado e segue;
- um traçado desenhado que atravessa um deles vira aviso de
  interferência ("O traçado passa por cima de uma ilha").
