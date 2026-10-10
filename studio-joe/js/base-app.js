/* Studio Joe — Base Joe : interface (volet de navigation, feuilles de données, mode création des tables,
   relations, requêtes en mode création ou SQL, formulaires avec sous-formulaires, états imprimables). */
(function () {
  const { $, toast, download, pickFiles, modal, confirmBox, baseName, initMenus } = Studio;
  const E = Studio.baseEngine;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const loaded = {};
  function loadScript(src) { if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('bibliothèque introuvable : ' + src)); }; document.head.appendChild(s); }); return loaded[src]; }

  /* ================= Stockage ================= */
  const idb = {
    h: null,
    open() { if (this.h) return Promise.resolve(this.h); return new Promise((res, rej) => { const r = indexedDB.open('base-joe', 1); r.onupgradeneeded = () => { r.result.createObjectStore('dbs', { keyPath: 'id' }); r.result.createObjectStore('kv'); }; r.onsuccess = () => { this.h = r.result; res(this.h); }; r.onerror = () => rej(r.error); }); },
    async all() { const h = await this.open(); return new Promise((res, rej) => { const q = h.transaction('dbs').objectStore('dbs').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async put(v) { const h = await this.open(); return new Promise((res, rej) => { const t = h.transaction('dbs', 'readwrite'); t.objectStore('dbs').put(v); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async del(id) { const h = await this.open(); return new Promise((res, rej) => { const t = h.transaction('dbs', 'readwrite'); t.objectStore('dbs').delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async kv(k, v) { const h = await this.open(); return new Promise((res, rej) => { const t = h.transaction('kv', v === undefined ? 'readonly' : 'readwrite'); const st = t.objectStore('kv'); const q = v === undefined ? st.get(k) : st.put(v, k); t.oncomplete = () => res(v === undefined ? q.result : v); t.onerror = () => rej(t.error); }); },
  };
  let db = null; let saveT = null;
  function dirty() { if (!db) return; db.updated = Date.now(); clearTimeout(saveT); saveT = setTimeout(() => idb.put(db).catch((e) => toast('Enregistrement impossible : ' + e.message, 6000)), 500); }
  async function useDb(d) { db = d; db.forms = db.forms || []; db.reports = db.reports || []; db.queries = db.queries || []; db.relations = db.relations || []; await idb.put(db); await idb.kv('current', db.id); tabs = []; active = null; renderAll(); }

  /* ================= Onglets ================= */
  let tabs = [], active = null; const state = {};
  const ICON = { T: '▦', D: '✎', Q: '⌕', F: '▤', R: '🖶', REL: '⇄' };
  function open(key) { if (!tabs.includes(key)) tabs.push(key); active = key; renderTabs(); renderPane(); $('#main').classList.remove('navopen'); }
  function closeTab(key) { tabs = tabs.filter((k) => k !== key); delete state[key]; if (active === key) active = tabs[tabs.length - 1] || null; renderTabs(); renderPane(); }
  const kindOfKey = (k) => k.split('|')[0]; const nameOfKey = (k) => k.split('|').slice(1).join('|');
  function renderTabs() {
    $('#tabs').innerHTML = tabs.map((k) => `<div class="tb${k === active ? ' on' : ''}" data-k="${esc(k)}"><span>${ICON[kindOfKey(k)]}</span><span>${esc(k === 'REL' ? 'Relations' : nameOfKey(k))}${kindOfKey(k) === 'D' ? ' (création)' : ''}</span><button data-x title="Fermer">✕</button></div>`).join('');
    $('#tabs').querySelectorAll('.tb').forEach((el) => { el.onclick = (e) => { if (e.target.closest('[data-x]')) closeTab(el.dataset.k); else { active = el.dataset.k; renderTabs(); renderPane(); } }; });
  }
  function renderAll() { $('#dbName').textContent = db ? db.name : ''; document.title = db ? `${db.name} — Base Joe` : 'Base Joe'; renderNav(); renderTabs(); renderPane(); }
  function refreshOpen() { renderNav(); renderPane(); }

  /* ================= Volet de navigation ================= */
  function renderNav() {
    if (!db) { $('#nav').innerHTML = ''; return; }
    const f = norm($('#navQ') ? $('#navQ').value : '');
    const sec = (title, kind, list, add) => `<h4>${title}<button data-add="${add}" title="Créer">＋</button></h4>` + list.filter((x) => !f || norm(x.name).includes(f)).map((x) => `<div class="it${active === kind + '|' + x.name ? ' on' : ''}" data-k="${kind}|${esc(x.name)}"><span class="ic">${ICON[kind]}</span><span class="nm">${esc(x.name)}</span><button class="more" data-more title="Plus">⋯</button></div>`).join('');
    const q = $('#navQ') ? $('#navQ').value : '';
    $('#nav').innerHTML = `<input type="search" id="navQ" placeholder="Rechercher…" value="${esc(q)}" aria-label="Rechercher un objet">`
      + sec('Tables', 'T', db.tables, 'newTable') + sec('Requêtes', 'Q', db.queries, 'newQuery') + sec('Formulaires', 'F', db.forms, 'newForm') + sec('États', 'R', db.reports, 'newReport')
      + `<h4>Base</h4><div class="it" data-k="REL"><span class="ic">⇄</span><span class="nm">Relations (${db.relations.length})</span></div>`;
    const qi = $('#navQ'); qi.oninput = () => { const pos = qi.selectionStart; renderNav(); const n = $('#navQ'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#nav').querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => act(b.dataset.add); });
    $('#nav').querySelectorAll('.it').forEach((el) => { el.onclick = (e) => { if (e.target.closest('[data-more]')) { objMenu(el.dataset.k); return; } open(el.dataset.k); renderNav(); }; });
  }
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  async function objMenu(key) {
    const kind = kindOfKey(key), name = nameOfKey(key);
    const btn = [{ label: 'Fermer', value: null }, { label: 'Supprimer', value: 'del' }, { label: 'Renommer', value: 'ren' }];
    if (kind === 'T') btn.push({ label: 'Exporter en CSV', value: 'csv' }, { label: 'Dupliquer la structure', value: 'dup' }, { label: 'Mode création', value: 'design' }, { label: 'Ouvrir', primary: true, value: 'open' });
    else if (kind === 'Q') btn.push({ label: 'Dupliquer', value: 'dup' }, { label: 'Mode création', value: 'design' }, { label: 'Ouvrir', primary: true, value: 'open' });
    else btn.push({ label: 'Modifier', value: 'design' }, { label: 'Ouvrir', primary: true, value: 'open' });
    const v = await modal({ title: name, body: `<p class="help">${{ T: 'Table', Q: 'Requête', F: 'Formulaire', R: 'État' }[kind]}</p>`, buttons: btn });
    if (!v) return;
    const list = { T: db.tables, Q: db.queries, F: db.forms, R: db.reports }[kind]; const obj = list.find((x) => x.name === name);
    if (v === 'open') open(key);
    if (v === 'design') { if (kind === 'T') open('D|' + name); else if (kind === 'Q') { open(key); state[key].mode = state[key].mode === 'design' && !obj.design ? 'sql' : obj.design ? 'design' : 'sql'; renderPane(); } else if (kind === 'F') formDialog(obj); else reportDialog(obj); }
    if (v === 'csv') download(new Blob([E.toCsv(obj)], { type: 'text/csv;charset=utf-8' }), obj.name + '.csv');
    if (v === 'ren') { const n = await askName('Nouveau nom', obj.name, list, obj); if (!n) return; renameObject(kind, obj, n); }
    if (v === 'dup') { const n = await askName('Nom de la copie', obj.name + ' (copie)', list); if (!n) return; const c = JSON.parse(JSON.stringify(obj)); c.name = n; c.id = E.uid(); if (kind === 'T') { c.rows = []; c.seq = 0; } list.push(c); dirty(); renderNav(); }
    if (v === 'del') {
      if (kind === 'T') { const deps = db.relations.filter((r) => same(r.one.table, name) || same(r.many.table, name)); if (!(await confirmBox(`Supprimer la table « ${name} » et ses ${obj.rows.length} enregistrement(s) ?${deps.length ? ` Ses ${deps.length} relation(s) seront supprimées.` : ''}`, 'Supprimer'))) return; db.relations = db.relations.filter((r) => !deps.includes(r)); db.tables.forEach((t) => t.fields.forEach((f) => { if (f.lookup && same(f.lookup.table, name)) delete f.lookup; })); }
      else if (!(await confirmBox(`Supprimer « ${name} » ?`, 'Supprimer'))) return;
      list.splice(list.indexOf(obj), 1); tabs.filter((k) => nameOfKey(k) === name && (kindOfKey(k) === kind || (kind === 'T' && kindOfKey(k) === 'D'))).forEach(closeTab); dirty(); renderNav();
    }
  }
  function renameObject(kind, obj, n) {
    const old = obj.name; obj.name = n;
    if (kind === 'T') { db.relations.forEach((r) => { if (same(r.one.table, old)) r.one.table = n; if (same(r.many.table, old)) r.many.table = n; }); db.tables.forEach((t) => t.fields.forEach((f) => { if (f.lookup && same(f.lookup.table, old)) f.lookup.table = n; })); db.forms.forEach((f) => { if (same(f.table, old)) f.table = n; }); }
    db.reports.forEach((r) => { if (same(r.source, old)) r.source = n; });
    tabs = tabs.map((k) => (nameOfKey(k) === old && (kindOfKey(k) === kind || (kind === 'T' && kindOfKey(k) === 'D')) ? `${kindOfKey(k)}|${n}` : k)); if (active && nameOfKey(active) === old) active = `${kindOfKey(active)}|${n}`;
    Object.keys(state).forEach((k) => { if (nameOfKey(k) === old) { state[`${kindOfKey(k)}|${n}`] = state[k]; delete state[k]; } });
    dirty(); renderAll();
    if (kind !== 'T') return; toast('Pensez à mettre à jour les requêtes SQL qui citent l\'ancien nom', 5000);
  }
  async function askName(title, def, list, self) {
    const v = await modal({ title, body: `<div class="field"><label for="anN">Nom</label><input id="anN" value="${esc(def)}"></div>`, onOpen: (b) => { const i = b.querySelector('#anN'); i.focus(); i.select(); }, buttons: [{ label: 'Annuler', value: null }, { label: 'OK', primary: true, value: (b) => b.querySelector('#anN').value.trim() }] });
    if (!v) return null; if (/[.!`[\]]/.test(v)) { toast('Un nom ne peut pas contenir . ! ` [ ]'); return null; }
    if (list && list.some((x) => x !== self && same(x.name, v))) { toast('Ce nom existe déjà'); return null; }
    if (!self && [...db.tables, ...db.queries].some((x) => same(x.name, v)) && (list === db.tables || list === db.queries)) { toast('Une table ou une requête porte déjà ce nom'); return null; }
    return v;
  }
  const nextName = (base, list) => { let i = 1; while (list.some((x) => same(x.name, base + i))) i++; return base + i; };

  /* ================= Volet principal ================= */
  function renderPane() {
    const pane = $('#pane');
    if (!db) { pane.innerHTML = welcomeHtml(); bindWelcome(); return; }
    if (!active) { pane.innerHTML = `<div class="welcome"><h2>${esc(db.name)}</h2><p class="help">${db.tables.length} table(s), ${db.queries.length} requête(s), ${db.forms.length} formulaire(s), ${db.reports.length} état(s). Ouvrez un objet dans le volet de gauche${innerWidth < 800 ? ' (☰)' : ''}, ou créez-en un.</p><div class="row"><button data-act="newTable">＋ Table</button><button data-act="newQuery">＋ Requête</button><button data-act="newForm">＋ Formulaire</button><button data-act="newReport">＋ État</button><button data-act="relations">⇄ Relations</button></div></div>`; return; }
    const kind = kindOfKey(active), name = nameOfKey(active);
    state[active] = state[active] || {};
    try {
      if (kind === 'T') { const t = E.table(db, name); if (!t) return closeTab(active); renderDatasheet(t, state[active]); }
      else if (kind === 'D') { const t = E.table(db, name); if (!t) return closeTab(active); renderDesign(t); }
      else if (kind === 'Q') { const q = db.queries.find((x) => x.name === name); if (!q) return closeTab(active); renderQuery(q, state[active]); }
      else if (kind === 'F') { const f = db.forms.find((x) => x.name === name); if (!f) return closeTab(active); renderForm(f, state[active]); }
      else if (kind === 'R') { const r = db.reports.find((x) => x.name === name); if (!r) return closeTab(active); renderReport(r, state[active]); }
      else if (kind === 'REL') renderRelations();
    } catch (e) { console.error(e); pane.innerHTML = `<div class="welcome"><p>Erreur : ${esc(e.message)}</p></div>`; }
  }

  /* ================= Feuille de données ================= */
  const isNum = (f) => ['int', 'auto', 'double', 'money'].includes(f.type);
  function cellText(f, v) { if (f.lookup) return E.lookupLabel(db, f, v); return E.display(f, v); }
  function renderDatasheet(t, st) {
    st.limit = st.limit || 200; st.sel = st.sel || new Set();
    let rows = t.rows;
    const q = norm(st.q || '');
    if (q) rows = rows.filter((r) => t.fields.some((f) => norm(cellText(f, r[f.name])).includes(q)));
    if (st.fq) rows = rows.filter((r) => r[st.fq.f] === st.fq.v);
    if (st.sort) { const f = t.fields.find((x) => x.name === st.sort.f); if (f) { const k = (r) => (f.lookup ? String(cellText(f, r[f.name])).toLowerCase() : r[f.name]); rows = [...rows].sort((a, b) => { const x = k(a), y = k(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * (st.sort.dir === 'desc' ? -1 : 1); }); } }
    const shown = rows.slice(0, st.limit);
    const pk = E.pkOf(t);
    $('#pane').innerHTML = `<div class="bar"><button class="primary" data-x="new">＋ Nouvel enregistrement</button><button data-x="del" ${st.sel.size ? '' : 'disabled'}>🗑 Supprimer${st.sel.size ? ` (${st.sel.size})` : ''}</button><input type="search" data-x="q" placeholder="Rechercher…" value="${esc(st.q || '')}" aria-label="Rechercher">${st.fq ? `<button data-x="unf" title="Retirer le filtre">✕ Filtre : ${esc(st.fq.f)} = ${esc(cellText(t.fields.find((f) => f.name === st.fq.f) || {}, st.fq.v))}</button>` : ''}<span class="count">${rows.length} enregistrement(s)${rows.length !== t.rows.length ? ` sur ${t.rows.length}` : ''}</span><span class="sp"></span><button data-x="form">▤ Formulaire</button><button data-x="design">✎ Mode création</button><button data-x="csv">CSV</button><button data-x="xlsx">Excel</button></div>
      <table class="ds"><thead><tr><th class="sel"><input type="checkbox" data-x="all" aria-label="Tout sélectionner"></th>${t.fields.map((f) => `<th data-f="${esc(f.name)}" title="${esc(E.TYPES[f.type].label)}${f.pk ? ' — clé primaire' : ''}">${f.pk ? '🔑 ' : ''}${esc(f.name)}${st.sort && st.sort.f === f.name ? (st.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${shown.map((r) => `<tr data-i="${t.rows.indexOf(r)}"><td class="sel"><input type="checkbox" ${st.sel.has(r) ? 'checked' : ''} aria-label="Sélectionner"></td>${t.fields.map((f) => `<td class="${isNum(f) ? 'num' : ''}" data-f="${esc(f.name)}">${f.type === 'bool' ? `<input type="checkbox" ${r[f.name] ? 'checked' : ''} aria-label="${esc(f.name)}">` : `<div class="v">${esc(cellText(f, r[f.name]))}</div>`}</td>`).join('')}</tr>`).join('')}
      <tr class="new"><td class="sel">✱</td>${t.fields.map((f, j) => `<td><div class="v">${j === 0 ? '(Nouveau)' : ''}</div></td>`).join('')}</tr></tbody></table>
      ${rows.length > st.limit ? `<div class="more-rows"><button data-x="more">Afficher ${Math.min(500, rows.length - st.limit)} de plus (${rows.length - st.limit} restants)</button></div>` : ''}`;
    void pk;
    const P = $('#pane');
    P.querySelector('[data-x="new"]').onclick = () => recordDialog(t, null);
    P.querySelector('tr.new').onclick = () => recordDialog(t, null);
    P.querySelector('[data-x="del"]').onclick = async () => { const list = [...st.sel].filter((r) => t.rows.includes(r)); if (!list.length) return; if (!(await confirmBox(`Supprimer ${list.length} enregistrement(s) ? Cette action est définitive.`, 'Supprimer'))) return; const r = E.deleteRows(db, t, list); if (r.err) return toast(r.err, 8000); st.sel.clear(); dirty(); toast(`${r.n} enregistrement(s) supprimé(s)${r.cascade ? `, ${r.cascade} lié(s) supprimé(s) en cascade` : ''}`); refreshOpen(); };
    const qi = P.querySelector('[data-x="q"]'); qi.oninput = () => { st.q = qi.value; st.limit = 200; const pos = qi.selectionStart; renderDatasheet(t, st); const n = $('#pane [data-x="q"]'); n.focus(); n.setSelectionRange(pos, pos); };
    const unf = P.querySelector('[data-x="unf"]'); if (unf) unf.onclick = () => { st.fq = null; renderDatasheet(t, st); };
    P.querySelector('[data-x="form"]').onclick = () => quickForm(t);
    P.querySelector('[data-x="design"]').onclick = () => open('D|' + t.name);
    P.querySelector('[data-x="csv"]').onclick = () => download(new Blob([E.toCsv({ fields: t.fields, rows })], { type: 'text/csv;charset=utf-8' }), t.name + '.csv');
    P.querySelector('[data-x="xlsx"]').onclick = async () => download(await E.toXlsx({ tables: [{ ...t, rows }] }), t.name + '.xlsx');
    const more = P.querySelector('[data-x="more"]'); if (more) more.onclick = () => { st.limit += 500; renderDatasheet(t, st); };
    P.querySelector('[data-x="all"]').onchange = (e) => { if (e.target.checked) shown.forEach((r) => st.sel.add(r)); else st.sel.clear(); renderDatasheet(t, st); };
    P.querySelectorAll('th[data-f]').forEach((th) => { th.onclick = () => { const f = th.dataset.f; st.sort = st.sort && st.sort.f === f ? (st.sort.dir === 'asc' ? { f, dir: 'desc' } : null) : { f, dir: 'asc' }; renderDatasheet(t, st); }; });
    P.querySelectorAll('tbody tr[data-i]').forEach((tr) => {
      const row = t.rows[+tr.dataset.i];
      tr.querySelector('td.sel input').onchange = (e) => { if (e.target.checked) st.sel.add(row); else st.sel.delete(row); const d = P.querySelector('[data-x="del"]'); d.disabled = !st.sel.size; d.textContent = `🗑 Supprimer${st.sel.size ? ` (${st.sel.size})` : ''}`; };
      tr.querySelectorAll('td[data-f]').forEach((td) => {
        const f = t.fields.find((x) => x.name === td.dataset.f);
        if (f.type === 'bool') { td.querySelector('input').onchange = (e) => { const r = E.saveRow(db, t, row, { [f.name]: e.target.checked }); if (r.errs) { toast(r.errs.join(' — '), 6000); e.target.checked = !e.target.checked; } else dirty(); }; return; }
        td.onclick = () => editCell(t, st, row, f, td);
        td.oncontextmenu = (e) => { e.preventDefault(); st.fq = { f: f.name, v: row[f.name] }; renderDatasheet(t, st); toast('Filtré par sélection — ✕ pour retirer le filtre'); };
      });
    });
  }
  function inputFor(f, v, cls = '') {
    const val = v == null ? '' : v;
    if (f.lookup) { const lt = E.table(db, f.lookup.table); const opts = lt ? lt.rows.map((r) => [r[f.lookup.field], E.lookupLabel(db, f, r[f.lookup.field])]).sort((a, b) => String(a[1]).localeCompare(String(b[1]))) : []; return `<select class="${cls}" data-in><option value=""></option>${opts.map(([k, l]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`; }
    if (f.values && f.values.length) { if (f.limit) return `<select class="${cls}" data-in><option value=""></option>${f.values.map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`; const id = 'dl' + Math.random().toString(36).slice(2, 7); return `<input class="${cls}" data-in list="${id}" value="${esc(val)}"><datalist id="${id}">${f.values.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`; }
    switch (f.type) {
      case 'bool': return `<input type="checkbox" class="${cls}" data-in ${v ? 'checked' : ''}>`;
      case 'date': return /T/.test(val) ? `<input type="datetime-local" class="${cls}" data-in value="${esc(String(val).slice(0, 16))}">` : `<input type="date" class="${cls}" data-in value="${esc(val)}">`;
      case 'memo': return `<textarea class="${cls}" data-in rows="3">${esc(val)}</textarea>`;
      case 'auto': return `<input class="${cls} ro" data-in value="${esc(val === '' ? '(NuméroAuto)' : val)}" disabled>`;
      case 'int': case 'double': case 'money': return `<input class="${cls}" data-in inputmode="decimal" value="${esc(val === '' ? '' : String(val).replace('.', ','))}">`;
      default: return `<input class="${cls}" data-in value="${esc(val)}"${f.size ? ` maxlength="${f.size}"` : ''}>`;
    }
  }
  function readInput(f, el) {
    if (f.type === 'bool') return el.checked;
    let v = el.value; if (f.lookup) { if (v === '') return null; const lt = E.table(db, f.lookup.table); const bf = lt && lt.fields.find((x) => x.name === f.lookup.field); return bf && isNum(bf) ? Number(v) : v; }
    return v;
  }
  function editCell(t, st, row, f, td) {
    if (f.type === 'auto' || td.classList.contains('edit')) return;
    td.classList.add('edit'); td.innerHTML = inputFor(f, row[f.name]);
    const el = td.querySelector('[data-in]'); el.focus(); if (el.select && el.tagName === 'INPUT') el.select();
    let done = false;
    const commit = (move) => {
      if (done) return; done = true;
      const v = readInput(f, el);
      const r = E.saveRow(db, t, row, { [f.name]: v });
      if (r.errs) { toast(r.errs.join(' — '), 6000); done = false; el.focus(); return; }
      dirty(); renderDatasheet(t, st);
      if (move) { const rows = [...$('#pane').querySelectorAll('tbody tr[data-i]')]; const ri = rows.findIndex((x) => t.rows[+x.dataset.i] === r.row); const fi = t.fields.indexOf(f); let nr = ri, nf = fi + (move === 'next' ? 1 : 0); if (move === 'down') nr = ri + 1; if (nf >= t.fields.length) { nf = 0; nr = ri + 1; } const tr = rows[nr]; if (tr) { const cell = tr.querySelector(`td[data-f="${CSS.escape(t.fields[nf].name)}"]`); if (cell && t.fields[nf].type !== 'bool' && t.fields[nf].type !== 'auto') cell.click(); } }
    };
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && el.tagName !== 'TEXTAREA') { e.preventDefault(); commit('down'); } else if (e.key === 'Tab') { e.preventDefault(); commit('next'); } else if (e.key === 'Escape') { done = true; renderDatasheet(t, st); } });
    el.addEventListener('blur', () => setTimeout(() => { if (!done && document.activeElement !== el) commit(); }, 120));
    if (el.tagName === 'SELECT') el.addEventListener('change', () => commit());
  }
  // saisie d'un enregistrement dans une fenêtre (nouveau ou modification)
  async function recordDialog(t, row, preset = {}, hide = []) {
    const vals = { ...(row || {}), ...preset };
    const res = await modal({ title: row ? `Modifier — ${t.name}` : `Nouvel enregistrement — ${t.name}`, wide: true,
      body: `<div class="rec" style="border-top:0;padding:0">${t.fields.filter((f) => !hide.includes(f.name)).map((f) => `<div class="fl"><label>${esc(f.name)}${f.required || f.pk ? ' *' : ''}</label><div data-f="${esc(f.name)}">${inputFor(f, vals[f.name])}</div></div>`).join('')}<p class="hint" id="recErr" style="color:#c62828"></p></div>`,
      onOpen: (b) => { const first = b.querySelector('[data-in]:not([disabled])'); if (first) first.focus(); },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Enregistrer', primary: true, validate: (b) => {
        const v = {}; b.querySelectorAll('[data-f]').forEach((d) => { const f = t.fields.find((x) => x.name === d.dataset.f); if (f.type !== 'auto') v[f.name] = readInput(f, d.querySelector('[data-in]')); });
        for (const k of Object.keys(preset)) v[k] = preset[k];
        const r = E.saveRow(db, t, row || {}, v);
        if (r.errs) { b.querySelector('#recErr').textContent = r.errs.join(' — '); return false; }
        b.dataset.saved = '1'; b._row = r.row; return true;
      }, value: (b) => b._row }] });
    if (res) { dirty(); refreshOpen(); }
    return res;
  }

  /* ================= Mode création d'une table ================= */
  function renderDesign(t) {
    const P = $('#pane');
    P.innerHTML = `<div class="bar"><button data-x="ds">▦ Feuille de données</button><button class="primary" data-x="add">＋ Ajouter un champ</button><span class="sp"></span><span class="count">${t.rows.length} enregistrement(s)</span></div>
      <div class="design"><table><thead><tr><th title="Clé primaire">🔑</th><th>Nom du champ</th><th>Type de données</th><th>Taille</th><th title="Obligatoire">Oblig.</th><th title="Indexé sans doublons">Sans doublons</th><th>Valeur par défaut</th><th>Liste de choix</th><th>Description</th><th></th></tr></thead><tbody>
      ${t.fields.map((f, i) => `<tr data-i="${i}"><td class="c"><input type="radio" name="pk" data-k="pk" ${f.pk ? 'checked' : ''} aria-label="Clé primaire"></td><td><input data-k="name" value="${esc(f.name)}"></td><td><select data-k="type">${Object.entries(E.TYPES).map(([k, x]) => `<option value="${k}"${k === f.type ? ' selected' : ''}>${x.label}</option>`).join('')}</select></td>
        <td>${f.type === 'text' ? `<input data-k="size" type="number" min="1" max="255" value="${f.size || 255}" style="width:70px">` : ''}</td><td class="c"><input type="checkbox" data-k="required" ${f.required || f.pk ? 'checked' : ''} ${f.pk ? 'disabled' : ''}></td><td class="c"><input type="checkbox" data-k="unique" ${f.unique || f.pk ? 'checked' : ''} ${f.pk ? 'disabled' : ''}></td>
        <td>${f.type === 'auto' ? '' : `<input data-k="default" value="${esc(f.default || '')}" placeholder="${f.type === 'date' ? 'Date()' : ''}">`}</td><td><button data-k="lookup">${f.lookup ? '↗ ' + esc(f.lookup.table) : f.values && f.values.length ? `${f.values.length} valeurs` : 'Aucune'}</button></td>
        <td><input data-k="desc" value="${esc(f.desc || '')}"></td><td style="white-space:nowrap"><button data-k="up" ${i ? '' : 'disabled'}>↑</button><button data-k="down" ${i < t.fields.length - 1 ? '' : 'disabled'}>↓</button><button data-k="del" class="danger">🗑</button></td></tr>`).join('')}
      </tbody></table>
      <p class="help">Clé primaire 🔑 : identifie chaque enregistrement (valeur unique, obligatoire). « Liste de choix » : liste de valeurs, ou valeur prise dans une autre table (crée une relation). Les noms ne peuvent pas contenir . ! \` [ ].</p></div>`;
    P.querySelector('[data-x="ds"]').onclick = () => open('T|' + t.name);
    P.querySelector('[data-x="add"]').onclick = () => { t.fields.push({ name: nextName('Champ', t.fields), type: 'text', size: 255 }); dirty(); renderDesign(t); const ins = P.querySelectorAll('input[data-k="name"]'); ins[ins.length - 1].focus(); ins[ins.length - 1].select(); };
    P.querySelectorAll('tbody tr').forEach((tr) => {
      const f = t.fields[+tr.dataset.i];
      tr.querySelectorAll('[data-k]').forEach((el) => {
        const k = el.dataset.k;
        const handler = async () => {
          if (k === 'name') { const n = el.value.trim(); if (!n || /[.!`[\]]/.test(n) || t.fields.some((x) => x !== f && same(x.name, n))) { toast(!n ? 'Nom vide' : 'Nom invalide ou déjà utilisé'); el.value = f.name; return; } E.renameField(db, t, f, n); }
          else if (k === 'type') {
            const type = el.value; if (type === 'auto' && t.fields.some((x) => x !== f && x.type === 'auto')) { toast('Une table ne peut avoir qu\'un seul champ NuméroAuto'); el.value = f.type; return; }
            const lost = t.rows.filter((r) => r[f.name] != null && E.coerce({ ...f, type }, ['text', 'memo'].includes(type) ? String(r[f.name]) : r[f.name]).err).length;
            if (lost && !(await confirmBox(`${lost} valeur(s) ne peuvent pas être converties en « ${E.TYPES[type].label} » et seront effacées. Continuer ?`, 'Convertir'))) { el.value = f.type; return; }
            E.changeFieldType(t, f, type); if (type === 'text' && !f.size) f.size = 255; if (type !== 'text') delete f.size;
          }
          else if (k === 'size') { const n = Math.max(1, Math.min(255, +el.value || 255)); const long = t.rows.filter((r) => r[f.name] && String(r[f.name]).length > n).length; if (long && !(await confirmBox(`${long} valeur(s) dépassent ${n} caractères et seront tronquées. Continuer ?`, 'Tronquer'))) { el.value = f.size; return; } t.rows.forEach((r) => { if (r[f.name] && r[f.name].length > n) r[f.name] = r[f.name].slice(0, n); }); f.size = n; }
          else if (k === 'required') { if (el.checked && t.rows.some((r) => r[f.name] == null || r[f.name] === '')) { toast('Des enregistrements n\'ont pas de valeur pour ce champ : complétez-les d\'abord'); el.checked = false; return; } f.required = el.checked; }
          else if (k === 'unique') { if (el.checked) { const seen = new Set(); if (t.rows.some((r) => { const v = r[f.name]; if (v == null) return false; if (seen.has(v)) return true; seen.add(v); return false; })) { toast('Ce champ contient des doublons : impossible de l\'indexer sans doublons'); el.checked = false; return; } } f.unique = el.checked; }
          else if (k === 'pk') { const seen = new Set(); if (t.rows.some((r) => { const v = r[f.name]; if (v == null || seen.has(v)) return true; seen.add(v); return false; })) { toast('Ce champ a des valeurs vides ou en double : il ne peut pas être clé primaire'); renderDesign(t); return; } t.fields.forEach((x) => { x.pk = x === f; }); f.required = true; }
          else if (k === 'default') f.default = el.value.trim() || undefined;
          else if (k === 'desc') f.desc = el.value;
          else if (k === 'lookup') { await lookupDialog(t, f); }
          else if (k === 'up' || k === 'down') { const i = t.fields.indexOf(f), j = i + (k === 'up' ? -1 : 1); [t.fields[i], t.fields[j]] = [t.fields[j], t.fields[i]]; }
          else if (k === 'del') { if (f.pk && t.fields.length > 1 && !(await confirmBox('Ce champ est la clé primaire. Le supprimer quand même ?', 'Supprimer'))) return; if (!(await confirmBox(`Supprimer le champ « ${f.name} » et ses données ?`, 'Supprimer'))) return; t.fields.splice(t.fields.indexOf(f), 1); t.rows.forEach((r) => delete r[f.name]); db.relations = db.relations.filter((r) => !((same(r.one.table, t.name) && r.one.field === f.name) || (same(r.many.table, t.name) && r.many.field === f.name))); }
          dirty(); renderDesign(t); renderNav();
        };
        el.addEventListener(['name', 'size', 'default', 'desc'].includes(k) ? 'change' : el.tagName === 'BUTTON' ? 'click' : 'change', handler);
      });
    });
  }
  async function lookupDialog(t, f) {
    const others = db.tables.filter((x) => x !== t);
    const cur = f.lookup ? 'table' : f.values && f.values.length ? 'values' : 'none';
    const lt0 = f.lookup ? E.table(db, f.lookup.table) : others[0];
    const fieldOpts = (tt, sel) => (tt ? tt.fields.map((x) => `<option${x.name === sel ? ' selected' : ''}>${esc(x.name)}</option>`).join('') : '');
    const v = await modal({ title: `Liste de choix — ${f.name}`, wide: true,
      body: `<div class="field"><label for="lkM">Valeurs proposées</label><select id="lkM"><option value="none"${cur === 'none' ? ' selected' : ''}>Aucune (saisie libre)</option><option value="values"${cur === 'values' ? ' selected' : ''}>Liste de valeurs que je tape</option><option value="table"${cur === 'table' ? ' selected' : ''} ${others.length ? '' : 'disabled'}>Valeurs prises dans une autre table</option></select></div>
        <div id="lkV"><div class="field"><label for="lkVals">Une valeur par ligne</label><textarea id="lkVals" rows="6">${esc((f.values || []).join('\n'))}</textarea></div><label class="row"><input type="checkbox" id="lkLim" ${f.limit ? 'checked' : ''}> Limiter à la liste</label></div>
        <div id="lkT"><div class="row"><div class="field" style="flex:1"><label for="lkTab">Table</label><select id="lkTab">${others.map((x) => `<option${lt0 && x.name === lt0.name ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div><div class="field" style="flex:1"><label for="lkF">Champ enregistré</label><select id="lkF">${fieldOpts(lt0, f.lookup ? f.lookup.field : (lt0 && E.pkOf(lt0) || {}).name)}</select></div><div class="field" style="flex:1"><label for="lkS">Champ affiché</label><select id="lkS">${fieldOpts(lt0, f.lookup ? f.lookup.show : ((lt0 && lt0.fields.find((x) => x.type === 'text')) || {}).name)}</select></div></div>
        <label class="row"><input type="checkbox" id="lkRel" checked> Créer la relation avec intégrité référentielle (recommandé)</label></div>`,
      onOpen: (b) => { const sync = () => { const m = b.querySelector('#lkM').value; b.querySelector('#lkV').hidden = m !== 'values'; b.querySelector('#lkT').hidden = m !== 'table'; }; b.querySelector('#lkM').onchange = sync; sync(); b.querySelector('#lkTab').onchange = () => { const tt = E.table(db, b.querySelector('#lkTab').value); b.querySelector('#lkF').innerHTML = fieldOpts(tt, (E.pkOf(tt) || {}).name); b.querySelector('#lkS').innerHTML = fieldOpts(tt, (tt.fields.find((x) => x.type === 'text') || {}).name); }; },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: (b) => ({ m: b.querySelector('#lkM').value, vals: b.querySelector('#lkVals').value.split('\n').map((s) => s.trim()).filter(Boolean), lim: b.querySelector('#lkLim').checked, tab: b.querySelector('#lkTab').value, fld: b.querySelector('#lkF').value, show: b.querySelector('#lkS').value, rel: b.querySelector('#lkRel').checked }) }] });
    if (!v) return;
    delete f.lookup; delete f.values; delete f.limit;
    if (v.m === 'values') { f.values = v.vals; f.limit = v.lim; }
    if (v.m === 'table' && v.tab) {
      const lt = E.table(db, v.tab); const bf = lt.fields.find((x) => x.name === v.fld);
      const wantType = bf.type === 'auto' ? 'int' : bf.type;
      if (f.type !== wantType) { const lost = t.rows.filter((r) => r[f.name] != null && E.coerce({ ...f, type: wantType }, r[f.name]).err).length; if (lost && !(await confirmBox(`Le champ doit devenir « ${E.TYPES[wantType].label} » comme ${lt.name}.${bf.name} ; ${lost} valeur(s) seront effacées. Continuer ?`, 'Continuer'))) return; E.changeFieldType(t, f, wantType); delete f.size; }
      f.lookup = { table: lt.name, field: bf.name, show: v.show };
      if (v.rel && !db.relations.some((r) => same(r.many.table, t.name) && r.many.field === f.name)) {
        const keys = new Set(lt.rows.map((r) => r[bf.name])); const orphans = t.rows.filter((r) => r[f.name] != null && !keys.has(r[f.name])).length;
        db.relations.push({ id: E.uid(), name: lt.name + t.name, one: { table: lt.name, field: bf.name }, many: { table: t.name, field: f.name }, integrity: !orphans, cascadeDelete: false });
        if (orphans) toast(`Relation créée sans intégrité : ${orphans} valeur(s) n'existent pas dans ${lt.name}`, 7000);
      }
    }
  }

  /* ================= Relations ================= */
  function renderRelations() {
    const P = $('#pane');
    P.innerHTML = `<div class="bar"><button class="primary" data-x="add">＋ Nouvelle relation</button><span class="sp"></span><span class="count">${db.relations.length} relation(s)</span></div><div class="rels">${db.relations.length ? '' : '<p class="help">Aucune relation. Une relation relie un champ d\'une table (souvent la clé primaire, côté « 1 ») au champ correspondant d\'une autre table (côté « plusieurs ») : par exemple Contribuables.N° → Paiements.Contribuable.</p>'}
      ${db.relations.map((r, i) => `<div class="relc" data-i="${i}"><div class="side"><b>${esc(r.one.table)}</b>${esc(r.one.field)}</div><div class="lnk">1 ─── ∞<br><label class="row" style="justify-content:center"><input type="checkbox" data-k="integrity" ${r.integrity ? 'checked' : ''}> Intégrité</label><label class="row" style="justify-content:center"><input type="checkbox" data-k="cascadeDelete" ${r.cascadeDelete ? 'checked' : ''} ${r.integrity ? '' : 'disabled'}> Suppression en cascade</label></div><div class="side"><b>${esc(r.many.table)}</b>${esc(r.many.field)}</div><button data-k="del" class="danger" title="Supprimer la relation">🗑</button></div>`).join('')}</div>`;
    P.querySelector('[data-x="add"]').onclick = relationDialog;
    P.querySelectorAll('.relc').forEach((el) => {
      const r = db.relations[+el.dataset.i];
      el.querySelector('[data-k="integrity"]').onchange = (e) => { if (e.target.checked) { const o = orphansOf(r); if (o) { toast(`Impossible : ${o} valeur(s) de ${r.many.table}.${r.many.field} n'existent pas dans ${r.one.table}`, 7000); e.target.checked = false; return; } } r.integrity = e.target.checked; if (!r.integrity) r.cascadeDelete = false; dirty(); renderRelations(); };
      el.querySelector('[data-k="cascadeDelete"]').onchange = (e) => { r.cascadeDelete = e.target.checked; dirty(); };
      el.querySelector('[data-k="del"]').onclick = async () => { if (!(await confirmBox('Supprimer cette relation ?', 'Supprimer'))) return; db.relations.splice(db.relations.indexOf(r), 1); const mt = E.table(db, r.many.table); const f = mt && mt.fields.find((x) => x.name === r.many.field); if (f && f.lookup && same(f.lookup.table, r.one.table)) delete f.lookup; dirty(); renderRelations(); renderNav(); };
    });
  }
  function orphansOf(r) { const one = E.table(db, r.one.table), many = E.table(db, r.many.table); if (!one || !many) return 0; const keys = new Set(one.rows.map((x) => x[r.one.field])); return many.rows.filter((x) => x[r.many.field] != null && !keys.has(x[r.many.field])).length; }
  async function relationDialog() {
    if (db.tables.length < 2) return toast('Il faut au moins deux tables');
    const fo = (t, sel) => t.fields.map((x) => `<option${x.name === sel ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
    const t0 = db.tables[0], t1 = db.tables[1];
    const v = await modal({ title: 'Nouvelle relation', wide: true,
      body: `<div class="row"><div class="field" style="flex:1"><label for="rOneT">Table principale (côté 1)</label><select id="rOneT">${db.tables.map((t) => `<option>${esc(t.name)}</option>`).join('')}</select></div><div class="field" style="flex:1"><label for="rOneF">Champ (en général la clé)</label><select id="rOneF">${fo(t0, (E.pkOf(t0) || {}).name)}</select></div></div>
        <div class="row"><div class="field" style="flex:1"><label for="rManyT">Table liée (côté plusieurs)</label><select id="rManyT">${db.tables.map((t) => `<option${t === t1 ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div><div class="field" style="flex:1"><label for="rManyF">Champ correspondant</label><select id="rManyF">${fo(t1)}</select></div></div>
        <label class="row"><input type="checkbox" id="rInt" checked> Appliquer l'intégrité référentielle</label><label class="row"><input type="checkbox" id="rCas"> Suppression en cascade des enregistrements liés</label>`,
      onOpen: (b) => { b.querySelector('#rOneT').onchange = (e) => { const t = E.table(db, e.target.value); b.querySelector('#rOneF').innerHTML = fo(t, (E.pkOf(t) || {}).name); }; b.querySelector('#rManyT').onchange = (e) => { b.querySelector('#rManyF').innerHTML = fo(E.table(db, e.target.value)); }; },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Créer', primary: true, value: (b) => ({ one: { table: b.querySelector('#rOneT').value, field: b.querySelector('#rOneF').value }, many: { table: b.querySelector('#rManyT').value, field: b.querySelector('#rManyF').value }, integrity: b.querySelector('#rInt').checked, cascadeDelete: b.querySelector('#rCas').checked }) }] });
    if (!v) return;
    if (same(v.one.table, v.many.table) && v.one.field === v.many.field) return toast('Choisissez deux champs différents');
    const one = E.table(db, v.one.table); const oneF = one.fields.find((x) => x.name === v.one.field);
    if (v.integrity && !(oneF.pk || oneF.unique)) return toast(`Pour l'intégrité, ${v.one.table}.${v.one.field} doit être la clé primaire ou un champ sans doublons`, 7000);
    const r = { id: E.uid(), name: v.one.table + v.many.table, ...v };
    if (v.integrity) { const o = orphansOf(r); if (o) return toast(`Impossible d'appliquer l'intégrité : ${o} valeur(s) de ${v.many.table}.${v.many.field} n'existent pas dans ${v.one.table}`, 8000); }
    db.relations.push(r);
    const mf = E.table(db, v.many.table).fields.find((x) => x.name === v.many.field); if (mf && !mf.lookup) { const show = one.fields.find((x) => x.type === 'text'); mf.lookup = { table: one.name, field: oneF.name, show: show ? show.name : oneF.name }; }
    dirty(); open('REL'); renderNav();
  }

  /* ================= Requêtes ================= */
  function renderQuery(q, st) {
    st.mode = st.mode || (q.design && !q.rows ? 'result' : 'result');
    const P = $('#pane');
    P.innerHTML = `<div class="bar"><button data-m="design" class="${st.mode === 'design' ? 'primary' : ''}">✎ Création</button><button data-m="sql" class="${st.mode === 'sql' ? 'primary' : ''}">SQL</button><button data-m="result" class="${st.mode === 'result' ? 'primary' : ''}">▶ Exécuter</button><span class="sp"></span><button data-x="report">🖶 Créer un état</button></div><div id="qBody"></div>`;
    P.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { st.mode = b.dataset.m; st.res = null; renderQuery(q, st); }; });
    P.querySelector('[data-x="report"]').onclick = () => reportDialog(null, q.name);
    const B = $('#qBody');
    if (st.mode === 'design') renderQbe(q, B);
    else if (st.mode === 'sql') {
      B.innerHTML = `<div class="design"><textarea class="sql" id="sqlT" spellcheck="false">${esc(q.sql || '')}</textarea>${q.design ? '<p class="help">Modifier le SQL ici détache la requête de la grille de création.</p>' : ''}
        <p class="help">SQL d'Access : <code>SELECT … FROM … WHERE … GROUP BY … ORDER BY …</code>, jointures <code>INNER/LEFT JOIN … ON …</code>, <code>[Noms avec espaces]</code>, textes <code>"…"</code>, dates <code>#mm/jj/aaaa#</code>, <code>Like "A*"</code>, <code>&amp;</code> pour assembler du texte, paramètres <code>[Entrez l'année]</code>. Requêtes action : <code>UPDATE</code>, <code>DELETE</code>, <code>INSERT INTO</code>. Fonctions : IIf, Nz, Left, Right, Mid, Len, UCase, LCase, Trim, InStr, Replace, Year, Month, Day, Date, Now, DateAdd, DateDiff, DatePart, DateSerial, Format, CInt, CLng, CDbl, CStr, CDate, Val, Round, Int, Abs, Switch, Choose ; agrégats Sum, Avg, Count, Min, Max, First, Last.</p></div>`;
      $('#sqlT').oninput = (e) => { q.sql = e.target.value; if (q.design) q.design = null; dirty(); };
      $('#sqlT').onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { st.mode = 'result'; renderQuery(q, st); } };
    } else runQueryView(q, st, B);
  }
  async function runQueryView(q, st, B, params) {
    B.innerHTML = '<p class="help" style="padding:12px">Exécution…</p>';
    try {
      const kind = E.kindOf(q.sql || '');
      let r = await E.run(db, q.sql || '', { params, dryRun: kind !== 'SELECT' });
      if (r.needParams) { const p = await askParams(r.needParams); if (!p) { B.innerHTML = '<p class="help" style="padding:12px">Exécution annulée.</p>'; return; } return runQueryView(q, st, B, { ...(params || {}), ...p }); }
      if (r.kind === 'action') {
        const verb = { UPDATE: 'modifier', DELETE: 'supprimer', INSERT: 'ajouter' }[r.op];
        if (!(await confirmBox(`Cette requête va ${verb} ${r.count} enregistrement(s) dans la table « ${r.table} ». Cette action est définitive. Continuer ?`, 'Exécuter'))) { B.innerHTML = '<p class="help" style="padding:12px">Requête action annulée.</p>'; return; }
        r = await E.run(db, q.sql, { params }); dirty();
        B.innerHTML = `<p style="padding:12px">✓ ${r.count} enregistrement(s) ${({ UPDATE: 'modifié(s)', DELETE: 'supprimé(s)', INSERT: 'ajouté(s)' })[r.op]} dans « ${esc(r.table)} ».</p>`; renderNav(); return;
      }
      st.res = r; renderResult(q, r, B);
    } catch (e) { B.innerHTML = `<div class="design"><p style="color:#c62828"><b>Erreur :</b> ${esc(e.message)}</p><p class="help">Vérifiez la requête en mode SQL.</p><pre class="help">${esc(q.sql || '')}</pre></div>`; }
  }
  async function askParams(names) {
    return modal({ title: 'Paramètres de la requête', body: names.map((n, i) => `<div class="field"><label for="pp${i}">${esc(n)}</label><input id="pp${i}"></div>`).join(''), onOpen: (b) => { const i = b.querySelector('input'); if (i) i.focus(); }, buttons: [{ label: 'Annuler', value: null }, { label: 'OK', primary: true, value: (b) => Object.fromEntries(names.map((n, i) => [n, b.querySelector('#pp' + i).value])) }] });
  }
  const fmtAny = (v) => { if (v == null) return ''; if (typeof v === 'boolean') return v ? 'Oui' : 'Non'; if (typeof v === 'number') return v.toLocaleString('fr-FR', { maximumFractionDigits: 4 }); const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?$/.exec(v); if (m) return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}`; return String(v); };
  function renderResult(q, r, B) {
    const show = r.rows.slice(0, 1000);
    B.innerHTML = `<div class="bar" style="top:49px"><span class="count">${r.rows.length} enregistrement(s)${r.rows.length > 1000 ? ' — 1000 premiers affichés' : ''}</span><span class="sp"></span><button data-x="csv">CSV</button><button data-x="xlsx">Excel</button></div><table class="ds"><thead><tr>${r.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${show.map((row) => `<tr>${r.cols.map((c) => `<td class="${typeof row[c] === 'number' ? 'num' : ''}"><div class="v">${esc(fmtAny(row[c]))}</div></td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const asTable = () => ({ name: q.name, fields: r.cols.map((c) => { const v = r.rows.find((x) => x[c] != null); const s = v && v[c]; return { name: c, type: typeof s === 'number' ? 'double' : typeof s === 'boolean' ? 'bool' : /^\d{4}-\d\d-\d\d/.test(s || '') ? 'date' : 'text' }; }), rows: r.rows });
    B.querySelector('[data-x="csv"]').onclick = () => download(new Blob([E.toCsv(asTable())], { type: 'text/csv;charset=utf-8' }), q.name + '.csv');
    B.querySelector('[data-x="xlsx"]').onclick = async () => download(await E.toXlsx({ tables: [asTable()] }), q.name + '.xlsx');
  }
  // grille de création (QBE)
  function renderQbe(q, B) {
    const d = q.design || (q.design = { tables: [], cols: [], totals: false });
    if (!q.design.cols) q.design.cols = [];
    const srcs = [...db.tables.map((t) => t.name), ...db.queries.filter((x) => x !== q && E.kindOf(x.sql || '') === 'SELECT').map((x) => x.name)];
    const fieldsOf = (n) => { const t = E.table(db, n); if (t) return t.fields.map((f) => f.name); const qq = db.queries.find((x) => x.name === n); return qq && qq._cols ? qq._cols : []; };
    const colOpts = (c) => `<option value=""></option>${d.tables.map((t) => `<optgroup label="${esc(t)}"><option value="${esc(t)}\u0001*"${c.table === t && c.field === '*' ? ' selected' : ''}>${esc(t)}.*</option>${fieldsOf(t).map((f) => `<option value="${esc(t)}\u0001${esc(f)}"${c.table === t && c.field === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}</optgroup>`).join('')}<option value="\u0002"${c.expr ? ' selected' : ''}>Expression…</option>`;
    const cols = [...d.cols, {}];
    const sel = (k, c, opts) => `<select data-c="${k}">${opts.map(([v, l]) => `<option value="${v}"${(c[k] || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    B.innerHTML = `<div class="design"><div class="chips">${d.tables.map((t) => `<span class="ch">${esc(t)} <button data-rm="${esc(t)}" title="Retirer">✕</button></span>`).join('')}<select id="qAdd"><option value="">＋ Ajouter une table ou une requête…</option>${srcs.filter((s) => !d.tables.includes(s)).map((s) => `<option>${esc(s)}</option>`).join('')}</select>
      <label class="row"><input type="checkbox" id="qTot" ${d.totals ? 'checked' : ''}> Σ Totaux</label><label class="row"><input type="checkbox" id="qDist" ${d.distinct ? 'checked' : ''}> Sans doublons</label></div>
      ${d.tables.length ? `<div class="qbe"><table><tbody>
        <tr><th>Champ</th>${cols.map((c, i) => `<td data-i="${i}"><select data-c="field">${colOpts(c)}</select>${c.expr !== undefined && c.expr !== null ? `<input data-c="expr" value="${esc(c.expr)}" placeholder="ex. [Montant]*0,1">` : ''}</td>`).join('')}</tr>
        <tr><th>Nom affiché</th>${cols.map((c, i) => `<td data-i="${i}"><input data-c="alias" value="${esc(c.alias || '')}" placeholder="(facultatif)"></td>`).join('')}</tr>
        ${d.totals ? `<tr><th>Opération</th>${cols.map((c, i) => `<td data-i="${i}">${sel('total', c, [['group', 'Regroupement'], ['sum', 'Somme'], ['avg', 'Moyenne'], ['count', 'Compte'], ['min', 'Min'], ['max', 'Max'], ['first', 'Premier'], ['last', 'Dernier'], ['where', 'Où (filtre)']])}</td>`).join('')}</tr>` : ''}
        <tr><th>Tri</th>${cols.map((c, i) => `<td data-i="${i}">${sel('sort', c, [['', '(non trié)'], ['asc', 'Croissant'], ['desc', 'Décroissant']])}</td>`).join('')}</tr>
        <tr><th>Afficher</th>${cols.map((c, i) => `<td data-i="${i}" style="text-align:center"><input type="checkbox" data-c="show" ${c.show === false ? '' : 'checked'}></td>`).join('')}</tr>
        <tr><th>Critères</th>${cols.map((c, i) => `<td data-i="${i}"><input data-c="crit" value="${esc(c.crit || '')}"></td>`).join('')}</tr>
        <tr><th>Ou</th>${cols.map((c, i) => `<td data-i="${i}"><input data-c="or" value="${esc(c.or || '')}"></td>`).join('')}</tr>
      </tbody></table></div>
      <p class="help">Critères : <code>&gt;100000</code>, <code>Patente</code>, <code>Comme "B*"</code>, <code>Entre 01/01/2026 Et 31/03/2026</code>, <code>Est Null</code>, <code>Oui</code>, <code>[Quelle année ?]</code> (demandé à l'exécution). Les tables sont reliées automatiquement d'après les relations.</p>
      <pre class="help" id="qSql" style="white-space:pre-wrap"></pre>` : '<p class="help">Ajoutez une ou plusieurs tables (ou requêtes) pour commencer.</p>'}</div>`;
    const upd = () => { try { q.sql = E.qbeToSql(db, d); $('#qSql').textContent = q.sql; } catch (e) { if ($('#qSql')) $('#qSql').textContent = '— ' + e.message; } dirty(); };
    $('#qAdd').onchange = (e) => { if (!e.target.value) return; d.tables.push(e.target.value); if (!d.cols.length) d.cols.push({ table: e.target.value, field: '*' }); upd(); renderQbe(q, B); };
    B.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { d.tables = d.tables.filter((t) => t !== b.dataset.rm); d.cols = d.cols.filter((c) => c.table !== b.dataset.rm || c.expr); upd(); renderQbe(q, B); }; });
    $('#qTot').onchange = (e) => { d.totals = e.target.checked; d.cols.forEach((c) => { if (d.totals && !c.total) c.total = 'group'; }); upd(); renderQbe(q, B); };
    $('#qDist').onchange = (e) => { d.distinct = e.target.checked; upd(); };
    B.querySelectorAll('td[data-i] [data-c]').forEach((el) => {
      const i = +el.closest('td').dataset.i; const k = el.dataset.c;
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => {
        if (i === d.cols.length) d.cols.push({});
        const c = d.cols[i];
        if (k === 'field') { if (el.value === '') { d.cols.splice(i, 1); upd(); renderQbe(q, B); return; } if (el.value === '\u0002') { c.expr = c.expr || ''; delete c.table; delete c.field; } else { const [t, f] = el.value.split('\u0001'); c.table = t; c.field = f; delete c.expr; } if (d.totals && !c.total) c.total = 'group'; upd(); renderQbe(q, B); return; }
        if (k === 'show') c.show = el.checked; else c[k] = el.value;
        upd();
      });
    });
    if ($('#qSql')) upd();
  }

  /* ================= Formulaires ================= */
  function quickForm(t) {
    let f = db.forms.find((x) => same(x.table, t.name));
    if (!f) { f = { id: E.uid(), name: nextName(t.name + ' ', db.forms).replace(/ 1$/, '') , table: t.name, title: t.name, fields: t.fields.map((x) => x.name), subs: true }; if (db.forms.some((x) => x !== f && same(x.name, f.name))) f.name = nextName('Formulaire ', db.forms); db.forms.push(f); dirty(); renderNav(); }
    open('F|' + f.name);
  }
  async function formDialog(f) {
    if (!db.tables.length) return toast('Créez d\'abord une table');
    const t0 = f ? E.table(db, f.table) : db.tables[0];
    const flist = (t, chosen) => t.fields.map((x) => `<label class="row"><input type="checkbox" value="${esc(x.name)}" ${!chosen || chosen.includes(x.name) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('');
    const v = await modal({ title: f ? 'Modifier le formulaire' : 'Nouveau formulaire', wide: true,
      body: `<div class="row"><div class="field" style="flex:1"><label for="fmT">Table</label><select id="fmT" ${f ? 'disabled' : ''}>${db.tables.map((t) => `<option${t === t0 ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div><div class="field" style="flex:1"><label for="fmTi">Titre</label><input id="fmTi" value="${esc(f ? f.title : t0.name)}"></div></div><div class="field"><label>Champs affichés</label><div id="fmF" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px">${flist(t0, f && f.fields)}</div></div><label class="row"><input type="checkbox" id="fmS" ${!f || f.subs ? 'checked' : ''}> Afficher les enregistrements liés (sous-formulaires)</label>`,
      onOpen: (b) => { b.querySelector('#fmT').onchange = (e) => { const t = E.table(db, e.target.value); b.querySelector('#fmF').innerHTML = flist(t); b.querySelector('#fmTi').value = t.name; }; },
      buttons: [{ label: 'Annuler', value: null }, { label: f ? 'Enregistrer' : 'Créer', primary: true, value: (b) => ({ table: b.querySelector('#fmT').value, title: b.querySelector('#fmTi').value.trim(), fields: [...b.querySelectorAll('#fmF input:checked')].map((i) => i.value), subs: b.querySelector('#fmS').checked }) }] });
    if (!v) return;
    if (f) { Object.assign(f, { title: v.title, fields: v.fields, subs: v.subs }); dirty(); renderPane(); return; }
    const name = await askName('Nom du formulaire', nextName(v.table + ' ', db.forms).replace(/ 1$/, ''), db.forms); if (!name) return;
    db.forms.push({ id: E.uid(), name, ...v }); dirty(); renderNav(); open('F|' + name);
  }
  function renderForm(fm, st) {
    const t = E.table(db, fm.table); if (!t) { $('#pane').innerHTML = '<p>Table introuvable.</p>'; return; }
    const list = st.q ? t.rows.filter((r) => t.fields.some((f) => norm(cellText(f, r[f.name])).includes(norm(st.q)))) : t.rows;
    st.idx = Math.max(0, Math.min(st.idx || 0, list.length - 1));
    const row = list[st.idx];
    const fields = fm.fields.map((n) => t.fields.find((f) => f.name === n)).filter(Boolean);
    const rels = fm.subs ? db.relations.filter((r) => same(r.one.table, t.name)) : [];
    const P = $('#pane');
    P.innerHTML = `<div class="bar"><div class="recnav"><button data-n="first" title="Premier">|◀</button><button data-n="prev" title="Précédent">◀</button><span class="count">${list.length ? `Enr. ${st.idx + 1} sur ${list.length}` : 'Aucun enregistrement'}</span><button data-n="next" title="Suivant">▶</button><button data-n="last" title="Dernier">▶|</button></div><button class="primary" data-x="new">＋ Nouveau</button><button data-x="del" ${row ? '' : 'disabled'}>🗑</button><input type="search" data-x="q" placeholder="Rechercher…" value="${esc(st.q || '')}"><span class="sp"></span><button data-x="edit">✎ Modifier le formulaire</button></div>
      <div class="form-view"><div class="rec"><h2>${esc(fm.title || fm.name)}</h2>${row ? fields.map((f) => `<div class="fl"><label>${esc(f.name)}${f.required || f.pk ? ' *' : ''}</label><div data-f="${esc(f.name)}">${inputFor(f, row[f.name])}</div></div>`).join('') : '<p class="help">Aucun enregistrement. Touchez « ＋ Nouveau ».</p>'}</div>
      ${row ? rels.map((rel, ri) => { const mt = E.table(db, rel.many.table); if (!mt) return ''; const items = mt.rows.filter((r) => r[rel.many.field] === row[rel.one.field]); const cols = mt.fields.filter((f) => f.name !== rel.many.field && !f.pk).slice(0, 6); const money = cols.filter((f) => f.type === 'money' || f.type === 'double' || f.type === 'int');
        return `<div class="sub" data-r="${ri}"><h3><span>${esc(mt.name)} (${items.length})</span><button data-sadd>＋ Ajouter</button></h3>${items.length ? `<table><thead><tr>${cols.map((f) => `<th>${esc(f.name)}</th>`).join('')}</tr></thead><tbody>${items.map((it) => `<tr data-ri="${mt.rows.indexOf(it)}" style="cursor:pointer">${cols.map((f) => `<td style="${isNum(f) ? 'text-align:right' : ''}">${esc(cellText(f, it[f.name]))}</td>`).join('')}</tr>`).join('')}${money.length ? `<tr><td colspan="${cols.length}" class="help" style="text-align:right">${money.map((f) => `Total ${esc(f.name)} : <b>${esc(E.display(f, items.reduce((a, x) => a + (+x[f.name] || 0), 0)))}</b>`).join(' · ')}</td></tr>` : ''}</tbody></table>` : '<p class="help">Aucun enregistrement lié.</p>'}</div>`; }).join('') : ''}</div>`;
    const go = (i) => { st.idx = i; renderForm(fm, st); };
    P.querySelector('[data-n="first"]').onclick = () => go(0); P.querySelector('[data-n="prev"]').onclick = () => go(st.idx - 1); P.querySelector('[data-n="next"]').onclick = () => go(st.idx + 1); P.querySelector('[data-n="last"]').onclick = () => go(list.length - 1);
    P.querySelector('[data-x="new"]').onclick = async () => { const r = await recordDialog(t, null); if (r) { st.q = ''; st.idx = t.rows.indexOf(r); renderForm(fm, st); } };
    P.querySelector('[data-x="del"]').onclick = async () => { if (!row || !(await confirmBox('Supprimer cet enregistrement ?', 'Supprimer'))) return; const r = E.deleteRows(db, t, [row]); if (r.err) return toast(r.err, 8000); dirty(); renderForm(fm, st); renderNav(); };
    const qi = P.querySelector('[data-x="q"]'); qi.onchange = () => { st.q = qi.value; st.idx = 0; renderForm(fm, st); };
    P.querySelector('[data-x="edit"]').onclick = () => formDialog(fm);
    P.querySelectorAll('.rec [data-f]').forEach((d) => {
      const f = t.fields.find((x) => x.name === d.dataset.f); const el = d.querySelector('[data-in]'); if (!el || el.disabled) return;
      el.addEventListener('change', () => { const r = E.saveRow(db, t, row, { [f.name]: readInput(f, el) }); if (r.errs) { toast(r.errs.join(' — '), 6000); renderForm(fm, st); return; } dirty(); if (rels.length) renderForm(fm, st); });
    });
    P.querySelectorAll('.sub').forEach((s) => {
      const rel = rels[+s.dataset.r]; const mt = E.table(db, rel.many.table);
      s.querySelector('[data-sadd]').onclick = () => recordDialog(mt, null, { [rel.many.field]: row[rel.one.field] }, [rel.many.field]);
      s.querySelectorAll('tr[data-ri]').forEach((tr) => { tr.onclick = async () => { const it = mt.rows[+tr.dataset.ri]; const v = await modal({ title: mt.name, body: '<p>Modifier ou supprimer cet enregistrement lié ?</p>', buttons: [{ label: 'Fermer', value: null }, { label: 'Supprimer', value: 'del' }, { label: 'Modifier', primary: true, value: 'edit' }] }); if (v === 'edit') recordDialog(mt, it, {}, [rel.many.field]); if (v === 'del' && await confirmBox('Supprimer cet enregistrement ?', 'Supprimer')) { const r = E.deleteRows(db, mt, [it]); if (r.err) return toast(r.err, 8000); dirty(); renderForm(fm, st); } }; });
    });
  }

  /* ================= États ================= */
  const sourceNames = () => [...db.tables.map((t) => t.name), ...db.queries.filter((q) => E.kindOf(q.sql || '') === 'SELECT').map((q) => q.name)];
  async function sourceData(name, params) {
    const t = E.table(db, name);
    if (t) return { fields: t.fields.map((f) => ({ name: f.name, type: f.type, f })), rows: t.rows.map((r) => { const o = {}; t.fields.forEach((f) => { o[f.name] = f.lookup ? E.lookupLabel(db, f, r[f.name]) : r[f.name]; }); return o; }) };
    const q = db.queries.find((x) => x.name === name); if (!q) throw new Error('source introuvable : ' + name);
    const r = await E.run(db, q.sql, { params }); if (r.needParams) { const p = await askParams(r.needParams); if (!p) return null; return sourceData(name, { ...(params || {}), ...p }); }
    return { fields: r.cols.map((c) => { const v = r.rows.find((x) => x[c] != null); const s = v && v[c]; return { name: c, type: typeof s === 'number' ? 'double' : typeof s === 'boolean' ? 'bool' : /^\d{4}-\d\d-\d\d/.test(s || '') ? 'date' : 'text' }; }), rows: r.rows };
  }
  async function reportDialog(rp, srcDefault) {
    const srcs = sourceNames(); if (!srcs.length) return toast('Créez d\'abord une table ou une requête');
    const src0 = rp ? rp.source : srcDefault || srcs[0];
    let sd = null; try { sd = await sourceData(src0); } catch (e) { return toast(e.message); } if (!sd) return;
    const fl = (d, chosen, nums) => d.fields.filter((f) => !nums || ['int', 'double', 'money'].includes(f.type)).map((f) => `<label class="row"><input type="checkbox" value="${esc(f.name)}" ${(chosen ? chosen.includes(f.name) : !nums) ? 'checked' : ''}> ${esc(f.name)}</label>`).join('') || '<span class="help">—</span>';
    const opts = (d, sel) => `<option value="">(aucun)</option>${d.fields.map((f) => `<option${f.name === sel ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}`;
    const v = await modal({ title: rp ? 'Modifier l\'état' : 'Nouvel état', wide: true,
      body: `<div class="row"><div class="field" style="flex:1"><label for="rpS">Source (table ou requête)</label><select id="rpS">${srcs.map((s) => `<option${s === src0 ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></div><div class="field" style="flex:1"><label for="rpT">Titre</label><input id="rpT" value="${esc(rp ? rp.title : src0)}"></div></div>
        <div class="row"><div class="field" style="flex:1"><label for="rpG">Regrouper par</label><select id="rpG">${opts(sd, rp && rp.group)}</select></div><div class="field" style="flex:1"><label for="rpO">Trier par</label><select id="rpO">${opts(sd, rp && rp.sort)}</select></div><div class="field" style="flex:1"><label for="rpP">Orientation</label><select id="rpP"><option value="p">Portrait</option><option value="l"${rp && rp.orient === 'l' ? ' selected' : ''}>Paysage</option></select></div></div>
        <div class="field"><label>Colonnes</label><div id="rpF" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px">${fl(sd, rp && rp.fields)}</div></div><div class="field"><label>Totaliser (sommes)</label><div id="rpN" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px">${fl(sd, rp ? rp.sums : sd.fields.filter((f) => f.type === 'money').map((f) => f.name), true)}</div></div>`,
      onOpen: (b) => { b.querySelector('#rpS').onchange = async (e) => { const d = await sourceData(e.target.value); if (!d) return; b.querySelector('#rpF').innerHTML = fl(d); b.querySelector('#rpN').innerHTML = fl(d, d.fields.filter((f) => f.type === 'money').map((f) => f.name), true); b.querySelector('#rpG').innerHTML = opts(d); b.querySelector('#rpO').innerHTML = opts(d); b.querySelector('#rpT').value = e.target.value; }; },
      buttons: [{ label: 'Annuler', value: null }, { label: rp ? 'Enregistrer' : 'Créer', primary: true, value: (b) => ({ source: b.querySelector('#rpS').value, title: b.querySelector('#rpT').value.trim(), group: b.querySelector('#rpG').value, sort: b.querySelector('#rpO').value, orient: b.querySelector('#rpP').value, fields: [...b.querySelectorAll('#rpF input:checked')].map((i) => i.value), sums: [...b.querySelectorAll('#rpN input:checked')].map((i) => i.value) }) }] });
    if (!v) return;
    if (rp) { Object.assign(rp, v); dirty(); renderPane(); return; }
    const name = await askName('Nom de l\'état', v.title || 'État', db.reports); if (!name) return;
    db.reports.push({ id: E.uid(), name, ...v }); dirty(); renderNav(); open('R|' + name);
  }
  async function reportHtml(rp) {
    const d = await sourceData(rp.source); if (!d) return null;
    const F = rp.fields.map((n) => d.fields.find((f) => f.name === n)).filter(Boolean).filter((f) => f.name !== rp.group);
    const fmt = (f, v) => (f.f ? (f.f.lookup ? (v == null ? '' : String(v)) : E.display(f.f, v)) : fmtAny(v));
    let rows = d.rows.slice();
    const cmp = (k) => (a, b) => { const x = a[k], y = b[k]; if (x == null) return 1; if (y == null) return -1; return x < y ? -1 : x > y ? 1 : 0; };
    if (rp.sort) rows.sort(cmp(rp.sort)); if (rp.group) rows = rows.sort((a, b) => cmp(rp.group)(a, b) || (rp.sort ? cmp(rp.sort)(a, b) : 0));
    const sums = rp.sums.filter((s) => F.some((f) => f.name === s));
    const sumRow = (list, cls, label) => `<tr class="${cls}"><td>${label} (${list.length})</td>${F.slice(1).map((f) => `<td class="num">${sums.includes(f.name) ? esc(fmt(f, list.reduce((a, r) => a + (+r[f.name] || 0), 0))) : ''}</td>`).join('')}</tr>`;
    const firstSum = sums.includes(F[0] && F[0].name);
    let body = '';
    if (rp.group) {
      const groups = new Map(); rows.forEach((r) => { const k = r[rp.group] == null ? '(vide)' : r[rp.group]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
      const gf = d.fields.find((f) => f.name === rp.group);
      for (const [k, list] of groups) { body += `<tr class="g"><td colspan="${F.length}">${esc(rp.group)} : ${esc(k === '(vide)' ? k : fmt(gf, k))}</td></tr>` + list.map((r) => `<tr>${F.map((f) => `<td class="${['int', 'double', 'money', 'auto'].includes(f.type) ? 'num' : ''}">${esc(fmt(f, r[f.name]))}</td>`).join('')}</tr>`).join('') + (sums.length ? sumRow(list, 'st', 'Sous-total') : ''); }
    } else body = rows.map((r) => `<tr>${F.map((f) => `<td class="${['int', 'double', 'money', 'auto'].includes(f.type) ? 'num' : ''}">${esc(fmt(f, r[f.name]))}</td>`).join('')}</tr>`).join('');
    void firstSum;
    const total = sums.length ? sumRow(rows, 'gt', 'Total général') : `<tr class="gt"><td colspan="${F.length}">${rows.length} enregistrement(s)</td></tr>`;
    return `<h1>${esc(rp.title || rp.name)}</h1><div class="sub2">${esc(db.name)} — ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}</div><table><thead><tr>${F.map((f) => `<th class="${['int', 'double', 'money', 'auto'].includes(f.type) ? 'num' : ''}">${esc(f.name)}</th>`).join('')}</tr></thead><tbody>${body}${total}</tbody></table>`;
  }
  async function renderReport(rp, st) {
    const P = $('#pane');
    P.innerHTML = `<div class="bar"><button class="primary" data-x="print">🖶 Imprimer / PDF</button><button data-x="edit">✎ Modifier</button><button data-x="reload">↻ Actualiser</button></div><div class="report-wrap"><div class="report" id="rep">Préparation…</div></div>`;
    P.querySelector('[data-x="edit"]').onclick = () => reportDialog(rp);
    P.querySelector('[data-x="reload"]').onclick = () => renderReport(rp, st);
    let html; try { html = await reportHtml(rp); } catch (e) { $('#rep').innerHTML = `<p style="color:#c62828">Erreur : ${esc(e.message)}</p>`; return; }
    if (html == null) { $('#rep').textContent = 'Annulé.'; return; }
    $('#rep').innerHTML = html;
    P.querySelector('[data-x="print"]').onclick = () => {
      const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
      const css = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText).filter((t) => t.startsWith('.report')); } catch (e) { return []; } }).join('\n');
      f.contentDocument.open(); f.contentDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(rp.title || rp.name)}</title><style>@page{size:A4 ${rp.orient === 'l' ? 'landscape' : 'portrait'};margin:12mm}body{margin:0}${css}.report{box-shadow:none;width:auto;padding:0}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><div class="report">${html}</div></body></html>`); f.contentDocument.close();
      setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300);
    };
  }

  /* ================= Fichiers ================= */
  async function openAccess() {
    const [file] = await pickFiles('.accdb,.mdb,.accde,.mde', false); if (!file) return;
    let pw;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        toast('Lecture du fichier Access…', 60000);
        const { db: d, skipped } = await E.readAccess(file, pw);
        await useDb(d);
        const rows = d.tables.reduce((a, t) => a + t.rows.length, 0);
        toast(`« ${file.name} » ouvert : ${d.tables.length} table(s), ${rows} enregistrement(s), ${d.relations.length} relation(s), ${d.queries.length} requête(s)${skipped.length ? `. Non repris : ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''} (pièces jointes, objets OLE)` : ''}`, 9000);
        if (d.tables[0]) open('T|' + d.tables[0].name);
        return;
      } catch (e) {
        if (e.password) { pw = await modal({ title: 'Base protégée', body: '<div class="field"><label for="apw">Mot de passe de la base Access</label><input id="apw" type="password"></div>', onOpen: (b) => b.querySelector('#apw').focus(), buttons: [{ label: 'Annuler', value: null }, { label: 'Ouvrir', primary: true, value: (b) => b.querySelector('#apw').value }] }); if (!pw) return; continue; }
        console.error(e); toast('Ouverture impossible : ' + (e.message || e), 8000); return;
      }
    }
  }
  async function importGrid() {
    if (!db) await useDb(blankDb('Ma base'));
    const [file] = await pickFiles('.xlsx,.xlsm,.csv,.txt,.tsv', false); if (!file) return;
    try {
      const grids = [];
      if (/\.xls[xm]$/i.test(file.name)) {
        if (!window.ExcelJS) await loadScript('lib/exceljs.min.js');
        const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
        wb.eachSheet((ws) => { const rows = []; ws.eachRow({ includeEmpty: false }, (r) => { const vals = []; r.eachCell({ includeEmpty: true }, (c, i) => { let v = c.value; if (v && typeof v === 'object' && !(v instanceof Date)) v = v.result !== undefined ? v.result : v.text !== undefined ? v.text : v.richText ? v.richText.map((x) => x.text).join('') : null; vals[i - 1] = v; }); rows.push(vals); }); if (rows.length) grids.push({ name: ws.name, rows }); });
      } else {
        let text = await file.text(); text = text.replace(/^﻿/, '');
        const head = text.split('\n')[0]; const sep = [';', '\t', ','].sort((a, b) => head.split(b).length - head.split(a).length)[0];
        const rows = []; let row = [], cell = '', q = false;
        for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; } if (c === '"' && !cell) q = true; else if (c === sep) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
        if (cell || row.length) { row.push(cell); rows.push(row); }
        grids.push({ name: baseName(file.name), rows: rows.filter((r) => r.some((x) => x !== '')) });
      }
      let added = 0;
      for (const g of grids) {
        let name = g.name.replace(/[.!`[\]]/g, '_'); let k = 2; while (E.table(db, name) || db.queries.some((x) => same(x.name, name))) name = g.name + ' ' + k++;
        const t = E.tableFromGrid(db, name, g.rows[0], g.rows.slice(1)); db.tables.push(t); added++;
      }
      dirty(); renderNav(); if (grids[0]) open('T|' + db.tables[db.tables.length - grids.length].name);
      toast(`${added} table(s) importée(s). Vérifiez les types en mode création.`, 5000);
    } catch (e) { console.error(e); toast('Import impossible : ' + e.message, 7000); }
  }
  async function exportXml() {
    if (!db || !db.tables.length) return toast('Aucune table à exporter');
    const v = await modal({ title: 'Exporter pour Microsoft Access', wide: true,
      body: `<p>Un fichier <b>XML</b> contenant la structure (types de champs, tailles, clés primaires, champs obligatoires et sans doublons) et toutes les données.</p><div class="field"><label>Tables</label><div id="xT" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px">${db.tables.map((t) => `<label class="row"><input type="checkbox" value="${esc(t.name)}" checked> ${esc(t.name)} (${t.rows.length})</label>`).join('')}</div></div>
        <p class="help"><b>Dans Access :</b> onglet <b>Données externes</b> → <b>Nouvelle source de données</b> → <b>À partir d'un fichier</b> → <b>Fichier XML</b>, choisissez ce fichier puis <b>Structure et données</b>. Les tables sont créées avec leurs types et leurs données.${db.relations.length ? `<br><b>Relations à recréer</b> ensuite dans Outils de base de données → Relations : ${db.relations.map((r) => `${esc(r.one.table)}.${esc(r.one.field)} → ${esc(r.many.table)}.${esc(r.many.field)}`).join(' ; ')}.` : ''}${db.queries.length ? `<br><b>Requêtes :</b> copiez le SQL de chaque requête dans une nouvelle requête Access (mode SQL).` : ''}</p>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Requêtes en .txt', value: 'sql' }, { label: 'Exporter le XML', primary: true, value: (b) => [...b.querySelectorAll('#xT input:checked')].map((i) => i.value) }] });
    if (!v) return;
    if (v === 'sql') { download(new Blob([db.queries.map((q) => `-- ${q.name}\n${q.sql}\n`).join('\n') || '-- aucune requête'], { type: 'text/plain;charset=utf-8' }), db.name + '-requetes.txt'); return; }
    download(new Blob([E.toAccessXml(db, v)], { type: 'application/xml' }), db.name.replace(/[\\/:*?"<>|]/g, '_') + '.xml');
  }
  async function library() {
    const all = (await idb.all()).sort((a, b) => b.updated - a.updated);
    const v = await modal({ title: 'Mes bases', wide: true, body: all.length ? `<div style="display:grid;gap:6px">${all.map((d) => `<div class="row" style="border:1px solid var(--line);border-radius:8px;padding:8px 10px"><div style="flex:1"><b>${esc(d.name)}</b><div class="help">${d.tables.length} table(s), ${d.tables.reduce((a, t) => a + t.rows.length, 0)} enregistrement(s) — modifiée le ${new Date(d.updated).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</div></div><button data-open="${d.id}" class="${db && d.id === db.id ? '' : 'primary'}">${db && d.id === db.id ? 'Ouverte' : 'Ouvrir'}</button></div>`).join('')}</div>` : '<p>Aucune base.</p>',
      onOpen: (b) => b.querySelectorAll('[data-open]').forEach((x) => { x.onclick = () => { b.closest('.modal-back').dataset.v = x.dataset.open; b.closest('.modal').querySelector('footer button.primary').click(); }; }),
      buttons: [{ label: 'Fermer', value: null }, { label: 'Nouvelle base', primary: true, value: (b) => b.closest('.modal-back').dataset.v || 'new' }] });
    if (!v) return; if (v === 'new') return newDbDialog();
    const d = all.find((x) => x.id === v); if (d && (!db || d.id !== db.id)) await useDb(d);
  }

  /* ================= Modèles ================= */
  const F = (name, type, extra = {}) => ({ name, type, ...(type === 'text' ? { size: 255 } : {}), ...extra });
  function blankDb(name) { return { id: E.uid(), name, tables: [], relations: [], queries: [], forms: [], reports: [], created: Date.now(), updated: Date.now() }; }
  const TEMPLATES = {
    vide: { name: 'Base vide', hint: 'Partir de zéro', build: (d) => { E.newTable(d, 'Table1').fields.push(F('Nom', 'text')); } },
    contrib: { name: 'Contribuables et paiements', hint: 'Recettes, taxes, quittances', build: (d) => {
      const tx = { id: E.uid(), name: 'Taxes', fields: [F('Code', 'text', { pk: true, required: true, size: 10 }), F('Libellé', 'text', { required: true }), F('Tarif annuel', 'money')], rows: [{ Code: 'PAT', 'Libellé': 'Patente', 'Tarif annuel': 75000 }, { Code: 'TDC', 'Libellé': 'Taxe de développement communal', 'Tarif annuel': 10000 }, { Code: 'DP', 'Libellé': 'Droits de place', 'Tarif annuel': 36000 }, { Code: 'PUB', 'Libellé': 'Taxe sur la publicité', 'Tarif annuel': 50000 }], seq: 0 };
      const c = { id: E.uid(), name: 'Contribuables', fields: [F('N°', 'auto', { pk: true, required: true }), F('Nom', 'text', { required: true }), F('Activité', 'text', { values: ['Commerce', 'Restauration', 'Transport', 'Artisanat', 'Services', 'Autre'] }), F('Quartier', 'text'), F('Téléphone', 'text', { size: 20 }), F('IFU', 'text', { size: 20, unique: false }), F('Actif', 'bool', { default: 'Oui' })], rows: [], seq: 0 };
      const p = { id: E.uid(), name: 'Paiements', fields: [F('N° quittance', 'auto', { pk: true, required: true }), F('Contribuable', 'int', { required: true, lookup: { table: 'Contribuables', field: 'N°', show: 'Nom' } }), F('Taxe', 'text', { size: 10, required: true, lookup: { table: 'Taxes', field: 'Code', show: 'Libellé' } }), F('Date', 'date', { required: true, default: 'Date()' }), F('Montant', 'money', { required: true }), F('Mode', 'text', { values: ['Espèces', 'Chèque', 'Virement', 'Mobile money'], limit: true }), F('Observations', 'memo')], rows: [], seq: 0 };
      d.tables.push(tx, c, p);
      [['Boutique Kaboré', 'Commerce', 'Secteur 1', '70 12 34 56'], ['Maquis Le Palmier', 'Restauration', 'Secteur 5', '76 45 12 00'], ['Garage Zongo', 'Artisanat', 'Route de Kaya', '78 00 11 22'], ['Pharmacie du Centre', 'Services', 'Centre-ville', '70 99 88 77']].forEach(([n, a, q, tel]) => E.saveRow(d, c, {}, { Nom: n, 'Activité': a, Quartier: q, 'Téléphone': tel, Actif: true }));
      [[1, 'PAT', '2026-01-15', 75000, 'Espèces'], [1, 'TDC', '2026-02-03', 10000, 'Mobile money'], [2, 'DP', '2026-03-10', 36000, 'Espèces'], [3, 'PAT', '2026-03-22', 75000, 'Chèque'], [4, 'PUB', '2026-04-05', 50000, 'Virement'], [2, 'TDC', '2026-05-12', 10000, 'Espèces']].forEach(([cn, tx2, dt, m, mo]) => E.saveRow(d, p, {}, { Contribuable: cn, Taxe: tx2, Date: dt, Montant: m, Mode: mo }));
      d.relations.push({ id: E.uid(), name: 'ContribuablesPaiements', one: { table: 'Contribuables', field: 'N°' }, many: { table: 'Paiements', field: 'Contribuable' }, integrity: true, cascadeDelete: false }, { id: E.uid(), name: 'TaxesPaiements', one: { table: 'Taxes', field: 'Code' }, many: { table: 'Paiements', field: 'Taxe' }, integrity: true, cascadeDelete: false });
      d.queries.push({ id: E.uid(), name: 'Recettes par taxe', sql: 'SELECT Taxes.[Libellé] AS Taxe, Count(*) AS [Nombre de paiements], Sum(Paiements.Montant) AS [Total encaissé]\nFROM Taxes INNER JOIN Paiements ON Taxes.Code = Paiements.Taxe\nGROUP BY Taxes.[Libellé]\nORDER BY Sum(Paiements.Montant) DESC;' },
        { id: E.uid(), name: 'Paiements de la période', sql: 'SELECT Paiements.[N° quittance], Paiements.Date, Contribuables.Nom, Paiements.Taxe, Paiements.Montant, Paiements.Mode\nFROM Contribuables INNER JOIN Paiements ON Contribuables.[N°] = Paiements.Contribuable\nWHERE Paiements.Date Between [Date de début (jj/mm/aaaa)] And [Date de fin (jj/mm/aaaa)]\nORDER BY Paiements.Date;' },
        { id: E.uid(), name: 'Contribuables sans paiement', sql: 'SELECT Contribuables.[N°], Contribuables.Nom, Contribuables.Quartier, Contribuables.[Téléphone]\nFROM Contribuables\nWHERE Contribuables.[N°] NOT IN (SELECT Contribuable FROM Paiements);' });
      d.forms.push({ id: E.uid(), name: 'Fiche contribuable', table: 'Contribuables', title: 'Fiche contribuable', fields: c.fields.map((f) => f.name), subs: true });
      d.reports.push({ id: E.uid(), name: 'Journal des paiements par taxe', source: 'Paiements', title: 'Journal des paiements par taxe', group: 'Taxe', sort: 'Date', orient: 'p', fields: ['Taxe', 'N° quittance', 'Date', 'Contribuable', 'Montant', 'Mode'], sums: ['Montant'] });
    } },
    courrier: { name: 'Courrier arrivée / départ', hint: 'Registre du courrier, suivi des réponses', build: (d) => {
      const t = { id: E.uid(), name: 'Courrier', fields: [F('N° d\'ordre', 'auto', { pk: true, required: true }), F('Sens', 'text', { size: 10, required: true, values: ['Arrivée', 'Départ'], limit: true }), F('Date', 'date', { required: true, default: 'Date()' }), F('Référence', 'text', { size: 60 }), F('Expéditeur / destinataire', 'text', { required: true }), F('Objet', 'text', { required: true }), F('Service', 'text', { values: ['Recette', 'Secrétariat', 'État civil', 'Urbanisme', 'Comptabilité'] }), F('Réponse attendue', 'bool'), F('Date de réponse', 'date'), F('Observations', 'memo')], rows: [], seq: 0 };
      d.tables.push(t);
      E.saveRow(d, t, {}, { Sens: 'Arrivée', Date: '2026-10-01', 'Référence': 'N°2026-145/MEFP', 'Expéditeur / destinataire': 'Direction régionale du Trésor', Objet: 'Clôture de l\'exercice 2026', Service: 'Recette', 'Réponse attendue': true });
      d.queries.push({ id: E.uid(), name: 'Courriers en attente de réponse', sql: 'SELECT [N° d\'ordre], Date, [Expéditeur / destinataire], Objet, Service, DateDiff("d", Date, Date()) AS [Jours d\'attente]\nFROM Courrier\nWHERE Sens = "Arrivée" AND [Réponse attendue] = True AND [Date de réponse] Is Null\nORDER BY Date;' });
      d.reports.push({ id: E.uid(), name: 'Registre du courrier', source: 'Courrier', title: 'Registre du courrier', group: 'Sens', sort: 'Date', orient: 'l', fields: ['Sens', 'N° d\'ordre', 'Date', 'Référence', 'Expéditeur / destinataire', 'Objet', 'Service'], sums: [] });
    } },
    inventaire: { name: 'Inventaire du matériel', hint: 'Biens, affectations, valeurs', build: (d) => {
      const s = { id: E.uid(), name: 'Services', fields: [F('N°', 'auto', { pk: true, required: true }), F('Service', 'text', { required: true, unique: true }), F('Responsable', 'text')], rows: [], seq: 0 };
      const m = { id: E.uid(), name: 'Matériel', fields: [F('N° inventaire', 'text', { pk: true, required: true, size: 20 }), F('Désignation', 'text', { required: true }), F('Catégorie', 'text', { values: ['Informatique', 'Mobilier', 'Véhicule', 'Matériel de bureau', 'Autre'] }), F('Service', 'int', { lookup: { table: 'Services', field: 'N°', show: 'Service' } }), F('Date d\'acquisition', 'date'), F('Valeur d\'acquisition', 'money'), F('État', 'text', { values: ['Bon', 'Moyen', 'Mauvais', 'Hors service'], limit: true })], rows: [], seq: 0 };
      d.tables.push(s, m); ['Recette municipale', 'Secrétariat général', 'État civil'].forEach((x) => E.saveRow(d, s, {}, { Service: x }));
      E.saveRow(d, m, {}, { 'N° inventaire': 'INF-2026-001', 'Désignation': 'Ordinateur portable', 'Catégorie': 'Informatique', Service: 1, "Date d'acquisition": '2026-02-10', "Valeur d'acquisition": 450000, 'État': 'Bon' });
      d.relations.push({ id: E.uid(), name: 'ServicesMatériel', one: { table: 'Services', field: 'N°' }, many: { table: 'Matériel', field: 'Service' }, integrity: true, cascadeDelete: false });
      d.reports.push({ id: E.uid(), name: 'Inventaire par catégorie', source: 'Matériel', title: 'Inventaire du matériel par catégorie', group: 'Catégorie', sort: 'N° inventaire', orient: 'l', fields: ['Catégorie', 'N° inventaire', 'Désignation', 'Service', 'Date d\'acquisition', 'Valeur d\'acquisition', 'État'], sums: ['Valeur d\'acquisition'] });
    } },
    contacts: { name: 'Contacts', hint: 'Carnet d\'adresses professionnel', build: (d) => { d.tables.push({ id: E.uid(), name: 'Contacts', fields: [F('N°', 'auto', { pk: true, required: true }), F('Nom', 'text', { required: true }), F('Prénom', 'text'), F('Structure', 'text'), F('Fonction', 'text'), F('Téléphone', 'text', { size: 20 }), F('E-mail', 'text'), F('Ville', 'text', { default: 'Ouagadougou' }), F('Notes', 'memo')], rows: [], seq: 0 }); } },
  };
  function welcomeHtml() { return `<div class="welcome"><h2>Base Joe — bases de données</h2><p class="help" style="max-width:640px">Tables, relations, requêtes, formulaires et états, comme Microsoft Access. Ouvre les fichiers <b>.accdb</b> et <b>.mdb</b> ; exporte vers Access (XML), Excel et CSV. Tout reste sur votre appareil.</p><div class="row"><button class="primary" data-act="openAccess">📂 Ouvrir un fichier Access</button><button data-act="importGrid">Importer Excel / CSV</button><button data-act="library">Mes bases</button></div><h3 style="margin:10px 0 0">Ou partir d'un modèle</h3><div class="tpl">${Object.entries(TEMPLATES).map(([k, t]) => `<button data-tpl="${k}"><b>${esc(t.name)}</b><span>${esc(t.hint)}</span></button>`).join('')}</div></div>`; }
  function bindWelcome() { $('#pane').querySelectorAll('[data-tpl]').forEach((b) => { b.onclick = () => createFromTemplate(b.dataset.tpl); }); }
  async function createFromTemplate(k, name) {
    const t = TEMPLATES[k]; const d = blankDb(name || (k === 'vide' ? 'Ma base' : t.name)); t.build(d);
    d.tables.forEach((x) => { const a = x.fields.find((f) => f.type === 'auto'); if (a) x.seq = Math.max(x.seq || 0, ...x.rows.map((r) => +r[a.name] || 0)); });
    await useDb(d); if (d.tables[0]) open((k === 'contrib' ? 'F|Fiche contribuable' : 'T|' + d.tables[d.tables.length - 1].name));
  }
  async function newDbDialog() {
    const v = await modal({ title: 'Nouvelle base', wide: true, body: `<div class="field"><label for="nbN">Nom de la base</label><input id="nbN" value="Ma base"></div><div class="welcome" style="padding:0"><div class="tpl">${Object.entries(TEMPLATES).map(([k, t]) => `<button data-tpl="${k}"><b>${esc(t.name)}</b><span>${esc(t.hint)}</span></button>`).join('')}</div></div>`,
      onOpen: (b) => b.querySelectorAll('[data-tpl]').forEach((x) => { x.onclick = () => { b.closest('.modal-back').dataset.v = x.dataset.tpl; b.closest('.modal').querySelector('footer button.primary').click(); }; }),
      buttons: [{ label: 'Annuler', value: null }, { label: 'Base vide', primary: true, value: (b) => ({ k: b.closest('.modal-back').dataset.v || 'vide', n: b.querySelector('#nbN').value.trim() }) }] });
    if (!v) return; createFromTemplate(v.k, v.n && v.n !== 'Ma base' ? v.n : undefined);
  }

  /* ================= Commandes ================= */
  const ACT = {
    newDb: newDbDialog, library, openAccess, importGrid, exportXml,
    openJoedb: async () => { const [f] = await pickFiles('.joedb,.json', false); if (!f) return; try { const o = JSON.parse(await f.text()); if (o.app !== 'base-joe' || !o.db) throw new Error('fichier non reconnu'); o.db.id = E.uid(); await useDb(o.db); toast(`« ${o.db.name} » ouvert`); } catch (e) { toast('Ouverture impossible : ' + e.message, 6000); } },
    saveJoedb: () => { if (!db) return; download(new Blob([JSON.stringify({ app: 'base-joe', v: 1, db })], { type: 'application/json' }), db.name.replace(/[\\/:*?"<>|]/g, '_') + '.joedb'); },
    exportXlsx: async () => { if (!db) return; download(await E.toXlsx(db), db.name.replace(/[\\/:*?"<>|]/g, '_') + '.xlsx'); },
    renameDb: async () => { if (!db) return; const n = await askName('Nom de la base', db.name); if (!n) return; db.name = n; dirty(); renderAll(); },
    deleteDb: async () => { if (!db) return; if (!(await confirmBox(`Supprimer définitivement la base « ${db.name} » de cet appareil ?`, 'Supprimer'))) return; await idb.del(db.id); db = null; tabs = []; active = null; const all = await idb.all(); if (all.length) await useDb(all.sort((a, b) => b.updated - a.updated)[0]); else renderAll(); },
    newTable: async () => { if (!db) await useDb(blankDb('Ma base')); const n = await askName('Nom de la table', nextName('Table', db.tables), db.tables); if (!n) return; if (db.queries.some((q) => same(q.name, n))) return toast('Une requête porte déjà ce nom'); E.newTable(db, n).fields.push({ name: 'Nom', type: 'text', size: 255 }); dirty(); renderNav(); open('D|' + n); },
    newQuery: async () => { if (!db) return; const n = await askName('Nom de la requête', nextName('Requête', db.queries), db.queries); if (!n) return; if (E.table(db, n)) return toast('Une table porte déjà ce nom'); db.queries.push({ id: E.uid(), name: n, sql: '', design: { tables: [], cols: [], totals: false } }); dirty(); renderNav(); open('Q|' + n); state['Q|' + n].mode = 'design'; renderPane(); },
    newSql: async () => { if (!db) return; const n = await askName('Nom de la requête', nextName('Requête', db.queries), db.queries); if (!n) return; db.queries.push({ id: E.uid(), name: n, sql: db.tables[0] ? `SELECT *\nFROM [${db.tables[0].name}];` : 'SELECT ' }); dirty(); renderNav(); open('Q|' + n); state['Q|' + n].mode = 'sql'; renderPane(); },
    newForm: () => db && formDialog(), newReport: () => db && reportDialog(), relations: () => db && open('REL'),
    help: () => modal({ title: 'Base Joe et Microsoft Access', wide: true, body: `<p><b>Ouvrir un fichier Access</b> (.accdb, .mdb, y compris protégé par mot de passe) : tables, types de champs, données, relations et requêtes sélection sont repris. Les pièces jointes, objets OLE, formulaires, états et macros d'Access ne sont pas lus.</p><p><b>Retour vers Access</b> : Fichier → « Exporter pour Access (XML) », puis dans Access : Données externes → Fichier XML → Structure et données. Les tables sont recréées avec leurs types, clés et données. Également : Excel (une feuille par table), CSV.</p><p><b>Requêtes</b> : en mode création (grille comme Access, critères en français) ou en SQL d'Access, y compris les requêtes paramétrées et les requêtes action (mise à jour, suppression, ajout).</p><p><b>Feuille de données</b> : touchez une cellule pour la modifier ; Entrée / Tab pour valider ; clic droit (appui long) : filtrer par sélection ; clic sur un en-tête : trier.</p><p>Les bases sont enregistrées sur l'appareil et incluses dans la Sauvegarde de Studio Joe.</p>` }),
  };
  function act(a) { const f = ACT[a]; if (f) Promise.resolve(f()).catch((e) => { console.error(e); toast('Erreur : ' + (e.message || e), 6000); }); }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) act(b.dataset.act); });
  $('#navToggle').onclick = () => $('#main').classList.toggle('navopen');
  Studio.onDropFiles(document.body, async (files) => { const f = files[0]; if (!f) return; if (/\.(accdb|mdb)$/i.test(f.name)) { try { const { db: d } = await E.readAccess(f); await useDb(d); if (d.tables[0]) open('T|' + d.tables[0].name); } catch (e) { toast('Ouverture impossible : ' + e.message, 7000); } } });

  initMenus();
  (async () => {
    try { const cur = await idb.kv('current'); const all = await idb.all(); const d = all.find((x) => x.id === cur) || all.sort((a, b) => b.updated - a.updated)[0]; if (d) { await useDb(d); return; } } catch (e) { console.warn(e); }
    renderAll();
  })();
  window.BaseJoe = { get db() { return db; }, open, act, createFromTemplate, useDb };
})();
