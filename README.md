# E-Ink Notes (Scrapbook Companion)

Caderno de notas minimalista em Markdown projetado especificamente para telas **E-Ink** (Boox, Kindle, Kobo, Android E-Ink ou navegador), com **sincronização bidirecional automática** com o Scrapbook Notes do Mailspring via GitHub Gist.

---

## ✨ Características

- **Otimizado para E-Ink**:
  - Tipografia nítida **IBM Plex Sans** e **IBM Plex Mono**.
  - Linhas finas de 1px de alto contraste (preto no branco puro).
  - **Zero animações ou transições** (`transition: none !important`), eliminando qualquer ghosting ou flickering na taxa de atualização do e-ink.
  - Alvos de toque generosos para caneta stylus ou dedos.
- **Formatação Markdown**:
  - Títulos (`#`, `##`, `###`), negrito, itálico, citações, blocos de código e imagens.
  - **Checklists Interativas**: caixas de seleção `- [ ]` e `- [x]` clicáveis diretamente no modo de leitura para riscar tarefas na hora.
  - **Tags Automáticas**: hashtags como `#trabalho` ou `#ideias` no texto geram chips de filtro dinâmicos no topo.
- **Sincronização com GitHub (Compatível com Mailspring)**:
  - Sincroniza diretamente com o mesmo cofre (*Mailspring Scrapbook Notes Vault*) no GitHub Gist.
  - Notas criadas ou editadas no Mailspring aparecem no E-Ink e vice-versa.
  - Mesclagem inteligente baseada na data de modificação mais recente.
  - Auto-sync com debounce (5 segundos após terminar de digitar).
- **100% Offline (PWA)**:
  - Service Worker e manifesto configurados para funcionar mesmo sem internet.
  - Suporta instalação como aplicativo no Android E-Ink (Boox).

---

## 🚀 Como Hospedar no GitHub Pages

1. No repositório no GitHub (`https://github.com/br-niko/notes`):
   - Vá em **Settings** > **Pages**.
   - Em **Build and deployment** > **Source**, selecione `Deploy from a branch`.
   - Escolha o branch `main` e a pasta `/ (root)`.
   - Clique em **Save**.
2. Acesse no seu dispositivo E-Ink:
   - `https://br-niko.github.io/notes/`

---

## 🔑 Como Ativar a Sincronização

1. Abra o app e clique no ícone de engrenagem (**Configurações**).
2. Cole um **GitHub Personal Access Token (classic)** com escopo `gist`.
3. Clique em **Salvar e Sincronizar**. Suas notas serão carregadas e sincronizadas automaticamente!
