/* Studio Joe — Texte Joe : révision (commentaires et suivi des modifications).
   Ajouts : <ins class="rv" data-a="auteur" data-t="date">, suppressions : <del class="rv" …> (le texte reste visible, barré).
   Commentaires : le texte commenté est entouré de <span class="cm" data-cid="…"> ; le contenu des commentaires
   (auteur, date, texte, réponses) est rangé dans doc.comments. L'export .docx (doc-extra.js) les convertit
   en vraies révisions et vrais commentaires Word. */
(function () {
  const { $, toast, modal, confirmBox } = Studio;
  const T = window.TexteJoe; const body = T.body; const esc = T.esc;
  const PANEL_CSS = `
#rvPanel{position:fixed;top:52px;right:0;bottom:0;width:min(340px,92vw);background:var(--panel);border-left:1px solid var(--line);box-shadow:var(--shadow);z-index:40;display:flex;flex-direction:column}
#rvPanel[hidden]{display:none}
#rvPanel .rh{display:flex;gap:6px;align-items:center;padding:10px;border-bottom:1px solid var(--line);flex-wrap:wrap}
#rvPanel .rh b{flex:1}
#rvPanel .rl{overflow-y:auto;padding:10px;display:grid;gap:8px;align-content:start;flex:1}
#rvPanel .ri{border:1px solid var(--line);border-left:4px solid var(--c,#999);border-radius:8px;padding:8px;font-size:13px;display:grid;gap:4px;background:var(--panel-2);cursor:pointer}
#rvPanel .ri.on{outline:2px solid var(--accent)}
#rvPanel .ri.done{opacity:.6}
#rvPanel .ri .m{color:var(--muted);font-size:11px}
#rvPanel .ri .q{font-style:italic;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#rvPanel .ri .bt{display:flex;gap:4px;flex-wrap:wrap}#rvPanel .ri .bt button{padding:2px 8px;font-size:12px;min-width:0}
#rvPanel .ri .rp{border-top:1px dashed var(--line);padding-top:4px}
#rvPanel .ri textarea{width:100%;min-height:44px;font:inherit;font-size:13px}
#rvPanel .sw{display:flex;gap:6px;align-items:center;font-size:13px;width:100%}
#rvPanel .sw input{width:18px;height:18px;margin:0}
#stTrack{cursor:pointer;color:#c62828;font-weight:600}
@media (max-width:700px){#rvPanel{top:auto;left:0;width:100%;height:58vh;border-left:0;border-top:1px solid var(--line);border-radius:14px 14px 0 0}}`;
  const st = document.createElement('style'); st.textContent = PANEL_CSS; document.head.appendChild(st);

  /* ================= Auteur ================= */
  const author = () => { try { return localStorage.getItem('studio-author') || ''; } catch (e) { return ''; } };
  async function askAuthor(force = false) {
    if (author() && !force) return author();
    const n = await modal({ title: 'Votre nom (auteur des révisions)', body: '<p class="hint">Il apparaît sur vos commentaires et modifications, dans Texte Joe et dans Word.</p><input type="text" id="au" placeholder="Ex. : J. Tiaho">', onOpen: (b) => { const i = b.querySelector('#au'); i.value = author(); i.select(); }, buttons: [{ label: 'Annuler', value: null }, { label: 'OK', primary: true, value: (b) => b.querySelector('#au').value.trim() }] });
    if (n) try { localStorage.setItem('studio-author', n); } catch (e) { /* stockage indisponible */ }
    return author() || n || 'Auteur';
  }
  const who = () => author() || 'Auteur';
  const now = () => new Date().toISOString();
  const fmtDate = (t) => { try { return new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const COLORS = ['#1565c0', '#6a1b9a', '#00838f', '#ef6c00', '#2e7d32', '#ad1457'];
  const colorOf = (a) => { let h = 0; for (const ch of String(a)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const comments = () => (T.doc.comments = T.doc.comments || []);

  /* ================= Outils DOM ================= */
  const elOf = (n) => (n && n.nodeType === 1 ? n : n && n.parentElement);
  const up = (n, sel) => { const e = elOf(n); const r = e && e.closest(sel); return r && body.contains(r) ? r : null; };
  const ownIns = (n) => { const i = up(n, 'ins.rv'); return i && i.dataset.a === who() ? i : null; };
  // morceaux de texte compris dans la plage, découpés aux bornes
  function pieces(r) {
    const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
    const list = []; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!r.intersectsNode(n) || !n.length) continue;
      const s = n === r.startContainer ? r.startOffset : 0, e = n === r.endContainer ? r.endOffset : n.length;
      if (s < e) list.push([n, s, e]);
    }
    return list.map(([n, s, e]) => { if (e < n.length) n.splitText(e); return s > 0 ? n.splitText(s) : n; })
      .filter((n) => !up(n, '.mf,.toc') && n.nodeValue.replace(/\u200b/g, '') !== '');
  }
  function wrap(n, tag, cls, data) { const e = document.createElement(tag); e.className = cls; Object.assign(e.dataset, data); n.parentNode.insertBefore(e, n); e.appendChild(n); return e; }
  function mergeSiblings(e) {
    const same = (x) => x && x.nodeType === 1 && x.tagName === e.tagName && x.className === e.className && x.dataset.a === e.dataset.a && x.dataset.cid === e.dataset.cid;
    const p = e.previousSibling; if (same(p)) { while (e.firstChild) p.appendChild(e.firstChild); e.remove(); e = p; }
    const nx = e.nextSibling; if (same(nx)) { while (nx.firstChild) e.appendChild(nx.firstChild); nx.remove(); }
    e.normalize(); return e;
  }
  const unwrap = (e) => { const p = e.parentNode; while (e.firstChild) p.insertBefore(e.firstChild, e); e.remove(); };
  function caretAt(node, after) { const r = document.createRange(); if (after) r.setStartAfter(node); else r.setStartBefore(node); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  function caretIn(text, off) { const r = document.createRange(); r.setStart(text, off); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  const before = () => T.snapshot();
  const after = () => { T.afterContentChange(); T.snapshot(); refreshSoon(); };

  /* ================= Suivi des modifications ================= */
  // marque le texte de la plage comme supprimé ; renvoie un repère où replacer le curseur
  function markDeleted(r, backward) {
    const mark = document.createTextNode(''); const c = r.cloneRange(); c.collapse(backward); c.insertNode(mark);
    const meta = { a: who(), t: now() };
    for (const n of pieces(r)) {
      if (up(n, 'del.rv')) continue;
      const own = ownIns(n);
      if (own) { n.remove(); if (!own.textContent.replace(/\u200b/g, '')) own.remove(); continue; }
      mergeSiblings(wrap(n, 'del', 'rv', meta));
    }
    return mark;
  }
  function insertTracked(text, r) {
    let host = up(r.startContainer, 'del.rv');
    const ins = document.createElement('ins'); ins.className = 'rv'; ins.dataset.a = who(); ins.dataset.t = now();
    const tn = document.createTextNode(text); ins.appendChild(tn);
    if (host) { host.after(ins); } else r.insertNode(ins);
    caretIn(tn, tn.length);
    return ins;
  }
  function rangeFromEvent(e) {
    const tr = e.getTargetRanges && e.getTargetRanges()[0];
    if (tr) { const r = document.createRange(); try { r.setStart(tr.startContainer, tr.startOffset); r.setEnd(tr.endContainer, tr.endOffset); return r; } catch (x) { /* plage invalide */ } }
    const s = getSelection(); return s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  }
  body.addEventListener('beforeinput', (e) => {
    if (!T.doc.track || e.isComposing) return;
    const t = e.inputType; const s = getSelection(); if (!s.rangeCount) return;
    if (t === 'insertText' || t === 'insertReplacementText' || t === 'insertFromPaste' || t === 'insertFromDrop') {
      const text = e.data != null ? e.data : e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
      if (!text) return;
      let r = t === 'insertReplacementText' ? rangeFromEvent(e) : s.getRangeAt(0);
      if (r.collapsed && ownIns(r.startContainer) && !up(r.startContainer, 'del.rv')) return; // on écrit dans son propre ajout
      e.preventDefault(); before();
      if (!r.collapsed) { const m = markDeleted(r, false); r = document.createRange(); r.setStartAfter(m); r.collapse(true); m.remove(); }
      mergeSiblings(insertTracked(text, r)); after(); return;
    }
    if (/^delete/.test(t)) {
      let r = s.getRangeAt(0);
      if (r.collapsed) r = rangeFromEvent(e);
      if (!r || r.collapsed || !r.toString().replace(/\u200b/g, '')) return; // fusion de paragraphes : non suivie
      e.preventDefault(); before();
      const backward = /Backward/.test(t);
      const m = markDeleted(r, backward); caretAt(m, false); m.remove(); after();
    }
  });
  // claviers de téléphone (saisie « composée ») : on prépare un ajout vide avant la composition
  body.addEventListener('compositionstart', () => {
    if (!T.doc.track) return; const s = getSelection(); if (!s.rangeCount) return;
    let r = s.getRangeAt(0);
    if (r.collapsed && ownIns(r.startContainer)) return;
    before();
    if (!r.collapsed) { const m = markDeleted(r, false); r = document.createRange(); r.setStartAfter(m); r.collapse(true); m.remove(); }
    insertTracked('\u200b', r);
  });
  body.addEventListener('compositionend', () => {
    if (!T.doc.track) return; const s = getSelection(); const n = s.anchorNode;
    const i = ownIns(n); if (!i || !n || n.nodeType !== 3) return;
    const z = n.nodeValue.indexOf('\u200b'); if (z < 0 || n.length < 2) return;
    const off = s.anchorOffset; n.deleteData(z, 1); caretIn(n, Math.max(0, off - (z < off ? 1 : 0)));
  });
  // collage en mode suivi : texte brut, marqué comme ajout
  body.addEventListener('paste', (e) => {
    if (!T.doc.track || !e.clipboardData) return;
    const text = e.clipboardData.getData('text/plain'); if (!text) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const s = getSelection(); if (!s.rangeCount) return; before();
    let r = s.getRangeAt(0); if (!r.collapsed) { const m = markDeleted(r, false); r = document.createRange(); r.setStartAfter(m); r.collapse(true); m.remove(); }
    mergeSiblings(insertTracked(text.replace(/\r?\n/g, ' '), r)); after();
  }, true);

  function setTrack(on) { T.doc.track = !!on; T.markDirty(); status(); refresh(); toast(on ? 'Suivi des modifications activé : vos ajouts et suppressions sont marqués' : 'Suivi des modifications désactivé'); }
  async function toggleTrack() { if (!T.doc.track) await askAuthor(); setTrack(!T.doc.track); }

  function accept(e) { if (e.tagName === 'INS') unwrap(e); else e.remove(); }
  function reject(e) { if (e.tagName === 'INS') e.remove(); else unwrap(e); }
  function revsIn(r) { return [...body.querySelectorAll('ins.rv,del.rv')].filter((e) => !r || r.intersectsNode(e)); }
  function decide(all, ok) {
    const s = getSelection(); const r = !all && s.rangeCount && body.contains(s.anchorNode) ? s.getRangeAt(0) : null;
    if (!all && !r) return toast('Placez le curseur dans une modification');
    const list = revsIn(r); if (!list.length) return toast(all ? 'Aucune modification suivie dans le document' : 'Aucune modification à cet endroit');
    before(); list.forEach(ok ? accept : reject); body.normalize(); after();
    toast(`${list.length} modification${list.length > 1 ? 's' : ''} ${ok ? 'acceptée' : 'refusée'}${list.length > 1 ? 's' : ''}`);
  }
  function goto(dir) {
    const all = [...body.querySelectorAll('ins.rv,del.rv,span.cm')]; if (!all.length) return toast('Aucune révision dans le document');
    const s = getSelection(); const cur = s.rangeCount && body.contains(s.anchorNode) ? s.getRangeAt(0) : null;
    let target;
    if (!cur) target = dir > 0 ? all[0] : all[all.length - 1];
    else if (dir > 0) target = all.find((e) => cur.comparePoint(e, 0) > 0 && !e.contains(cur.startContainer)) || all[0];
    else target = [...all].reverse().find((e) => cur.comparePoint(e, 0) < 0 && !e.contains(cur.startContainer)) || all[all.length - 1];
    select(target);
  }
  function select(e) {
    T.focusBody(); const r = document.createRange(); r.selectNodeContents(e); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    e.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (e.dataset.cid) focusComment(e.dataset.cid, false);
  }

  /* ================= Commentaires ================= */
  async function addComment() {
    T.focusBody(); const s = getSelection(); if (!s.rangeCount || !body.contains(s.anchorNode)) return toast('Placez le curseur dans le texte');
    if (s.getRangeAt(0).collapsed) { s.modify('move', 'backward', 'word'); s.modify('extend', 'forward', 'word'); }
    const r = s.getRangeAt(0).cloneRange(); const quote = r.toString().replace(/\u200b/g, '').trim();
    if (!quote) return toast('Sélectionnez le texte à commenter');
    await askAuthor();
    const text = await modal({ title: 'Nouveau commentaire', body: `<p class="hint">Sur : « ${esc(quote.slice(0, 120))}${quote.length > 120 ? '…' : ''} »</p><textarea id="ct" rows="4" style="width:100%" placeholder="Votre commentaire…"></textarea>`, onOpen: (b) => b.querySelector('#ct').focus(), buttons: [{ label: 'Annuler', value: null }, { label: 'Ajouter', primary: true, value: (b) => b.querySelector('#ct').value.trim() }] });
    if (!text) return;
    before();
    const cid = T.uid();
    for (const n of pieces(r)) wrap(n, 'span', 'cm', { cid });
    comments().push({ id: cid, a: who(), t: now(), text, quote: quote.slice(0, 300), replies: [], done: false });
    after(); openPanel(); focusComment(cid);
  }
  const spansOf = (cid) => [...body.querySelectorAll(`span.cm[data-cid="${CSS.escape(cid)}"]`)];
  function deleteComment(cid) { before(); spansOf(cid).forEach(unwrap); body.normalize(); T.doc.comments = comments().filter((c) => c.id !== cid); after(); }
  function resolveComment(cid) { const c = comments().find((x) => x.id === cid); if (!c) return; before(); c.done = !c.done; spansOf(cid).forEach((e) => e.classList.toggle('done', c.done)); after(); }
  function reply(cid, text) { const c = comments().find((x) => x.id === cid); if (!c || !text) return; before(); c.replies = c.replies || []; c.replies.push({ a: who(), t: now(), text }); after(); }
  async function deleteAllComments() {
    if (!comments().length && !body.querySelector('span.cm')) return toast('Aucun commentaire');
    if (!(await confirmBox('Supprimer tous les commentaires du document ?'))) return;
    before(); body.querySelectorAll('span.cm').forEach(unwrap); body.normalize(); T.doc.comments = []; after();
  }
  function focusComment(cid, scrollDoc = true) {
    body.querySelectorAll('span.cm.on').forEach((e) => e.classList.remove('on'));
    spansOf(cid).forEach((e) => e.classList.add('on'));
    if (scrollDoc && spansOf(cid)[0]) spansOf(cid)[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (!panel.hidden) { panel.querySelectorAll('.ri.on').forEach((e) => e.classList.remove('on')); const it = panel.querySelector(`.ri[data-cid="${CSS.escape(cid)}"]`); if (it) { it.classList.add('on'); it.scrollIntoView({ block: 'nearest' }); } }
  }
  body.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('span.cm'); if (!c || !body.contains(c)) return;
    if (panel.hidden && innerWidth >= 700) openPanel();
    if (!panel.hidden) focusComment(c.dataset.cid, false);
  });

  /* ================= Volet Révisions ================= */
  const panel = document.createElement('aside'); panel.id = 'rvPanel'; panel.hidden = true; document.body.appendChild(panel);
  function openPanel() { panel.hidden = false; refresh(); }
  function togglePanel() { panel.hidden ? openPanel() : (panel.hidden = true); }
  function items() {
    const out = []; const seen = new Set();
    for (const e of body.querySelectorAll('ins.rv,del.rv,span.cm')) {
      if (e.tagName === 'SPAN') { const cid = e.dataset.cid; if (seen.has(cid)) continue; seen.add(cid); const c = comments().find((x) => x.id === cid); if (c) out.push({ k: 'c', c, el: e }); continue; }
      out.push({ k: e.tagName === 'INS' ? 'i' : 'd', el: e, a: e.dataset.a || 'Auteur', t: e.dataset.t, text: e.textContent.replace(/\u200b/g, '') });
    }
    for (const c of comments()) if (!seen.has(c.id)) out.push({ k: 'c', c, orphan: true });
    return out;
  }
  function refresh() {
    status();
    if (panel.hidden) return;
    const list = items(); const nRev = list.filter((x) => x.k !== 'c').length, nCom = list.filter((x) => x.k === 'c').length;
    panel.innerHTML = `<div class="rh"><b>Révision</b><button data-rv="close" title="Fermer">✕</button>
      <label class="sw"><input type="checkbox" data-rv="track" ${T.doc.track ? 'checked' : ''}> Suivi des modifications</label>
      <label class="sw"><input type="checkbox" data-rv="final" ${body.classList.contains('final') ? 'checked' : ''}> Afficher le texte final (sans marques)</label>
      <button data-rv="comment">💬 Commenter</button><button data-rv="acceptAll" ${nRev ? '' : 'disabled'}>✓ Tout accepter</button><button data-rv="rejectAll" ${nRev ? '' : 'disabled'}>✗ Tout refuser</button>
      <span class="hint" style="width:100%">${nRev} modification${nRev > 1 ? 's' : ''} · ${nCom} commentaire${nCom > 1 ? 's' : ''}</span></div>
      <div class="rl">${list.length ? '' : '<p class="hint">Aucune révision. Activez le suivi des modifications ou sélectionnez un passage puis « Commenter ».</p>'}</div>`;
    const rl = panel.querySelector('.rl');
    list.forEach((x, i) => {
      const d = document.createElement('div'); d.className = 'ri'; d.dataset.i = i;
      if (x.k === 'c') {
        const c = x.c; d.dataset.cid = c.id; d.classList.toggle('done', !!c.done); d.style.setProperty('--c', colorOf(c.a));
        d.innerHTML = `<div class="m">💬 <b>${esc(c.a)}</b> · ${fmtDate(c.t)}${c.done ? ' · résolu' : ''}${x.orphan ? ' · texte supprimé' : ''}</div>
          <div class="q">« ${esc(c.quote || '')} »</div><div>${esc(c.text).replace(/\n/g, '<br>')}</div>
          ${(c.replies || []).map((rp) => `<div class="rp"><div class="m"><b>${esc(rp.a)}</b> · ${fmtDate(rp.t)}</div>${esc(rp.text).replace(/\n/g, '<br>')}</div>`).join('')}
          <div class="bt"><button data-rv="reply">Répondre</button><button data-rv="resolve">${c.done ? 'Rouvrir' : 'Résolu'}</button><button data-rv="del">Supprimer</button></div>`;
      } else {
        d.style.setProperty('--c', x.k === 'i' ? '#2e7d32' : '#c62828');
        d.innerHTML = `<div class="m">${x.k === 'i' ? '➕ Ajout' : '➖ Suppression'} · <b>${esc(x.a)}</b> · ${fmtDate(x.t)}</div><div class="q" style="font-style:normal;color:var(--fg)">« ${esc(x.text.slice(0, 160))} »</div>
          <div class="bt"><button data-rv="acc">✓ Accepter</button><button data-rv="rej">✗ Refuser</button></div>`;
      }
      d._x = x; rl.appendChild(d);
    });
  }
  let refreshT = null; function refreshSoon() { clearTimeout(refreshT); refreshT = setTimeout(refresh, 250); }
  new MutationObserver(() => refreshSoon()).observe(body, { childList: true, subtree: true, characterData: true });
  panel.addEventListener('change', (e) => {
    const k = e.target.dataset.rv;
    if (k === 'track') { if (e.target.checked && !author()) askAuthor().then(() => setTrack(true)); else setTrack(e.target.checked); }
    if (k === 'final') body.classList.toggle('final', e.target.checked);
  });
  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rv]'); const it = e.target.closest('.ri'); const x = it && it._x;
    if (b && b.tagName === 'INPUT') return;
    if (!b) { if (x && x.el) select(x.el); else if (x && x.c) focusComment(x.c.id); return; }
    const k = b.dataset.rv;
    if (k === 'close') panel.hidden = true;
    else if (k === 'comment') addComment();
    else if (k === 'acceptAll') decide(true, true);
    else if (k === 'rejectAll') decide(true, false);
    else if (k === 'acc' || k === 'rej') { before(); (k === 'acc' ? accept : reject)(x.el); body.normalize(); after(); }
    else if (k === 'del') deleteComment(x.c.id);
    else if (k === 'resolve') resolveComment(x.c.id);
    else if (k === 'reply') {
      if (it.querySelector('textarea')) return;
      await askAuthor();
      const box = document.createElement('div'); box.innerHTML = '<textarea placeholder="Votre réponse…"></textarea><div class="bt"><button data-rv="send" class="primary">Envoyer</button></div>'; it.appendChild(box); box.querySelector('textarea').focus();
    } else if (k === 'send') { reply(x.c.id, it.querySelector('textarea').value.trim()); }
  });

  /* ================= Barre d'état ================= */
  const stT = document.createElement('span'); stT.id = 'stTrack'; stT.title = 'Ouvrir le volet Révision'; stT.onclick = openPanel;
  const stSave = $('#stSave'); if (stSave) stSave.after(stT);
  function status() { const n = body.querySelectorAll('ins.rv,del.rv').length, c = comments().length; stT.textContent = T.doc.track ? `● Suivi activé${n ? ` (${n})` : ''}` : n || c ? `Révisions : ${n} · 💬 ${c}` : ''; stT.style.color = T.doc.track ? '#c62828' : 'var(--muted)'; }
  // un nouveau document (ou un document ouvert) rafraîchit le volet
  const origLoad = T.loadDoc; T.loadDoc = function (d) { origLoad(d); body.classList.remove('final'); refresh(); };

  Object.assign(T.actions, {
    comment: addComment, track: toggleTrack, review: togglePanel,
    acceptChange: () => decide(false, true), rejectChange: () => decide(false, false),
    acceptAll: () => decide(true, true), rejectAll: () => decide(true, false),
    nextChange: () => goto(1), prevChange: () => goto(-1), deleteComments: deleteAllComments,
    authorName: () => askAuthor(true),
  });
  // ouverture d'un .docx : les repères posés par doc-extra.js (prepRevisions) deviennent des révisions / commentaires
  function applyMarkers(html, info) {
    const box = document.createElement('div'); box.innerHTML = html;
    const ph = {}; const re = /\uE000(\/?)([RC][^\uE001]*)\uE001/g;
    const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); const texts = []; for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.includes('\uE000')) texts.push(n);
    for (const t of texts) {
      const frag = document.createDocumentFragment(); let last = 0; let m; re.lastIndex = 0;
      while ((m = re.exec(t.nodeValue))) {
        if (m.index > last) frag.appendChild(document.createTextNode(t.nodeValue.slice(last, m.index)));
        const e = document.createElement('span'); e.dataset.mk = m[2]; frag.appendChild(e); (ph[m[2]] = ph[m[2]] || [])[m[1] ? 1 : 0] = e; last = re.lastIndex;
      }
      if (last < t.length) frag.appendChild(document.createTextNode(t.nodeValue.slice(last)));
      t.replaceWith(frag);
    }
    const comments = [];
    for (const [id, [s, e]] of Object.entries(ph)) {
      if (!s || !e) continue;
      const r = document.createRange(); r.setStartAfter(s); r.setEndBefore(e);
      if (id[0] === 'R') { const m = info.marks[id]; if (!m) continue; const ps = pieces(r); for (const n of ps) wrap(n, m.k.toLowerCase(), 'rv', { a: m.a, t: m.t }); }
      else {
        const c = info.comments[id.slice(1)]; if (!c) continue; const quote = r.toString().trim();
        const cid = T.uid(); for (const n of pieces(r)) wrap(n, 'span', 'cm', { cid });
        comments.push({ id: cid, a: c.a, t: c.t, text: c.text, quote: quote.slice(0, 300), replies: [], done: false });
      }
    }
    box.querySelectorAll('span[data-mk]').forEach((e) => e.remove());
    box.normalize();
    return { html: box.innerHTML, comments };
  }
  T.review = { markDeleted, refresh, items, author: who, applyMarkers };
  document.addEventListener('DOMContentLoaded', () => setTimeout(refresh, 50));
})();
