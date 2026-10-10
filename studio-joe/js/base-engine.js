/* Studio Joe — Base Joe : moteur de base de données (équivalent Microsoft Access).
   Modèle des tables, contrôle des saisies, relations et intégrité référentielle, requêtes en SQL Access
   (traduit pour AlaSQL : crochets, chaînes "…", dates #…#, &, jokers * ?, fonctions IIf, Nz, Left, Format…,
   paramètres demandés à l'utilisateur), lecture des fichiers .accdb / .mdb (mdb-reader), export XML
   importable par Access (structure + données), Excel, CSV. */
(function () {
  const loaded = {};
  function loadScript(src) { if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('bibliothèque introuvable : ' + src)); }; document.head.appendChild(s); }); return loaded[src]; }

  const TYPES = {
    auto: { label: 'NuméroAuto', jet: 'autonumber' }, text: { label: 'Texte court', jet: 'text' }, memo: { label: 'Texte long', jet: 'memo' },
    int: { label: 'Nombre (entier)', jet: 'longinteger' }, double: { label: 'Nombre (réel)', jet: 'double' }, money: { label: 'Monétaire', jet: 'currency' },
    date: { label: 'Date/Heure', jet: 'datetime' }, bool: { label: 'Oui/Non', jet: 'yesno' },
  };
  const uid = () => Math.random().toString(36).slice(2, 10);

  /* ================= Valeurs ================= */
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  function isoDate(d, withTime) { if (!(d instanceof Date) || isNaN(d)) return null; const t = d.getHours() || d.getMinutes() || d.getSeconds(); const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; return t || withTime ? `${s}T${pad(d.getHours())}:${pad(d.getMinutes())}${d.getSeconds() ? ':' + pad(d.getSeconds()) : ''}` : s; }
  function parseDateInput(v) {
    if (v == null || v === '') return null; if (v instanceof Date) return isoDate(v);
    const s = String(v).trim(); let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s))) return isoDate(new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
    if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2})[:h](\d{2}))?$/.exec(s))) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return isoDate(new Date(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0))); }
    return undefined; // illisible
  }
  function parseNumber(v) { if (v == null || v === '') return null; if (typeof v === 'number') return v; const s = String(v).replace(/[\s\u00a0\u202f]/g, '').replace(/(f\s?cfa|fcfa|f|€|\$)$/i, '').replace(',', '.'); if (!s) return null; const n = Number(s); return isFinite(n) ? n : undefined; }
  // conversion d'une saisie vers le type du champ ; renvoie { v } ou { err }
  function coerce(field, raw) {
    if (raw === undefined || raw === null || raw === '') return { v: null };
    switch (field.type) {
      case 'auto': case 'int': { const n = parseNumber(raw); if (n === undefined || (n !== null && !Number.isInteger(n))) return { err: 'nombre entier attendu' }; return { v: n }; }
      case 'double': case 'money': { const n = parseNumber(raw); if (n === undefined) return { err: 'nombre attendu' }; return { v: field.type === 'money' && n !== null ? Math.round(n * 10000) / 10000 : n }; }
      case 'date': { const d = parseDateInput(raw); if (d === undefined) return { err: 'date attendue (jj/mm/aaaa)' }; return { v: d }; }
      case 'bool': { if (typeof raw === 'boolean') return { v: raw }; const s = String(raw).trim().toLowerCase(); if (['1', 'oui', 'vrai', 'true', 'yes', 'o', 'x', '-1'].includes(s)) return { v: true }; if (['0', 'non', 'faux', 'false', 'no', 'n', ''].includes(s)) return { v: false }; return { err: 'Oui ou Non attendu' }; }
      default: { const s = String(raw); if (field.type === 'text' && field.size && s.length > field.size) return { err: `${field.size} caractères au maximum` }; return { v: s }; }
    }
  }
  function display(field, v) {
    if (v === null || v === undefined || v === '') return '';
    switch (field.type) {
      case 'money': return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' F';
      case 'double': return Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 6 });
      case 'int': case 'auto': return typeof v === 'number' ? String(v) : String(v);
      case 'date': { const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(v); return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : String(v); }
      case 'bool': return v ? 'Oui' : 'Non';
      default: return String(v);
    }
  }

  /* ================= Tables et enregistrements ================= */
  const table = (db, name) => db.tables.find((t) => t.name.toLowerCase() === String(name).toLowerCase());
  const pkOf = (t) => t.fields.find((f) => f.pk) || null;
  function newTable(db, name) {
    const t = { id: uid(), name, fields: [{ name: 'N°', type: 'auto', pk: true, required: true }], rows: [], seq: 0 };
    db.tables.push(t); return t;
  }
  // contrôle et enregistrement d'une ligne (nouvelle si row._new) ; renvoie les erreurs
  function saveRow(db, t, row, values) {
    const errs = []; const out = { ...row };
    for (const f of t.fields) {
      if (!(f.name in values)) continue;
      if (f.type === 'auto') continue;
      const r = coerce(f, values[f.name]); if (r.err) { errs.push(`${f.name} : ${r.err}`); continue; }
      out[f.name] = r.v;
    }
    const isNew = !t.rows.includes(row);
    for (const f of t.fields) {
      if (f.type === 'auto') { if (isNew && (out[f.name] == null)) out[f.name] = ++t.seq; continue; }
      if (isNew && out[f.name] == null && f.default != null && f.default !== '') { const r = coerce(f, defaultValue(f.default)); if (!r.err) out[f.name] = r.v; }
      if (f.type === 'bool' && out[f.name] == null) out[f.name] = false;
      if ((f.required || f.pk) && (out[f.name] === null || out[f.name] === undefined || out[f.name] === '')) errs.push(`${f.name} : valeur obligatoire`);
      if ((f.unique || f.pk) && out[f.name] != null && t.rows.some((r) => r !== row && r[f.name] === out[f.name])) errs.push(`${f.name} : la valeur « ${display(f, out[f.name])} » existe déjà (doublon interdit)`);
      if (f.values && f.values.length && f.limit && out[f.name] != null && !f.values.includes(out[f.name])) errs.push(`${f.name} : choisir une valeur de la liste`);
    }
    // intégrité référentielle : la valeur doit exister dans la table liée
    for (const rel of db.relations.filter((r) => r.integrity && sameName(r.many.table, t.name))) {
      const v = out[rel.many.field]; if (v == null) continue; const one = table(db, rel.one.table); if (!one) continue;
      if (!one.rows.some((r) => r[rel.one.field] === v)) errs.push(`${rel.many.field} : « ${v} » n'existe pas dans la table ${one.name}`);
    }
    if (errs.length) return { errs };
    // mise à jour sur place : les références à l'enregistrement restent valables
    if (isNew) t.rows.push(out); else { for (const k of Object.keys(out)) row[k] = out[k]; }
    db.updated = Date.now();
    return { row: isNew ? out : row };
  }
  function defaultValue(d) { const s = String(d).trim(); if (/^(date|aujourdhui|aujourd'hui)\(\)$/i.test(s)) { const n = new Date(); return isoDate(new Date(n.getFullYear(), n.getMonth(), n.getDate())); } if (/^(maintenant|now)\(\)$/i.test(s)) return isoDate(new Date(), true); return s.replace(/^"(.*)"$/, '$1'); }
  const sameName = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  // suppression avec intégrité : refusée s'il existe des lignes liées, sauf suppression en cascade
  function deleteRows(db, t, rows) {
    const blocked = []; const cascade = [];
    for (const rel of db.relations.filter((r) => r.integrity && sameName(r.one.table, t.name))) {
      const many = table(db, rel.many.table); if (!many) continue;
      const keys = new Set(rows.map((r) => r[rel.one.field]));
      const linked = many.rows.filter((r) => keys.has(r[rel.many.field]));
      if (linked.length) (rel.cascadeDelete ? cascade : blocked).push({ table: many, rows: linked });
    }
    if (blocked.length) return { err: `Impossible de supprimer : ${blocked.map((b) => `${b.rows.length} enregistrement(s) liés dans ${b.table.name}`).join(', ')}. Supprimez-les d'abord, ou activez la suppression en cascade dans la relation.` };
    for (const c of cascade) { const r = deleteRows(db, c.table, c.rows); if (r.err) return r; }
    const set = new Set(rows); t.rows = t.rows.filter((r) => !set.has(r)); db.updated = Date.now();
    return { n: rows.length, cascade: cascade.reduce((a, c) => a + c.rows.length, 0) };
  }
  // changement de type d'un champ : conversion des données existantes
  function changeFieldType(t, f, type) {
    const old = f.type; f.type = type; let lost = 0;
    for (const r of t.rows) { const v = r[f.name]; if (v == null) continue; const c = coerce(f, type === 'text' || type === 'memo' ? (old === 'date' ? display({ type: 'date' }, v) : String(v)) : v); if (c.err) { r[f.name] = null; lost++; } else r[f.name] = c.v; }
    if (type === 'auto') { t.seq = Math.max(0, ...t.rows.map((r) => +r[f.name] || 0)); t.rows.forEach((r) => { if (r[f.name] == null) r[f.name] = ++t.seq; }); }
    return lost;
  }
  function renameField(db, t, f, name) {
    const old = f.name; if (old === name) return;
    t.rows.forEach((r) => { r[name] = r[old]; delete r[old]; }); f.name = name;
    db.relations.forEach((rel) => { for (const s of [rel.one, rel.many]) if (sameName(s.table, t.name) && s.field === old) s.field = name; });
    db.tables.forEach((x) => x.fields.forEach((y) => { if (y.lookup && sameName(y.lookup.table, t.name)) { if (y.lookup.field === old) y.lookup.field = name; if (y.lookup.show === old) y.lookup.show = name; } }));
  }
  // valeur affichée d'un champ « liste de choix » liée à une autre table
  function lookupLabel(db, f, v) {
    if (v == null || !f.lookup) return v; const t = table(db, f.lookup.table); if (!t) return v;
    const r = t.rows.find((x) => x[f.lookup.field] === v); if (!r) return v;
    const shows = (f.lookup.show || '').split(',').map((s) => s.trim()).filter(Boolean);
    return shows.length ? shows.map((s) => { const sf = t.fields.find((x) => x.name === s); return sf ? display(sf, r[s]) : r[s]; }).join(' — ') : v;
  }

  /* ================= SQL Access → AlaSQL ================= */
  const KW = new Set(['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'AS', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL', 'CROSS', 'ON', 'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'HAVING', 'DISTINCT', 'DISTINCTROW', 'TOP', 'PERCENT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'UNION', 'ALL', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'TRUE', 'FALSE', 'YES', 'NO', 'ON', 'OFF', 'EXISTS', 'MOD', 'ANY', 'SOME', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'XOR', 'IMP', 'EQV', 'PARAMETERS', 'TRANSFORM', 'PIVOT', 'WITH', 'OWNERACCESS', 'OPTION']);
  const AGG = new Set(['SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'FIRST', 'LAST', 'STDEV', 'STDEVP', 'VAR', 'VARP']);
  const FN = ['IIF', 'NZ', 'LEFT', 'RIGHT', 'MID', 'LEN', 'UCASE', 'LCASE', 'TRIM', 'LTRIM', 'RTRIM', 'INSTR', 'REPLACE', 'SPACE', 'STRING', 'STRREVERSE', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'WEEKDAY', 'DATE', 'NOW', 'TIME', 'DATESERIAL', 'DATEVALUE', 'DATEADD', 'DATEDIFF', 'DATEPART', 'MONTHNAME', 'WEEKDAYNAME', 'FORMAT', 'CINT', 'CLNG', 'CDBL', 'CSNG', 'CCUR', 'CSTR', 'CDATE', 'CBOOL', 'VAL', 'STR', 'ROUND', 'ABS', 'INT', 'FIX', 'SGN', 'SQR', 'ISNULL', 'ISNUMERIC', 'ISDATE', 'SWITCH', 'CHOOSE', 'ASC', 'CHR'];
  function tokenize(sql) {
    const toks = []; let i = 0; const n = sql.length;
    while (i < n) {
      const c = sql[i];
      if (/\s/.test(c)) { let j = i; while (j < n && /\s/.test(sql[j])) j++; toks.push({ t: 'ws', v: sql.slice(i, j) }); i = j; continue; }
      if (c === "'" || c === '"') { let j = i + 1, s = ''; while (j < n) { if (sql[j] === c) { if (sql[j + 1] === c) { s += c; j += 2; continue; } break; } s += sql[j++]; } toks.push({ t: 'str', v: s }); i = j + 1; continue; }
      if (c === '[') { const j = sql.indexOf(']', i); const v = sql.slice(i + 1, j < 0 ? n : j); toks.push({ t: 'id', v, br: true }); i = j < 0 ? n : j + 1; continue; }
      if (c === '`') { const j = sql.indexOf('`', i + 1); toks.push({ t: 'id', v: sql.slice(i + 1, j < 0 ? n : j), br: true }); i = j < 0 ? n : j + 1; continue; }
      if (c === '#') { const j = sql.indexOf('#', i + 1); if (j > i) { toks.push({ t: 'date', v: sql.slice(i + 1, j) }); i = j + 1; continue; } }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] || ''))) { let j = i; while (j < n && /[0-9.eE]/.test(sql[j])) j++; toks.push({ t: 'num', v: sql.slice(i, j) }); i = j; continue; }
      if (/[A-Za-z_\u00c0-\u024f]/.test(c)) { let j = i; while (j < n && /[A-Za-z0-9_\u00c0-\u024f]/.test(sql[j])) j++; toks.push({ t: 'word', v: sql.slice(i, j) }); i = j; continue; }
      const two = sql.slice(i, i + 2); if (['<>', '<=', '>=', '!='].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
      toks.push({ t: 'op', v: c }); i++;
    }
    return toks;
  }
  // date littérale Access : #mm/jj/aaaa# (format américain de SQL Access) ou #aaaa-mm-jj#
  function accessDate(s) {
    let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s.trim()))) return isoDate(new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)));
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s.trim()))) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return isoDate(new Date(y, +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0))); }
    return s;
  }
  const q1 = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const bq = (s) => '`' + String(s).replace(/`/g, '') + '`';

  /* Traduit une requête Access. ctx : { db, params } ; renvoie { sql, params: [noms demandés] } */
  function translate(db, sqlIn, params = {}) {
    let toks = tokenize(sqlIn.trim().replace(/;\s*$/, ''));
    const sig = () => toks.filter((x) => x.t !== 'ws');
    const S = sig(); const up = (x) => (x && x.t === 'word' ? x.v.toUpperCase() : null);
    // tables citées (FROM, JOIN, UPDATE, INTO) et leurs alias
    const refs = []; // { name, alias }
    const objName = (x) => (x.t === 'id' || x.t === 'word' ? x.v : null);
    for (let i = 0; i < S.length; i++) {
      const u = up(S[i]);
      if (u === 'FROM' || u === 'JOIN' || u === 'UPDATE' || u === 'INTO') {
        let k = i + 1;
        while (k < S.length) {
          if (S[k].t === 'op' && S[k].v === '(') break;
          const nm = objName(S[k]); if (!nm || (S[k].t === 'word' && KW.has(nm.toUpperCase()))) break;
          let alias = null; let j = k + 1;
          if (up(S[j]) === 'AS') j++;
          if (S[j] && (S[j].t === 'id' || (S[j].t === 'word' && !KW.has(S[j].v.toUpperCase())))) { alias = S[j].v; j++; }
          refs.push({ name: nm, alias }); k = j;
          if (S[k] && S[k].t === 'op' && S[k].v === ',' && u === 'FROM') { k++; continue; } break;
        }
      }
    }
    const isQuery = (nm) => db.queries.some((q) => sameName(q.name, nm));
    const colsOf = (nm) => { const t = table(db, nm); if (t) return t.fields.map((f) => f.name); const q = db.queries.find((x) => sameName(x.name, nm)); return q && q._cols ? q._cols : []; };
    const known = new Set(); refs.forEach((r) => { known.add(r.name.toLowerCase()); if (r.alias) known.add(r.alias.toLowerCase()); });
    const selAliases = new Set(); for (let i = 0; i < S.length - 1; i++) if (up(S[i]) === 'AS') selAliases.add(String(S[i + 1].v).toLowerCase());
    const allCols = new Set(); refs.forEach((r) => colsOf(r.name).forEach((c) => allCols.add(c.toLowerCase())));
    const multi = refs.length > 1;
    const ownerOf = (col) => { const own = refs.filter((r) => colsOf(r.name).some((c) => c.toLowerCase() === col.toLowerCase())); return own.length === 1 ? own[0] : null; };
    const asked = [];
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const x = toks[i];
      if (x.t === 'ws') { out.push(' '); continue; }
      const prev = (() => { for (let k = i - 1; k >= 0; k--) if (toks[k].t !== 'ws') return toks[k]; return null; })();
      const next = (() => { for (let k = i + 1; k < toks.length; k++) if (toks[k].t !== 'ws') return toks[k]; return null; })();
      const afterDot = prev && prev.t === 'op' && prev.v === '.'; const beforeDot = next && next.t === 'op' && next.v === '.';
      if (x.t === 'str') { // motif LIKE : jokers Access * ? → % _
        const isLike = prev && up(prev) === 'LIKE';
        out.push(q1(isLike ? x.v.replace(/\*/g, '%').replace(/\?/g, '_').replace(/#/g, '_') : x.v)); continue;
      }
      if (x.t === 'date') { out.push(q1(accessDate(x.v))); continue; }
      if (x.t === 'num') { out.push(x.v); continue; }
      if (x.t === 'op') { out.push(x.v === '&' ? '||' : x.v === '!' && beforeDot === false ? '.' : x.v); continue; }
      const U = x.t === 'word' ? x.v.toUpperCase() : null;
      if (x.t === 'word' && next && next.t === 'op' && next.v === '(' && !afterDot) {
        if (AGG.has(U)) { out.push(U); continue; }
        if (FN.includes(U)) { out.push('ACC_' + U); continue; }
        out.push(x.v); continue; // autre fonction (moteur)
      }
      if (U && KW.has(U)) {
        if (U === 'DISTINCTROW') out.push('DISTINCT'); else if (U === 'YES' || U === 'ON' && false) out.push('true'); else if (U === 'NO') out.push('false');
        else if (U === 'TRUE') out.push('true'); else if (U === 'FALSE') out.push('false'); else if (U === 'MOD') out.push('%');
        else if (['PARAMETERS', 'WITH', 'OWNERACCESS', 'OPTION'].includes(U)) out.push(U); else out.push(U);
        continue;
      }
      // identifiant
      const nm = x.v; const low = nm.toLowerCase();
      if (afterDot) { out.push(bq(nm)); continue; }
      if (beforeDot) { out.push(bq(nm)); continue; }
      if (prev && up(prev) === 'AS') { out.push(bq(nm)); continue; } // alias
      if (known.has(low) && (!allCols.has(low) || refs.some((r) => sameName(r.name, nm) || (r.alias && sameName(r.alias, nm))))) { out.push(bq(nm)); continue; }
      if (allCols.has(low)) {
        // colonne non qualifiée : qualifiée d'office quand plusieurs tables (nécessaire au moteur)
        const own = multi ? ownerOf(nm) : null;
        out.push(own ? `${bq(own.alias || own.name)}.${bq(nm)}` : bq(nm)); continue;
      }
      if (selAliases.has(low) || prev && up(prev) === 'AS') { out.push(bq(nm)); continue; }
      if (table(db, nm) || isQuery(nm)) { out.push(bq(nm)); continue; }
      // paramètre : nom inconnu entre crochets → valeur demandée à l'utilisateur
      if (x.br) {
        if (!(nm in params)) { if (!asked.includes(nm)) asked.push(nm); out.push('NULL'); continue; }
        const v = params[nm]; const n = parseNumber(v); const d = parseDateInput(v);
        out.push(n !== undefined && n !== null && /^[\d\s.,-]+$/.test(String(v)) ? String(n) : d ? q1(d) : q1(v)); continue;
      }
      out.push(bq(nm));
    }
    let sql = out.join('').replace(/\s+/g, ' ').trim();
    // SELECT * sur plusieurs tables : colonnes listées (les homonymes deviennent « Table.Champ » comme dans Access)
    if (multi && /^SELECT\s+(DISTINCT\s+)?(TOP\s+\d+\s+)?\*\s+FROM/i.test(sql)) {
      const count = {}; refs.forEach((r) => colsOf(r.name).forEach((c) => { count[c.toLowerCase()] = (count[c.toLowerCase()] || 0) + 1; }));
      const list = refs.flatMap((r) => colsOf(r.name).map((c) => `${bq(r.alias || r.name)}.${bq(c)}${count[c.toLowerCase()] > 1 ? ' AS ' + bq((r.alias || r.name) + '.' + c) : ''}`)).join(', ');
      sql = sql.replace(/\*\s+FROM/i, list + ' FROM');
    }
    return { sql, params: asked, refs };
  }

  /* fonctions Access disponibles dans les requêtes */
  function registerFunctions(A) {
    const D = (v) => { if (v == null) return null; if (v instanceof Date) return v; const s = String(v); const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d))?)?/.exec(s); if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); const p = parseDateInput(s); return p ? D(p) : null; };
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const unit = (u) => ({ yyyy: 'y', y: 'd', q: 'q', m: 'm', d: 'd', w: 'd', ww: 'w', h: 'h', n: 'n', s: 's' }[String(u).toLowerCase()] || 'd');
    const F = {
      IIF: (c, a, b) => (c ? a : b), NZ: (v, d) => (v == null ? (d === undefined ? '' : d) : v),
      LEFT: (s, n) => (s == null ? null : String(s).slice(0, n)), RIGHT: (s, n) => (s == null ? null : n ? String(s).slice(-n) : ''), MID: (s, a, n) => (s == null ? null : String(s).substr(a - 1, n === undefined ? undefined : n)),
      LEN: (s) => (s == null ? null : String(s).length), UCASE: (s) => (s == null ? null : String(s).toUpperCase()), LCASE: (s) => (s == null ? null : String(s).toLowerCase()),
      TRIM: (s) => (s == null ? null : String(s).trim()), LTRIM: (s) => (s == null ? null : String(s).replace(/^\s+/, '')), RTRIM: (s) => (s == null ? null : String(s).replace(/\s+$/, '')),
      INSTR: (a, b, c) => { if (c === undefined) { c = b; b = a; a = 1; } return b == null ? null : String(b).indexOf(String(c), a - 1) + 1; },
      REPLACE: (s, a, b) => (s == null ? null : String(s).split(String(a)).join(String(b))), SPACE: (n) => ' '.repeat(n), STRING: (n, c) => String(c)[0].repeat(n), STRREVERSE: (s) => String(s).split('').reverse().join(''),
      YEAR: (d) => (D(d) ? D(d).getFullYear() : null), MONTH: (d) => (D(d) ? D(d).getMonth() + 1 : null), DAY: (d) => (D(d) ? D(d).getDate() : null),
      HOUR: (d) => (D(d) ? D(d).getHours() : null), MINUTE: (d) => (D(d) ? D(d).getMinutes() : null), SECOND: (d) => (D(d) ? D(d).getSeconds() : null), WEEKDAY: (d) => (D(d) ? D(d).getDay() + 1 : null),
      DATE: () => { const n = new Date(); return isoDate(new Date(n.getFullYear(), n.getMonth(), n.getDate())); }, NOW: () => isoDate(new Date(), true), TIME: () => new Date().toTimeString().slice(0, 8),
      DATESERIAL: (y, m, d) => isoDate(new Date(y, m - 1, d)), DATEVALUE: (s) => parseDateInput(s) || null, CDATE: (s) => parseDateInput(s) || null,
      DATEADD: (u, n, d) => { const x = D(d); if (!x) return null; const k = unit(u); if (k === 'y') x.setFullYear(x.getFullYear() + n); else if (k === 'q') x.setMonth(x.getMonth() + 3 * n); else if (k === 'm') x.setMonth(x.getMonth() + n); else if (k === 'w') x.setDate(x.getDate() + 7 * n); else if (k === 'h') x.setHours(x.getHours() + n); else if (k === 'n') x.setMinutes(x.getMinutes() + n); else if (k === 's') x.setSeconds(x.getSeconds() + n); else x.setDate(x.getDate() + n); return isoDate(x); },
      DATEDIFF: (u, a, b) => { const x = D(a), y = D(b); if (!x || !y) return null; const k = unit(u); if (k === 'y') return y.getFullYear() - x.getFullYear(); if (k === 'q') return Math.floor(y.getMonth() / 3) - Math.floor(x.getMonth() / 3) + 4 * (y.getFullYear() - x.getFullYear()); if (k === 'm') return (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth(); const ms = y - x; return Math.trunc(ms / ({ w: 6048e5, h: 36e5, n: 6e4, s: 1e3 }[k] || 864e5)); },
      DATEPART: (u, d) => { const x = D(d); if (!x) return null; const k = unit(u); return k === 'y' ? x.getFullYear() : k === 'q' ? Math.floor(x.getMonth() / 3) + 1 : k === 'm' ? x.getMonth() + 1 : k === 'h' ? x.getHours() : k === 'n' ? x.getMinutes() : k === 's' ? x.getSeconds() : String(u).toLowerCase() === 'w' ? x.getDay() + 1 : x.getDate(); },
      MONTHNAME: (m) => MOIS[m - 1] || null, WEEKDAYNAME: (d) => JOURS[d - 1] || null,
      FORMAT: (v, f) => formatValue(v, f, D, MOIS, JOURS),
      CINT: (v) => Math.round(parseNumber(v)), CLNG: (v) => Math.round(parseNumber(v)), CDBL: (v) => parseNumber(v), CSNG: (v) => parseNumber(v), CCUR: (v) => Math.round(parseNumber(v) * 10000) / 10000,
      CSTR: (v) => (v == null ? null : String(v)), CBOOL: (v) => !!v, VAL: (v) => parseFloat(String(v).replace(',', '.')) || 0, STR: (v) => (v == null ? null : ' ' + v),
      ROUND: (v, n = 0) => (v == null ? null : Math.round(v * 10 ** n) / 10 ** n), ABS: (v) => (v == null ? null : Math.abs(v)), INT: (v) => (v == null ? null : Math.floor(v)), FIX: (v) => (v == null ? null : Math.trunc(v)),
      SGN: (v) => Math.sign(v), SQR: (v) => Math.sqrt(v), ISNULL: (v) => v == null, ISNUMERIC: (v) => parseNumber(v) != null && parseNumber(v) !== undefined, ISDATE: (v) => !!parseDateInput(v),
      SWITCH: (...a) => { for (let i = 0; i < a.length; i += 2) if (a[i]) return a[i + 1]; return null; }, CHOOSE: (i, ...a) => a[i - 1] ?? null, ASC: (s) => String(s).charCodeAt(0), CHR: (n) => String.fromCharCode(n),
    };
    for (const [k, f] of Object.entries(F)) A.fn['ACC_' + k] = f;
  }
  function formatValue(v, f, D, MOIS, JOURS) {
    if (v == null) return null; const fmt = String(f || '');
    const low = fmt.toLowerCase();
    if (['currency', 'monétaire', 'monetaire'].includes(low)) return Number(v).toLocaleString('fr-FR') + ' F';
    if (['standard', 'fixed', 'fixe'].includes(low)) return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (low === 'percent' || low === 'pourcentage') return (Number(v) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' %';
    if (/^[#0 ,.]+$/.test(fmt)) { const dec = (fmt.split('.')[1] || '').length; return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: /[ ,]/.test(fmt.split('.')[0]) }); }
    const d = D(v); if (!d) return String(v);
    if (low === 'short date' || low === 'date, abrégé') return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    if (low === 'long date' || low === 'date, complet') return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
    return fmt.replace(/yyyy|aaaa|yy|aa|mmmm|mmm|mm|m|dddd|ddd|dd|d|jjjj|jj|j|hh|nn|ss/gi, (t) => {
      switch (t.toLowerCase()) {
        case 'yyyy': case 'aaaa': return d.getFullYear(); case 'yy': case 'aa': return String(d.getFullYear()).slice(-2);
        case 'mmmm': return MOIS[d.getMonth()]; case 'mmm': return MOIS[d.getMonth()].slice(0, 4).replace(/\.$/, ''); case 'mm': return pad(d.getMonth() + 1); case 'm': return d.getMonth() + 1;
        case 'dddd': case 'jjjj': return JOURS[d.getDay()]; case 'ddd': return JOURS[d.getDay()].slice(0, 3); case 'dd': case 'jj': return pad(d.getDate()); case 'd': case 'j': return d.getDate();
        case 'hh': return pad(d.getHours()); case 'nn': return pad(d.getMinutes()); case 'ss': return pad(d.getSeconds()); default: return t;
      }
    });
  }

  /* Exécute une requête. opts.params : valeurs des paramètres. Renvoie
     { kind:'select', rows, cols } ou { kind:'action', count, table } ou { needParams:[…] } */
  let ready = null;
  async function ensure() {
    if (!ready) ready = (async () => { if (!window.alasql) await loadScript('lib/alasql.min.js'); registerFunctions(window.alasql); })();
    return ready;
  }
  function kindOf(sql) { const m = /^\s*(SELECT|UPDATE|DELETE|INSERT|PARAMETERS|TRANSFORM)\b/i.exec(sql); return m ? m[1].toUpperCase() : null; }
  async function run(db, sqlIn, opts = {}, depth = 0) {
    await ensure();
    if (depth > 8) throw new Error('requêtes imbriquées trop profondément');
    let src = sqlIn.trim().replace(/^PARAMETERS\s+[^;]*;\s*/i, '');
    const kind = kindOf(src);
    if (kind === 'TRANSFORM') throw new Error('les requêtes analyse croisée (TRANSFORM) ne sont pas prises en charge : utilisez GROUP BY');
    if (!kind) throw new Error('requête non reconnue : commencez par SELECT, UPDATE, DELETE ou INSERT');
    const A = new window.alasql.Database();
    const mentions = (name) => new RegExp(`(^|[^\\w\\u00c0-\\u024f])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w\\u00c0-\\u024f])`, 'i').test(src);
    // requêtes enregistrées utilisées comme sources : calculées d'abord (leurs colonnes servent à la traduction)
    for (const q of db.queries) {
      if (!mentions(q.name) || kindOf(q.sql) !== 'SELECT' || (opts.self && sameName(opts.self, q.name))) continue;
      const r = await run(db, q.sql, { ...opts, self: q.name }, depth + 1); if (r.needParams) return r;
      A.exec(`CREATE TABLE ${bq(q.name)}`); A.tables[q.name].data = r.rows; q._cols = r.cols;
    }
    const tr = translate(db, src, opts.params || {});
    if (tr.params.length) return { needParams: tr.params };
    for (const t of db.tables) {
      if (!mentions(t.name)) continue;
      A.exec(`CREATE TABLE ${bq(t.name)}`); A.tables[t.name].data = kind === 'SELECT' ? t.rows : t.rows.map((r) => ({ ...r }));
    }
    let res;
    try { res = A.exec(tr.sql); } catch (e) { throw new Error(sqlError(e)); }
    if (kind === 'SELECT') {
      const rows = Array.isArray(res) ? res : [];
      const cols = []; rows.slice(0, 200).forEach((r) => Object.keys(r).forEach((k) => { if (!cols.includes(k)) cols.push(k); }));
      if (!rows.length) { const m = /^SELECT\s+(?:DISTINCT\s+)?(?:TOP\s+\d+\s+)?(.*?)\s+FROM\s/i.exec(src); if (m && m[1] !== '*') m[1].split(',').forEach((p) => { const a = /\bAS\s+\[?([^\]]+)\]?\s*$/i.exec(p.trim()); cols.push(a ? a[1] : p.trim().replace(/^.*\./, '').replace(/[[\]]/g, '')); }); else if (tr.refs[0]) { const t = table(db, tr.refs[0].name); if (t) t.fields.forEach((f) => cols.push(f.name)); } }
      return { kind: 'select', rows, cols, sql: tr.sql };
    }
    // requête action : on reporte le résultat dans la table, après contrôle des types
    const target = kind === 'INSERT' ? tr.refs.find((r) => true) : tr.refs[0];
    const t = table(db, target.name); if (!t) throw new Error('table introuvable : ' + target.name);
    const data = A.tables[t.name].data;
    if (opts.dryRun) return { kind: 'action', count: typeof res === 'number' ? res : 0, table: t.name, op: kind };
    const errs = [];
    const clean = data.map((r) => { const o = {}; for (const f of t.fields) { let v = r[f.name]; if (v === undefined) v = null; if (f.type === 'auto' && v == null) { v = ++t.seq; } else if (v != null) { const c = coerce(f, v); if (c.err) { errs.push(`${f.name} : ${c.err} (« ${v} »)`); v = null; } else v = c.v; } else if (f.type === 'bool') v = false; o[f.name] = v; } return o; });
    if (errs.length) throw new Error('valeurs refusées — ' + [...new Set(errs)].slice(0, 3).join(' ; '));
    // intégrité référentielle, comme Access : suppression refusée s'il existe des lignes liées (sauf cascade),
    // valeurs de clé étrangère inexistantes refusées
    const before = t.rows; const cascades = [];
    for (const rel of db.relations.filter((x) => x.integrity)) {
      if (sameName(rel.one.table, t.name)) {
        const keep = new Set(clean.map((r) => r[rel.one.field]));
        const gone = new Set(before.map((r) => r[rel.one.field]).filter((v) => v != null && !keep.has(v)));
        if (!gone.size) continue; const many = table(db, rel.many.table); if (!many) continue;
        const linked = many.rows.filter((r) => gone.has(r[rel.many.field]));
        if (linked.length && !rel.cascadeDelete) throw new Error(`intégrité référentielle : ${linked.length} enregistrement(s) de ${many.name} dépendent des lignes supprimées ou modifiées`);
        if (linked.length) cascades.push({ many, linked });
      }
      if (sameName(rel.many.table, t.name)) {
        const one = table(db, rel.one.table); if (!one) continue; const ok = new Set(one.rows.map((r) => r[rel.one.field]));
        const bad = clean.filter((r) => r[rel.many.field] != null && !ok.has(r[rel.many.field]));
        if (bad.length) throw new Error(`intégrité référentielle : ${rel.many.field} = ${bad[0][rel.many.field]} n'existe pas dans ${one.name}`);
      }
    }
    cascades.forEach(({ many, linked }) => { const set = new Set(linked); many.rows = many.rows.filter((r) => !set.has(r)); });
    t.rows = clean; db.updated = Date.now();
    return { kind: 'action', count: typeof res === 'number' ? res : 0, table: t.name, op: kind };
  }
  function sqlError(e) {
    const m = String(e.message || e);
    if (/Parse error/i.test(m)) { const l = m.split('\n'); return 'erreur de syntaxe près de : ' + (l[1] || '').trim(); }
    if (/Table .* does not exist/i.test(m)) return 'table ou requête inconnue : ' + (/Table "?([^"]+)"?/.exec(m) || [, ''])[1];
    return m;
  }

  /* ================= Création de requêtes (grille QBE → SQL) ================= */
  // design : { tables:[nom], cols:[{ table, field, expr, alias, total, sort, show, crit, or }] }
  function qbeToSql(db, d) {
    const tables = d.tables.filter((t) => table(db, t) || db.queries.some((q) => sameName(q.name, t)));
    if (!tables.length) throw new Error('ajoutez au moins une table');
    const ref = (c) => (c.expr ? c.expr : c.field === '*' ? `[${c.table}].*` : `[${c.table}].[${c.field}]`);
    const totals = d.cols.some((c) => c.total && c.total !== 'none');
    const sel = []; const where = []; const whereOr = []; const group = []; const having = []; const order = [];
    for (const c of d.cols) {
      if (!c.field && !c.expr) continue;
      const r = ref(c); const tot = totals ? c.total || 'group' : 'none';
      const AGGS = { sum: 'Sum', avg: 'Avg', count: 'Count', min: 'Min', max: 'Max', first: 'First', last: 'Last' };
      const out = AGGS[tot] ? `${AGGS[tot]}(${r})` : r;
      const alias = c.alias || (AGGS[tot] ? `${({ sum: 'Somme', avg: 'Moyenne', count: 'Nombre', min: 'Min', max: 'Max', first: 'Premier', last: 'Dernier' })[tot]}De${c.field || 'Expr'}` : c.expr ? 'Expr' + (sel.length + 1) : null);
      if (c.show !== false && tot !== 'where') sel.push(alias ? `${out} AS [${alias}]` : out);
      if (totals && tot === 'group') group.push(r);
      const cr = criteria(c.crit, r, c);
      if (cr) { if (totals && AGGS[tot]) having.push(cr.replace(r, out)); else where.push(cr); }
      const cro = criteria(c.or, r, c); if (cro) whereOr.push(cro);
      if (c.sort === 'asc' || c.sort === 'desc') order.push(`${alias && AGGS[tot] ? `[${alias}]` : out} ${c.sort.toUpperCase()}`);
    }
    if (!sel.length) throw new Error('choisissez au moins un champ à afficher');
    // jointures d'après les relations entre les tables ajoutées
    let from = `[${tables[0]}]`; const joined = [tables[0]]; const rest = tables.slice(1);
    let guard = 0;
    while (rest.length && guard++ < 50) {
      let progressed = false;
      for (const t of [...rest]) {
        const rel = db.relations.find((r) => (sameName(r.one.table, t) && joined.some((j) => sameName(r.many.table, j))) || (sameName(r.many.table, t) && joined.some((j) => sameName(r.one.table, j))));
        if (!rel) continue;
        const jt = (d.joins && d.joins[t]) || 'INNER';
        from = `(${from} ${jt} JOIN [${t}] ON [${rel.one.table}].[${rel.one.field}] = [${rel.many.table}].[${rel.many.field}])`;
        joined.push(t); rest.splice(rest.indexOf(t), 1); progressed = true;
      }
      if (!progressed) { from += ', ' + rest.map((t) => `[${t}]`).join(', '); rest.length = 0; }
    }
    from = from.replace(/^\((.*)\)$/, '$1');
    let w = where.join(' AND '); if (whereOr.length) w = (w ? `(${w}) OR ` : '') + whereOr.join(' OR ');
    return `SELECT ${d.distinct ? 'DISTINCT ' : ''}${d.top ? `TOP ${d.top} ` : ''}${sel.join(', ')}\nFROM ${from}${w ? `\nWHERE ${w}` : ''}${group.length ? `\nGROUP BY ${group.join(', ')}` : ''}${having.length ? `\nHAVING ${having.join(' AND ')}` : ''}${order.length ? `\nORDER BY ${order.join(', ')}` : ''};`;
  }
  // critère à la manière d'Access : « >1000 », « Patente », « Comme "A*" », « Entre 01/01/2026 Et 31/03/2026 », « Est Null »…
  function criteria(crit, ref, col) {
    if (crit == null) return null; let c = String(crit).trim(); if (!c) return null;
    c = c.replace(/\bcomme\b/gi, 'Like').replace(/\bentre\b/gi, 'Between').replace(/\bet\b/gi, 'And').replace(/\bou\b/gi, 'Or').replace(/\best\s+null\b/gi, 'Is Null').replace(/\best\s+pas\s+null\b/gi, 'Is Not Null').replace(/\bpas\b/gi, 'Not').replace(/\bdans\b/gi, 'In').replace(/\bvrai\b/gi, 'True').replace(/\bfaux\b/gi, 'False').replace(/\boui\b/gi, 'True').replace(/\bnon\b/gi, 'False');
    // dates jj/mm/aaaa (écriture française) → #aaaa-mm-jj#
    c = c.replace(/#?\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b#?/g, (_, d, m, y) => `#${y}-${pad(m)}-${pad(d)}#`);
    const ops = /^(=|<>|<=|>=|<|>|Like\b|Not\b|Between\b|In\b|Is\b)/i;
    if (ops.test(c)) return `${ref} ${c}`;
    if (/^(True|False)$/i.test(c)) return `${ref} = ${c}`;
    if (/^-?\d+([.,]\d+)?$/.test(c)) return `${ref} = ${c.replace(',', '.')}`;
    if (/^#.*#$/.test(c) || /^".*"$/.test(c) || /^'.*'$/.test(c) || /^\[.*\]$/.test(c)) return `${ref} = ${c}`;
    if (/[*?]/.test(c)) return `${ref} Like "${c.replace(/"/g, '""')}"`;
    return `${ref} = "${c.replace(/"/g, '""')}"`;
  }

  /* ================= Lecture des fichiers Access (.accdb, .mdb) ================= */
  async function readAccess(file, password) {
    await loadScript('lib/mdb-reader.min.js');
    const buf = window.MDBBuffer.from(new Uint8Array(await file.arrayBuffer()));
    let r;
    try { r = new window.MDBReader(buf, password ? { password } : undefined); r.getTableNames(); }
    catch (e) { if (/password|mot de passe|decrypt|encrypt/i.test(String(e.message))) { const err = new Error('mot de passe requis ou incorrect'); err.password = true; throw err; } throw e; }
    const db = { id: uid(), name: file.name.replace(/\.(accdb|mdb)$/i, ''), tables: [], relations: [], queries: [], forms: [], reports: [], created: Date.now(), updated: Date.now(), source: file.name };
    const skipped = [];
    for (const name of r.getTableNames()) {
      const T = r.getTable(name); const cols = T.getColumns();
      const fields = []; const conv = {};
      for (const c of cols) {
        let type; switch (c.type) {
          case 'boolean': type = 'bool'; break;
          case 'byte': case 'integer': case 'long': case 'bigint': type = c.autoLong ? 'auto' : 'int'; break;
          case 'currency': type = 'money'; break;
          case 'float': case 'double': case 'numeric': type = 'double'; break;
          case 'datetime': case 'datetimeextended': type = 'date'; break;
          case 'memo': type = 'memo'; break;
          case 'text': case 'repid': type = 'text'; break;
          default: type = null;
        }
        if (!type) { skipped.push(`${name}.${c.name} (${c.type})`); continue; }
        const f = { name: c.name, type, required: c.nullable === false && type !== 'bool' && type !== 'auto' };
        if (type === 'text') f.size = Math.max(1, Math.min(255, c.size ? Math.round(c.size / 2) : 255));
        fields.push(f); conv[c.name] = type;
      }
      const pk = fields.find((f) => f.type === 'auto') || fields.find((f) => /^(id|n°|no|num|numero|numéro|code)$/i.test(f.name));
      if (pk) pk.pk = true;
      const rows = T.getData().map((row) => { const o = {}; for (const f of fields) { let v = row[f.name]; if (v === undefined) v = null; if (v != null) { if (f.type === 'date') v = isoDate(v instanceof Date ? v : new Date(v)); else if (['money', 'double', 'int', 'auto'].includes(f.type)) v = Number(v); else if (f.type === 'bool') v = !!v; else if (typeof v !== 'string') v = String(v); } else if (f.type === 'bool') v = false; o[f.name] = v; } return o; });
      const auto = fields.find((f) => f.type === 'auto');
      db.tables.push({ id: uid(), name, fields, rows, seq: auto ? Math.max(0, ...rows.map((x) => +x[auto.name] || 0)) : 0 });
    }
    // relations (MSysRelationships)
    try {
      const rels = {}; for (const x of r.getTable('MSysRelationships').getData()) (rels[x.szRelationship] = rels[x.szRelationship] || []).push(x);
      for (const [nm, parts] of Object.entries(rels)) {
        const p = parts[0]; if (!table(db, p.szObject) || !table(db, p.szReferencedObject)) continue;
        const g = p.grbit || 0;
        db.relations.push({ id: uid(), name: nm, one: { table: p.szReferencedObject, field: p.szReferencedColumn }, many: { table: p.szObject, field: p.szColumn }, integrity: !(g & 2), cascadeDelete: !!(g & 0x1000), cascadeUpdate: !!(g & 0x100) });
        const mt = table(db, p.szObject); const f = mt.fields.find((x) => x.name === p.szColumn); const ot = table(db, p.szReferencedObject);
        if (f && !f.lookup) { const show = ot.fields.find((x) => x.type === 'text'); f.lookup = { table: ot.name, field: p.szReferencedColumn, show: show ? show.name : '' }; }
      }
    } catch (e) { /* pas de relations lisibles */ }
    // requêtes enregistrées (MSysQueries) : reconstruction des requêtes sélection simples
    try { db.queries = readQueries(r); } catch (e) { console.warn('requêtes illisibles', e); }
    return { db, skipped };
  }
  function readQueries(r) {
    const objs = r.getTable('MSysObjects').getData().filter((o) => o.Type === 5 && !/^~/.test(o.Name));
    const rows = r.getTable('MSysQueries').getData(); const byId = {};
    rows.forEach((x) => { (byId[x.ObjectId] = byId[x.ObjectId] || []).push(x); });
    const out = [];
    const br = (s) => (s && !/^\[.*\]$/.test(s) ? `[${s}]` : s);
    for (const o of objs) {
      const q = byId[o.Id]; if (!q) continue;
      const at = (n) => q.filter((x) => x.Attribute === n);
      const type = (at(0)[0] || {}).Flag || 1; const flags = (at(3)[0] || {}).Flag || 0;
      const sqlText = (at(0)[0] || {}).Expression;
      if ([7, 8, 9].includes(type) && sqlText) { out.push({ id: uid(), name: o.Name, sql: sqlText, imported: true }); continue; }
      const tables = at(5).map((x) => (x.Expression ? `(${x.Expression})` : br(x.Name1)) + (x.Name2 ? ` AS [${x.Name2}]` : ''));
      const cols = at(6).map((x) => x.Expression + (x.Name1 ? ` AS [${x.Name1}]` : ''));
      let from = tables.join(', ');
      const joins = at(7);
      if (joins.length) {
        const used = new Set(); let f = '';
        joins.forEach((j, i) => { const kind = j.Flag === 2 ? 'LEFT' : j.Flag === 3 ? 'RIGHT' : 'INNER'; if (!i) { f = `${br(j.Name1)} ${kind} JOIN ${br(j.Name2)} ON ${j.Expression}`; used.add(j.Name1); } else f = `(${f}) ${kind} JOIN ${br(j.Name2)} ON ${j.Expression}`; used.add(j.Name2); });
        const others = at(5).filter((x) => !used.has(x.Name2 || x.Name1)).map((x) => br(x.Name1));
        from = [f, ...others].join(', ');
      }
      const where = (at(8)[0] || {}).Expression; const group = at(9).map((x) => x.Expression); const having = (at(10)[0] || {}).Expression;
      const order = at(11).map((x) => x.Expression + (/^d/i.test(x.Name1 || '') ? ' DESC' : ''));
      const top = (at(3)[0] || {}).Name1;
      let sql;
      if (type === 1 || type === 0) sql = `SELECT ${flags & 2 ? 'DISTINCT ' : ''}${top && /^\d+$/.test(top) ? `TOP ${top} ` : ''}${flags & 1 ? '*' + (cols.length ? ', ' : '') : ''}${cols.join(', ')} FROM ${from}${where ? ` WHERE ${where}` : ''}${group.length ? ` GROUP BY ${group.join(', ')}` : ''}${having ? ` HAVING ${having}` : ''}${order.length ? ` ORDER BY ${order.join(', ')}` : ''};`;
      else if (type === 5) sql = `DELETE FROM ${from}${where ? ` WHERE ${where}` : ''};`;
      else if (type === 4) sql = `UPDATE ${from} SET ${at(6).map((x) => `${x.Name1} = ${x.Expression}`).join(', ')}${where ? ` WHERE ${where}` : ''};`;
      else continue;
      out.push({ id: uid(), name: o.Name, sql, imported: true });
    }
    return out;
  }

  /* ================= Export ================= */
  // nom XML à la manière d'Access : caractères interdits → _xHHHH_
  function xmlName(s) { return String(s).split('').map((ch, i) => { const ok = /[A-Za-z_\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02ff]/.test(ch) || (i > 0 && /[0-9.\-\u00b7]/.test(ch)); return ok ? ch : `_x${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`; }).join(''); }
  const xesc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  function toAccessXml(db, tableNames) {
    const ts = db.tables.filter((t) => !tableNames || tableNames.includes(t.name));
    let x = '<?xml version="1.0" encoding="UTF-8"?>\n<root xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:od="urn:schemas-microsoft-com:officedata">\n<xsd:schema>\n<xsd:element name="dataroot">\n<xsd:complexType>\n<xsd:sequence>\n';
    ts.forEach((t) => { x += `<xsd:element ref="${xmlName(t.name)}" minOccurs="0" maxOccurs="unbounded"/>\n`; });
    x += '</xsd:sequence>\n<xsd:attribute name="generated" type="xsd:dateTime"/>\n</xsd:complexType>\n</xsd:element>\n';
    for (const t of ts) {
      x += `<xsd:element name="${xmlName(t.name)}">\n<xsd:annotation>\n<xsd:appinfo>\n`;
      const pk = pkOf(t); if (pk) x += `<od:index index-name="PrimaryKey" index-key="${xesc(pk.name)} " primary="yes" unique="yes" clustered="no" order="asc"/>\n`;
      t.fields.filter((f) => f.unique && !f.pk).forEach((f) => { x += `<od:index index-name="${xesc(f.name)}" index-key="${xesc(f.name)} " primary="no" unique="yes" clustered="no" order="asc"/>\n`; });
      x += '</xsd:appinfo>\n</xsd:annotation>\n<xsd:complexType>\n<xsd:sequence>\n';
      for (const f of t.fields) {
        const n = xmlName(f.name); const req = f.required || f.pk;
        switch (f.type) {
          case 'auto': x += `<xsd:element name="${n}" minOccurs="1" od:jetType="autonumber" od:sqlSType="int" od:autoUnique="yes" od:nonNullable="yes" type="xsd:int"/>\n`; break;
          case 'int': x += `<xsd:element name="${n}" minOccurs="${req ? 1 : 0}" od:jetType="longinteger" od:sqlSType="int"${req ? ' od:nonNullable="yes"' : ''} type="xsd:int"/>\n`; break;
          case 'double': x += `<xsd:element name="${n}" minOccurs="${req ? 1 : 0}" od:jetType="double" od:sqlSType="float"${req ? ' od:nonNullable="yes"' : ''} type="xsd:double"/>\n`; break;
          case 'money': x += `<xsd:element name="${n}" minOccurs="${req ? 1 : 0}" od:jetType="currency" od:sqlSType="money"${req ? ' od:nonNullable="yes"' : ''} type="xsd:double"/>\n`; break;
          case 'date': x += `<xsd:element name="${n}" minOccurs="${req ? 1 : 0}" od:jetType="datetime" od:sqlSType="datetime"${req ? ' od:nonNullable="yes"' : ''} type="xsd:dateTime"/>\n`; break;
          case 'bool': x += `<xsd:element name="${n}" minOccurs="1" od:jetType="yesno" od:sqlSType="bit" od:nonNullable="yes" type="xsd:boolean"/>\n`; break;
          case 'memo': x += `<xsd:element name="${n}" minOccurs="${req ? 1 : 0}" od:jetType="memo" od:sqlSType="ntext"${req ? ' od:nonNullable="yes"' : ''}>\n<xsd:simpleType>\n<xsd:restriction base="xsd:string">\n<xsd:maxLength value="536870910"/>\n</xsd:restriction>\n</xsd:simpleType>\n</xsd:element>\n`; break;
          default: x += `<xsd:element name="${n}" minOccurs="${req ? 1 : 0}" od:jetType="text" od:sqlSType="nvarchar"${req ? ' od:nonNullable="yes"' : ''}>\n<xsd:simpleType>\n<xsd:restriction base="xsd:string">\n<xsd:maxLength value="${f.size || 255}"/>\n</xsd:restriction>\n</xsd:simpleType>\n</xsd:element>\n`;
        }
      }
      x += '</xsd:sequence>\n</xsd:complexType>\n</xsd:element>\n';
    }
    const now = new Date(); x += `</xsd:schema>\n<dataroot xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" generated="${isoDate(now, true)}${now.getSeconds() ? '' : ':00'}">\n`;
    for (const t of ts) for (const r of t.rows) {
      x += `<${xmlName(t.name)}>\n`;
      for (const f of t.fields) {
        const v = r[f.name]; if (v === null || v === undefined || v === '') { if (f.type === 'bool') x += `<${xmlName(f.name)}>0</${xmlName(f.name)}>\n`; continue; }
        let s;
        if (f.type === 'bool') s = v ? '1' : '0';
        else if (f.type === 'date') { const m = /^(\d{4}-\d\d-\d\d)(?:T(\d\d:\d\d)(?::(\d\d))?)?/.exec(v); s = m ? `${m[1]}T${m[2] || '00:00'}:${m[3] || '00'}` : v; }
        else s = String(v);
        x += `<${xmlName(f.name)}>${xesc(s)}</${xmlName(f.name)}>\n`;
      }
      x += `</${xmlName(t.name)}>\n`;
    }
    return x + '</dataroot>\n</root>\n';
  }
  async function toXlsx(db, tableNames) {
    if (!window.ExcelJS) await loadScript('lib/exceljs.min.js');
    const wb = new window.ExcelJS.Workbook(); wb.creator = 'Base Joe';
    const used = new Set();
    for (const t of db.tables.filter((x) => !tableNames || tableNames.includes(x.name))) {
      let nm = t.name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31); let k = 2; while (used.has(nm.toLowerCase())) nm = nm.slice(0, 28) + '_' + k++; used.add(nm.toLowerCase());
      const ws = wb.addWorksheet(nm, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.addRow(t.fields.map((f) => f.name));
      t.rows.forEach((r) => ws.addRow(t.fields.map((f) => { const v = r[f.name]; if (v == null) return null; if (f.type === 'date') { const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(v); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0))) : v; } return v; })));
      const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA4373A' } };
      t.fields.forEach((f, j) => { const c = ws.getColumn(j + 1); c.width = Math.min(45, Math.max(10, f.name.length + 2, ...t.rows.slice(0, 300).map((r) => display(f, r[f.name]).length + 2))); if (f.type === 'money') c.numFmt = '#,##0 "F CFA"'; if (f.type === 'date') c.numFmt = t.rows.some((r) => /T/.test(r[f.name] || '')) ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy'; });
      if (t.fields.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.fields.length } };
    }
    if (!wb.worksheets.length) wb.addWorksheet('Vide');
    return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function toCsv(t) {
    const q = (s) => (s == null ? '' : /[;"\n\r]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
    const lines = [t.fields.map((f) => q(f.name)).join(';')];
    t.rows.forEach((r) => lines.push(t.fields.map((f) => { const v = r[f.name]; if (v == null) return ''; if (f.type === 'date') return display(f, v); if (f.type === 'bool') return v ? 'Oui' : 'Non'; if (typeof v === 'number') return String(v).replace('.', ','); return q(v); }).join(';')));
    return '\ufeff' + lines.join('\r\n');
  }
  // import d'un tableau (Excel, CSV) : types devinés d'après les valeurs
  function tableFromGrid(db, name, header, rows) {
    const t = { id: uid(), name, fields: [], rows: [], seq: 0 };
    const names = header.map((h, j) => { let n = String(h == null || h === '' ? `Champ${j + 1}` : h).trim().replace(/[.!`[\]]/g, '_').slice(0, 64); let k = 2; const base = n; while (header.slice(0, j).some((x, i) => names && names[i] === n)) n = base + k++; return n; });
    names.forEach((n, j) => {
      const vals = rows.map((r) => r[j]).filter((v) => v !== null && v !== undefined && v !== '');
      let type = 'text';
      if (vals.length && vals.every((v) => typeof v === 'boolean' || /^(oui|non|vrai|faux)$/i.test(String(v)))) type = 'bool';
      else if (vals.length && vals.every((v) => v instanceof Date || (typeof v === 'string' && parseDateInput(v) && /[/-]/.test(v)))) type = 'date';
      else if (vals.length && vals.every((v) => typeof v === 'number' || (typeof v === 'string' && parseNumber(v) != null && parseNumber(v) !== undefined && /^[-+\d\s.,]+(f\s?cfa|fcfa|f)?$/i.test(v.trim())))) type = vals.every((v) => Number.isInteger(parseNumber(v))) ? 'int' : 'double';
      else if (vals.some((v) => String(v).length > 255)) type = 'memo';
      if (/montant|prix|solde|total|recette|dépense|depense|somme|tarif|coût|cout/i.test(n) && (type === 'int' || type === 'double')) type = 'money';
      t.fields.push({ name: n, type, ...(type === 'text' ? { size: 255 } : {}) });
    });
    rows.forEach((r) => { const o = {}; t.fields.forEach((f, j) => { const c = coerce(f, r[j] instanceof Date ? isoDate(r[j]) : r[j]); o[f.name] = c.err ? null : c.v; }); t.rows.push(o); });
    const idf = t.fields.find((f) => /^(id|n°|no|num|code)$/i.test(f.name) && f.type === 'int' && new Set(t.rows.map((r) => r[f.name])).size === t.rows.length && t.rows.every((r) => r[f.name] != null));
    if (idf) { idf.pk = true; } else { t.fields.unshift({ name: 'N°', type: 'auto', pk: true, required: true }); t.rows.forEach((r, i) => { r['N°'] = i + 1; }); t.seq = t.rows.length; }
    return t;
  }

  window.Studio = window.Studio || {};
  window.Studio.baseEngine = { TYPES, uid, coerce, display, isoDate, parseDateInput, parseNumber, table, pkOf, newTable, saveRow, deleteRows, changeFieldType, renameField, lookupLabel, translate, run, ensure, qbeToSql, criteria, readAccess, toAccessXml, toXlsx, toCsv, tableFromGrid, kindOf, xmlName };
})();
