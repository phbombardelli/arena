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
