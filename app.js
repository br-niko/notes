/**
 * E-Ink Notes (Scrapbook Companion)
 * High-contrast, zero-animation note taker with bidirectional GitHub Gist sync.
 */

(function () {
  'use strict';

  // --- STORAGE KEYS ---
  const STORAGE_KEY = 'eink_notes_data';
  const CONFIG_KEY = 'eink_notes_config';

  // --- STATE ---
  let state = {
    notes: [],
    selectedId: null,
    filterTag: null,
    searchQuery: '',
    viewMode: 'reading', // 'reading' | 'edit'
    isSyncing: false,
    syncError: null,
    lastSyncTime: null,
    isMobile: window.innerWidth <= 768,
  };

  let autoSyncTimer = null;

  // --- DOM ELEMENTS ---
  const dom = {
    appTitle: document.getElementById('app-title'),
    syncStatus: document.getElementById('sync-status'),
    btnBackToList: document.getElementById('btn-back-to-list'),
    btnNewNote: document.getElementById('btn-new-note'),
    btnToggleSearch: document.getElementById('btn-toggle-search'),
    btnSync: document.getElementById('btn-sync'),
    btnSettings: document.getElementById('btn-settings'),
    searchRow: document.getElementById('search-row'),
    searchInput: document.getElementById('search-input'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    viewList: document.getElementById('view-list'),
    viewDetail: document.getElementById('view-detail'),
    tagsBar: document.getElementById('tags-bar'),
    notesList: document.getElementById('notes-list'),
    noteTitleInput: document.getElementById('note-title-input'),
    btnModeRead: document.getElementById('btn-mode-read'),
    btnModeEdit: document.getElementById('btn-mode-edit'),
    btnPinNote: document.getElementById('btn-pin-note'),
    btnDeleteNote: document.getElementById('btn-delete-note'),
    formatToolbar: document.getElementById('format-toolbar'),
    noteTagsRow: document.getElementById('note-tags-row'),
    readingPane: document.getElementById('reading-pane'),
    editPane: document.getElementById('edit-pane'),
    noteTextarea: document.getElementById('note-textarea'),
    noteStats: document.getElementById('note-stats'),
    noteDate: document.getElementById('note-date'),
    // Settings modal
    modalSettings: document.getElementById('modal-settings'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    inputGithubToken: document.getElementById('input-github-token'),
    inputGistId: document.getElementById('input-gist-id'),
    settingsStatusMsg: document.getElementById('settings-status-msg'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    btnSyncNow: document.getElementById('btn-sync-now'),
    btnExportBackup: document.getElementById('btn-export-backup'),
    inputImportBackup: document.getElementById('input-import-backup'),
  };

  // --- CONFIG HELPERS ---
  function getConfig() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function setConfig(cfg) {
    const current = getConfig();
    const updated = Object.assign({}, current, cfg);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
  }

  // --- MARKDOWN UTILITIES ---
  function extractTags(markdown) {
    if (!markdown) return [];
    const regex = /(?:^|\s)#([a-zA-Z0-9_\u00C0-\u017F-]+)/g;
    const tags = new Set();
    let m;
    while ((m = regex.exec(markdown)) !== null) {
      const tag = m[1].toLowerCase();
      if (!/^\d+$/.test(tag)) {
        tags.add('#' + tag);
      }
    }
    return Array.from(tags);
  }

  function extractFirstHeadingOrTitle(markdown, fallback) {
    if (!markdown) return fallback || 'Nova Nota';
    const lines = markdown.split('\n');
    for (const l of lines) {
      const trimmed = l.trim();
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/^#+\s*/, '').trim() || fallback;
      }
      if (trimmed.length > 0) {
        return trimmed.slice(0, 50);
      }
    }
    return fallback || 'Nova Nota';
  }

  function renderMarkdown(markdown) {
    if (!markdown) return '<p style="color: #888888; font-style: italic;">Nota vazia. Clique em Editar para escrever...</p>';

    let taskIdx = 0;
    const lines = markdown.split('\n');
    let inList = false;
    let inCode = false;
    let codeBuffer = [];
    const out = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Code blocks
      if (line.trim().startsWith('```')) {
        if (inCode) {
          out.push('<pre><code>' + escapeHtml(codeBuffer.join('\n')) + '</code></pre>');
          codeBuffer = [];
          inCode = false;
        } else {
          if (inList) { out.push('</ul>'); inList = false; }
          inCode = true;
        }
        continue;
      }

      if (inCode) {
        codeBuffer.push(line);
        continue;
      }

      // Checklists: - [ ] or - [x]
      const taskMatch = line.match(/^(\s*)-\s*\[([ xX])\]\s*(.*)$/);
      if (taskMatch) {
        if (!inList) { out.push('<ul>'); inList = true; }
        const isChecked = taskMatch[2].toLowerCase() === 'x';
        const taskText = parseInlineMarkdown(taskMatch[3]);
        const curIdx = taskIdx++;
        out.push(
          `<li class="task-item ${isChecked ? 'checked' : ''}">` +
            `<input type="checkbox" class="task-checkbox" data-task-idx="${curIdx}" ${isChecked ? 'checked' : ''}>` +
            `<span>${taskText}</span>` +
          `</li>`
        );
        continue;
      }

      // Bullet lists: - or *
      const listMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
      if (listMatch) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push(`<li>${parseInlineMarkdown(listMatch[2])}</li>`);
        continue;
      }

      // Close list if line is not a list item
      if (inList) {
        out.push('</ul>');
        inList = false;
      }

      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      // Headings
      if (trimmed.startsWith('### ')) {
        out.push(`<h3>${parseInlineMarkdown(trimmed.slice(4))}</h3>`);
      } else if (trimmed.startsWith('## ')) {
        out.push(`<h2>${parseInlineMarkdown(trimmed.slice(3))}</h2>`);
      } else if (trimmed.startsWith('# ')) {
        out.push(`<h1>${parseInlineMarkdown(trimmed.slice(2))}</h1>`);
      } else if (trimmed.startsWith('> ')) {
        out.push(`<blockquote>${parseInlineMarkdown(trimmed.slice(2))}</blockquote>`);
      } else if (trimmed === '---' || trimmed === '***') {
        out.push('<hr>');
      } else {
        out.push(`<p>${parseInlineMarkdown(line)}</p>`);
      }
    }

    if (inList) out.push('</ul>');
    if (inCode) out.push('<pre><code>' + escapeHtml(codeBuffer.join('\n')) + '</code></pre>');

    return out.join('\n');
  }

  function parseInlineMarkdown(text) {
    if (!text) return '';
    let t = escapeHtml(text);

    // Images: ![alt](url)
    t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

    // Links: [text](url)
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Bold: **text** or __text__
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Inline code: `code`
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Hashtags: #tag
    t = t.replace(/(?:^|\s)(#([a-zA-Z0-9_\u00C0-\u017F-]+))/g, (match, fullTag) => {
      return ` <span class="note-card-tag">${fullTag}</span>`;
    });

    return t;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toggleTaskInMarkdown(markdown, targetIdx) {
    const lines = markdown.split('\n');
    let curIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(\s*-\s*\[)([ xX])(\]\s*.*)$/);
      if (match) {
        if (curIdx === targetIdx) {
          const isChecked = match[2].toLowerCase() === 'x';
          lines[i] = match[1] + (isChecked ? ' ' : 'x') + match[3];
          break;
        }
        curIdx++;
      }
    }
    return lines.join('\n');
  }

  // --- STORAGE / REPOSITORY ---
  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state.notes = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Erro ao carregar notas:', e);
      state.notes = [];
    }

    if (!Array.isArray(state.notes) || state.notes.length === 0) {
      createInitialNote();
    }
  }

  function saveNotes(triggerSync = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notes));
    } catch (e) {
      console.error('Falha ao salvar notas no localStorage:', e);
    }

    if (triggerSync) {
      scheduleAutoSync();
    }
  }

  function createInitialNote() {
    const now = new Date().toISOString();
    const note = {
      id: 'note-' + Date.now(),
      title: 'Nova Nota',
      body: '',
      tags: [],
      pinned: false,
      created_at: now,
      updated_at: now,
    };
    state.notes = [note];
    state.selectedId = note.id;
    saveNotes(false);
  }

  function createNewNote() {
    const now = new Date().toISOString();
    const note = {
      id: 'note-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      title: 'Nova Nota',
      body: '',
      tags: [],
      pinned: false,
      created_at: now,
      updated_at: now,
    };
    state.notes.unshift(note);
    state.selectedId = note.id;
    state.viewMode = 'edit';
    saveNotes(true);
    render();
    if (state.isMobile) {
      showDetailView();
    }
    setTimeout(() => {
      dom.noteTitleInput.focus();
    }, 50);
  }

  function deleteCurrentNote() {
    if (!state.selectedId) return;
    const note = state.notes.find(n => n.id === state.selectedId);
    const title = note ? note.title : 'esta nota';
    if (!confirm(`Deseja excluir "${title}"?`)) return;

    state.notes = state.notes.filter(n => n.id !== state.selectedId);
    state.selectedId = state.notes.length > 0 ? state.notes[0].id : null;
    saveNotes(true);
    render();
    if (state.isMobile) {
      showListView();
    }
  }

  function togglePinCurrentNote() {
    if (!state.selectedId) return;
    const note = state.notes.find(n => n.id === state.selectedId);
    if (!note) return;
    note.pinned = !note.pinned;
    note.updated_at = new Date().toISOString();
    saveNotes(true);
    render();
  }

  // --- GITHUB SYNC (COMPATÍVEL COM MAILSPRING SCRAPBOOK) ---
  async function syncWithGitHub(showFeedback = false) {
    const cfg = getConfig();
    const token = cfg.githubToken ? cfg.githubToken.trim() : null;

    if (!token) {
      updateSyncStatus('Local');
      if (showFeedback) {
        showSettingsStatus('Token do GitHub não configurado. Adicione-o acima.', 'error');
      }
      return;
    }

    state.isSyncing = true;
    state.syncError = null;
    updateSyncStatus('Sincronizando...');
    if (showFeedback) showSettingsStatus('Conectando ao GitHub...', '');

    try {
      let gistId = cfg.gistId ? cfg.gistId.trim() : null;

      // 1. Localiza ou cria o Gist "Mailspring Scrapbook Notes Vault"
      if (!gistId) {
        const listRes = await fetch('https://api.github.com/gists', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        });
        if (listRes.ok) {
          const gists = await listRes.json();
          const found = gists.find(
            g => g.description === 'Mailspring Scrapbook Notes Vault' ||
                 (g.files && g.files['mailspring-notes.json'])
          );
          if (found) {
            gistId = found.id;
            setConfig({ gistId });
            dom.inputGistId.value = gistId;
          }
        }
      }

      // 2. Se já existe, baixa e faz o merge bidirecional
      let mergedNotes = [...state.notes];
      if (gistId) {
        const getRes = await fetch(`https://api.github.com/gists/${gistId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        });

        if (getRes.ok) {
          const gistData = await getRes.json();
          if (gistData.files && gistData.files['mailspring-notes.json']) {
            try {
              const remoteNotes = JSON.parse(gistData.files['mailspring-notes.json'].content);
              mergedNotes = mergeNotes(state.notes, remoteNotes);
            } catch (err) {
              console.warn('Erro ao decodificar JSON remoto:', err);
            }
          }
        }
      }

      // 3. Monta o payload de envio (mailspring-notes.json + .md para cada nota)
      const filesPayload = {
        'mailspring-notes.json': {
          content: JSON.stringify(mergedNotes, null, 2),
        },
      };

      for (const note of mergedNotes.slice(0, 30)) {
        const safeTitle = (note.title || 'note').replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_') + '.md';
        filesPayload[safeTitle] = {
          content: note.body || '',
        };
      }

      // 4. Envia para o GitHub
      if (gistId) {
        const updateRes = await fetch(`https://api.github.com/gists/${gistId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            description: 'Mailspring Scrapbook Notes Vault',
            files: filesPayload,
          }),
        });

        if (!updateRes.ok) {
          throw new Error(`Erro ao atualizar Gist (${updateRes.status})`);
        }
      } else {
        const createRes = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            description: 'Mailspring Scrapbook Notes Vault',
            public: false,
            files: filesPayload,
          }),
        });

        if (!createRes.ok) {
          throw new Error(`Erro ao criar Gist (${createRes.status})`);
        }

        const created = await createRes.json();
        gistId = created.id;
        setConfig({ gistId });
        dom.inputGistId.value = gistId;
      }

      // Atualiza estado local com as notas mescladas
      state.notes = mergedNotes;
      if (!state.selectedId || !state.notes.some(n => n.id === state.selectedId)) {
        state.selectedId = state.notes.length > 0 ? state.notes[0].id : null;
      }
      saveNotes(false);

      state.isSyncing = false;
      state.lastSyncTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      updateSyncStatus(`Sync: ${state.lastSyncTime}`, true);
      if (showFeedback) {
        showSettingsStatus('Notas sincronizadas com sucesso com o GitHub!', 'success');
      }
      render();
    } catch (err) {
      console.error('Falha de sincronização:', err);
      state.isSyncing = false;
      state.syncError = err.message || 'Erro de conexão';
      updateSyncStatus('Erro no sync');
      if (showFeedback) {
        showSettingsStatus(`Falha: ${state.syncError}`, 'error');
      }
    }
  }

  // Merge bidirecional baseado no timestamp mais recente de cada nota
  function mergeNotes(localNotes, remoteNotes) {
    const map = new Map();

    for (const n of localNotes) {
      map.set(n.id, n);
    }

    for (const r of remoteNotes) {
      if (!map.has(r.id)) {
        map.set(r.id, r);
      } else {
        const l = map.get(r.id);
        const lTime = new Date(l.updated_at || l.created_at || 0).getTime();
        const rTime = new Date(r.updated_at || r.created_at || 0).getTime();
        if (rTime > lTime) {
          map.set(r.id, r);
        }
      }
    }

    const list = Array.from(map.values());
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
    });
    return list;
  }

  function scheduleAutoSync() {
    const cfg = getConfig();
    if (!cfg.githubToken) return;

    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => {
      syncWithGitHub(false);
    }, 5000);
  }

  function updateSyncStatus(text, isSynced = false) {
    dom.syncStatus.textContent = text;
    dom.syncStatus.className = 'sync-badge ' + (isSynced ? 'synced' : (text.includes('Sincronizando') ? 'syncing' : ''));
  }

  function showSettingsStatus(msg, type) {
    dom.settingsStatusMsg.textContent = msg;
    dom.settingsStatusMsg.className = 'status-msg ' + (type || '');
    dom.settingsStatusMsg.style.display = msg ? 'block' : 'none';
  }

  // --- FORMAT TOOLBAR ---
  function insertFormatSnippet(prefix, suffix, placeholder) {
    const textarea = dom.noteTextarea;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const selected = val.slice(start, end) || placeholder || '';
    const replacement = prefix + selected + suffix;

    textarea.value = val.slice(0, start) + replacement + val.slice(end);
    textarea.focus();
    textarea.selectionStart = start + prefix.length;
    textarea.selectionEnd = start + prefix.length + selected.length;

    onBodyChange();
  }

  // --- RENDERING ---
  function render() {
    renderTagsBar();
    renderNotesList();
    renderNoteDetail();
  }

  function renderTagsBar() {
    const allTags = new Set();
    for (const n of state.notes) {
      for (const t of (n.tags || [])) {
        allTags.add(t);
      }
    }

    if (allTags.size === 0) {
      dom.tagsBar.style.display = 'none';
      return;
    }

    dom.tagsBar.style.display = 'flex';
    dom.tagsBar.innerHTML = '';

    // "All" chip
    const allChip = document.createElement('span');
    allChip.className = 'tag-chip ' + (state.filterTag === null ? 'active' : '');
    allChip.textContent = 'All';
    allChip.onclick = () => {
      state.filterTag = null;
      render();
    };
    dom.tagsBar.appendChild(allChip);

    for (const tag of allTags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip ' + (state.filterTag === tag ? 'active' : '');
      chip.textContent = tag;
      chip.onclick = () => {
        state.filterTag = state.filterTag === tag ? null : tag;
        render();
      };
      dom.tagsBar.appendChild(chip);
    }
  }

  function renderNotesList() {
    const container = dom.notesList;
    container.innerHTML = '';

    let list = [...state.notes];

    // Filter by tag
    if (state.filterTag) {
      list = list.filter(n => (n.tags || []).includes(state.filterTag));
    }

    // Filter by search query
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.body || '').toLowerCase().includes(q)
      );
    }

    // Sort: pinned first, then updated_at descending
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
    });

    if (list.length === 0) {
      container.innerHTML = '<div class="notes-empty">Nenhuma nota encontrada.</div>';
      return;
    }

    for (const note of list) {
      const card = document.createElement('div');
      card.className = 'note-card ' + (note.id === state.selectedId ? 'active' : '');
      card.onclick = () => {
        state.selectedId = note.id;
        render();
        if (state.isMobile) {
          showDetailView();
        }
      };

      const dateStr = formatDate(note.updated_at || note.created_at);
      const snippet = (note.body || '').trim().replace(/^#+\s*/g, '').slice(0, 120);

      card.innerHTML = `
        <div class="note-card-header">
          <div class="note-card-title">
            ${note.pinned ? '<span class="note-card-pin">PIN</span>' : ''}
            <span>${escapeHtml(note.title || 'Nova Nota')}</span>
          </div>
          <span class="note-card-date">${dateStr}</span>
        </div>
        ${snippet ? `<div class="note-card-snippet">${escapeHtml(snippet)}</div>` : ''}
        ${note.tags && note.tags.length > 0 ? `
          <div class="note-card-tags">
            ${note.tags.map(t => `<span class="note-card-tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}
      `;

      container.appendChild(card);
    }
  }

  function renderNoteDetail() {
    const note = state.notes.find(n => n.id === state.selectedId);

    if (!note) {
      dom.viewDetail.classList.add('hidden');
      return;
    }

    dom.viewDetail.classList.remove('hidden');

    // Title
    dom.noteTitleInput.value = note.title || '';

    // Pin button active state
    dom.btnPinNote.style.background = note.pinned ? '#000000' : '';
    dom.btnPinNote.style.color = note.pinned ? '#ffffff' : '';

    // Mode buttons
    dom.btnModeRead.className = 'btn btn-sm ' + (state.viewMode === 'reading' ? 'active' : '');
    dom.btnModeEdit.className = 'btn btn-sm ' + (state.viewMode === 'edit' ? 'active' : '');

    // Format toolbar
    if (state.viewMode === 'edit') {
      dom.formatToolbar.classList.remove('hidden');
      dom.readingPane.classList.add('hidden');
      dom.editPane.classList.remove('hidden');
      dom.noteTextarea.value = note.body || '';
    } else {
      dom.formatToolbar.classList.add('hidden');
      dom.readingPane.classList.remove('hidden');
      dom.editPane.classList.add('hidden');
      dom.readingPane.innerHTML = renderMarkdown(note.body || '');
    }

    // Tags
    if (note.tags && note.tags.length > 0) {
      dom.noteTagsRow.innerHTML = note.tags.map(t => `<span class="note-card-tag">${escapeHtml(t)}</span>`).join('');
    } else {
      dom.noteTagsRow.innerHTML = '';
    }

    // Stats
    const words = (note.body || '').trim().split(/\s+/).filter(Boolean).length;
    const chars = (note.body || '').length;
    dom.noteStats.textContent = `${words} palavras · ${chars} caracteres`;
    dom.noteDate.textContent = `Atualizado: ${formatDate(note.updated_at || note.created_at)}`;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
  }

  // --- EVENT HANDLERS ---
  function onTitleChange() {
    const note = state.notes.find(n => n.id === state.selectedId);
    if (!note) return;
    note.title = dom.noteTitleInput.value.trim() || 'Nova Nota';
    note.updated_at = new Date().toISOString();
    saveNotes(true);
    renderNotesList();
  }

  function onBodyChange() {
    const note = state.notes.find(n => n.id === state.selectedId);
    if (!note) return;
    note.body = dom.noteTextarea.value;
    note.tags = extractTags(note.body);
    note.updated_at = new Date().toISOString();

    // Auto-update title if default
    if (!note.title || note.title === 'Nova Nota') {
      note.title = extractFirstHeadingOrTitle(note.body, 'Nova Nota');
      dom.noteTitleInput.value = note.title;
    }

    saveNotes(true);
    renderTagsBar();
    renderNotesList();

    const words = note.body.trim().split(/\s+/).filter(Boolean).length;
    dom.noteStats.textContent = `${words} palavras · ${note.body.length} caracteres`;
  }

  function showListView() {
    dom.viewList.classList.remove('hidden');
    dom.viewDetail.classList.add('hidden');
    dom.btnBackToList.classList.add('hidden');
    dom.appTitle.textContent = 'Notas';
  }

  function showDetailView() {
    dom.viewList.classList.add('hidden');
    dom.viewDetail.classList.remove('hidden');
    dom.btnBackToList.classList.remove('hidden');
    const note = state.notes.find(n => n.id === state.selectedId);
    dom.appTitle.textContent = note ? note.title : 'Nota';
  }

  // --- INITIALIZATION ---
  function init() {
    loadNotes();

    const cfg = getConfig();
    if (cfg.githubToken) {
      dom.inputGithubToken.value = cfg.githubToken;
    }
    if (cfg.gistId) {
      dom.inputGistId.value = cfg.gistId;
    }

    // Attach Header Events
    dom.btnNewNote.onclick = createNewNote;
    dom.btnBackToList.onclick = showListView;

    dom.btnToggleSearch.onclick = () => {
      dom.searchRow.classList.toggle('hidden');
      if (!dom.searchRow.classList.contains('hidden')) {
        dom.searchInput.focus();
      }
    };

    dom.searchInput.oninput = (e) => {
      state.searchQuery = e.target.value.trim();
      renderNotesList();
    };

    dom.btnClearSearch.onclick = () => {
      dom.searchInput.value = '';
      state.searchQuery = '';
      renderNotesList();
    };

    dom.btnSync.onclick = () => {
      syncWithGitHub(false);
    };

    dom.btnSettings.onclick = () => {
      dom.modalSettings.classList.remove('hidden');
      showSettingsStatus('', '');
    };

    dom.btnCloseSettings.onclick = () => {
      dom.modalSettings.classList.add('hidden');
    };

    dom.btnSaveSettings.onclick = async () => {
      const token = dom.inputGithubToken.value.trim();
      const gistId = dom.inputGistId.value.trim();
      setConfig({ githubToken: token, gistId: gistId });
      showSettingsStatus('Salvando e conectando ao GitHub...', '');
      await syncWithGitHub(true);
    };

    dom.btnSyncNow.onclick = async () => {
      await syncWithGitHub(true);
    };

    // Backup Export & Import
    dom.btnExportBackup.onclick = () => {
      const blob = new Blob([JSON.stringify(state.notes, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `notes-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    dom.inputImportBackup.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (Array.isArray(imported)) {
            state.notes = imported;
            saveNotes(true);
            render();
            showSettingsStatus('Backup restaurado com sucesso!', 'success');
          } else {
            showSettingsStatus('Formato de backup inválido.', 'error');
          }
        } catch (err) {
          showSettingsStatus('Erro ao ler arquivo JSON.', 'error');
        }
      };
      reader.readAsText(file);
    };

    // Detail events
    dom.noteTitleInput.oninput = onTitleChange;
    dom.noteTextarea.oninput = onBodyChange;
    dom.btnDeleteNote.onclick = deleteCurrentNote;
    dom.btnPinNote.onclick = togglePinCurrentNote;

    dom.btnModeRead.onclick = () => {
      state.viewMode = 'reading';
      renderNoteDetail();
    };

    dom.btnModeEdit.onclick = () => {
      state.viewMode = 'edit';
      renderNoteDetail();
      setTimeout(() => dom.noteTextarea.focus(), 50);
    };

    // Format toolbar actions
    dom.formatToolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-format');
      if (!btn) return;
      const fmt = btn.getAttribute('data-format');
      switch (fmt) {
        case 'bold': insertFormatSnippet('**', '**', 'negrito'); break;
        case 'italic': insertFormatSnippet('*', '*', 'itálico'); break;
        case 'h1': insertFormatSnippet('# ', '', 'Título 1'); break;
        case 'h2': insertFormatSnippet('## ', '', 'Título 2'); break;
        case 'task': insertFormatSnippet('- [ ] ', '', 'Tarefa'); break;
        case 'list': insertFormatSnippet('- ', '', 'Item'); break;
        case 'quote': insertFormatSnippet('> ', '', 'Citação'); break;
        case 'code': insertFormatSnippet('```\n', '\n```', 'código'); break;
      }
    });

    // Checkbox click in reading pane
    dom.readingPane.addEventListener('change', (e) => {
      if (e.target && e.target.classList.contains('task-checkbox')) {
        const idx = parseInt(e.target.getAttribute('data-task-idx'), 10);
        const note = state.notes.find(n => n.id === state.selectedId);
        if (note && !isNaN(idx)) {
          note.body = toggleTaskInMarkdown(note.body, idx);
          note.updated_at = new Date().toISOString();
          saveNotes(true);
          renderNoteDetail();
        }
      }
    });

    // Window resize
    window.addEventListener('resize', () => {
      const isMobile = window.innerWidth <= 768;
      if (isMobile !== state.isMobile) {
        state.isMobile = isMobile;
        if (!state.isMobile) {
          dom.viewList.classList.remove('hidden');
          dom.viewDetail.classList.remove('hidden');
          dom.btnBackToList.classList.add('hidden');
        } else {
          showListView();
        }
      }
    });

    render();

    // Responsive initial view
    if (state.isMobile) {
      showListView();
    }

    // Auto-sync initial run
    syncWithGitHub(false);

    // Register Service Worker for offline PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('SW registration failed:', err);
      });
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
