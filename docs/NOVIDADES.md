# Novidades do Arena

O que mudou em cada versão, do mais novo para o mais antigo (B-94).

**Como o número muda** (`maior.menor.correção`):

- **correção** (1.1.**1**): conserto, sem função nova.
- **menor** (1.**2**.0): função nova ou mudança que o usuário vê.
- **maior** (**2**.0.0): só quando um croqui salvo numa versão antiga deixar de abrir igual.

**A cada versão:** subir o número no `package.json` (é o único lugar; o
app e os arquivos salvos leem dali), escrever a entrada aqui, fazer o
commit e marcar com a tag `vX.Y.Z` (`git tag v1.2.0 && git push --tags`).

---

## 1.5.0 — 14/11/2026

- **Montagem do obstáculo (B-108):** cada vertical, oxer, tríplice e muro tem a montagem da entrada: peça por peça (vara, testeira, painel, portão, muro), de baixo para cima, com a altura de cada ponta. Arraste a vara pelo meio para subir ou descer, pela ponta para inclinar. Disposições prontas: paralelas, leque à direita ou à esquerda, Z, Z invertido e espaçar igual. A peça nova nunca nasce atrás de outra e não muda a altura do obstáculo. A janela tem as alturas de entrada, meio e saída editáveis no topo, o liverpool, a observação e setas para o obstáculo anterior e o próximo.
- **No painel do obstáculo:** as alturas de cada plano e a miniatura de frente e de perfil, logo abaixo da rotação.
- **Folha de especificação dos obstáculos:** uma linha por obstáculo, com perfil, vista de frente, material, alturas e observação, e o total de material da prova. Quem muda no desempate ganha uma linha logo abaixo, com o número e a etiqueta "Desempate". Liga-se na aba Impressão e sai no PDF e na impressão depois do croqui.
- **Impressão como visualização de impressão:** todas as folhas que vão sair ficam na tela, uma embaixo da outra, com setas no pé para passar de uma a outra e "Todas" para ver tudo. A observação se edita direto na folha de especificação. O painel ficou mais enxuto: Páginas (desempate e especificação), Papel e escala, Diagramação e, fechado, Mais opções.
- **Desempate mais claro:** no resumo da prova, cada obstáculo do desempate tem "ao contrário" e "vira oxer" escritos; no painel do obstáculo aparece a seção "No desempate". O que sai no papel se escolhe só na Impressão.
- **Revisão da interface:** Sentido em quatro botões (→ ← ↔ ⌀); "Pista pelo mapa" e "Modelos de pista" saíram da barra lateral (seguem no painel e no menu Arquivo); o botão "Folha A4 · 1:600" saiu do topo; avisos do desempate em laranja; altura não informada aparece vazia, não "0".
- Liverpool nasce com 1 m de profundidade, e as alturas no desenho nascem desligadas (vão para a tabela).

## 1.4.0 — 13/11/2026

- **Obstáculos em sequência:** com a ferramenta Obstáculo, um obstáculo meio transparente acompanha o cursor até o clique, já com o tipo e o próximo número. Depois de pôr, a ferramenta continua: dá para pôr vários seguidos e ajustar o tipo depois. Esc ou V voltam a selecionar.
- **Guias de alinhamento na folha (B-112):** na Impressão, arrastar ou puxar o canto do quadro técnico, da tabela, de um logo ou da pista gruda nas bordas e no meio dos outros itens, das margens e do centro da folha, com uma linha tracejada mostrando o alinhamento. Alt solta o ímã.
- **Quadro técnico com tamanho livre:** puxar o canto muda largura e altura separadas, sem mudar a letra (como a tabela de alturas). O painel ganhou o campo Altura e o botão "Altura automática".
- **Etiquetas do desempate (B-111):** "Só desempate" e "Oxer no desempate" agora desviam dos outros rótulos e não ficam coladas em outro obstáculo.
- **Autoria (B-110):** o rodapé de toda folha traz "Confeccionado com Arena", e a barra de baixo do app mostra os direitos e quem desenvolveu.
- Correção: inserir o primeiro quadro num croqui antigo não muda mais a escala que você escolheu.

## 1.3.1 — 12/11/2026

- Escala mais flexível. Puxando o canto da pista na Impressão, ela anda de 10 em 10 (1:610, 1:620…); com Shift, pula só entre as escalas padrão. "Ajustar ao papel" e "Rearrumar a folha" procuram de 25 em 25 (1:625, 1:650…), para a pista sair a maior possível em vez de cair direto para a próxima escala padrão.

## 1.3.0 — 12/11/2026

- **Aba Impressão (B-105):** a folha se monta numa aba própria, ao lado de Pista, Percurso e Ginástica. Ali ficam formato, orientação, margens, escala, posição da pista, quadro técnico, tabela de alturas e logos. A pista com o percurso vira um bloco: arraste para mudar de lugar na folha e puxe um canto para mudar a escala (de escala padrão em escala padrão). O botão "Folha A4 · 1:750" do topo leva para essa aba.
- Nas abas Pista e Percurso não aparecem mais a folha nem os quadros: só a pista, em metros, sem preocupação com o espaço em volta. "Ajustar à tela" enquadra a pista; na Impressão, a folha.

## 1.2.4 — 12/11/2026

- **A pista é o principal da folha:** "Rearrumar a folha" procura a maior escala para a pista e, se for preciso, encolhe quadro técnico, tabela e logos (até 70%) para ela caber maior. Com folga, eles voltam ao tamanho cheio.
- A escala que você escolhe fica: os quadros se ajeitam (e encolhem, se preciso) para a pista caber nela; só se nem assim couber ela volta à maior que dá.
- A posição da pista na folha não custa mais escala: se os quadros no lado oposto deixariam a pista menor, eles vão para o lado que a deixa maior, e a pista continua encostada onde você pediu.
- Os textos ENTRADA e SAÍDA contam como parte do desenho: não ficam mais fora da área de impressão.

## 1.2.3 — 12/11/2026

- **Pista na folha:** no painel da folha, uma grade 3×3 escolhe onde a pista com o percurso fica: no centro, encostada em cima, embaixo, à esquerda, à direita ou num dos quatro cantos. Os quadros vão para o lado oposto (num canto, para o dos dois lados opostos que deixa a pista maior). Se a pista não couber nem em 1:1000 com os quadros desse lado, eles vão para onde couber e a pista continua encostada onde você pediu.

## 1.2.2 — 12/11/2026

- A folha que se arruma enquadra o desenho inteiro, não só o contorno da pista: arquibancada, júri, entrada e saída e a régua do perímetro ficam dentro da área de impressão e fora dos quadros, também ao virar a folha de retrato para paisagem.
- Tabela de alturas com tamanho: largura e altura no painel ("Tamanho automático" volta ao normal) ou puxando os cantos da seleção, como o quadro técnico. Arrumada pela folha, ela acompanha sozinha o quadro: a mesma largura na coluna, a mesma altura na faixa.
- Ao dar ordem ao desempate, o quadro técnico já liga o bloco do desempate, com a ordem e a velocidade do percurso; a distância e os tempos entram quando o traçado do desempate é desenhado.

## 1.2.1 — 12/11/2026

- A arrumação da folha liga sozinha também nos croquis antigos, quando se muda a folha (formato, orientação, margens) ou se insere quadro, tabela ou logo.
- Duas fases: a distância da 1ª fase vem sempre do traçado até a linha (a extensão corrigida do percurso inteiro não vale para ela e volta quando as duas fases são desligadas); traçado que não cruza a linha também é medido.
- A linha das fases não mostra mais a opção de texto no desenho.
- O assistente só avisa "volta por fora" quando a linha gira bem mais que meia volta, e não quando apenas estica a reta para fazer uma curva normal.
- Desempate: "Na folha" virou "Na impressão".

## 1.2.0 — 12/11/2026

- **Espelhar (B-96):** espelha o que está selecionado (um obstáculo, uma combinação ou o percurso inteiro), esquerda ↔ direita ou cima ↕ baixo, pelo painel, pelo menu Editar ou com Shift+H / Shift+V. O sentido de salto e o traçado acompanham.
- **Ordem do desempate nos obstáculos (B-99):** um círculo azul com a posição na ordem do desempate ao lado do número, nas vistas Desempate e Ambos. Dá para desligar no painel da prova.
- **Prova em duas fases (B-95):** no painel da prova, "Prova em duas fases" e onde a 1ª fase termina. Aparece a linha tracejada entre as fases (chegada da 1ª e partida da 2ª), com "1ª fase" e "2ª fase" de cada lado; o quadro técnico ganha os blocos 1ª fase e 2ª fase, com distância e tempos de cada uma; avisos do Art. 222 da FEI. O assistente de traçado passa pela linha.
- **Folha que se arruma sozinha (B-103):** quadro técnico, tabela de alturas e logos vão para uma coluna ou uma faixa da folha, no lado que deixa a pista maior, e a pista se ajusta ao que sobra. Muda junto quando o quadro cresce ou a folha vira retrato. O que você arrastar fica onde você pôs. No painel da folha: escolher o lado e "Rearrumar a folha" (croquis antigos só se arrumam com esse botão). Na faixa, o quadro de duas fases ou com desempate deita: gerais, 1ª fase, 2ª fase e desempate lado a lado ("Seções lado a lado" no painel do quadro, para quem o pôs à mão).
- A ordem do desempate não cobre mais o número do obstáculo vizinho.

## 1.1.0 — 11/11/2026

- **Desempate no croqui (B-92):** ordem do desempate, obstáculos "Só desempate", sentido contrário e vertical que vira oxer, traçado e distâncias do desempate, avisos do regulamento da FEI, bloco do desempate no quadro técnico, vista Percurso / Desempate / Ambos e escolha do que vai para a folha (só o percurso, página separada ou tudo numa folha).
- **Tutoriais em vídeo (B-25):** botão ▶ Tutoriais no topo, boas-vindas na primeira abertura e player com capítulos.
- Quadro técnico calcula os tempos pelas regras da CBH.
- Sugestões e contato pelo app; opção de esconder a imagem de fundo.
- Janela das alturas arrastável; cotas da ginástica legíveis.
- Cada arraste é um passo próprio de desfazer.

## 1.0.0 — 27/10/2026

Primeira versão com nome: o Arena em português, inglês e espanhol, com
Pista, Percurso e Ginástica, assistente de traçado, quadro técnico, tabela
de alturas, PDF e impressão em escala, app instalável e backup na nuvem
com a conta Google.
