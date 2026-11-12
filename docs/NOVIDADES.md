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
