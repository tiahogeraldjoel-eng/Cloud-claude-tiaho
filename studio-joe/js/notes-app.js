/* Studio Joe — Notes Joe : carnet de notes (équivalent OneNote / Google Keep).
   Carnets, notes riches, listes à cocher, photos, mémos vocaux, dictée, étiquettes, couleurs, épingles,
   recherche plein texte, corbeille, export (texte, Markdown, Texte Joe, impression), partage.
   Tout est enregistré sur l'appareil (IndexedDB). */
(function () {
  const { $, toast, download, pickFiles, modal, confirmBox, baseName } = Studio;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const COLORS = { '': 'Aucune', '#f4c430': 'Jaune', '#43a047': 'Vert', '#1e88e5': 'Bleu', '#e91e63': 'Rose', '#8e24aa': 'Violet', '#f57c00': 'Orange' };
  const NB_COLORS = ['#c8901a', '#1e88e5', '#43a047', '#e53935', '#8e24aa', '#00897b', '#6d4c41'];

  /* ================= Stockage ================= */
  const db = {
    h: null,
    open() { if (this.h) return Promise.resolve(this.h); return new Promise((res, rej) => { const r = indexedDB.open('notes-joe', 1); r.onupgradeneeded = () => { r.result.createObjectStore('notes', { keyPath: 'id' }); r.result.createObjectStore('nbs', { keyPath: 'id' }); }; r.onsuccess = () => { this.h = r.result; res(this.h); }; r.onerror = () => rej(r.error); }); },
    async all(st) { const h = await this.open(); return new Promise((res, rej) => { const q = h.transaction(st).objectStore(st).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async put(st, v) { const h = await this.open(); return new Promise((res, rej) => { const t = h.transaction(st, 'readwrite'); t.objectStore(st).put(v); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async del(st, id) { const h = await this.open(); return new Promise((res, rej) => { const t = h.transaction(st, 'readwrite'); t.objectStore(st).delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  };

  let notes = [], nbs = [];
  let filter = { kind: 'all', id: null }; // all | pinned | todo | nb | tag | trash
  let current = null; // note ouverte
  const panes = $('#panes');
  const setView = (v) => { panes.dataset.view = v; };

  /* ================= Barre latérale ================= */
  const live = () => notes.filter((n) => !n.deleted);
  function renderNav() {
    const L = live(); const tags = {};
    L.forEach((n) => (n.tags || []).forEach((t) => { tags[t] = (tags[t] || 0) + 1; }));
    const item = (kind, id, label, count, extra = '') => `<button class="it${filter.kind === kind && (filter.id || null) === (id || null) ? ' on' : ''}" data-k="${kind}" data-id="${id ? esc(id) : ''}">${extra}<span>${label}</span><span class="n">${count || ''}</span></button>`;
    $('#nav').innerHTML = item('all', null, '🗒 Toutes les notes', L.length)
      + item('pinned', null, '📌 Épinglées', L.filter((n) => n.pinned).length)
      + item('todo', null, '☑ Tâches à faire', L.filter((n) => n.todo > 0).length)
      + `<h4>Carnets <button id="addNb" title="Nouveau carnet">＋</button></h4>`
      + nbs.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).map((b) => item('nb', b.id, esc(b.name), L.filter((n) => n.nb === b.id).length, `<span class="dot" style="background:${b.color}"></span>`)).join('')
      + (Object.keys(tags).length ? '<h4>Étiquettes</h4>' + Object.keys(tags).sort((a, b) => a.localeCompare(b)).map((t) => item('tag', t, '#' + esc(t), tags[t])).join('') : '')
      + '<h4>&nbsp;</h4>' + item('trash', null, '🗑 Corbeille', notes.filter((n) => n.deleted).length);
    $('#nav').querySelectorAll('.it').forEach((b) => {
      b.onclick = () => { filter = { kind: b.dataset.k, id: b.dataset.id || null }; renderNav(); renderList(); setView('list'); };
      if (b.dataset.k === 'nb') b.oncontextmenu = (e) => { e.preventDefault(); nbMenu(b.dataset.id); };
      if (b.dataset.k === 'nb') { let t; b.addEventListener('touchstart', () => { t = setTimeout(() => nbMenu(b.dataset.id), 600); }, { passive: true }); b.addEventListener('touchend', () => clearTimeout(t)); }
    });
    $('#addNb').onclick = (e) => { e.stopPropagation(); nbDialog(); };
  }
  async function nbDialog(nb) {
    const v = await modal({ title: nb ? 'Modifier le carnet' : 'Nouveau carnet', body: `<div class="field"><label for="nbN">Nom</label><input id="nbN" value="${nb ? esc(nb.name) : ''}" placeholder="ex. Recette municipale, Réunions, Personnel"></div><div class="field"><label>Couleur</label><div class="swatches" id="nbC">${NB_COLORS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${(nb ? nb.color : NB_COLORS[nbs.length % NB_COLORS.length]) === c ? 'on' : ''}" aria-label="${c}"></button>`).join('')}</div></div>`,
      onOpen: (b) => { b.querySelector('#nbN').focus(); b.querySelectorAll('#nbC button').forEach((x) => { x.onclick = () => { b.querySelectorAll('#nbC button').forEach((y) => y.classList.remove('on')); x.classList.add('on'); }; }); },
      buttons: [{ label: 'Annuler', value: null }, { label: nb ? 'Enregistrer' : 'Créer', primary: true, value: (b) => ({ name: b.querySelector('#nbN').value.trim(), color: (b.querySelector('#nbC .on') || {}).dataset?.c || NB_COLORS[0] }) }] });
    if (!v || !v.name) return;
    const o = nb || { id: uid(), order: nbs.length };
    Object.assign(o, v); if (!nb) nbs.push(o); await db.put('nbs', o);
    if (!nb) filter = { kind: 'nb', id: o.id };
    renderNav(); renderList();
  }
  async function nbMenu(id) {
    const nb = nbs.find((b) => b.id === id); if (!nb) return;
    const v = await modal({ title: 'Carnet « ' + nb.name + ' »', body: '<p>Que voulez-vous faire ?</p>', buttons: [{ label: 'Fermer', value: null }, { label: 'Supprimer', value: 'del' }, { label: 'Renommer / couleur', primary: true, value: 'edit' }] });
    if (v === 'edit') nbDialog(nb);
    if (v === 'del') {
      const n = live().filter((x) => x.nb === id).length;
      if (nbs.length < 2) return toast('Gardez au moins un carnet');
      if (!(await confirmBox(`Supprimer le carnet « ${nb.name} » ? ${n ? `Ses ${n} note(s) iront dans la corbeille.` : ''}`, 'Supprimer'))) return;
      for (const x of notes.filter((x) => x.nb === id)) { x.deleted = Date.now(); x.nb = nbs.find((b) => b.id !== id).id; await db.put('notes', x); }
      nbs = nbs.filter((b) => b.id !== id); await db.del('nbs', id); filter = { kind: 'all', id: null }; renderNav(); renderList();
    }
  }

  /* ================= Liste des notes ================= */
  function visible() {
    let L = filter.kind === 'trash' ? notes.filter((n) => n.deleted) : live();
    if (filter.kind === 'pinned') L = L.filter((n) => n.pinned);
    if (filter.kind === 'todo') L = L.filter((n) => n.todo > 0);
    if (filter.kind === 'nb') L = L.filter((n) => n.nb === filter.id);
    if (filter.kind === 'tag') L = L.filter((n) => (n.tags || []).includes(filter.id));
    const q = norm($('#q').value.trim());
    if (q) { const words = q.split(/\s+/); L = L.filter((n) => { const h = norm(n.title + ' ' + n.text + ' ' + (n.tags || []).join(' ')); return words.every((w) => h.includes(w)); }); }
    const s = $('#sort').value;
    L.sort((a, b) => (filter.kind !== 'trash' && b.pinned - a.pinned) || (s === 'title' ? (a.title || '').localeCompare(b.title || '') : s === 'cre' ? b.created - a.created : b.updated - a.updated));
    return L;
  }
  function when(t) {
    const d = new Date(t), now = new Date();
    if (d.toDateString() === now.toDateString()) return 'aujourd\'hui ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'hier ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  // surlignage des mots cherchés (insensible aux accents), extrait centré sur le premier trouvé
  function highlight(text, q) {
    const words = q ? q.split(/\s+/).filter((x) => x.length > 1) : [];
    if (!words.length) return esc(text);
    const first = Math.min(...words.map((w) => { const i = norm(text).indexOf(w); return i < 0 ? Infinity : i; }));
    if (isFinite(first) && first > 60) text = '…' + text.slice(first - 40);
    const n = norm(text); const marks = new Array(text.length).fill(false);
    words.forEach((w) => { let i = n.indexOf(w); while (i >= 0) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = n.indexOf(w, i + w.length); } });
    let out = '', on = false;
    for (let k = 0; k < text.length; k++) { if (marks[k] !== on) { out += marks[k] ? '<mark>' : '</mark>'; on = marks[k]; } out += esc(text[k]); }
    return on ? out + '</mark>' : out;
  }
  function renderList() {
    const L = visible(); const q = norm($('#q').value.trim());
    const nbName = (id) => (nbs.find((b) => b.id === id) || {}).name || '';
    const titles = { all: 'Toutes les notes', pinned: 'Épinglées', todo: 'Tâches à faire', trash: 'Corbeille (vidée après 30 jours)' };
    $('#listTitle').textContent = (filter.kind === 'nb' ? nbName(filter.id) : filter.kind === 'tag' ? '#' + filter.id : titles[filter.kind]) + ` · ${L.length}`;
    if (!L.length) { $('#cards').innerHTML = `<div class="empty-list">${q ? 'Aucune note ne contient « ' + esc($('#q').value) + ' ».' : filter.kind === 'trash' ? 'La corbeille est vide.' : 'Aucune note ici.<br><br>Touchez ＋ pour écrire.'}</div>`; return; }
    $('#cards').innerHTML = (filter.kind === 'trash' ? '<button id="emptyTrash" class="danger">Vider la corbeille</button>' : '') + L.map((n) => {
      const nb = nbs.find((b) => b.id === n.nb);
      return `<div class="card${current && current.id === n.id ? ' on' : ''}" data-id="${n.id}" style="border-left-color:${n.color || (nb ? nb.color : 'var(--line)')}">
        <h3>${n.pinned ? '📌' : ''}<span>${highlight(n.title || 'Sans titre', q)}</span></h3>
        <p>${highlight((n.text || '').slice(0, 400), q) || '<i>Note vide</i>'}</p>
        <div class="meta"><span>${when(n.updated)}</span>${filter.kind !== 'nb' && nb ? `<span>${esc(nb.name)}</span>` : ''}${n.todo || n.done ? `<span>☑ ${n.done}/${n.todo + n.done}</span>` : ''}${n.memos ? `<span>🎙 ${n.memos}</span>` : ''}${(n.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
        ${n.thumb ? `<img class="th" src="${n.thumb}" alt="">` : ''}</div>`;
    }).join('');
    $('#cards').querySelectorAll('.card').forEach((c) => { c.onclick = () => openNote(c.dataset.id); });
    const et = $('#emptyTrash'); if (et) et.onclick = emptyTrash;
  }
  async function emptyTrash() {
    const T = notes.filter((n) => n.deleted); if (!T.length) return;
    if (!(await confirmBox(`Supprimer définitivement ${T.length} note(s) ?`, 'Supprimer'))) return;
    for (const n of T) await db.del('notes', n.id);
    notes = notes.filter((n) => !n.deleted); if (current && current.deleted) closeNote(); renderNav(); renderList();
  }

  /* ================= Éditeur ================= */
  let saveTimer = null, bodyEl = null;
  function closeNote() { current = null; renderEditor(); }
  function openNote(id) { flush(); current = notes.find((n) => n.id === id) || null; renderEditor(); renderList(); setView('note'); }
  async function newNote(extra = {}) {
    flush();
    const nb = filter.kind === 'nb' ? filter.id : (nbs[0] || {}).id;
    const n = { id: uid(), nb, title: '', html: '', text: '', tags: filter.kind === 'tag' ? [filter.id] : [], pinned: filter.kind === 'pinned', color: '', created: Date.now(), updated: Date.now(), todo: 0, done: 0, ...extra };
    notes.push(n); await db.put('notes', n); current = n;
    if (filter.kind === 'trash' || filter.kind === 'todo') filter = { kind: 'all', id: null };
    renderNav(); renderList(); renderEditor(); setView('note');
    setTimeout(() => { const t = $('#ttl'); if (t && !n.title) t.focus(); }, 50);
    return n;
  }
  function renderEditor() {
    const ed = $('#ed');
    if (!current) { ed.innerHTML = '<div class="none"><div><p style="font-size:40px;margin:0">🗒</p><p>Choisissez une note, ou touchez ＋ pour en écrire une.</p></div></div>'; bodyEl = null; return; }
    const n = current; const trash = !!n.deleted;
    ed.innerHTML = `<div class="bar1">
        <button class="back" id="edBack" title="Retour à la liste">←</button>
        <select id="edNb" aria-label="Carnet">${nbs.map((b) => `<option value="${b.id}"${b.id === n.nb ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
        <span class="sp"></span>
        ${trash ? '<button id="edRestore" class="primary">Restaurer</button><button id="edKill" class="danger">Supprimer définitivement</button>' : `<button id="edPin" class="${n.pinned ? 'on' : ''}" title="Épingler en haut de la liste">📌</button><button id="edColor" title="Couleur">🎨</button><button id="edMore" title="Plus">⋯</button>`}
      </div>
      <input class="ttl" id="ttl" placeholder="Titre" value="${esc(n.title)}" ${trash ? 'disabled' : ''}>
      <div class="tagsrow"><span>#</span><input id="tags" placeholder="étiquettes, séparées par des virgules" value="${esc((n.tags || []).join(', '))}" ${trash ? 'disabled' : ''}></div>
      <div class="scroll"><div id="recbar"></div>${trash ? '' : `<div class="tb" id="tb">
        <button data-c="h2" title="Titre">T</button><button data-c="bold" title="Gras (Ctrl+B)"><b>G</b></button><button data-c="italic" title="Italique (Ctrl+I)"><i>I</i></button><button data-c="underline" title="Souligné (Ctrl+U)"><u>S</u></button><button data-c="mark" title="Surligner">🖍</button>
        <span class="sep"></span><button data-c="chk" title="Liste à cocher">☑</button><button data-c="ul" title="Liste à puces">•</button><button data-c="ol" title="Liste numérotée">1.</button><button data-c="hr" title="Séparateur">—</button>
        <span class="sep"></span><button data-c="photo" title="Photo ou image">📷</button><button data-c="memo" title="Mémo vocal (enregistrer)">🎙</button><button data-c="dictate" title="Dictée : parler pour écrire">🗣</button><button data-c="date" title="Insérer la date et l'heure">🕒</button>
        <span class="sep"></span><button data-c="read" title="Lire à voix haute">🔊</button>
      </div>`}<div class="body" id="body" contenteditable="${trash ? 'false' : 'true'}" data-ph="Écrivez ici… (☑ pour une liste à cocher, 📷 pour une photo, 🎙 pour un mémo vocal)">${n.html}</div></div>
      <div class="foot"><span>Créée ${when(n.created)}</span><span>Modifiée ${when(n.updated)}</span><span id="saved"></span></div>`;
    bodyEl = $('#body'); lastRange = null;
    $('#edBack').onclick = () => { flush(); setView('list'); renderList(); };
    $('#edNb').onchange = (e) => { n.nb = e.target.value; touch(); renderNav(); };
    if (trash) {
      $('#edRestore').onclick = async () => { delete n.deleted; await db.put('notes', n); renderNav(); renderList(); renderEditor(); toast('Note restaurée'); };
      $('#edKill').onclick = async () => { if (!(await confirmBox('Supprimer définitivement cette note ?', 'Supprimer'))) return; notes = notes.filter((x) => x !== n); await db.del('notes', n.id); closeNote(); renderNav(); renderList(); setView('list'); };
      return;
    }
    $('#ttl').oninput = (e) => { n.title = e.target.value; touch(); };
    $('#ttl').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); bodyEl.focus(); } };
    $('#tags').onchange = (e) => { n.tags = [...new Set(e.target.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))]; e.target.value = n.tags.join(', '); touch(); renderNav(); };
    $('#edPin').onclick = (e) => { n.pinned = !n.pinned; e.currentTarget.classList.toggle('on', n.pinned); touch(); renderNav(); };
    $('#edColor').onclick = colorDialog; $('#edMore').onclick = moreMenu;
    bodyEl.addEventListener('input', () => touch());
    bodyEl.addEventListener('click', onBodyClick);
    bodyEl.addEventListener('keydown', onBodyKey);
    bodyEl.addEventListener('paste', onPaste);
    bodyEl.addEventListener('drop', onDrop);
    $('#tb').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // garde la sélection
    $('#tb').addEventListener('click', (e) => { const b = e.target.closest('button[data-c]'); if (b) cmd(b.dataset.c, b); });
    if (dictSession) $('#tb [data-c="dictate"]').classList.add('on');
  }
  function touch() {
    if (!current) return; current.updated = Date.now(); const s = $('#saved'); if (s) s.textContent = '…';
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600);
  }
  // champs calculés d'une note (texte pour la recherche, tâches, mémos, vignette)
  function derive(n, el) {
    if (!el) { el = document.createElement('div'); el.innerHTML = n.html; }
    const clone = el.cloneNode(true); clone.querySelectorAll('.memo').forEach((m) => m.remove());
    clone.querySelectorAll('li, p, div, h2, h3, ul, ol, br').forEach((e) => { e.insertAdjacentText('beforebegin', ' '); e.insertAdjacentText('afterend', ' '); });
    n.text = clone.textContent.replace(/\s+/g, ' ').trim();
    n.todo = el.querySelectorAll('ul.chk li:not([data-done="1"])').length; n.done = el.querySelectorAll('ul.chk li[data-done="1"]').length;
    n.memos = el.querySelectorAll('.memo').length;
  }
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!current || current.deleted || !bodyEl) return;
    const n = current;
    n.html = bodyEl.innerHTML.replace(/^(<br>)+$/, '');
    derive(n, bodyEl);
    const img = bodyEl.querySelector('img'); n.thumb = img ? (img.dataset.th || thumbOf(img)) : '';
    db.put('notes', n).then(() => { const s = $('#saved'); if (s && current === n) s.textContent = '✓ Enregistrée'; }).catch((e) => { console.error(e); toast('Enregistrement impossible : mémoire de l\'appareil pleine ?', 6000); });
    renderList(); renderNavCounts();
  }
  let navTimer = null; const renderNavCounts = () => { clearTimeout(navTimer); navTimer = setTimeout(renderNav, 400); };
  function thumbOf(img) {
    try { const c = document.createElement('canvas'); const s = 112 / Math.max(1, Math.min(img.naturalWidth, img.naturalHeight)); c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); const u = c.toDataURL('image/jpeg', 0.7); img.dataset.th = u; return u; } catch (e) { return ''; }
  }

  // dernière position du curseur dans la note (le choix d'une photo ou le micro font perdre la sélection)
  let lastRange = null;
  document.addEventListener('selectionchange', () => { const s = getSelection(); if (bodyEl && s.rangeCount && bodyEl.contains(s.anchorNode)) lastRange = s.getRangeAt(0).cloneRange(); });
  // photo et mémo : jamais à l'intérieur d'une liste, mais juste après
  function caretOutOfList() { const s = getSelection(); if (!s.rangeCount) return; let n = s.anchorNode; if (n.nodeType === 3) n = n.parentElement; const list = n && n.closest && n.closest('#body ul, #body ol'); if (!list) return; let nx = list.nextSibling; if (!nx || nx.nodeType !== 1 || nx.tagName !== 'DIV') { nx = document.createElement('div'); nx.innerHTML = '<br>'; list.after(nx); } const r = document.createRange(); r.setStart(nx, 0); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
  function focusAtCaret() { bodyEl.focus(); if (lastRange && bodyEl.contains(lastRange.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange); } else { const r = document.createRange(); r.selectNodeContents(bodyEl); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }
  function exec(c, v = null) { bodyEl.focus(); document.execCommand(c, false, v); touch(); }
  function cmd(c, btn) {
    switch (c) {
      case 'h2': { const b = blockOf(); exec('formatBlock', b && b.tagName === 'H2' ? 'div' : 'h2'); break; }
      case 'bold': case 'italic': case 'underline': exec(c); break;
      case 'mark': { const s = getSelection(); if (s.isCollapsed) return toast('Sélectionnez d\'abord le texte à surligner'); const anc = s.anchorNode && s.anchorNode.parentElement && s.anchorNode.parentElement.closest('mark'); if (anc) { anc.replaceWith(...anc.childNodes); touch(); } else { const m = document.createElement('mark'); try { s.getRangeAt(0).surroundContents(m); } catch (e) { m.textContent = s.toString(); s.getRangeAt(0).deleteContents(); s.getRangeAt(0).insertNode(m); } touch(); } break; }
      case 'ul': exec('insertUnorderedList'); break;
      case 'ol': exec('insertOrderedList'); break;
      case 'chk': {
        const li = blockOf() && blockOf().closest('li'); const ul = li && li.parentElement;
        if (ul && ul.classList.contains('chk')) { exec('insertUnorderedList'); break; }
        if (!ul || ul.tagName !== 'UL') exec('insertUnorderedList');
        const l2 = blockOf() && blockOf().closest('ul'); if (l2) { l2.classList.add('chk'); l2.querySelectorAll('li').forEach((x) => { if (!x.dataset.done) x.dataset.done = '0'; }); }
        touch(); break;
      }
      case 'hr': exec('insertHTML', '<hr><div><br></div>'); break;
      case 'date': exec('insertText', new Date().toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' '); break;
      case 'photo': addPhoto(); break;
      case 'memo': recordMemo(); break;
      case 'dictate': dictate(btn); break;
      case 'read': readAloud(); break;
    }
  }
  function blockOf() { const s = getSelection(); if (!s.rangeCount || !bodyEl.contains(s.anchorNode)) return null; let n = s.anchorNode; if (n.nodeType === 3) n = n.parentElement; return n.closest('li, h2, h3, div, p') || n; }
  function onBodyClick(e) {
    const li = e.target.closest('ul.chk > li');
    if (li && e.target === li) { const r = li.getBoundingClientRect(); if (e.clientX - r.left < 28) { li.dataset.done = li.dataset.done === '1' ? '0' : '1'; touch(); e.preventDefault(); } }
    const a = e.target.closest('a[href]'); if (a && (e.ctrlKey || e.metaKey || !bodyEl.isContentEditable)) window.open(a.href, '_blank', 'noopener');
  }
  function onBodyKey(e) {
    if (e.key === 'Enter') { const li = blockOf() && blockOf().closest('ul.chk > li'); if (li) setTimeout(() => { const n2 = blockOf() && blockOf().closest('ul.chk > li'); if (n2 && n2 !== li) n2.dataset.done = '0'; }, 0); }
    // « [] » ou « - [ ] » en début de ligne : case à cocher
    if (e.key === ' ') { const b = blockOf(); if (b && !b.closest('li') && /^(\[\s?\]|-\s?\[\s?\])$/.test(b.textContent.trim())) { e.preventDefault(); b.textContent = ''; cmd('chk'); } else if (b && !b.closest('li') && /^[-*•]$/.test(b.textContent.trim())) { e.preventDefault(); b.textContent = ''; cmd('ul'); } }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); cmd('chk'); }
  }
  async function onPaste(e) {
    const files = [...(e.clipboardData.files || [])].filter((f) => /^image\//.test(f.type));
    e.preventDefault();
    if (files.length) { for (const f of files) await insertImage(f); return; }
    const t = e.clipboardData.getData('text/plain'); if (!t) return;
    const html = t.split(/\r?\n/).map((l) => esc(l)).join('<br>');
    document.execCommand('insertHTML', false, linkify(html)); touch();
  }
  const linkify = (h) => h.replace(/(^|[\s>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  async function onDrop(e) { const files = [...(e.dataTransfer.files || [])].filter((f) => /^image\//.test(f.type)); if (!files.length) return; e.preventDefault(); for (const f of files) await insertImage(f); }
  async function addPhoto() { const fs = await pickFiles('image/*', true); for (const f of fs) await insertImage(f); }
  async function insertImage(f) {
    const img = await Studio.loadImage(await Studio.readAsDataURL(f));
    const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    focusAtCaret(); caretOutOfList(); document.execCommand('insertHTML', false, `<img src="${c.toDataURL('image/jpeg', 0.82)}" alt=""><div><br></div>`); touch();
  }

  /* --- mémo vocal --- */
  let memoRec = null;
  async function recordMemo() {
    if (memoRec) { memoRec.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Enregistrement impossible dans ce navigateur');
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return toast('Micro refusé : autorisez-le dans les réglages', 6000); }
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined); const chunks = [];
    const note = current; const range = (() => { const s = getSelection(); return s.rangeCount && bodyEl.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null; })();
    const t0 = Date.now(); const bar = $('#recbar');
    const tick = setInterval(() => { const b = $('#recbar'); if (b && memoRec) b.innerHTML = `<div class="recbar"><span class="dot"></span><span>Mémo vocal ${fmt((Date.now() - t0) / 1000)}</span><span style="flex:1"></span><button id="memoStop" class="danger">⏹ Arrêter</button></div>`; const s = $('#memoStop'); if (s) s.onclick = () => mr.stop(); }, 250);
    memoRec = mr; void bar;
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      clearInterval(tick); stream.getTracks().forEach((t) => t.stop()); memoRec = null; const b = $('#recbar'); if (b) b.innerHTML = '';
      const sec = (Date.now() - t0) / 1000; if (sec < 0.6) return;
      const url = await Studio.readAsDataURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
      const html = `<div class="memo" contenteditable="false">🎙<audio controls preload="metadata" src="${url}"></audio><span>${fmt(sec)} · ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span></div><div><br></div>`;
      if (current !== note) { note.html += html; db.put('notes', note); toast('Mémo ajouté à « ' + (note.title || 'Sans titre') + ' »'); return; }
      if (range) lastRange = range; focusAtCaret(); caretOutOfList();
      document.execCommand('insertHTML', false, html); touch(); toast('Mémo vocal ajouté');
    };
    mr.start(1000); toast('Enregistrement… touchez 🎙 ou « Arrêter » pour terminer', 3000);
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  /* --- dictée et lecture --- */
  let dictSession = null;
  async function dictate(btn) {
    if (dictSession) { dictSession.stop(); dictSession = null; document.querySelectorAll('[data-c="dictate"]').forEach((b) => b.classList.remove('on')); toast('Dictée arrêtée'); return; }
    if (!Studio.speech) return toast('Dictée indisponible');
    bodyEl.focus();
    try {
      dictSession = await Studio.speech.start(Studio.speech.savedEngine(), {
        lang: Studio.speech.savedLang(),
        onFinal: (text) => { if (!bodyEl) return; bodyEl.focus(); const s = getSelection(); const before = s.rangeCount && s.anchorNode && s.anchorNode.nodeType === 3 ? s.anchorNode.nodeValue.slice(0, s.anchorOffset) : ''; const sep = before && !/\s$/.test(before) && !/^[.,;:?!…]/.test(text) ? ' ' : ''; document.execCommand('insertText', false, sep + text); touch(); },
        onError: (m) => { toast('Dictée : ' + m, 6000); if (dictSession) dictSession.stop(); dictSession = null; document.querySelectorAll('[data-c="dictate"]').forEach((b) => b.classList.remove('on')); },
      });
      if (btn) btn.classList.add('on');
      toast('Parlez : le texte s\'écrit au curseur. « virgule », « point », « à la ligne » sont compris.', 5000);
    } catch (e) { dictSession = null; toast('Dictée impossible : ' + (e.message || e), 6000); }
  }
  let readCtl = null;
  async function readAloud() {
    if (readCtl) { readCtl.stop(); readCtl = null; return; }
    if (!Studio.tts || !Studio.tts.available()) return toast('Lecture à voix haute indisponible dans ce navigateur');
    const s = getSelection(); const text = (s.rangeCount && bodyEl.contains(s.anchorNode) && !s.isCollapsed ? s.toString() : (current.title ? current.title + '. ' : '') + bodyEl.innerText).trim();
    if (!text) return;
    await Studio.tts.loadVoices(); let pref = {}; try { pref = JSON.parse(localStorage.getItem('voix-prefs') || '{}'); } catch (e) { /* ignore */ }
    readCtl = Studio.tts.speak(text, { voiceURI: pref.voice || '', lang: 'fr-FR', rate: +(pref.rate || 1), onEnd: () => { readCtl = null; } });
    toast('Lecture en cours — touchez 🔊 pour arrêter', 3000);
  }

  /* --- couleur, menu ⋯, export --- */
  async function colorDialog() {
    const n = current;
    const v = await modal({ title: 'Couleur de la note', body: `<div class="swatches" style="flex-wrap:wrap">${Object.entries(COLORS).map(([c, l]) => `<button type="button" data-c="${c}" title="${l}" style="background:${c || 'var(--panel-2)'}" class="${(n.color || '') === c ? 'on' : ''}">${c ? '' : '∅'}</button>`).join('')}</div>`,
      onOpen: (b) => b.querySelectorAll('button[data-c]').forEach((x) => { x.onclick = () => { b.querySelectorAll('button[data-c]').forEach((y) => y.classList.remove('on')); x.classList.add('on'); }; }),
      buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => ({ c: (b.querySelector('button.on') || { dataset: { c: '' } }).dataset.c }) }] });
    if (!v) return; n.color = v.c; touch(); flush();
  }
  async function moreMenu() {
    flush(); const n = current;
    const v = await modal({ title: n.title || 'Note', body: '<p class="hint">Exporter, partager ou supprimer cette note.</p>', buttons: [
      { label: 'Supprimer', value: 'del' }, { label: 'Dupliquer', value: 'dup' }, { label: 'Imprimer / PDF', value: 'print' }, { label: '.txt', value: 'txt' }, { label: '.md', value: 'md' }, { label: 'Ouvrir dans Texte Joe', value: 'doc' }, { label: 'Partager', primary: true, value: 'share' }] });
    if (!v) return;
    const title = n.title || 'Note';
    if (v === 'del') { n.deleted = Date.now(); await db.put('notes', n); closeNote(); renderNav(); renderList(); setView('list'); toast('Note mise à la corbeille'); }
    if (v === 'dup') { await newNote({ title: title + ' (copie)', html: n.html, text: n.text, tags: [...(n.tags || [])], color: n.color, nb: n.nb, todo: n.todo, done: n.done, thumb: n.thumb }); }
    if (v === 'txt') download(new Blob([title + '\n\n' + toText(n.html)], { type: 'text/plain;charset=utf-8' }), safe(title) + '.txt');
    if (v === 'md') download(new Blob([toMarkdown(n)], { type: 'text/markdown;charset=utf-8' }), safe(title) + '.md');
    if (v === 'print') printNote(n);
    if (v === 'doc') openInTexte(n);
    if (v === 'share') {
      const text = title + '\n\n' + toText(n.html);
      if (navigator.share) { try { await navigator.share({ title, text }); } catch (e) { /* annulé */ } }
      else { try { await navigator.clipboard.writeText(text); toast('Texte copié : collez-le où vous voulez'); } catch (e) { toast('Partage indisponible'); } }
    }
  }
  const safe = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
  function toText(html) {
    const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('.memo').forEach((m) => m.replaceWith('[mémo vocal]'));
    d.querySelectorAll('ul.chk > li').forEach((li) => li.prepend(li.dataset.done === '1' ? '☑ ' : '☐ ')); d.querySelectorAll('ul:not(.chk) > li').forEach((li) => li.prepend('• '));
    d.querySelectorAll('ol').forEach((ol) => [...ol.children].forEach((li, i) => li.prepend(`${i + 1}. `)));
    d.querySelectorAll('img').forEach((m) => m.replaceWith('[image]'));
    d.querySelectorAll('br').forEach((b) => b.replaceWith('\n')); d.querySelectorAll('li, p, div, h2, h3, hr').forEach((e) => e.append('\n'));
    return d.textContent.replace(/\n{3,}/g, '\n\n').trim();
  }
  function toMarkdown(n) {
    const d = document.createElement('div'); d.innerHTML = n.html; const out = [];
    const inl = (el) => [...el.childNodes].map((c) => { if (c.nodeType === 3) return c.nodeValue; if (c.nodeType !== 1) return ''; const t = inl(c); switch (c.tagName) { case 'B': case 'STRONG': return t.trim() ? `**${t}**` : t; case 'I': case 'EM': return t.trim() ? `*${t}*` : t; case 'MARK': return `==${t}==`; case 'A': return `[${t}](${c.getAttribute('href')})`; case 'BR': return '\n'; case 'IMG': return '![image]'; default: return t; } }).join('');
    const walk = (el) => { for (const c of el.childNodes) { if (c.nodeType === 3) { if (c.nodeValue.trim()) out.push(c.nodeValue.trim()); continue; } if (c.nodeType !== 1) continue; const tg = c.tagName;
      if (tg === 'H2') out.push('## ' + inl(c)); else if (tg === 'H3') out.push('### ' + inl(c)); else if (tg === 'HR') out.push('---');
      else if (tg === 'UL') [...c.children].forEach((li) => out.push((c.classList.contains('chk') ? (li.dataset.done === '1' ? '- [x] ' : '- [ ] ') : '- ') + inl(li)));
      else if (tg === 'OL') [...c.children].forEach((li, i) => out.push(`${i + 1}. ${inl(li)}`));
      else if (c.classList.contains('memo')) out.push('*[mémo vocal]*'); else if (tg === 'IMG') out.push('![image]');
      else if (c.querySelector('ul,ol,h2,h3,hr,div')) walk(c); else out.push(inl(c)); } };
    walk(d);
    return `# ${n.title || 'Note'}\n\n${(n.tags || []).length ? n.tags.map((t) => '#' + t).join(' ') + '\n\n' : ''}${out.join('\n\n').replace(/\n{3,}/g, '\n\n')}\n`;
  }
  function printNote(n) {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
    const d = f.contentDocument; d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(n.title || 'Note')}</title><style>body{font:12pt/1.5 Calibri,Carlito,'Segoe UI',Arial,sans-serif;margin:18mm}img{max-width:100%}ul.chk{list-style:none;padding-left:0}ul.chk li::before{content:'☐  '}ul.chk li[data-done="1"]::before{content:'☑  '}ul.chk li[data-done="1"]{text-decoration:line-through;color:#777}.memo{display:none}mark{background:#ffe58a}.meta{color:#777;font-size:10pt}</style></head><body><h1>${esc(n.title || 'Note')}</h1><p class="meta">${new Date(n.updated).toLocaleString('fr-FR')}${(n.tags || []).length ? ' · ' + n.tags.map((t) => '#' + esc(t)).join(' ') : ''}</p>${n.html}</body></html>`); d.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 400);
  }
  async function openInTexte(n) {
    const d = document.createElement('div'); d.innerHTML = n.html; d.querySelectorAll('.memo').forEach((m) => m.remove());
    d.querySelectorAll('ul.chk > li').forEach((li) => li.prepend(li.dataset.done === '1' ? '☑ ' : '☐ ')); d.querySelectorAll('ul.chk').forEach((u) => { u.style.listStyle = 'none'; u.classList.remove('chk'); });
    d.querySelectorAll('div').forEach((x) => { if (!x.querySelector('div,ul,ol,h2,h3')) { const p = document.createElement('p'); p.innerHTML = x.innerHTML; x.replaceWith(p); } });
    const html = `<h1>${esc(n.title || 'Note')}</h1>` + d.innerHTML; const id = uid();
    await new Promise((res, rej) => { const q = indexedDB.open('texte-joe', 1); q.onupgradeneeded = () => { q.result.createObjectStore('docs'); q.result.createObjectStore('kv'); }; q.onsuccess = () => { const h = q.result; const tx = h.transaction(['docs', 'kv'], 'readwrite'); tx.objectStore('docs').put({ id, title: n.title || 'Note', html, updated: Date.now() }, id); tx.objectStore('kv').put(id, 'current'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }; q.onerror = () => rej(q.error); });
    location.href = 'texte.html';
  }
  async function importFiles() {
    const fs = await pickFiles('.txt,.md,text/plain,text/markdown', true); if (!fs.length) return;
    let last = null;
    for (const f of fs) {
      const t = await f.text(); const lines = t.split(/\r?\n/);
      let title = baseName(f.name); if (/^#\s+/.test(lines[0] || '')) { title = lines.shift().replace(/^#\s+/, ''); }
      const html = lines.map((l) => { const m = /^- \[( |x)\] (.*)$/i.exec(l); if (m) return `<ul class="chk"><li data-done="${m[1] === ' ' ? 0 : 1}">${esc(m[2])}</li></ul>`; if (/^##+ /.test(l)) return `<h2>${esc(l.replace(/^#+ /, ''))}</h2>`; return `<div>${linkify(esc(l)) || '<br>'}</div>`; }).join('').replace(/<\/ul><ul class="chk">/g, '');
      const n = { id: uid(), nb: filter.kind === 'nb' ? filter.id : nbs[0].id, title, html, text: t.replace(/\s+/g, ' ').slice(0, 2000), tags: [], pinned: false, color: '', created: f.lastModified || Date.now(), updated: Date.now(), todo: (html.match(/data-done="0"/g) || []).length, done: (html.match(/data-done="1"/g) || []).length };
      derive(n); notes.push(n); await db.put('notes', n); last = n;
    }
    renderNav(); renderList(); if (last) openNote(last.id); toast(`${fs.length} note(s) importée(s)`);
  }

  /* ================= Démarrage ================= */
  async function start() {
    try { [notes, nbs] = await Promise.all([db.all('notes'), db.all('nbs')]); } catch (e) { console.error(e); toast('Stockage indisponible : les notes ne seront pas gardées', 7000); }
    if (!nbs.length) {
      nbs = [{ id: uid(), name: 'Mes notes', color: NB_COLORS[0], order: 0 }, { id: uid(), name: 'Travail', color: NB_COLORS[1], order: 1 }, { id: uid(), name: 'Personnel', color: NB_COLORS[2], order: 2 }];
      for (const b of nbs) await db.put('nbs', b).catch(() => {});
      if (!notes.length) {
        const n = { id: uid(), nb: nbs[0].id, title: 'Bienvenue dans Notes Joe', tags: ['aide'], pinned: true, color: '#f4c430', created: Date.now(), updated: Date.now(),
          html: '<div>Vos notes restent sur cet appareil, même sans internet.</div><h2>Pour commencer</h2><ul class="chk"><li data-done="1">Ouvrir Notes Joe</li><li data-done="0">Toucher ＋ pour écrire une note</li><li data-done="0">Taper ☑ pour une liste à cocher (ou « [] » puis espace)</li><li data-done="0">Ajouter une photo 📷 ou un mémo vocal 🎙</li><li data-done="0">Dicter avec 🗣 au lieu de taper</li></ul><div>Touchez la case pour cocher une tâche. Les notes avec des tâches non cochées apparaissent dans « Tâches à faire ». Rangez vos notes dans des carnets et ajoutez des #étiquettes. Un appui long sur un carnet permet de le renommer.</div>' };
        derive(n); notes.push(n); await db.put('notes', n).catch(() => {});
      }
    }
    // corbeille : suppression définitive après 30 jours
    const old = notes.filter((n) => n.deleted && Date.now() - n.deleted > 30 * 864e5);
    for (const n of old) await db.del('notes', n.id).catch(() => {});
    notes = notes.filter((n) => !old.includes(n));
    renderNav(); renderList(); renderEditor();
    if (innerWidth > 860) { const first = visible()[0]; if (first) openNote(first.id); }
  }
  $('#q').addEventListener('input', () => renderList());
  $('#sort').addEventListener('change', () => renderList());
  $('#newBtn').onclick = () => newNote(); $('#fab').onclick = () => newNote();
  $('#navBtn').onclick = () => setView(panes.dataset.view === 'nav' ? 'list' : 'nav');
  $('#importBtn').onclick = importFiles;
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newNote(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.altKey) { e.preventDefault(); setView('list'); $('#q').focus(); } });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('popstate', () => { if (panes.dataset.view === 'note') { flush(); setView('list'); } });
  start();
  window.NotesJoe = { get notes() { return notes; }, get nbs() { return nbs; }, get current() { return current; }, newNote, openNote, flush, toMarkdown, toText, cmd };
})();
