/* Studio Joe — Mes fichiers : tous les documents des applications au même endroit, recherche dans tout
   le contenu (documents, notes, bases, formulaires et réponses, agenda, présentations, classeur), ouverture
   de n'importe quel fichier dans la bonne application, réception des fichiers partagés depuis d'autres
   applications du téléphone (WhatsApp, e-mail, Fichiers…), place occupée et stockage persistant. */
(function () {
  const { $, toast, pickFiles, modal, confirmBox } = Studio;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const APPS = {
    texte: { label: 'Texte Joe', ic: 'Tx', color: '#2b579a' }, tableur: { label: 'Tableur Joe', ic: 'Tb', color: '#1f7a46' }, presentation: { label: 'Présentation Joe', ic: 'Pr', color: '#c4501b' },
    base: { label: 'Base Joe', ic: 'Ba', color: '#a4373a' }, notes: { label: 'Notes Joe', ic: 'No', color: '#c8901a' }, agenda: { label: 'Agenda Joe', ic: 'Ag', color: '#1565c0' },
    formulaires: { label: 'Formulaires Joe', ic: 'Fo', color: '#00796b' }, scan: { label: 'Scan Joe', ic: 'Sc', color: '#0b8a8a' }, audio: { label: 'Audio Joe', ic: 'Au', color: '#5b2a86' },
    pdf: { label: 'PDF Joe', ic: 'PDF', color: '#b3261e' }, photo: { label: 'Photo Joe', ic: 'Ph', color: '#00639b' }, video: { label: 'Video Joe', ic: 'Vd', color: '#7b3fa0' }, design: { label: 'Design Joe', ic: 'De', color: '#e8590c' }, schema: { label: 'Diagrammes Joe', ic: 'Dg', color: '#6d4c41' }, sauvegarde: { label: 'Sauvegarde', ic: 'Sv', color: '#455a64' },
  };

  /* ================= Lecture des données des applications (sans rien créer) ================= */
  let dbList = null;
  async function exists(name) { if (dbList === null) { try { dbList = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : []; } catch (e) { dbList = []; } } return !dbList.length || dbList.includes(name); }
  async function openDb(name) {
    if (!(await exists(name))) return null;
    return new Promise((res) => { let created = false; const r = indexedDB.open(name); r.onupgradeneeded = () => { created = true; }; r.onsuccess = () => { if (created) { r.result.close(); indexedDB.deleteDatabase(name); res(null); } else res(r.result); }; r.onerror = () => res(null); });
  }
  async function all(name, store) { const h = await openDb(name); if (!h) return []; if (!h.objectStoreNames.contains(store)) { h.close(); return []; } const v = await new Promise((res) => { const q = h.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => res([]); }); h.close(); return v; }
  async function get(name, store, key) { const h = await openDb(name); if (!h) return undefined; if (!h.objectStoreNames.contains(store)) { h.close(); return undefined; } const v = await new Promise((res) => { const q = h.transaction(store).objectStore(store).get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); h.close(); return v; }
  async function put(name, store, value, key) { const h = await openDb(name); if (!h) return; await new Promise((res) => { const t = h.transaction(store, 'readwrite'); t.objectStore(store).put(value, key); t.oncomplete = res; t.onerror = res; }); h.close(); }
  const htmlText = (h) => String(h || '').replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ');
  function deepText(o, max = 200000) { const out = []; let n = 0; const walk = (v, k) => { if (n > max || v == null) return; if (typeof v === 'string') { if (/^data:/.test(v) || v.length > 20000 || /^(id|color|fill|stroke|font|type|src|bg)$/i.test(k || '')) return; const t = /<[a-z]/i.test(v) ? htmlText(v) : v; out.push(t); n += t.length; } else if (typeof v === 'number' && !/^(x|y|w|h|r|z|id|size|rot|op|.*[Ww]idth|.*[Hh]eight)$/.test(k || '')) out.push(String(v)); else if (Array.isArray(v)) v.forEach((x) => walk(x, k)); else if (typeof v === 'object' && !(v instanceof Blob) && !ArrayBuffer.isView(v)) for (const kk of Object.keys(v)) walk(v[kk], kk); }; walk(o); return out.join(' '); }

  async function collect() {
    const items = [];
    const add = (o) => items.push(o);
    // Texte Joe
    for (const d of await all('texte-joe', 'docs')) add({ app: 'texte', title: d.title || 'Document', updated: d.updated, text: htmlText(d.html), open: async () => { await put('texte-joe', 'kv', d.id, 'current'); location.href = 'texte.html'; } });
    // Tableur Joe (classeur en cours)
    try { const w = JSON.parse(localStorage.getItem('tableur-autosave') || 'null'); if (w && w.sheets) add({ app: 'tableur', title: w.name || 'Classeur', sub: `${w.sheets.length} feuille(s) — classeur en cours`, updated: w.saved || null, text: deepText(w.sheets), open: () => { location.href = 'tableur.html'; } }); } catch (e) { /* illisible */ }
    // Présentation Joe (présentation en cours)
    try { const s = await get('presentation-joe', 'kv', 'deck'); if (s) { const d = JSON.parse(s); add({ app: 'presentation', title: d.name || d.title || 'Présentation', sub: `${(d.slides || []).length} diapositive(s) — présentation en cours`, updated: d.saved || null, text: deepText(d.slides), open: () => { location.href = 'presentation.html'; } }); } } catch (e) { /* illisible */ }
    // Notes Joe
    const nbs = await all('notes-joe', 'nbs');
    for (const n of await all('notes-joe', 'notes')) { if (n.deleted) continue; const nb = nbs.find((b) => b.id === n.nb); add({ app: 'notes', title: n.title || 'Sans titre', sub: `Note${nb ? ' · ' + nb.name : ''}${(n.tags || []).length ? ' · #' + n.tags.join(' #') : ''}`, updated: n.updated, text: (n.text || '') + ' ' + (n.tags || []).join(' '), open: () => { location.href = 'notes.html#note=' + encodeURIComponent(n.id); } }); }
    // Base Joe
    for (const d of await all('base-joe', 'dbs')) {
      const rows = d.tables.reduce((a, t) => a + t.rows.length, 0);
      add({ app: 'base', title: d.name, sub: `Base de données · ${d.tables.length} table(s), ${rows} enregistrement(s)`, updated: d.updated, text: `${d.tables.map((t) => t.name).join(' ')} ${(d.queries || []).map((q) => q.name).join(' ')}`, open: () => { location.href = 'base.html#db=' + encodeURIComponent(d.id); }, tables: d.tables, db: d });
    }
    // Formulaires Joe
    const resps = await all('forms-joe', 'resp');
    for (const f of await all('forms-joe', 'forms')) { const R = resps.filter((r) => r.form === f.id); add({ app: 'formulaires', title: f.title || 'Formulaire', sub: `Formulaire · ${f.fields.length} question(s), ${R.length} réponse(s)`, updated: Math.max(f.updated || 0, ...R.map((r) => r.at)), text: `${f.desc || ''} ${f.fields.map((x) => x.label + ' ' + (x.options || '')).join(' ')} ${R.map((r) => Object.values(r.values).filter((v) => typeof v !== 'string' || !/^data:/.test(v)).join(' ')).join(' ')}`, open: () => { try { localStorage.setItem('forms-last', f.id); } catch (e) { /* ignore */ } location.href = 'formulaires.html'; } }); }
    // Agenda Joe
    for (const e of await all('agenda-joe', 'events')) add({ app: 'agenda', kind: 'event', title: e.title || 'Événement', sub: `Rendez-vous · ${fmtWhen(e.start)}${e.rrule ? ' · répété' : ''}${e.place ? ' · ' + e.place : ''}`, updated: e.updated || null, date: e.start, text: `${e.place || ''} ${e.notes || ''}`, open: () => { location.href = 'agenda.html#date=' + String(e.start).slice(0, 10); } });
    for (const t of await all('agenda-joe', 'tasks')) add({ app: 'agenda', kind: 'task', title: (t.done ? '☑ ' : '☐ ') + t.title, sub: `Tâche${t.due ? ' · ' + fmtWhen(t.due) : ''}${t.done ? ' · terminée' : ''}`, updated: t.doneAt || t.created, text: t.notes || '', open: () => { try { localStorage.setItem('agenda-view', 'tasks'); } catch (e) { /* ignore */ } location.href = 'agenda.html'; } });
    // Diagrammes Joe
    for (const d of await all('schema-joe', 'docs')) add({ app: 'schema', title: d.title || 'Schéma', sub: `Schéma · ${(d.els || []).filter((e) => e.t === 'shape').length} forme(s)`, updated: d.updated, text: (d.els || []).map((e) => e.text || '').filter(Boolean).join('\n'), open: () => { location.href = 'schema.html#doc=' + d.id; } });
    // Scan Joe, Audio Joe
    const pages = await get('scan-joe', 'kv', 'pages'); if (pages && pages.length) add({ app: 'scan', title: `Scan en cours`, sub: `${pages.length} page(s) scannée(s)`, updated: null, text: '', open: () => { location.href = 'scan.html'; } });
    const au = await get('audio-joe', 'kv', 'doc'); if (au && au.ch) add({ app: 'audio', title: au.name || 'Son', sub: `Son en cours · ${Math.round(au.ch[0].length / au.sr / 60)} min`, updated: au.updated, text: '', open: () => { location.href = 'audio.html'; } });
    return items;
  }
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function fmtWhen(s) { const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(s || ''); return m ? `${+m[3]} ${MOIS[+m[2] - 1]} ${m[1]}${m[4] ? ` ${m[4]}h${m[5] !== '00' ? m[5] : ''}` : ''}` : ''; }
  function ago(t) { if (!t) return ''; const d = new Date(t), now = new Date(); if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); const y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'hier'; return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }); }

  /* ================= Affichage, recherche ================= */
  let items = [], filter = '';
  function snippet(text, words) {
    const n = norm(text); let at = -1; for (const w of words) { const i = n.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
    if (at < 0) return '';
    const a = Math.max(0, at - 25); let s = text.slice(a, at + 130).replace(/\s+/g, ' ');
    return (a ? '…' : '') + hl(s, words) + '…';
  }
  function hl(text, words) {
    const n = norm(text); const marks = new Array(text.length).fill(false);
    words.forEach((w) => { let i = n.indexOf(w); while (i >= 0) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = n.indexOf(w, i + w.length); } });
    let out = '', on = false; for (let k = 0; k < text.length; k++) { if (marks[k] !== on) { out += marks[k] ? '<mark>' : '</mark>'; on = marks[k]; } out += esc(text[k]); } return on ? out + '</mark>' : out;
  }
  function render() {
    const q = norm($('#q').value.trim()); const words = q.split(/\s+/).filter(Boolean);
    let list = items.filter((it) => !filter || it.app === filter);
    const results = [];
    if (words.length) {
      for (const it of list) {
        const hay = norm(it.title + ' ' + (it.sub || '') + ' ' + it.text);
        if (words.every((w) => hay.includes(w))) results.push({ it, sn: snippet(it.text, words) || '' });
        // bases : lignes trouvées, table par table
        if (it.app === 'base' && it.tables) for (const t of it.tables) {
          const hits = t.rows.filter((r) => { const h = norm(Object.values(r).join(' ')); return words.every((w) => h.includes(w)); });
          if (hits.length) { const first = Object.values(hits[0]).filter((v) => v != null && v !== '').join(' · '); results.push({ it: { ...it, title: `${it.title} › ${t.name}`, sub: `${hits.length} enregistrement(s) trouvé(s)`, open: () => { location.href = `base.html#db=${encodeURIComponent(it.db.id)}&t=${encodeURIComponent(t.name)}`; } }, sn: hl(first.slice(0, 180), words) }); }
        }
      }
    } else results.push(...list.filter((it) => it.kind !== 'event' && it.kind !== 'task').sort((a, b) => (b.updated || 0) - (a.updated || 0)).map((it) => ({ it, sn: '' })));
    const counts = {}; items.forEach((it) => { counts[it.app] = (counts[it.app] || 0) + 1; });
    $('#chips').innerHTML = `<button data-f="" class="${filter ? '' : 'on'}">Tout (${items.length})</button>` + Object.keys(APPS).filter((a) => counts[a]).map((a) => `<button data-f="${a}" class="${filter === a ? 'on' : ''}">${APPS[a].label} (${counts[a]})</button>`).join('');
    $('#chips').querySelectorAll('button').forEach((b) => { b.onclick = () => { filter = b.dataset.f; render(); }; });
    if (!results.length) { $('#list').innerHTML = `<p class="empty">${words.length ? `Rien ne contient « ${esc($('#q').value)} ».` : 'Aucun document pour le moment. Créez-en depuis l\'accueil, ou ouvrez un fichier avec 📂.'}</p>`; return; }
    const row = ({ it, sn }) => { const A = APPS[it.app]; return `<button class="it"><span class="ic" style="background:${A.color}">${A.ic}</span><div><div class="t">${words.length ? hl(it.title, words) : esc(it.title)}</div><div class="s">${esc(it.sub || A.label)}</div>${sn ? `<div class="sn">${sn}</div>` : ''}</div><span class="d">${esc(ago(it.updated))}</span></button>`; };
    const shown = results.slice(0, 200);
    $('#list').innerHTML = (words.length ? `<h3>${results.length} résultat(s)</h3>` : '<h3>Récents</h3>') + shown.map(row).join('') + (results.length > 200 ? '<p class="hint">Affinez la recherche pour voir la suite.</p>' : '');
    $('#list').querySelectorAll('.it').forEach((b, i) => { b.onclick = () => shown[i].it.open(); });
  }

  /* ================= Ouvrir n'importe quel fichier dans la bonne application ================= */
  function appsFor(f) {
    const n = f.name.toLowerCase(), t = f.type || '';
    const ext = (n.match(/\.([a-z0-9]+)$/) || [, ''])[1];
    if (ext === 'joebak') return [['sauvegarde', 'Restaurer la sauvegarde']];
    if (['accdb', 'mdb', 'joedb'].includes(ext)) return [['base', 'Ouvrir dans Base Joe']];
    if (ext === 'ics' || t === 'text/calendar') return [['agenda', 'Ajouter à Agenda Joe']];
    if (ext === 'joeform') return [['formulaires', 'Importer dans Formulaires Joe']];
    if (ext === 'pdf' || t === 'application/pdf') return [['pdf', 'Ouvrir dans PDF Joe'], ['texte', 'Convertir en document (Texte Joe)'], ['tableur', 'Reprendre les tableaux (Tableur Joe)'], ['formulaires', 'Formulaire rempli → réponse']];
    if (['docx', 'odt', 'rtf', 'html', 'htm', 'joedoc'].includes(ext)) return [['texte', 'Ouvrir dans Texte Joe']];
    if (['doc'].includes(ext)) return [['texte', 'Ouvrir dans Texte Joe (enregistrez-le d\'abord en .docx)']];
    if (['xlsx', 'xlsm', 'csv', 'tsv', 'joetab'].includes(ext)) return [['tableur', 'Ouvrir dans Tableur Joe'], ['base', 'Importer en table (Base Joe)']];
    if (['pptx', 'joeslides'].includes(ext)) return [['presentation', 'Ouvrir dans Présentation Joe']];
    if (['txt', 'md'].includes(ext) || t.startsWith('text/')) return [['notes', 'Créer une note'], ['texte', 'Ouvrir dans Texte Joe']];
    if (ext === 'json') return [['formulaires', 'Réponse ou formulaire (Formulaires Joe)']];
    if (t.startsWith('audio/') || ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'amr', 'flac', 'oga'].includes(ext)) return [['audio', 'Ouvrir dans Audio Joe'], ['video', 'Ajouter à un montage (Video Joe)']];
    if (t.startsWith('video/') || ['mp4', 'mov', 'webm', '3gp', 'mkv'].includes(ext)) return [['video', 'Monter dans Video Joe'], ['audio', 'Extraire le son (Audio Joe)']];
    if (t.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'bmp', 'joeimg'].includes(ext)) return [['scan', 'Document photographié → Scan Joe'], ['photo', 'Retoucher dans Photo Joe'], ['pdf', 'Mettre en PDF (PDF Joe)'], ['design', 'Utiliser dans Design Joe']];
    if (ext === 'joedesign') return [['design', 'Ouvrir dans Design Joe']];
    if (ext === 'joeschema') return [['schema', 'Ouvrir dans Diagrammes Joe']];
    if (ext === 'joevideo') return [['video', 'Ouvrir dans Video Joe']];
    return [];
  }
  async function route(files, source) {
    if (!files.length) return;
    // fichiers de même nature : une seule destination
    const groups = new Map(); files.forEach((f) => { const k = JSON.stringify(appsFor(f)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); });
    if (groups.size > 1) toast('Fichiers de types différents : ils sont ouverts un type à la fois', 5000);
    const [key, fs] = [...groups.entries()][0]; const choices = JSON.parse(key);
    if (!choices.length) { toast(`« ${fs[0].name} » : type de fichier non pris en charge par Studio Joe`, 7000); return; }
    let app = choices[0][0];
    if (choices.length > 1) {
      app = await modal({ title: fs.length > 1 ? `${fs.length} fichiers` : fs[0].name, body: `<p class="hint">${source === 'share' ? 'Reçu d\'une autre application. ' : ''}Que voulez-vous faire ?</p>`, buttons: [{ label: 'Annuler', value: null }, ...choices.slice(1).reverse().map(([a, l]) => ({ label: l, value: a })), { label: choices[0][1], primary: true, value: choices[0][0] }] });
      if (!app) return;
    }
    await Studio.openIn(app, fs);
  }
  $('#openFile').onclick = async () => { const fs = await pickFiles('*/*', true); if (fs.length) route(fs); };
  Studio.onDropFiles(document.body, (fs) => route(fs));

  /* ================= Fichiers reçus par le partage du téléphone ================= */
  async function showShared() {
    const fs = await Studio.handoff.peek('shared').catch(() => []);
    if (!fs.length) { $('#shared').innerHTML = ''; return; }
    $('#shared').innerHTML = `<div class="shared"><h2>📥 Reçu${fs.length > 1 ? `s (${fs.length})` : ''}</h2>${fs.map((f, i) => `<div class="sf"><b>${esc(f.name)}</b><span class="hint">${(f.size / 1024 > 1024 ? (f.size / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(f.size / 1024)) + ' Ko')}</span><div class="apps">${appsFor(f).map(([a, l], j) => `<button data-i="${i}" data-a="${a}" class="${j ? '' : 'primary'}">${esc(l)}</button>`).join('') || '<span class="hint">Type de fichier non pris en charge</span>'}</div></div>`).join('')}<button id="dropShared" class="ghost">Ignorer</button></div>`;
    $('#shared').querySelectorAll('[data-a]').forEach((b) => { b.onclick = async () => { const list = await Studio.handoff.take('shared'); const f = list[+b.dataset.i]; const rest = list.filter((_, k) => k !== +b.dataset.i); if (rest.length) await Studio.handoff.put('shared', rest); await Studio.openIn(b.dataset.a, [f]); }; });
    $('#dropShared').onclick = async () => { await Studio.handoff.take('shared'); showShared(); };
  }

  /* ================= Stockage ================= */
  async function showStorage() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    const e = await navigator.storage.estimate(); const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const used = e.usage || 0, quota = e.quota || 1; const mo = (b) => (b / 1048576 > 1024 ? (b / 1073741824).toFixed(1).replace('.', ',') + ' Go' : Math.round(b / 1048576) + ' Mo');
    $('#store').innerHTML = `<span>Place utilisée : <b>${mo(used)}</b> sur ${mo(quota)} disponibles</span><span class="bar"><div style="width:${Math.min(100, (used / quota) * 100).toFixed(1)}%"></div></span>${persisted ? '<span>🔒 Stockage protégé</span>' : '<button id="persist" title="Empêche le navigateur d\'effacer vos données quand le téléphone manque de place">🔒 Protéger mes données</button>'}<a href="sauvegarde.html">Sauvegarder…</a>`;
    const p = $('#persist'); if (p) p.onclick = async () => { const ok = await navigator.storage.persist(); toast(ok ? 'Données protégées : le navigateur ne les effacera pas pour faire de la place' : 'Le navigateur a refusé. Installez Studio Joe (menu ⋮ → Installer) puis réessayez.', 7000); showStorage(); };
  }

  $('#q').addEventListener('input', render);
  { const q = new URLSearchParams(location.search).get('q'); if (q) $('#q').value = q; }
  (async () => {
    try { items = await collect(); } catch (e) { console.error(e); toast('Lecture des données impossible : ' + e.message, 7000); }
    render(); showShared(); showStorage();
    if (/[?&]partage=/.test(location.search)) { history.replaceState(null, '', location.pathname); const fs = await Studio.handoff.peek('shared').catch(() => []); if (fs.length === 1) { const ch = appsFor(fs[0]); if (ch.length === 1) { const [f] = await Studio.handoff.take('shared'); Studio.openIn(ch[0][0], [f]); } } }
  })();
  window.FilesJoe = { appsFor, route, collect, get items() { return items; } };
})();
