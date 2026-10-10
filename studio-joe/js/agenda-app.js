/* Studio Joe — Agenda Joe : agenda et tâches (équivalent Outlook / Google Agenda).
   Vues jour, semaine, mois, liste ; événements répétés (chaque jour, semaine, mois — y compris « le 2e lundi » —,
   année), plusieurs agendas colorés, jours fériés du Burkina Faso, tâches avec échéances et priorités,
   tâches cochables des notes de Notes Joe, rappels par notification, import / export .ics (Google Agenda,
   Outlook, agenda du téléphone). Tout reste sur l'appareil. */
(function () {
  const { $, toast, download, pickFiles, modal, confirmBox, initMenus } = Studio;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const JC = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const COLORS = ['#1565c0', '#2e7d32', '#c62828', '#6a1b9a', '#ef6c00', '#00838f', '#5d4037', '#ad1457'];

  /* ================= Dates ================= */
  const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const tkey = (d) => `${dkey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  function parse(s) { if (!s) return null; const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null; }
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const startOfWeek = (d) => { const x = startOfDay(d); const k = (x.getDay() + 6) % 7; return addDays(x, -k); }; // lundi
  const sameDay = (a, b) => dkey(a) === dkey(b);
  const hm = (d) => `${pad(d.getHours())}h${d.getMinutes() ? pad(d.getMinutes()) : ''}`;
  const longDate = (d) => `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;

  /* ================= Stockage ================= */
  const db = {
    h: null,
    open() { if (this.h) return Promise.resolve(this.h); return new Promise((res, rej) => { const r = indexedDB.open('agenda-joe', 1); r.onupgradeneeded = () => { r.result.createObjectStore('events', { keyPath: 'id' }); r.result.createObjectStore('tasks', { keyPath: 'id' }); r.result.createObjectStore('kv'); }; r.onsuccess = () => { this.h = r.result; res(this.h); }; r.onerror = () => rej(r.error); }); },
    async all(st) { const h = await this.open(); return new Promise((res, rej) => { const q = h.transaction(st).objectStore(st).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async put(st, v, k) { const h = await this.open(); return new Promise((res, rej) => { const t = h.transaction(st, 'readwrite'); if (k === undefined) t.objectStore(st).put(v); else t.objectStore(st).put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async get(st, k) { const h = await this.open(); return new Promise((res, rej) => { const q = h.transaction(st).objectStore(st).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async del(st, k) { const h = await this.open(); return new Promise((res, rej) => { const t = h.transaction(st, 'readwrite'); t.objectStore(st).delete(k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  };
  let events = [], tasks = [], cals = [], settings = { holidays: true, notes: true, notify: false };
  let cur = new Date(), view = innerWidth < 820 ? 'list' : 'month';
  const saveCals = () => db.put('kv', cals, 'cals');
  const saveSettings = () => db.put('kv', settings, 'settings');
  const calOf = (id) => cals.find((c) => c.id === id) || cals[0];
  const visibleCal = (id) => { const c = calOf(id); return !c || c.visible !== false; };

  /* ================= Jours fériés (Burkina Faso) ================= */
  function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); }
  // fêtes musulmanes : dates estimées (calendrier lunaire), à confirmer chaque année par les autorités
  const ISLAM = { 2025: [['2025-03-30', 'Aïd el-Fitr (Ramadan)'], ['2025-06-06', 'Aïd el-Adha (Tabaski)'], ['2025-09-04', 'Mawloud']], 2026: [['2026-03-20', 'Aïd el-Fitr (Ramadan)'], ['2026-05-27', 'Aïd el-Adha (Tabaski)'], ['2026-08-26', 'Mawloud']], 2027: [['2027-03-10', 'Aïd el-Fitr (Ramadan)'], ['2027-05-16', 'Aïd el-Adha (Tabaski)'], ['2027-08-15', 'Mawloud']], 2028: [['2028-02-27', 'Aïd el-Fitr (Ramadan)'], ['2028-05-05', 'Aïd el-Adha (Tabaski)'], ['2028-08-04', 'Mawloud']] };
  function holidays(y) {
    const fixed = [['01-01', 'Jour de l\'an'], ['01-03', 'Anniversaire du soulèvement populaire du 3 janvier 1966'], ['03-08', 'Journée internationale de la femme'], ['05-01', 'Fête du travail'], ['08-05', 'Fête de l\'indépendance'], ['08-15', 'Assomption'], ['11-01', 'Toussaint'], ['12-11', 'Fête nationale (proclamation de la République)'], ['12-25', 'Noël']];
    const out = fixed.map(([md, n]) => ({ date: `${y}-${md}`, name: n }));
    const e = easter(y); out.push({ date: dkey(addDays(e, 1)), name: 'Lundi de Pâques' }, { date: dkey(addDays(e, 39)), name: 'Ascension' }, { date: dkey(addDays(e, 50)), name: 'Lundi de Pentecôte' });
    (ISLAM[y] || []).forEach(([d, n]) => out.push({ date: d, name: n + ' (date estimée, à confirmer)' }));
    return out;
  }

  /* ================= Répétitions ================= */
  // ev.rrule : { freq: 'daily'|'weekly'|'monthly'|'yearly', interval, byday:[0-6], monthMode:'day'|'nth', until:'YYYY-MM-DD', count }
  function occurrences(ev, A, B) {
    const S = parse(ev.start); if (!S) return [];
    const E = parse(ev.end) || S; const dur = Math.max(0, E - S);
    const out = []; const ex = new Set(ev.exdates || []);
    const push = (st) => { const k = ev.allDay ? dkey(st) : tkey(st); if (ex.has(k)) return; const en = new Date(+st + dur); if (en >= A && st < B) out.push({ ev, start: st, end: en, key: `${ev.id}@${k}` }); };
    const r = ev.rrule;
    if (!r || !r.freq) { push(S); return out; }
    const until = r.until ? addDays(parse(r.until), 1) : null; const max = r.count || Infinity; const iv = Math.max(1, r.interval || 1);
    let n = 0; let guard = 0;
    const accept = (d) => { if (until && d >= until) return false; if (n >= max) return false; n++; push(d); return true; };
    if (r.freq === 'daily') { for (let d = new Date(S); d < B && guard++ < 5000; d = addDays(d, iv)) { if (d < S) continue; if (!accept(d)) break; } }
    else if (r.freq === 'weekly') {
      const days = (r.byday && r.byday.length ? r.byday : [S.getDay()]).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      let wk = startOfWeek(S);
      outer: for (; wk < B && guard++ < 2000; wk = addDays(wk, 7 * iv)) for (const dd of days) { const d = addDays(wk, (dd + 6) % 7); d.setHours(S.getHours(), S.getMinutes()); if (d < S) continue; if (d >= B) break outer; if (!accept(d)) break outer; }
    } else if (r.freq === 'monthly') {
      const nth = Math.ceil(S.getDate() / 7), wd = S.getDay(), last = S.getDate() + 7 > new Date(S.getFullYear(), S.getMonth() + 1, 0).getDate();
      for (let m = 0; guard++ < 1200; m += iv) {
        const y = S.getFullYear(), mo = S.getMonth() + m; let d;
        if (r.monthMode === 'nth') { const first = new Date(y, mo, 1); let day = 1 + ((wd - first.getDay() + 7) % 7) + 7 * (nth - 1); const dim = new Date(y, mo + 1, 0).getDate(); if (last && nth >= 4) { while (day + 7 <= dim) day += 7; } if (day > dim) continue; d = new Date(y, mo, day, S.getHours(), S.getMinutes()); }
        else { const dim = new Date(y, mo + 1, 0).getDate(); if (S.getDate() > dim) { d = new Date(y, mo, dim, S.getHours(), S.getMinutes()); if (!r.clamp) continue; } else d = new Date(y, mo, S.getDate(), S.getHours(), S.getMinutes()); }
        if (d >= B) break; if (!accept(d)) break;
      }
    } else if (r.freq === 'yearly') { for (let k = 0; guard++ < 300; k += iv) { const d = new Date(S.getFullYear() + k, S.getMonth(), S.getDate(), S.getHours(), S.getMinutes()); if (d.getMonth() !== S.getMonth()) continue; if (d >= B) break; if (!accept(d)) break; } }
    return out;
  }
  function itemsIn(A, B) {
    const q = norm($('#q').value);
    let list = events.filter((e) => visibleCal(e.cal)).flatMap((e) => occurrences(e, A, B));
    if (q) list = list.filter((o) => norm(`${o.ev.title} ${o.ev.place || ''} ${o.ev.notes || ''}`).includes(q));
    list.sort((a, b) => a.start - b.start || (b.ev.allDay ? 1 : 0) - (a.ev.allDay ? 1 : 0));
    return list;
  }
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function holidaysIn(A, B) { if (!settings.holidays) return []; const out = []; for (let y = A.getFullYear(); y <= B.getFullYear(); y++) holidays(y).forEach((h) => { const d = parse(h.date); if (d >= A && d < B) out.push({ ...h, d }); }); return out; }
  function tasksOn(d) { return tasks.filter((t) => t.due === dkey(d)); }

  /* ================= Barre latérale ================= */
  let miniMonth = new Date(cur);
  function renderSide() {
    const m0 = new Date(miniMonth.getFullYear(), miniMonth.getMonth(), 1); const s = startOfWeek(m0); const today = new Date();
    let cells = ''; for (let i = 0; i < 42; i++) { const d = addDays(s, i); cells += `${i % 7 === 0 ? '<tr>' : ''}<td class="${d.getMonth() !== m0.getMonth() ? 'o' : ''}${sameDay(d, today) ? ' t' : ''}${sameDay(d, cur) ? ' s' : ''}" data-d="${dkey(d)}">${d.getDate()}</td>${i % 7 === 6 ? '</tr>' : ''}`; }
    $('#side').innerHTML = `<div class="mini"><div class="hd"><button data-mm="-1">‹</button><span>${MOIS[m0.getMonth()]} ${m0.getFullYear()}</span><button data-mm="1">›</button></div><table><tr>${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => `<td style="cursor:default;color:var(--muted)">${x}</td>`).join('')}</tr>${cells}</table></div>
      <div><h4>Agendas <button data-x="addCal" title="Nouvel agenda">＋</button></h4>${cals.map((c) => `<label class="cal-it"><input type="checkbox" data-cal="${c.id}" ${c.visible === false ? '' : 'checked'} style="accent-color:${c.color}"><span>${esc(c.name)}</span><button class="more" data-edit="${c.id}" title="Modifier">⋯</button></label>`).join('')}
      <label class="cal-it"><input type="checkbox" data-x="hol" ${settings.holidays ? 'checked' : ''} style="accent-color:#c62828"><span>Jours fériés (Burkina Faso)</span></label>
      <label class="cal-it"><input type="checkbox" data-x="notes" ${settings.notes ? 'checked' : ''}><span>Tâches de Notes Joe</span></label></div>
      <div><h4>Aujourd'hui</h4><div id="todaySide" style="font-size:13px;display:grid;gap:4px"></div></div>`;
    $('#side').querySelectorAll('td[data-d]').forEach((td) => { td.onclick = () => { cur = parse(td.dataset.d); if (view === 'tasks' || view === 'list') view = 'day'; render(); $('#main').classList.remove('open'); }; });
    $('#side').querySelectorAll('[data-mm]').forEach((b) => { b.onclick = () => { miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + +b.dataset.mm, 1); renderSide(); }; });
    $('#side').querySelectorAll('[data-cal]').forEach((i) => { i.onchange = () => { calOf(i.dataset.cal).visible = i.checked; saveCals(); renderView(); }; });
    $('#side').querySelectorAll('[data-edit]').forEach((b) => { b.onclick = (e) => { e.preventDefault(); calDialog(calOf(b.dataset.edit)); }; });
    $('#side [data-x="addCal"]').onclick = () => calDialog();
    $('#side [data-x="hol"]').onchange = (e) => { settings.holidays = e.target.checked; saveSettings(); renderView(); };
    $('#side [data-x="notes"]').onchange = (e) => { settings.notes = e.target.checked; saveSettings(); loadNoteTasks().then(renderView); };
    const t0 = startOfDay(new Date()); const td = itemsIn(t0, addDays(t0, 1)); const tt = tasks.filter((t) => !t.done && t.due && t.due <= dkey(t0));
    $('#todaySide').innerHTML = (td.map((o) => `<div><b>${o.ev.allDay ? 'Journée' : hm(o.start)}</b> ${esc(o.ev.title)}</div>`).join('') + tt.map((t) => `<div>☐ ${esc(t.title)}${t.due < dkey(t0) ? ' <span style="color:#c62828">(en retard)</span>' : ''}</div>`).join('')) || '<span class="hint">Rien de prévu.</span>';
  }
  async function calDialog(c) {
    const v = await modal({ title: c ? 'Modifier l\'agenda' : 'Nouvel agenda', body: `<div class="field"><label for="cN">Nom</label><input id="cN" value="${esc(c ? c.name : '')}" placeholder="ex. Recette municipale, Famille…"></div><div class="field"><label>Couleur</label><div class="swatches" id="cC">${COLORS.map((x) => `<button type="button" data-c="${x}" style="background:${x}" class="${(c ? c.color : COLORS[cals.length % COLORS.length]) === x ? 'on' : ''}"></button>`).join('')}</div></div>`,
      onOpen: (b) => b.querySelectorAll('#cC button').forEach((x) => { x.onclick = () => { b.querySelectorAll('#cC button').forEach((y) => y.classList.remove('on')); x.classList.add('on'); }; }),
      buttons: [{ label: 'Annuler', value: null }, ...(c && cals.length > 1 ? [{ label: 'Supprimer', value: 'del' }] : []), { label: 'Enregistrer', primary: true, value: (b) => ({ name: b.querySelector('#cN').value.trim(), color: (b.querySelector('#cC .on') || { dataset: { c: COLORS[0] } }).dataset.c }) }] });
    if (!v) return;
    if (v === 'del') { const n = events.filter((e) => e.cal === c.id).length; if (!(await confirmBox(`Supprimer l'agenda « ${c.name} »${n ? ` et ses ${n} événement(s)` : ''} ?`, 'Supprimer'))) return; for (const e of events.filter((x) => x.cal === c.id)) await db.del('events', e.id); events = events.filter((e) => e.cal !== c.id); cals = cals.filter((x) => x !== c); saveCals(); render(); return; }
    if (!v.name) return;
    if (c) Object.assign(c, v); else cals.push({ id: uid(), ...v, visible: true });
    saveCals(); render();
  }

  /* ================= Vues ================= */
  function render() { renderTitle(); renderSide(); renderView(); document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.v === view)); }
  function renderTitle() {
    let t = '';
    if (view === 'month') t = `${MOIS[cur.getMonth()]} ${cur.getFullYear()}`;
    else if (view === 'week') { const s = startOfWeek(cur), e = addDays(s, 6); t = s.getMonth() === e.getMonth() ? `${s.getDate()} – ${e.getDate()} ${MOIS[e.getMonth()]} ${e.getFullYear()}` : `${s.getDate()} ${MOIS[s.getMonth()].slice(0, 4)}. – ${e.getDate()} ${MOIS[e.getMonth()].slice(0, 4)}. ${e.getFullYear()}`; }
    else if (view === 'day') t = longDate(cur);
    else if (view === 'list') t = 'À venir';
    else t = 'Tâches';
    $('#title').textContent = t;
  }
  function renderView() {
    const v = $('#view');
    if (view === 'month') renderMonth(v); else if (view === 'week') renderWeek(v, 7); else if (view === 'day') renderWeek(v, 1); else if (view === 'list') renderList(v); else renderTasks(v);
  }
  const colorOf = (ev) => (calOf(ev.cal) || {}).color || '#1565c0';
  function evChip(o, short) {
    const c = colorOf(o.ev); const allDay = o.ev.allDay;
    return `<div class="ev ${allDay ? 'ad' : 'tm'}" style="background:${c};--c:${c}" data-k="${esc(o.key)}" title="${esc(o.ev.title)}">${allDay ? '' : `<b>${hm(o.start)}</b> `}${esc(o.ev.title)}${short ? '' : ''}</div>`;
  }
  function renderMonth(v) {
    const m0 = new Date(cur.getFullYear(), cur.getMonth(), 1); const s = startOfWeek(m0); const B = addDays(s, 42);
    const items = itemsIn(s, B); const hol = holidaysIn(s, B); const today = new Date(); const maxShow = innerWidth < 820 ? 2 : 4;
    let h = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((d) => `<div class="dh">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = addDays(s, i), d2 = addDays(d, 1);
      const its = items.filter((o) => o.start < d2 && o.end > d || (sameDay(o.start, d)));
      const hs = hol.filter((x) => sameDay(x.d, d)); const tk = tasksOn(d);
      const all = [...hs.map((x) => `<div class="ev hol" title="${esc(x.name)}">${esc(x.name)}</div>`), ...its.map((o) => evChip(o)), ...tk.map((t) => `<div class="ev task${t.done ? ' done' : ''}" data-t="${t.id}">${t.done ? '☑' : '☐'} ${esc(t.title)}</div>`)];
      h += `<div class="day${d.getMonth() !== m0.getMonth() ? ' o' : ''}${sameDay(d, today) ? ' t' : ''}" data-d="${dkey(d)}"><span class="n">${d.getDate()}</span>${all.slice(0, maxShow).join('')}${all.length > maxShow ? `<span class="more">+ ${all.length - maxShow} autre(s)</span>` : ''}</div>`;
    }
    v.innerHTML = `<div class="month">${h}</div>`;
    v.querySelectorAll('.day').forEach((el) => { el.onclick = (e) => { if (e.target.closest('[data-k],[data-t]')) return; const d = parse(el.dataset.d); if (sameDay(d, cur) || innerWidth < 820) { cur = d; view = 'day'; render(); } else { cur = d; render(); } }; el.ondblclick = () => editEvent(null, { start: el.dataset.d + 'T09:00' }); });
    bindItems(v, items);
  }
  function lanes(list) { // colonnes pour les événements qui se chevauchent
    const out = []; let group = []; let end = 0;
    const flush = () => { const cols = []; group.forEach((o) => { let c = cols.findIndex((x) => x <= o.start); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = o.end; o._c = c; }); group.forEach((o) => { o._n = cols.length; out.push(o); }); group = []; };
    list.forEach((o) => { if (group.length && o.start >= end) { flush(); end = 0; } group.push(o); end = Math.max(end, +o.end); });
    flush(); return out;
  }
  function renderWeek(v, n) {
    const s = n === 7 ? startOfWeek(cur) : startOfDay(cur); const B = addDays(s, n); const items = itemsIn(s, B); const hol = holidaysIn(s, B); const today = new Date();
    const cols = `56px repeat(${n}, minmax(${n === 7 ? 90 : 200}px, 1fr))`;
    let head = '<div></div>', alld = '<div style="font-size:11px;color:var(--muted);padding:4px;border-left:0">jour</div>', grid = '<div class="hours">' + Array.from({ length: 24 }, (_, h) => `<div>${h ? h + 'h' : ''}</div>`).join('') + '</div>';
    for (let i = 0; i < n; i++) {
      const d = addDays(s, i), d2 = addDays(d, 1);
      head += `<div class="${sameDay(d, today) ? 't' : ''}">${JC[d.getDay()]} <b>${d.getDate()}</b></div>`;
      const ad = items.filter((o) => (o.ev.allDay || o.end - o.start >= 864e5) && o.start < d2 && o.end > d);
      alld += `<div>${hol.filter((x) => sameDay(x.d, d)).map((x) => `<div class="ev hol">${esc(x.name)}</div>`).join('')}${ad.map((o) => evChip(o)).join('')}${tasksOn(d).map((t) => `<div class="ev task${t.done ? ' done' : ''}" data-t="${t.id}">${t.done ? '☑' : '☐'} ${esc(t.title)}</div>`).join('')}</div>`;
      const tm = lanes(items.filter((o) => !o.ev.allDay && o.end - o.start < 864e5 && o.start < d2 && o.end > d));
      grid += `<div class="col${sameDay(d, today) ? ' t' : ''}" data-d="${dkey(d)}">${tm.map((o) => { const st = Math.max(0, (o.start - d) / 6e4), en = Math.min(1440, (o.end - d) / 6e4); const c = colorOf(o.ev); return `<div class="tev" data-k="${esc(o.key)}" style="top:${(st / 60) * 48}px;height:${Math.max(20, ((en - st) / 60) * 48 - 2)}px;left:${(o._c / o._n) * 100}%;width:calc(${100 / o._n}% - 3px);background:${c}"><b>${hm(o.start)}</b> ${esc(o.ev.title)}${o.ev.place ? `<br><small>${esc(o.ev.place)}</small>` : ''}</div>`; }).join('')}${sameDay(d, today) ? `<div class="now" style="top:${((today - d) / 36e5) * 48}px"></div>` : ''}</div>`;
    }
    v.innerHTML = `<div class="wk"><div class="head" style="grid-template-columns:${cols}">${head}</div><div class="alld" style="grid-template-columns:${cols}">${alld}</div><div class="grid" style="grid-template-columns:${cols}">${grid}</div></div>`;
    v.scrollTop = 7 * 48;
    v.querySelectorAll('.col').forEach((c) => { c.onclick = (e) => { if (e.target.closest('[data-k]')) return; const r = c.getBoundingClientRect(); const min = Math.floor(((e.clientY - r.top) / 48) * 2) * 30; editEvent(null, { start: `${c.dataset.d}T${pad(Math.floor(min / 60))}:${pad(min % 60)}` }); }; });
    bindItems(v, items);
  }
  function renderList(v) {
    const s = startOfDay(new Date()); const B = addDays(s, 90); const items = itemsIn(s, B); const hol = holidaysIn(s, B);
    const days = new Map(); const add = (d, html, t) => { const k = dkey(d); if (!days.has(k)) days.set(k, []); days.get(k).push({ t, html }); };
    items.forEach((o) => { const c = colorOf(o.ev); add(o.start, `<div class="row-ev" style="--c:${c}" data-k="${esc(o.key)}"><span class="h">${o.ev.allDay ? 'Journée' : `${hm(o.start)} – ${hm(o.end)}`}</span><span><b>${esc(o.ev.title)}</b>${o.ev.place ? `<span class="w"> · ${esc(o.ev.place)}</span>` : ''}${o.ev.rrule ? ' <span class="w">↻</span>' : ''}</span></div>`, +o.start); });
    hol.forEach((x) => add(x.d, `<div class="row-ev" style="--c:#c62828"><span class="h">Férié</span><span style="color:#c62828">${esc(x.name)}</span></div>`, +x.d - 1));
    tasks.filter((t) => t.due && !t.done && t.due >= dkey(s) && t.due < dkey(B)).forEach((t) => add(parse(t.due), `<div class="row-ev" style="--c:#757575" data-t="${t.id}"><span class="h">${t.time || 'Tâche'}</span><span>☐ ${esc(t.title)}</span></div>`, +parse(t.due) + 1));
    const keys = [...days.keys()].sort();
    v.innerHTML = `<div class="list">${keys.length ? keys.map((k) => { const d = parse(k); return `<div><h3>${sameDay(d, new Date()) ? 'Aujourd\'hui — ' : sameDay(d, addDays(new Date(), 1)) ? 'Demain — ' : ''}${longDate(d)}</h3>${days.get(k).sort((a, b) => a.t - b.t).map((x) => x.html).join('')}</div>`; }).join('') : '<p class="hint">Rien de prévu dans les 3 prochains mois. Touchez ＋ pour ajouter un rendez-vous.</p>'}</div>`;
    bindItems(v, items);
  }
  function bindItems(v, items) {
    v.querySelectorAll('[data-k]').forEach((el) => { el.onclick = (e) => { e.stopPropagation(); const o = items.find((x) => x.key === el.dataset.k); if (o) showEvent(o); }; });
    v.querySelectorAll('[data-t]').forEach((el) => { el.onclick = (e) => { e.stopPropagation(); const t = tasks.find((x) => x.id === el.dataset.t); if (t) editTask(t); }; });
  }

  /* ================= Événements ================= */
  async function showEvent(o) {
    const ev = o.ev; const c = calOf(ev.cal);
    const when = ev.allDay ? (sameDay(o.start, addDays(o.end, -1)) || o.end - o.start <= 864e5 ? longDate(o.start) : `du ${longDate(o.start)} au ${longDate(addDays(o.end, -1))}`) : `${longDate(o.start)}, ${hm(o.start)} – ${hm(o.end)}`;
    const v = await modal({ title: ev.title, body: `<p style="margin-top:0"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c ? c.color : '#1565c0'}"></span> ${esc(c ? c.name : '')}</p><p>🕒 ${esc(when)}${ev.rrule ? `<br>↻ ${esc(rruleText(ev.rrule, parse(ev.start)))}` : ''}</p>${ev.place ? `<p>📍 ${esc(ev.place)}</p>` : ''}${ev.reminders && ev.reminders.length ? `<p>🔔 ${ev.reminders.map(remText).join(', ')}</p>` : ''}${ev.notes ? `<p style="white-space:pre-wrap">${esc(ev.notes)}</p>` : ''}`,
      buttons: [{ label: 'Fermer', value: null }, { label: 'Supprimer', value: 'del' }, { label: 'Dupliquer', value: 'dup' }, { label: '📱 Agenda du téléphone', value: 'ics' }, { label: 'Modifier', primary: true, value: 'edit' }] });
    if (v === 'edit') editEvent(ev, null, o);
    if (v === 'dup') editEvent(null, { ...ev, id: undefined, title: ev.title + ' (copie)', exdates: [] });
    if (v === 'ics') download(new Blob([toIcs([ev])], { type: 'text/calendar' }), safe(ev.title) + '.ics');
    if (v === 'del') {
      if (ev.rrule) {
        const w = await modal({ title: 'Supprimer un événement répété', body: '<p>Supprimer seulement ce jour, ou toute la série ?</p>', buttons: [{ label: 'Annuler', value: null }, { label: 'Toute la série', value: 'all' }, { label: 'Ce jour seulement', primary: true, value: 'one' }] });
        if (!w) return;
        if (w === 'one') { ev.exdates = [...(ev.exdates || []), ev.allDay ? dkey(o.start) : tkey(o.start)]; await db.put('events', ev); render(); return; }
      } else if (!(await confirmBox(`Supprimer « ${ev.title} » ?`, 'Supprimer'))) return;
      events = events.filter((x) => x !== ev); await db.del('events', ev.id); render(); toast('Événement supprimé');
    }
  }
  const safe = (s) => String(s || 'agenda').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
  const remText = (m) => (m === 0 ? 'à l\'heure' : m % 1440 === 0 ? `${m / 1440} jour(s) avant` : m % 60 === 0 ? `${m / 60} h avant` : `${m} min avant`);
  function rruleText(r, S) {
    const iv = r.interval > 1 ? r.interval : 0;
    let t = { daily: iv ? `tous les ${iv} jours` : 'tous les jours', weekly: iv ? `toutes les ${iv} semaines` : 'chaque semaine', monthly: iv ? `tous les ${iv} mois` : 'chaque mois', yearly: 'chaque année' }[r.freq];
    if (r.freq === 'weekly' && r.byday && r.byday.length) t += ' le ' + r.byday.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => JOURS[d]).join(', ');
    if (r.freq === 'monthly' && S) t += r.monthMode === 'nth' ? ` le ${['1er', '2e', '3e', '4e', 'dernier'][Math.min(4, Math.ceil(S.getDate() / 7) - 1)]} ${JOURS[S.getDay()]}` : ` le ${S.getDate()}`;
    if (r.until) t += ` jusqu'au ${r.until.split('-').reverse().join('/')}`; if (r.count) t += `, ${r.count} fois`;
    return t;
  }
  async function editEvent(ev, preset, occ) {
    if (ev && ev.rrule && occ) {
      const w = await modal({ title: 'Modifier un événement répété', body: '<p>Modifier seulement ce jour, ou toute la série ?</p>', buttons: [{ label: 'Annuler', value: null }, { label: 'Toute la série', value: 'all' }, { label: 'Ce jour seulement', primary: true, value: 'one' }] });
      if (!w) return;
      if (w === 'one') { ev.exdates = [...(ev.exdates || []), ev.allDay ? dkey(occ.start) : tkey(occ.start)]; await db.put('events', ev); const copy = { ...ev, id: undefined, rrule: null, exdates: [], start: ev.allDay ? dkey(occ.start) : tkey(occ.start), end: ev.allDay ? dkey(occ.end) : tkey(occ.end) }; return editEvent(null, copy); }
    }
    const e = ev || { title: '', cal: (cals.find((c) => c.visible !== false) || cals[0]).id, allDay: false, reminders: [15], ...(preset || {}) };
    let S = parse(e.start) || (() => { const d = new Date(cur); const n = new Date(); d.setHours(n.getHours() + 1, 0, 0, 0); return d; })();
    let En = parse(e.end) || new Date(+S + 3600e3);
    if (e.allDay && e.end) En = addDays(parse(e.end), -1); // fin exclusive → fin incluse à l'écran
    const r = e.rrule || {};
    const v = await modal({ title: ev ? 'Modifier l\'événement' : 'Nouvel événement', wide: true,
      body: `<div class="field"><label for="eT">Titre</label><input id="eT" value="${esc(e.title)}" placeholder="ex. Réunion du conseil municipal"></div>
        <label class="row"><input type="checkbox" id="eAD" ${e.allDay ? 'checked' : ''}> Toute la journée</label>
        <div class="row"><div class="field" style="flex:1"><label for="eSD">Début</label><input type="date" id="eSD" value="${dkey(S)}"></div><div class="field" style="flex:1" data-tm><label for="eST">Heure</label><input type="time" id="eST" value="${pad(S.getHours())}:${pad(S.getMinutes())}"></div><div class="field" style="flex:1"><label for="eED">Fin</label><input type="date" id="eED" value="${dkey(En)}"></div><div class="field" style="flex:1" data-tm><label for="eET">Heure</label><input type="time" id="eET" value="${pad(En.getHours())}:${pad(En.getMinutes())}"></div></div>
        <div class="row"><div class="field" style="flex:1"><label for="eC">Agenda</label><select id="eC">${cals.map((c) => `<option value="${c.id}"${c.id === e.cal ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field" style="flex:1"><label for="eP">Lieu</label><input id="eP" value="${esc(e.place || '')}"></div></div>
        <div class="row"><div class="field" style="flex:1"><label for="eR">Répéter</label><select id="eR"><option value="">Ne pas répéter</option><option value="daily"${r.freq === 'daily' ? ' selected' : ''}>Tous les jours</option><option value="weekdays"${r.freq === 'weekly' && (r.byday || []).join() === '1,2,3,4,5' ? ' selected' : ''}>Du lundi au vendredi</option><option value="weekly"${r.freq === 'weekly' && (r.byday || []).join() !== '1,2,3,4,5' ? ' selected' : ''}>Chaque semaine</option><option value="monthly"${r.freq === 'monthly' && r.monthMode !== 'nth' ? ' selected' : ''}>Chaque mois (même date)</option><option value="monthlyNth"${r.freq === 'monthly' && r.monthMode === 'nth' ? ' selected' : ''}>Chaque mois (même jour de semaine)</option><option value="yearly"${r.freq === 'yearly' ? ' selected' : ''}>Chaque année</option></select></div><div class="field" style="flex:1"><label for="eIv">Tous les</label><input id="eIv" type="number" min="1" max="99" value="${r.interval || 1}"></div><div class="field" style="flex:1"><label for="eU">Jusqu'au (facultatif)</label><input id="eU" type="date" value="${r.until || ''}"></div></div>
        <div class="field" id="eDays" hidden><label>Jours</label><div class="row">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="row"><input type="checkbox" value="${d}" ${(r.byday || [S.getDay()]).includes(d) ? 'checked' : ''}> ${JC[d]}</label>`).join('')}</div></div>
        <div class="field"><label>Rappels</label><div class="row" id="eRem">${[[0, 'À l\'heure'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 h'], [1440, '1 jour'], [2880, '2 jours'], [10080, '1 semaine']].map(([m, l]) => `<label class="row"><input type="checkbox" value="${m}" ${(e.reminders || []).includes(m) ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
        <div class="field"><label for="eN">Notes</label><textarea id="eN" rows="3">${esc(e.notes || '')}</textarea></div>`,
      onOpen: (b) => {
        const sync = () => { const ad = b.querySelector('#eAD').checked; b.querySelectorAll('[data-tm]').forEach((x) => { x.hidden = ad; }); const rv = b.querySelector('#eR').value; b.querySelector('#eDays').hidden = rv !== 'weekly'; b.querySelector('#eIv').closest('.field').hidden = !rv || rv === 'weekdays'; b.querySelector('#eU').closest('.field').hidden = !rv; };
        b.querySelector('#eAD').onchange = sync; b.querySelector('#eR').onchange = sync; sync();
        // la fin suit le début
        const sd = b.querySelector('#eSD'), st = b.querySelector('#eST'), ed = b.querySelector('#eED'), et = b.querySelector('#eET');
        let durMs = En - S; const read = (d, t) => parse(`${d}T${t || '00:00'}`);
        sd.onchange = st.onchange = () => { const ns = read(sd.value, st.value); if (!ns) return; const ne = new Date(+ns + durMs); ed.value = dkey(ne); et.value = `${pad(ne.getHours())}:${pad(ne.getMinutes())}`; };
        ed.onchange = et.onchange = () => { const a = read(sd.value, st.value), z = read(ed.value, et.value); if (a && z && z >= a) durMs = z - a; };
        if (!ev) b.querySelector('#eT').focus();
      },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Enregistrer', primary: true, validate: (b) => { if (!b.querySelector('#eT').value.trim()) { toast('Donnez un titre'); return false; } const a = b.querySelector('#eSD').value, z = b.querySelector('#eED').value; if (!a || !z) { toast('Indiquez les dates'); return false; } const ad = b.querySelector('#eAD').checked; if ((ad ? z : z + b.querySelector('#eET').value) < (ad ? a : a + b.querySelector('#eST').value)) { toast('La fin est avant le début'); return false; } return true; },
        value: (b) => { const ad = b.querySelector('#eAD').checked; const rv = b.querySelector('#eR').value; const iv = Math.max(1, +b.querySelector('#eIv').value || 1); const until = b.querySelector('#eU').value || null;
          let rr = null;
          if (rv === 'daily') rr = { freq: 'daily', interval: iv }; else if (rv === 'weekdays') rr = { freq: 'weekly', interval: 1, byday: [1, 2, 3, 4, 5] }; else if (rv === 'weekly') rr = { freq: 'weekly', interval: iv, byday: [...b.querySelectorAll('#eDays input:checked')].map((i) => +i.value) }; else if (rv === 'monthly') rr = { freq: 'monthly', interval: iv, monthMode: 'day' }; else if (rv === 'monthlyNth') rr = { freq: 'monthly', interval: iv, monthMode: 'nth' }; else if (rv === 'yearly') rr = { freq: 'yearly', interval: iv };
          if (rr && until) rr.until = until;
          return { title: b.querySelector('#eT').value.trim(), allDay: ad, start: ad ? b.querySelector('#eSD').value : `${b.querySelector('#eSD').value}T${b.querySelector('#eST').value}`, end: ad ? dkey(addDays(parse(b.querySelector('#eED').value), 1)) : `${b.querySelector('#eED').value}T${b.querySelector('#eET').value}`, cal: b.querySelector('#eC').value, place: b.querySelector('#eP').value.trim(), rrule: rr, reminders: [...b.querySelectorAll('#eRem input:checked')].map((i) => +i.value), notes: b.querySelector('#eN').value }; } }] });
    if (!v) return;
    const out = ev || { id: uid(), exdates: [], created: Date.now() };
    Object.assign(out, v, { updated: Date.now() }); if (!out.id) out.id = uid();
    if (!ev) events.push(out); await db.put('events', out);
    cur = parse(out.start); render(); toast(ev ? 'Événement modifié' : 'Événement ajouté');
    if (out.reminders.length && !settings.askedNotif && 'Notification' in window && Notification.permission === 'default') { settings.askedNotif = true; saveSettings(); notifDialog(true); }
  }

  /* ================= Tâches ================= */
  let noteTasks = []; // [{ noteId, noteTitle, idx, text, done }]
  async function loadNoteTasks() {
    noteTasks = []; if (!settings.notes) return;
    try {
      const notes = await new Promise((res) => { const r = indexedDB.open('notes-joe'); r.onupgradeneeded = () => { r.transaction.abort(); res([]); }; r.onerror = () => res([]); r.onsuccess = () => { const h = r.result; if (!h.objectStoreNames.contains('notes')) { h.close(); res([]); return; } const q = h.transaction('notes').objectStore('notes').getAll(); q.onsuccess = () => { h.close(); res(q.result); }; q.onerror = () => { h.close(); res([]); }; }; });
      for (const n of notes) { if (n.deleted || !n.html || !/class="chk"/.test(n.html)) continue; const d = document.createElement('div'); d.innerHTML = n.html; d.querySelectorAll('ul.chk > li').forEach((li, idx) => { const text = li.textContent.trim(); if (text) noteTasks.push({ noteId: n.id, noteTitle: n.title || 'Sans titre', idx, text, done: li.dataset.done === '1' }); }); }
    } catch (e) { console.warn(e); }
  }
  async function toggleNoteTask(nt) {
    await new Promise((res, rej) => { const r = indexedDB.open('notes-joe'); r.onsuccess = () => { const h = r.result; const tx = h.transaction('notes', 'readwrite'); const st = tx.objectStore('notes'); const g = st.get(nt.noteId); g.onsuccess = () => { const n = g.result; if (!n) return; const d = document.createElement('div'); d.innerHTML = n.html; const li = d.querySelectorAll('ul.chk > li')[nt.idx]; if (li) { li.dataset.done = li.dataset.done === '1' ? '0' : '1'; n.html = d.innerHTML; n.todo = d.querySelectorAll('ul.chk li:not([data-done="1"])').length; n.done = d.querySelectorAll('ul.chk li[data-done="1"]').length; n.updated = Date.now(); st.put(n); } }; tx.oncomplete = () => { h.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
    nt.done = !nt.done;
  }
  function renderTasks(v) {
    const today = dkey(new Date()); const q = norm($('#q').value);
    let open = tasks.filter((t) => !t.done), done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    if (q) { open = open.filter((t) => norm(t.title + ' ' + (t.notes || '')).includes(q)); done = done.filter((t) => norm(t.title).includes(q)); }
    const sortT = (a, b) => (b.prio || 0) - (a.prio || 0) || String(a.due || '9').localeCompare(String(b.due || '9')) || a.created - b.created;
    const groups = [['En retard', open.filter((t) => t.due && t.due < today)], ['Aujourd\'hui', open.filter((t) => t.due === today)], ['À venir', open.filter((t) => t.due && t.due > today)], ['Sans date', open.filter((t) => !t.due)]];
    const row = (t) => `<div class="tk${t.done ? ' done' : ''}" data-id="${t.id}"><input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Fait"><span class="ti">${t.prio ? `<span class="pri">${'!'.repeat(t.prio)} </span>` : ''}${esc(t.title)}<small>${t.due ? `<span class="${!t.done && t.due < today ? 'late' : ''}">${t.due === today ? 'aujourd\'hui' : longDate(parse(t.due))}${t.time ? ' à ' + t.time : ''}</span>` : ''}${t.list ? ` · ${esc(t.list)}` : ''}${t.notes ? ' · 📝' : ''}</small></span><button data-del title="Supprimer" class="ghost">🗑</button></div>`;
    const nts = noteTasks.filter((n) => !n.done && (!q || norm(n.text).includes(q)));
    v.innerHTML = `<div class="tasks"><div class="add"><input id="newTask" placeholder="Nouvelle tâche… (ex. Envoyer le compte de gestion vendredi !!)"><button class="primary" id="addTask">Ajouter</button></div>
      ${groups.filter(([, l]) => l.length).map(([n, l]) => `<div><h3>${n} (${l.length})</h3>${l.sort(sortT).map(row).join('')}</div>`).join('') || (nts.length ? '' : '<p class="hint">Aucune tâche en cours.</p>')}
      ${nts.length ? `<div><h3>Depuis Notes Joe (${nts.length})</h3>${nts.map((n, i) => `<div class="tk" data-nt="${noteTasks.indexOf(n)}"><input type="checkbox" aria-label="Fait"><span class="ti">${esc(n.text)}<small>📒 ${esc(n.noteTitle)}</small></span><span></span></div>`).join('')}</div>` : ''}
      ${done.length ? `<details><summary><b>Terminées (${done.length})</b></summary>${done.slice(0, 100).map(row).join('')}${done.length ? '<button id="purge" class="ghost">Effacer les tâches terminées</button>' : ''}</details>` : ''}</div>`;
    const add = async () => { const i = $('#newTask'); const t = quickTask(i.value); if (!t) return; tasks.push(t); await db.put('tasks', t); i.value = ''; renderTasks(v); renderSide(); toast(t.due ? `Tâche pour ${t.due === today ? 'aujourd\'hui' : longDate(parse(t.due))}` : 'Tâche ajoutée'); $('#newTask').focus(); };
    $('#addTask').onclick = add; $('#newTask').onkeydown = (e) => { if (e.key === 'Enter') add(); };
    v.querySelectorAll('.tk[data-id]').forEach((el) => {
      const t = tasks.find((x) => x.id === el.dataset.id);
      el.querySelector('input').onchange = async (e) => { t.done = e.target.checked; t.doneAt = t.done ? Date.now() : null; if (t.done && t.repeat) { const nt = { ...t, id: uid(), done: false, doneAt: null, created: Date.now(), due: nextDue(t) }; tasks.push(nt); await db.put('tasks', nt); } await db.put('tasks', t); setTimeout(() => { renderTasks(v); renderSide(); }, 250); };
      el.querySelector('.ti').onclick = () => editTask(t);
      el.querySelector('[data-del]').onclick = async () => { tasks = tasks.filter((x) => x !== t); await db.del('tasks', t.id); renderTasks(v); renderSide(); };
    });
    v.querySelectorAll('.tk[data-nt]').forEach((el) => { el.querySelector('input').onchange = async () => { await toggleNoteTask(noteTasks[+el.dataset.nt]); toast('Cochée aussi dans Notes Joe'); setTimeout(() => renderTasks(v), 250); }; });
    const pg = $('#purge'); if (pg) pg.onclick = async () => { if (!(await confirmBox(`Effacer ${done.length} tâche(s) terminée(s) ?`, 'Effacer'))) return; for (const t of done) await db.del('tasks', t.id); tasks = tasks.filter((t) => !t.done); renderTasks(v); };
  }
  function nextDue(t) { const d = parse(t.due) || new Date(); if (t.repeat === 'daily') return dkey(addDays(d, 1)); if (t.repeat === 'weekly') return dkey(addDays(d, 7)); if (t.repeat === 'monthly') return dkey(new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())); if (t.repeat === 'yearly') return dkey(new Date(d.getFullYear() + 1, d.getMonth(), d.getDate())); return t.due; }
  // saisie rapide : « … demain », « … vendredi », « … le 15/11 », « … 10h30 », « !! » pour la priorité
  function quickTask(s) {
    let title = String(s || '').trim(); if (!title) return null; let due = null, time = null, prio = 0;
    const m0 = /(!{1,3})\s*$/.exec(title); if (m0) { prio = m0[1].length; title = title.slice(0, m0.index).trim(); }
    const today = startOfDay(new Date());
    let m;
    if ((m = /\s+(?:à\s+)?(\d{1,2})\s*h\s*(\d{2})?\s*$/i.exec(title))) { time = `${pad(+m[1])}:${m[2] || '00'}`; title = title.slice(0, m.index).trim(); }
    if ((m = /\s+(aujourd'hui|ce soir)\s*$/i.exec(title))) { due = dkey(today); title = title.slice(0, m.index).trim(); }
    else if ((m = /\s+après-demain\s*$/i.exec(title))) { due = dkey(addDays(today, 2)); title = title.slice(0, m.index).trim(); }
    else if ((m = /\s+demain\s*$/i.exec(title))) { due = dkey(addDays(today, 1)); title = title.slice(0, m.index).trim(); }
    else if ((m = /\s+(?:le\s+|ce\s+)?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+prochain)?\s*$/i.exec(title))) { const wd = JOURS.indexOf(m[1].toLowerCase()); let k = (wd - today.getDay() + 7) % 7; if (!k) k = 7; due = dkey(addDays(today, k)); title = title.slice(0, m.index).trim(); }
    else if ((m = /\s+(?:le\s+)?(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\s*$/i.exec(title))) { let y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : today.getFullYear(); let d = new Date(y, +m[2] - 1, +m[1]); if (!m[3] && d < today) d = new Date(y + 1, +m[2] - 1, +m[1]); due = dkey(d); title = title.slice(0, m.index).trim(); }
    if (time && !due) due = dkey(today);
    return { id: uid(), title: title || s, due, time, prio, done: false, created: Date.now(), list: '', notes: '', remind: !!time };
  }
  async function editTask(t) {
    const v = await modal({ title: 'Tâche', body: `<div class="field"><label for="tT">Tâche</label><input id="tT" value="${esc(t.title)}"></div><div class="row"><div class="field" style="flex:1"><label for="tD">Échéance</label><input type="date" id="tD" value="${t.due || ''}"></div><div class="field" style="flex:1"><label for="tH">Heure</label><input type="time" id="tH" value="${t.time || ''}"></div><div class="field" style="flex:1"><label for="tP">Priorité</label><select id="tP"><option value="0">Normale</option><option value="1"${t.prio === 1 ? ' selected' : ''}>! Importante</option><option value="2"${t.prio === 2 ? ' selected' : ''}>!! Urgente</option><option value="3"${t.prio === 3 ? ' selected' : ''}>!!! Critique</option></select></div></div>
      <div class="row"><div class="field" style="flex:1"><label for="tR">Répéter</label><select id="tR"><option value="">Non</option><option value="daily"${t.repeat === 'daily' ? ' selected' : ''}>Chaque jour</option><option value="weekly"${t.repeat === 'weekly' ? ' selected' : ''}>Chaque semaine</option><option value="monthly"${t.repeat === 'monthly' ? ' selected' : ''}>Chaque mois</option><option value="yearly"${t.repeat === 'yearly' ? ' selected' : ''}>Chaque année</option></select></div><div class="field" style="flex:1"><label for="tL">Liste</label><input id="tL" value="${esc(t.list || '')}" placeholder="ex. Recette, Maison"></div></div>
      <label class="row"><input type="checkbox" id="tRem" ${t.remind ? 'checked' : ''}> Rappel à l'heure de l'échéance</label><div class="field"><label for="tN">Notes</label><textarea id="tN" rows="3">${esc(t.notes || '')}</textarea></div>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Supprimer', value: 'del' }, { label: 'Enregistrer', primary: true, value: (b) => ({ title: b.querySelector('#tT').value.trim() || t.title, due: b.querySelector('#tD').value || null, time: b.querySelector('#tH').value || null, prio: +b.querySelector('#tP').value, repeat: b.querySelector('#tR').value || null, list: b.querySelector('#tL').value.trim(), remind: b.querySelector('#tRem').checked, notes: b.querySelector('#tN').value }) }] });
    if (!v) return;
    if (v === 'del') { tasks = tasks.filter((x) => x !== t); await db.del('tasks', t.id); render(); return; }
    Object.assign(t, v); if (!tasks.includes(t)) tasks.push(t); await db.put('tasks', t); render();
  }

  /* ================= Rappels ================= */
  let fired = new Set();
  async function notifDialog(fromEvent) {
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const v = await modal({ title: 'Rappels', body: `<p>${fromEvent ? 'Cet événement a un rappel. ' : ''}Agenda Joe affiche une notification à l'heure du rappel <b>tant que l'application est ouverte ou en arrière-plan</b>. Un navigateur ne peut pas réveiller le téléphone si l'application est fermée.</p><p><b>Pour des rappels toujours fiables</b> : Fichier → « Exporter vers Google Agenda / téléphone (.ics) », puis ouvrez le fichier avec l'agenda du téléphone. Vos rappels y sont repris.</p><p>État des notifications : <b>${{ granted: 'autorisées', denied: 'refusées (à changer dans les réglages du navigateur)', default: 'pas encore autorisées', unsupported: 'non disponibles ici' }[perm]}</b>.</p>`,
      buttons: [{ label: 'Fermer', value: null }, ...(perm === 'default' ? [{ label: 'Autoriser les notifications', primary: true, value: 'ask' }] : perm === 'granted' ? [{ label: 'Tester', primary: true, value: 'test' }] : [])] });
    if (v === 'ask') { const p = await Notification.requestPermission(); settings.notify = p === 'granted'; saveSettings(); toast(p === 'granted' ? 'Notifications autorisées' : 'Notifications refusées'); }
    if (v === 'test') notify('Agenda Joe', 'Les rappels fonctionnent.');
  }
  async function notify(title, body, tag) {
    try { const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration()); if (reg && reg.showNotification) { await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', requireInteraction: true }); return; } } catch (e) { /* repli */ }
    try { new Notification(title, { body, tag, icon: 'icons/icon-192.png' }); } catch (e) { toast(`🔔 ${title} — ${body}`, 10000); }
  }
  async function checkReminders(initial) {
    const now = new Date(); const A = addDays(startOfDay(now), -1), B = addDays(now, 15); const missed = [];
    for (const o of events.filter((e) => e.reminders && e.reminders.length).flatMap((e) => occurrences(e, A, B))) {
      if (o.start < addDays(now, -1)) continue;
      for (const m of o.ev.reminders) {
        const at = new Date(+o.start - m * 6e4); const key = `${o.key}#${m}`;
        if (at <= now && !fired.has(key)) { fired.add(key); if (now - at < 15 * 6e4) await fireRem(`${o.ev.title}`, `${o.ev.allDay ? longDate(o.start) : `${hm(o.start)}${sameDay(o.start, now) ? '' : ' — ' + longDate(o.start)}`}${o.ev.place ? ' · ' + o.ev.place : ''}`, key); else if (o.end > now) missed.push(o.ev.title); }
      }
    }
    for (const t of tasks.filter((x) => x.remind && !x.done && x.due)) { const at = parse(`${t.due}T${t.time || '08:00'}`); const key = `task#${t.id}#${t.due}`; if (at <= now && !fired.has(key)) { fired.add(key); if (now - at < 15 * 6e4) await fireRem('Tâche : ' + t.title, t.time ? `à ${t.time}` : 'pour aujourd\'hui', key); else if (sameDay(at, now)) missed.push(t.title); } }
    if (fired.size > 2000) fired = new Set([...fired].slice(-1000));
    db.put('kv', [...fired], 'fired').catch(() => {});
    if (initial && missed.length) toast(`🔔 Rappels passés pendant que l'agenda était fermé : ${[...new Set(missed)].slice(0, 3).join(', ')}${missed.length > 3 ? '…' : ''}`, 9000);
  }
  async function fireRem(title, body, key) { if ('Notification' in window && Notification.permission === 'granted') await notify(title, body, key); toast(`🔔 ${title} — ${body}`, 12000); }

  /* ================= iCalendar (.ics) ================= */
  const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
  const icsDt = (s, allDay) => { const d = parse(s); return allDay ? `;VALUE=DATE:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` : `:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`; };
  const fold = (l) => { const out = []; let s = l; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
  function toIcs(list, todos = []) {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Studio Joe//Agenda Joe//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    for (const e of list) {
      L.push('BEGIN:VEVENT', `UID:${e.id}@studio-joe`, `DTSTAMP:${stamp}`, `DTSTART${icsDt(e.start, e.allDay)}`, `DTEND${icsDt(e.end || e.start, e.allDay)}`, fold(`SUMMARY:${icsEsc(e.title)}`));
      if (e.place) L.push(fold(`LOCATION:${icsEsc(e.place)}`)); if (e.notes) L.push(fold(`DESCRIPTION:${icsEsc(e.notes)}`));
      const c = calOf(e.cal); if (c) L.push(fold(`CATEGORIES:${icsEsc(c.name)}`));
      if (e.rrule && e.rrule.freq) { const r = e.rrule; const S = parse(e.start); let rr = `RRULE:FREQ=${r.freq.toUpperCase()}`; if (r.interval > 1) rr += `;INTERVAL=${r.interval}`; if (r.freq === 'weekly' && r.byday && r.byday.length) rr += `;BYDAY=${r.byday.map((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d]).join(',')}`; if (r.freq === 'monthly' && r.monthMode === 'nth') { const n = Math.ceil(S.getDate() / 7); rr += `;BYDAY=${n >= 5 ? -1 : n}${['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][S.getDay()]}`; } if (r.until) rr += `;UNTIL=${r.until.replace(/-/g, '')}T235959`; if (r.count) rr += `;COUNT=${r.count}`; L.push(rr); (e.exdates || []).forEach((x) => L.push(`EXDATE${icsDt(x, e.allDay)}`)); }
      for (const m of e.reminders || []) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsEsc(e.title)}`), `TRIGGER:-PT${m}M`, 'END:VALARM');
      L.push('END:VEVENT');
    }
    for (const t of todos) { L.push('BEGIN:VTODO', `UID:${t.id}@studio-joe`, `DTSTAMP:${stamp}`, fold(`SUMMARY:${icsEsc(t.title)}`)); if (t.due) L.push(`DUE${t.time ? icsDt(`${t.due}T${t.time}`) : icsDt(t.due, true)}`); if (t.prio) L.push(`PRIORITY:${[0, 5, 3, 1][t.prio]}`); L.push(`STATUS:${t.done ? 'COMPLETED' : 'NEEDS-ACTION'}`); if (t.notes) L.push(fold(`DESCRIPTION:${icsEsc(t.notes)}`)); L.push('END:VTODO'); }
    L.push('END:VCALENDAR'); return L.join('\r\n') + '\r\n';
  }
  function parseIcs(text) {
    const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    const unesc = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    const dt = (v, params) => { const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/.exec(v.trim()); if (!m) return null; if (!m[4] || /VALUE=DATE(?!-)/.test(params)) return { s: `${m[1]}-${m[2]}-${m[3]}`, allDay: true }; let d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); if (m[7]) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])); return { s: tkey(d), allDay: false }; };
    const evs = [], tds = []; let cur2 = null, kind = null, inAlarm = false;
    for (const ln of lines) {
      if (/^BEGIN:VEVENT/i.test(ln)) { cur2 = { reminders: [], exdates: [] }; kind = 'e'; continue; }
      if (/^BEGIN:VTODO/i.test(ln)) { cur2 = {}; kind = 't'; continue; }
      if (/^BEGIN:VALARM/i.test(ln)) { inAlarm = true; continue; } if (/^END:VALARM/i.test(ln)) { inAlarm = false; continue; }
      if (/^END:VEVENT/i.test(ln)) { if (cur2 && cur2.start) evs.push(cur2); cur2 = null; continue; }
      if (/^END:VTODO/i.test(ln)) { if (cur2 && cur2.title) tds.push(cur2); cur2 = null; continue; }
      if (!cur2) continue;
      const i = ln.indexOf(':'); if (i < 0) continue; const head = ln.slice(0, i), val = ln.slice(i + 1); const [name, ...ps] = head.split(';'); const params = ps.join(';'); const N = name.toUpperCase();
      if (inAlarm) { if (N === 'TRIGGER') { const m = /^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(val); if (m) cur2.reminders.push((+m[1] || 0) * 10080 + (+m[2] || 0) * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0)); } continue; }
      if (N === 'SUMMARY') cur2.title = unesc(val); else if (N === 'LOCATION') cur2.place = unesc(val); else if (N === 'DESCRIPTION') cur2.notes = unesc(val); else if (N === 'UID') cur2.uid = val;
      else if (N === 'DTSTART') { const d = dt(val, params); if (d) { cur2.start = d.s; cur2.allDay = d.allDay; } }
      else if (N === 'DTEND') { const d = dt(val, params); if (d) cur2.end = d.s; }
      else if (N === 'DUE') { const d = dt(val, params); if (d) { cur2.due = d.s.slice(0, 10); if (!d.allDay) cur2.time = d.s.slice(11, 16); } }
      else if (N === 'STATUS' && kind === 't') cur2.done = /COMPLETED/i.test(val);
      else if (N === 'EXDATE') val.split(',').forEach((x) => { const d = dt(x, params); if (d) cur2.exdates.push(d.s); });
      else if (N === 'RRULE') { const o = Object.fromEntries(val.split(';').map((p) => p.split('='))); const f = (o.FREQ || '').toLowerCase(); if (['daily', 'weekly', 'monthly', 'yearly'].includes(f)) { const r = { freq: f, interval: +o.INTERVAL || 1 }; if (o.BYDAY) { const dd = o.BYDAY.split(','); if (f === 'weekly') r.byday = dd.map((x) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(x.slice(-2))).filter((x) => x >= 0); if (f === 'monthly' && /^-?\d/.test(dd[0])) r.monthMode = 'nth'; } if (o.UNTIL) r.until = `${o.UNTIL.slice(0, 4)}-${o.UNTIL.slice(4, 6)}-${o.UNTIL.slice(6, 8)}`; if (o.COUNT) r.count = +o.COUNT; cur2.rrule = r; } }
    }
    evs.forEach((e) => { if (!e.end) e.end = e.allDay ? dkey(addDays(parse(e.start), 1)) : tkey(new Date(+parse(e.start) + 3600e3)); });
    return { evs, tds };
  }
  async function importIcs(given) {
    const fs = given && given.length ? given : await pickFiles('.ics,text/calendar', true); if (!fs.length) return;
    let ne = 0, nt = 0;
    const cal = await modal({ title: 'Importer dans quel agenda ?', body: `<div class="field"><label for="iC">Agenda</label><select id="iC">${cals.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}<option value="__new">＋ Nouvel agenda « Importé »</option></select></div>`, buttons: [{ label: 'Annuler', value: null }, { label: 'Importer', primary: true, value: (b) => b.querySelector('#iC').value }] });
    if (!cal) return;
    let calId = cal; if (cal === '__new') { const c = { id: uid(), name: 'Importé', color: COLORS[cals.length % COLORS.length], visible: true }; cals.push(c); saveCals(); calId = c.id; }
    for (const f of fs) {
      const { evs, tds } = parseIcs(await f.text());
      for (const e of evs) { const id = e.uid ? 'ics-' + e.uid.replace(/[^\w@.-]/g, '').slice(0, 80) : uid(); const ex = events.find((x) => x.id === id); const ev = { id, title: e.title || '(sans titre)', start: e.start, end: e.end, allDay: !!e.allDay, cal: ex ? ex.cal : calId, place: e.place || '', notes: e.notes || '', rrule: e.rrule || null, exdates: e.exdates, reminders: [...new Set(e.reminders)], updated: Date.now() }; if (ex) Object.assign(ex, ev); else events.push(ev); await db.put('events', ex || ev); ne++; }
      for (const t of tds) { const tk = { id: t.uid ? 'ics-' + t.uid.replace(/[^\w@.-]/g, '').slice(0, 80) : uid(), title: t.title, due: t.due || null, time: t.time || null, prio: 0, done: !!t.done, created: Date.now(), notes: t.notes || '' }; const ex = tasks.find((x) => x.id === tk.id); if (ex) Object.assign(ex, tk); else tasks.push(tk); await db.put('tasks', ex || tk); nt++; }
    }
    render(); toast(`${ne} événement(s) et ${nt} tâche(s) importé(s)`);
  }
  async function exportIcs() {
    const v = await modal({ title: 'Exporter vers un autre agenda', body: `<p>Le fichier <b>.ics</b> s'ouvre avec Google Agenda, l'agenda du téléphone (Samsung, Android), Outlook ou Apple Calendrier. Les rappels sont repris : ils sonneront même si Agenda Joe est fermé.</p><div class="field"><label>Agendas</label>${cals.map((c) => `<label class="row"><input type="checkbox" value="${c.id}" checked> ${esc(c.name)} (${events.filter((e) => e.cal === c.id).length})</label>`).join('')}</div><label class="row"><input type="checkbox" id="xT" checked> Inclure les tâches non terminées</label><label class="row"><input type="checkbox" id="xP" checked> Seulement à partir d'aujourd'hui</label>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Exporter', primary: true, value: (b) => ({ cals: [...b.querySelectorAll('input[value]:checked')].map((i) => i.value), tasks: b.querySelector('#xT').checked, fut: b.querySelector('#xP').checked }) }] });
    if (!v) return;
    const today = dkey(new Date());
    const list = events.filter((e) => v.cals.includes(e.cal) && (!v.fut || e.rrule || (e.end || e.start) >= today));
    const blob = new Blob([toIcs(list, v.tasks ? tasks.filter((t) => !t.done) : [])], { type: 'text/calendar' });
    const file = new File([blob], `agenda-joe-${today}.ics`, { type: 'text/calendar' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Agenda Joe' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    download(blob, file.name); toast(`${list.length} événement(s) exporté(s) : ouvrez le fichier avec votre agenda`, 6000);
  }

  /* ================= Commandes ================= */
  const ACT = {
    today: () => { cur = new Date(); miniMonth = new Date(cur); render(); },
    prev: () => step(-1), next: () => step(1),
    new: () => (view === 'tasks' ? $('#newTask') && $('#newTask').focus() : editEvent(null, null)),
    importIcs: () => importIcs(), exportIcs, notif: () => notifDialog(false), print: () => window.print(),
  };
  function step(k) { if (view === 'month') cur = new Date(cur.getFullYear(), cur.getMonth() + k, 1); else if (view === 'week') cur = addDays(cur, 7 * k); else if (view === 'day') cur = addDays(cur, k); else return; miniMonth = new Date(cur); render(); }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) { const f = ACT[b.dataset.act]; if (f) Promise.resolve(f()).catch((er) => toast('Erreur : ' + er.message)); } });
  $('#views').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; view = b.dataset.v; try { localStorage.setItem('agenda-view', view); } catch (er) { /* ignore */ } if (view === 'tasks') loadNoteTasks().then(render); else render(); };
  $('#sideBtn').onclick = () => $('#main').classList.toggle('open');
  $('#q').addEventListener('input', () => renderView());
  document.addEventListener('keydown', (e) => { if (e.target.closest('input,textarea,select,.modal')) return; const k = e.key.toLowerCase(); if (k === 't') ACT.today(); else if (k === 'arrowleft' || k === 'p') step(-1); else if (k === 'arrowright' || k === 'n') step(1); else if (k === 'm') { view = 'month'; render(); } else if (k === 'w' || k === 's') { view = 'week'; render(); } else if (k === 'd' || k === 'j') { view = 'day'; render(); } });
  // balayage gauche / droite sur téléphone
  let sx = null; $('#view').addEventListener('touchstart', (e) => { sx = e.touches.length === 1 ? [e.touches[0].clientX, e.touches[0].clientY] : null; }, { passive: true });
  $('#view').addEventListener('touchend', (e) => { if (!sx || view === 'list' || view === 'tasks') return; const dx = e.changedTouches[0].clientX - sx[0], dy = e.changedTouches[0].clientY - sx[1]; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1); sx = null; });

  initMenus();
  (async () => {
    try {
      [events, tasks] = await Promise.all([db.all('events'), db.all('tasks')]);
      cals = (await db.get('kv', 'cals')) || []; settings = { ...settings, ...((await db.get('kv', 'settings')) || {}) }; fired = new Set((await db.get('kv', 'fired')) || []);
    } catch (e) { toast('Stockage indisponible', 6000); }
    if (!cals.length) { cals = [{ id: 'travail', name: 'Travail', color: '#1565c0', visible: true }, { id: 'perso', name: 'Personnel', color: '#2e7d32', visible: true }, { id: 'echeances', name: 'Échéances', color: '#c62828', visible: true }]; saveCals(); }
    try { const v = localStorage.getItem('agenda-view'); if (v) view = v; } catch (e) { /* ignore */ }
    await loadNoteTasks();
    const deep = /^#date=(\d{4}-\d\d-\d\d)$/.exec(location.hash); if (deep) { cur = parse(deep[1]); view = 'day'; history.replaceState(null, '', location.pathname); }
    render();
    Studio.onImport('agenda', (fs) => importIcs(fs));
    await checkReminders(true); setInterval(() => checkReminders(false), 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(false); loadNoteTasks().then(renderView); } });
  })();
  window.AgendaJoe = { get events() { return events; }, get tasks() { return tasks; }, occurrences, parseIcs, toIcs, quickTask, holidays, render, setView: (v, d) => { view = v; if (d) cur = parse(d); render(); } };
})();
