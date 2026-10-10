/* Studio Joe — moteur de formules du tableur (Tableur Joe).
   Les formules sont stockées sous leur forme « canonique » (noms anglais, séparateur « , », décimales « . »),
   comme dans un fichier Excel, et affichées en français (SOMME, SI, « ; », virgule décimale).
   Valeurs : nombre, texte, booléen, null (vide), FErr (erreur), Rng (plage), tableau 2D. Les dates sont des
   numéros de série comme dans Excel (1 = 31/12/1899 ; 46000 ≈ 2025). */
(function () {
  const MAXR = 1048576, MAXC = 16384;

  /* ---------------- Adresses ---------------- */
  function colName(c) { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function colIndex(s) { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
  const addr = (r, c) => colName(c) + (r + 1);
  function parseAddr(s) {
    const m = /^\s*\$?([A-Za-z]{1,3})\$?(\d+)\s*$/.exec(s || ''); if (!m) return null;
    const r = +m[2] - 1, c = colIndex(m[1]); if (r < 0 || r >= MAXR || c >= MAXC) return null; return { r, c };
  }
  function parseRange(s) {
    const [a, b] = String(s).split(':'); const p = parseAddr(a); if (!p) return null;
    const q = b ? parseAddr(b) : p; if (!q) return null;
    return { r1: Math.min(p.r, q.r), c1: Math.min(p.c, q.c), r2: Math.max(p.r, q.r), c2: Math.max(p.c, q.c) };
  }
  const rangeName = (g) => (g.r1 === g.r2 && g.c1 === g.c2 ? addr(g.r1, g.c1) : addr(g.r1, g.c1) + ':' + addr(g.r2, g.c2));

  /* ---------------- Erreurs ---------------- */
  class FErr { constructor(code) { this.code = code; } toString() { return this.code; } }
  const err = (c) => new FErr(c);
  const isErr = (v) => v instanceof FErr;
  const E = { DIV0: '#DIV/0!', NA: '#N/A', VALUE: '#VALUE!', REF: '#REF!', NAME: '#NAME?', NUM: '#NUM!', NULL: '#NULL!', CIRC: '#CIRC!' };
  const ERR_FR = { '#VALUE!': '#VALEUR!', '#NAME?': '#NOM?', '#NUM!': '#NOMBRE!', '#NULL!': '#NUL!' };
  const ERR_EN = Object.fromEntries(Object.entries(ERR_FR).map(([a, b]) => [b, a]));
  const errFr = (code) => ERR_FR[code] || code;

  /* ---------------- Noms des fonctions (français ↔ anglais) ---------------- */
  const FR = {
    SUM: 'SOMME', AVERAGE: 'MOYENNE', MIN: 'MIN', MAX: 'MAX', COUNT: 'NB', COUNTA: 'NBVAL', COUNTBLANK: 'NB.VIDE', IF: 'SI', IFS: 'SI.CONDITIONS',
    IFERROR: 'SIERREUR', IFNA: 'SI.NON.DISP', AND: 'ET', OR: 'OU', NOT: 'NON', XOR: 'OUX', TRUE: 'VRAI', FALSE: 'FAUX', SWITCH: 'SI.MULTIPLE',
    ROUND: 'ARRONDI', ROUNDUP: 'ARRONDI.SUP', ROUNDDOWN: 'ARRONDI.INF', MROUND: 'ARRONDI.AU.MULTIPLE', INT: 'ENT', TRUNC: 'TRONQUE', ABS: 'ABS', MOD: 'MOD',
    POWER: 'PUISSANCE', SQRT: 'RACINE', PRODUCT: 'PRODUIT', SUMPRODUCT: 'SOMMEPROD', SUMIF: 'SOMME.SI', SUMIFS: 'SOMME.SI.ENS', COUNTIF: 'NB.SI',
    COUNTIFS: 'NB.SI.ENS', AVERAGEIF: 'MOYENNE.SI', AVERAGEIFS: 'MOYENNE.SI.ENS', MAXIFS: 'MAX.SI.ENS', MINIFS: 'MIN.SI.ENS', SUMSQ: 'SOMME.CARRES',
    VLOOKUP: 'RECHERCHEV', HLOOKUP: 'RECHERCHEH', XLOOKUP: 'RECHERCHEX', LOOKUP: 'RECHERCHE', INDEX: 'INDEX', MATCH: 'EQUIV', XMATCH: 'EQUIVX',
    CHOOSE: 'CHOISIR', ROW: 'LIGNE', COLUMN: 'COLONNE', ROWS: 'LIGNES', COLUMNS: 'COLONNES', INDIRECT: 'INDIRECT', OFFSET: 'DECALER', ADDRESS: 'ADRESSE',
    CONCATENATE: 'CONCATENER', CONCAT: 'CONCAT', TEXTJOIN: 'JOINDRE.TEXTE', LEFT: 'GAUCHE', RIGHT: 'DROITE', MID: 'STXT', LEN: 'NBCAR',
    UPPER: 'MAJUSCULE', LOWER: 'MINUSCULE', PROPER: 'NOMPROPRE', TRIM: 'SUPPRESPACE', SUBSTITUTE: 'SUBSTITUE', REPLACE: 'REMPLACER', FIND: 'TROUVE',
    SEARCH: 'CHERCHE', TEXT: 'TEXTE', VALUE: 'CNUM', REPT: 'REPT', EXACT: 'EXACT', CHAR: 'CAR', CODE: 'CODE', CLEAN: 'EPURAGE', FIXED: 'CTXT',
    ISBLANK: 'ESTVIDE', ISNUMBER: 'ESTNUM', ISTEXT: 'ESTTEXTE', ISERROR: 'ESTERREUR', ISERR: 'ESTERR', ISNA: 'ESTNA', ISLOGICAL: 'ESTLOGIQUE',
    ISEVEN: 'EST.PAIR', ISODD: 'EST.IMPAIR', NA: 'NA', N: 'N', TYPE: 'TYPE',
    TODAY: 'AUJOURDHUI', NOW: 'MAINTENANT', DATE: 'DATE', TIME: 'TEMPS', YEAR: 'ANNEE', MONTH: 'MOIS', DAY: 'JOUR', HOUR: 'HEURE', MINUTE: 'MINUTE',
    SECOND: 'SECONDE', WEEKDAY: 'JOURSEM', WEEKNUM: 'NO.SEMAINE', EDATE: 'MOIS.DECALER', EOMONTH: 'FIN.MOIS', DATEDIF: 'DATEDIF', DAYS: 'JOURS',
    DAYS360: 'JOURS360', NETWORKDAYS: 'NB.JOURS.OUVRES', WORKDAY: 'SERIE.JOUR.OUVRE', DATEVALUE: 'DATEVAL', YEARFRAC: 'FRACTION.ANNEE',
    PI: 'PI', RAND: 'ALEA', RANDBETWEEN: 'ALEA.ENTRE.BORNES', CEILING: 'PLAFOND', FLOOR: 'PLANCHER', SIGN: 'SIGNE', EXP: 'EXP', LN: 'LN', LOG: 'LOG',
    LOG10: 'LOG10', EVEN: 'PAIR', ODD: 'IMPAIR', FACT: 'FACT', GCD: 'PGCD', LCM: 'PPCM', QUOTIENT: 'QUOTIENT', SUBTOTAL: 'SOUS.TOTAL', AGGREGATE: 'AGREGAT',
    MEDIAN: 'MEDIANE', MODE: 'MODE', STDEV: 'ECARTYPE', STDEVP: 'ECARTYPEP', VAR: 'VAR', VARP: 'VAR.P', LARGE: 'GRANDE.VALEUR', SMALL: 'PETITE.VALEUR',
    RANK: 'RANG', PERCENTILE: 'CENTILE', QUARTILE: 'QUARTILE', AVERAGEA: 'AVERAGEA', COUNTUNIQUE: 'NB.UNIQUE',
    PMT: 'VPM', FV: 'VC', PV: 'VA', NPV: 'VAN', IRR: 'TRI', RATE: 'TAUX', NPER: 'NPM', IPMT: 'INTPER', PPMT: 'PRINCPER', SLN: 'AMORLIN', DB: 'DB',
    DDB: 'DDB', SYD: 'SYD', XNPV: 'VAN.PAIEMENTS', XIRR: 'TRI.PAIEMENTS', EFFECT: 'TAUX.EFFECTIF', NOMINAL: 'TAUX.NOMINAL', CUMIPMT: 'CUMUL.INTER', CUMPRINC: 'CUMUL.PRINCPER',
    NUMBERTEXT: 'ENLETTRES',
  };
  const EN = {}; for (const [en, fr] of Object.entries(FR)) EN[fr] = en;
  Object.assign(EN, { 'NBVAL': 'COUNTA', 'MAINTENANT': 'NOW', 'NB.JOURS.OUVRES.INTL': 'NETWORKDAYS', 'CONCATENER': 'CONCATENATE', 'ENLETTRE': 'NUMBERTEXT', 'NBLETTRES': 'NUMBERTEXT',
    'ECARTYPE.STANDARD': 'STDEV', 'ECARTYPE.PEARSON': 'STDEVP', 'VAR.S': 'VAR', 'RANG.EQ': 'RANK', 'MODE.SIMPLE': 'MODE', 'AUJOURD\'HUI': 'TODAY', 'PLAFOND.MATH': 'CEILING', 'PLANCHER.MATH': 'FLOOR' });
  const toEn = (n) => { const u = n.toUpperCase(); return EN[u] || u.replace(/^_XLFN\./, ''); };
  const toFr = (n) => FR[n.toUpperCase()] || n.toUpperCase();

  /* aide à la saisie : syntaxe des fonctions courantes */
  const HELP = {
    SUM: ['nombre1; [nombre2]; …', 'Additionne des nombres ou des plages'], AVERAGE: ['nombre1; [nombre2]; …', 'Moyenne'], MIN: ['nombre1; …', 'Plus petite valeur'], MAX: ['nombre1; …', 'Plus grande valeur'],
    COUNT: ['valeur1; …', 'Compte les nombres'], COUNTA: ['valeur1; …', 'Compte les cellules non vides'], COUNTBLANK: ['plage', 'Compte les cellules vides'],
    IF: ['test; valeur_si_vrai; [valeur_si_faux]', 'Choisit une valeur selon une condition'], IFS: ['test1; valeur1; [test2; valeur2]; …', 'Plusieurs conditions'],
    IFERROR: ['valeur; valeur_si_erreur', 'Remplace une erreur'], AND: ['logique1; …', 'VRAI si tout est vrai'], OR: ['logique1; …', 'VRAI si au moins un est vrai'], NOT: ['logique', 'Inverse'],
    ROUND: ['nombre; nb_chiffres', 'Arrondit'], ROUNDUP: ['nombre; nb_chiffres', 'Arrondit vers le haut'], ROUNDDOWN: ['nombre; nb_chiffres', 'Arrondit vers le bas'], INT: ['nombre', 'Partie entière'],
    ABS: ['nombre', 'Valeur absolue'], MOD: ['nombre; diviseur', 'Reste de la division'], SQRT: ['nombre', 'Racine carrée'], POWER: ['nombre; puissance', 'Puissance'], PRODUCT: ['nombre1; …', 'Multiplie'],
    SUMPRODUCT: ['matrice1; [matrice2]; …', 'Somme des produits (aussi pour des sommes conditionnelles)'],
    SUMIF: ['plage; critère; [plage_somme]', 'Somme selon un critère, ex. ">1000" ou "Loyer"'], SUMIFS: ['plage_somme; plage1; critère1; …', 'Somme selon plusieurs critères'],
    COUNTIF: ['plage; critère', 'Compte selon un critère'], COUNTIFS: ['plage1; critère1; …', 'Compte selon plusieurs critères'],
    AVERAGEIF: ['plage; critère; [plage_moyenne]', 'Moyenne selon un critère'], AVERAGEIFS: ['plage_moyenne; plage1; critère1; …', 'Moyenne selon plusieurs critères'],
    MAXIFS: ['plage_max; plage1; critère1; …', 'Maximum selon des critères'], MINIFS: ['plage_min; plage1; critère1; …', 'Minimum selon des critères'],
    VLOOKUP: ['valeur; table; no_colonne; [FAUX pour exact]', 'Cherche dans la 1re colonne et renvoie une colonne'], HLOOKUP: ['valeur; table; no_ligne; [FAUX]', 'Recherche horizontale'],
    XLOOKUP: ['valeur; plage_recherche; plage_résultat; [si_absent]; [mode]', 'Recherche moderne'], INDEX: ['plage; no_ligne; [no_colonne]', 'Valeur à une position'],
    MATCH: ['valeur; plage; [type 0 = exact]', 'Position d\'une valeur'], CHOOSE: ['no; valeur1; valeur2; …', 'Choisit dans une liste'],
    CONCATENATE: ['texte1; texte2; …', 'Assemble des textes'], CONCAT: ['texte1; …', 'Assemble des textes'], TEXTJOIN: ['séparateur; ignorer_vides; texte1; …', 'Assemble avec un séparateur'],
    LEFT: ['texte; [nb]', 'Premiers caractères'], RIGHT: ['texte; [nb]', 'Derniers caractères'], MID: ['texte; début; nb', 'Extrait du texte'], LEN: ['texte', 'Longueur'],
    UPPER: ['texte', 'Majuscules'], LOWER: ['texte', 'Minuscules'], PROPER: ['texte', 'Majuscule à chaque mot'], TRIM: ['texte', 'Supprime les espaces en trop'],
    SUBSTITUTE: ['texte; ancien; nouveau; [no]', 'Remplace un texte'], FIND: ['cherché; texte; [début]', 'Position (sensible à la casse)'], SEARCH: ['cherché; texte; [début]', 'Position'],
    TEXT: ['valeur; format', 'Met en forme, ex. TEXTE(A1;"jj/mm/aaaa")'], VALUE: ['texte', 'Convertit en nombre'],
    TODAY: ['', 'Date du jour'], NOW: ['', 'Date et heure'], DATE: ['année; mois; jour', 'Crée une date'], YEAR: ['date', 'Année'], MONTH: ['date', 'Mois'], DAY: ['date', 'Jour'],
    WEEKDAY: ['date; [type]', 'Jour de la semaine'], EDATE: ['date; mois', 'Date décalée de n mois'], EOMONTH: ['date; mois', 'Dernier jour du mois'],
    DATEDIF: ['début; fin; "y"|"m"|"d"', 'Écart entre deux dates'], NETWORKDAYS: ['début; fin; [fériés]', 'Jours ouvrés'],
    PMT: ['taux; nb_périodes; va; [vc]; [type]', 'Mensualité d\'un emprunt'], FV: ['taux; nper; vpm; [va]; [type]', 'Valeur future'], PV: ['taux; nper; vpm; [vc]; [type]', 'Valeur actuelle'],
    NPV: ['taux; valeur1; …', 'Valeur actuelle nette'], IRR: ['valeurs; [estimation]', 'Taux de rendement interne'], RATE: ['nper; vpm; va; [vc]', 'Taux d\'intérêt'],
    IPMT: ['taux; période; nper; va', 'Part des intérêts'], PPMT: ['taux; période; nper; va', 'Part du capital'], SLN: ['coût; valeur_résiduelle; durée', 'Amortissement linéaire'],
    NUMBERTEXT: ['nombre; [devise]', 'Montant en lettres, ex. ENLETTRES(A1;"francs CFA")'], SUBTOTAL: ['no_fonction; plage', 'Sous-total (9 = somme, 1 = moyenne)'],
    RANK: ['nombre; plage; [ordre]', 'Rang'], LARGE: ['plage; k', 'k-ième plus grande'], SMALL: ['plage; k', 'k-ième plus petite'], MEDIAN: ['nombre1; …', 'Médiane'],
    OFFSET: ['réf; lignes; colonnes; [hauteur]; [largeur]', 'Plage décalée'], INDIRECT: ['texte_réf', 'Référence écrite en texte'], ROW: ['[réf]', 'Numéro de ligne'], COLUMN: ['[réf]', 'Numéro de colonne'],
    ISBLANK: ['valeur', 'Cellule vide ?'], ISNUMBER: ['valeur', 'Nombre ?'], ISERROR: ['valeur', 'Erreur ?'], ISTEXT: ['valeur', 'Texte ?'],
  };

  /* ---------------- Lexeur ---------------- */
  const SHEET_RE = /^(?:'((?:[^']|'')+)'|([A-Za-z_À-ÿ][\wÀ-ÿ.]*))!/;
  const CELL = '\\$?[A-Za-z]{1,3}\\$?\\d+';
  const REF_RE = new RegExp(`^(?:(${CELL})(?::(${CELL}))?|(\\$?[A-Za-z]{1,3}):(\\$?[A-Za-z]{1,3})|(\\$?\\d+):(\\$?\\d+))(?![\\w(.])`);
  const ERR_RE = /^#(?:DIV\/0!|N\/A|VALUE!|VALEUR!|REF!|NAME\?|NOM\?|NUM!|NOMBRE!|NULL!|NUL!|CIRC!)/i;
  function cellPart(s) { const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(s); return { c: colIndex(m[2]), ac: !!m[1], r: +m[4] - 1, ar: !!m[3] }; }

  function tokenize(src, mode = 'en') {
    const out = []; let i = 0;
    while (i < src.length) {
      const rest = src.slice(i), ch = src[i];
      let m;
      if ((m = /^\s+/.exec(rest))) { out.push({ type: 'ws', raw: m[0] }); i += m[0].length; continue; }
      if (ch === '"') {
        let j = i + 1, s = '';
        while (j < src.length) { if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; } s += src[j++]; }
        if (j >= src.length) throw new SyntaxError('guillemet non fermé');
        out.push({ type: 'str', raw: src.slice(i, j + 1), v: s }); i = j + 1; continue;
      }
      if ((m = ERR_RE.exec(rest))) { const code = ERR_EN[m[0].toUpperCase()] || m[0].toUpperCase(); out.push({ type: 'err', raw: m[0], v: code }); i += m[0].length; continue; }
      // nombre : en mode français la virgule entre deux chiffres est décimale
      m = mode === 'fr' ? /^(\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][-+]?\d+)?(?![\w(])/.exec(rest) : /^(\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?(?![\w(])/.exec(rest);
      if (m && !/^\d+:/.test(rest)) { out.push({ type: 'num', raw: m[0], v: parseFloat(m[0].replace(',', '.')) }); i += m[0].length; continue; }
      // référence (avec feuille facultative)
      const sm = SHEET_RE.exec(rest);
      const after = sm ? rest.slice(sm[0].length) : rest;
      if ((m = REF_RE.exec(after))) {
        const ref = { sheet: sm ? (sm[1] !== undefined ? sm[1].replace(/''/g, "'") : sm[2]) : null };
        if (m[1]) { ref.kind = m[2] ? 'range' : 'cell'; ref.a = cellPart(m[1]); ref.b = m[2] ? cellPart(m[2]) : null; }
        else if (m[3]) { ref.kind = 'cols'; const p = (s) => ({ c: colIndex(s.replace('$', '')), ac: s[0] === '$', r: 0, ar: true }); ref.a = p(m[3]); ref.b = p(m[4]); ref.a.r = 0; ref.b.r = MAXR - 1; }
        else { ref.kind = 'rows'; const p = (s) => ({ r: +s.replace('$', '') - 1, ar: s[0] === '$', c: 0, ac: true }); ref.a = p(m[5]); ref.b = p(m[6]); ref.b.c = MAXC - 1; }
        if (ref.a.r < MAXR && ref.a.c < MAXC && (!ref.b || (ref.b.r < MAXR && ref.b.c < MAXC))) {
          const len = (sm ? sm[0].length : 0) + m[0].length;
          out.push({ type: 'ref', raw: src.slice(i, i + len), ref }); i += len; continue;
        }
      }
      if ((m = /^[A-Za-z_À-ÿ][\wÀ-ÿ.']*/.exec(rest))) {
        const name = m[0];
        const next = src.slice(i + name.length).match(/^\s*\(/);
        const u = name.toUpperCase();
        if (!next && /^(TRUE|FALSE|VRAI|FAUX)$/.test(u)) out.push({ type: 'bool', raw: name, v: u === 'TRUE' || u === 'VRAI' });
        else out.push({ type: next ? 'fn' : 'name', raw: name, name: u });
        i += name.length; continue;
      }
      if ((m = /^(<>|<=|>=|[-+*/^&=<>%])/.exec(rest))) { out.push({ type: 'op', raw: m[0], v: m[0] }); i += m[0].length; continue; }
      if (ch === '(') { out.push({ type: 'lp', raw: ch }); i++; continue; }
      if (ch === ')') { out.push({ type: 'rp', raw: ch }); i++; continue; }
      if (ch === ';' || ch === ',') { out.push({ type: 'sep', raw: ch }); i++; continue; }
      if (ch === '{' || ch === '}') throw new SyntaxError('les matrices { } ne sont pas prises en charge');
      throw new SyntaxError(`caractère inattendu « ${ch} »`);
    }
    return out;
  }

  /* ---------------- Analyseur ---------------- */
  function parse(src) {
    const toks = tokenize(src, 'en').filter((t) => t.type !== 'ws'); let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const isOp = (...ops) => peek() && peek().type === 'op' && ops.includes(peek().v);
    function expr() { return compare(); }
    function compare() { let a = concat(); while (isOp('=', '<>', '<', '>', '<=', '>=')) { const op = next().v; a = { t: 'bin', op, a, b: concat() }; } return a; }
    function concat() { let a = add(); while (isOp('&')) { next(); a = { t: 'bin', op: '&', a, b: add() }; } return a; }
    function add() { let a = mul(); while (isOp('+', '-')) { const op = next().v; a = { t: 'bin', op, a, b: mul() }; } return a; }
    function mul() { let a = pow(); while (isOp('*', '/')) { const op = next().v; a = { t: 'bin', op, a, b: pow() }; } return a; }
    function pow() { let a = unary(); while (isOp('^')) { next(); a = { t: 'bin', op: '^', a, b: unary() }; } return a; }
    function unary() { if (isOp('+', '-')) { const op = next().v; return { t: 'un', op, a: unary() }; } return postfix(); }
    function postfix() { let a = primary(); while (isOp('%')) { next(); a = { t: 'pct', a }; } return a; }
    function primary() {
      const t = next();
      if (!t) throw new SyntaxError('formule incomplète');
      switch (t.type) {
        case 'num': return { t: 'num', v: t.v };
        case 'str': return { t: 'str', v: t.v };
        case 'bool': return { t: 'bool', v: t.v };
        case 'err': return { t: 'err', v: t.v };
        case 'ref': return { t: 'ref', ref: t.ref };
        case 'name': return { t: 'name', name: t.name };
        case 'lp': { const e = expr(); if (!peek() || peek().type !== 'rp') throw new SyntaxError('parenthèse fermante manquante'); next(); return e; }
        case 'fn': {
          next(); // (
          const args = [];
          if (peek() && peek().type === 'rp') { next(); return { t: 'fn', name: toEn(t.name), args }; }
          for (;;) {
            if (peek() && (peek().type === 'sep' || peek().type === 'rp')) args.push({ t: 'empty' }); else args.push(expr());
            const s = next();
            if (!s) throw new SyntaxError('parenthèse fermante manquante');
            if (s.type === 'rp') break;
            if (s.type !== 'sep') throw new SyntaxError('« ; » ou « ) » attendu');
          }
          return { t: 'fn', name: toEn(t.name), args };
        }
        default: throw new SyntaxError(`« ${t.raw} » inattendu`);
      }
    }
    const e = expr();
    if (p < toks.length) throw new SyntaxError(`« ${toks[p].raw} » inattendu`);
    return e;
  }

  /* ---------------- Conversion français ↔ canonique, décalage des références ---------------- */
  const quoteSheet = (n) => (/^[A-Za-z_À-ÿ][\wÀ-ÿ.]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`);
  function refText(ref) {
    const sh = ref.sheet != null ? quoteSheet(ref.sheet) + '!' : '';
    const cp = (x) => (x.ac ? '$' : '') + colName(x.c) + (x.ar ? '$' : '') + (x.r + 1);
    if (ref.kind === 'cols') return sh + (ref.a.ac ? '$' : '') + colName(ref.a.c) + ':' + (ref.b.ac ? '$' : '') + colName(ref.b.c);
    if (ref.kind === 'rows') return sh + (ref.a.ar ? '$' : '') + (ref.a.r + 1) + ':' + (ref.b.ar ? '$' : '') + (ref.b.r + 1);
    return sh + cp(ref.a) + (ref.b ? ':' + cp(ref.b) : '');
  }
  function canonicalize(text) { // saisie (français ou anglais) → forme canonique
    return tokenize(text, 'fr').map((t) => {
      if (t.type === 'sep') return ',';
      if (t.type === 'num') return t.raw.replace(',', '.');
      if (t.type === 'fn') return toEn(t.name);
      if (t.type === 'bool') return t.v ? 'TRUE' : 'FALSE';
      if (t.type === 'err') return t.v;
      return t.raw;
    }).join('');
  }
  function localize(f) { // forme canonique → affichage français
    try {
      return tokenize(f, 'en').map((t) => {
        if (t.type === 'sep') return ';';
        if (t.type === 'num') return t.raw.replace('.', ',');
        if (t.type === 'fn') return toFr(t.name.replace(/^_XLFN\./, ''));
        if (t.type === 'bool') return t.v ? 'VRAI' : 'FAUX';
        if (t.type === 'err') return errFr(t.v);
        return t.raw;
      }).join('');
    } catch (e) { return f; }
  }
  /* Réécrit chaque référence : fn(ref) renvoie la référence modifiée, ou null pour #REF!. */
  function mapRefs(f, fn) {
    try {
      return tokenize(f, 'en').map((t) => {
        if (t.type !== 'ref') return t.raw;
        const r = fn(JSON.parse(JSON.stringify(t.ref)));
        return r ? refText(r) : '#REF!';
      }).join('');
    } catch (e) { return f; }
  }
  /* Copie d'une formule décalée de (dr, dc) : les références relatives suivent. */
  function shiftFormula(f, dr, dc) {
    return mapRefs(f, (ref) => {
      const mv = (x) => { if (!x.ar && ref.kind !== 'cols') x.r += dr; if (!x.ac && ref.kind !== 'rows') x.c += dc; return x.r >= 0 && x.c >= 0 && x.r < MAXR && x.c < MAXC; };
      if (!mv(ref.a)) return null; if (ref.b && !mv(ref.b)) return null; return ref;
    });
  }
  /* Insertion (count > 0) ou suppression (count < 0) de lignes/colonnes à `at` dans la feuille `sheetName`. */
  function adjustForStructure(f, ownSheet, sheetName, axis, at, count) {
    return mapRefs(f, (ref) => {
      const target = ref.sheet == null ? ownSheet : ref.sheet;
      if (target.toLowerCase() !== sheetName.toLowerCase()) return ref;
      const k = axis === 'row' ? 'r' : 'c';
      if ((axis === 'row' && ref.kind === 'cols') || (axis === 'col' && ref.kind === 'rows')) return ref;
      const pts = ref.b ? [ref.a, ref.b] : [ref.a];
      if (count > 0) { pts.forEach((x) => { if (x[k] >= at) x[k] += count; }); return ref; }
      const n = -count, end = at + n - 1;
      if (!ref.b) { if (ref.a[k] >= at && ref.a[k] <= end) return null; if (ref.a[k] > end) ref.a[k] -= n; return ref; }
      let lo = ref.a[k], hi = ref.b[k];
      if (lo >= at && hi <= end) return null;
      const adj = (x) => (x > end ? x - n : x >= at ? at : x);
      lo = adj(lo); hi = hi > end ? hi - n : hi >= at ? at - 1 : hi;
      if (hi < lo) return null; ref.a[k] = lo; ref.b[k] = hi; return ref;
    });
  }
  function renameSheetInFormula(f, oldName, newName) {
    return mapRefs(f, (ref) => { if (ref.sheet && ref.sheet.toLowerCase() === oldName.toLowerCase()) ref.sheet = newName; return ref; });
  }
  /* noms de fonctions proposés pendant la saisie */
  function suggest(prefix) {
    const u = prefix.toUpperCase(); if (!u) return [];
    const frNames = new Set([...Object.values(FR), ...Object.keys(window.formulajs || {}).filter((k) => /^[A-Z][A-Z0-9.]*$/.test(k)).map(toFr)]);
    return [...frNames].filter((n) => n.startsWith(u) && n !== 'VRAI' && n !== 'FAUX').sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 8);
  }
  const functionList = () => Object.entries(HELP).map(([en, h]) => ({ name: toFr(en), args: h[0], desc: h[1] })).sort((a, b) => a.name.localeCompare(b.name));
  function help(frName) { const en = toEn(frName); const h = HELP[en]; return h ? { name: toFr(en), args: h[0], desc: h[1] } : null; }

  /* ---------------- Dates ---------------- */
  const EPOCH = Date.UTC(1899, 11, 30), DAY = 86400000;
  const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - EPOCH) / DAY;
  const fromSerial = (n) => new Date(EPOCH + Math.floor(n + 1e-9) * DAY);
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MONTHS_S = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const todaySerial = () => { const d = new Date(); return serial(d.getFullYear(), d.getMonth() + 1, d.getDate()); };

  /* ---------------- Formats de nombres (codes Excel, rendu français) ---------------- */
  const NBSP = ' ';
  function splitSections(fmt) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < fmt.length; i++) { const ch = fmt[i]; if (ch === '"') q = !q; if (ch === '\\' && !q) { cur += ch + (fmt[i + 1] || ''); i++; continue; } if (ch === ';' && !q) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out;
  }
  const stripQuoted = (s) => s.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '');
  const isDateFormat = (fmt) => /[dmyhsjaDMYHSJA]/.test(stripQuoted(String(fmt || '').split(';')[0]).replace(/General|Standard|E[+-]/gi, ''));
  function generalNumber(v) {
    if (!isFinite(v)) return err(E.NUM).code;
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e11 || a < 1e-9) return v.toExponential(5).replace(/\.?0+e/, 'e').replace('.', ',').replace('e', 'E').replace(/E\+?(-?)(\d)$/, 'E$1+0$2').replace('E+-', 'E-');
    let s = String(+v.toPrecision(11));
    if (/e/.test(s)) s = v.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',');
  }
  function groupInt(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); }
  function formatNumberSection(v, sec) {
    let color = null; const cm = /\[(Red|Rouge|Blue|Bleu|Green|Vert|Black|Noir|Magenta|Cyan|Yellow|Jaune|White|Blanc)\]/i.exec(sec);
    if (cm) color = { red: '#c00000', rouge: '#c00000', blue: '#1f4fd1', bleu: '#1f4fd1', green: '#2b8a3e', vert: '#2b8a3e', black: '#000', noir: '#000', magenta: '#c0c', cyan: '#0aa', yellow: '#b8a000', jaune: '#b8a000', white: '#fff', blanc: '#fff' }[cm[1].toLowerCase()];
    sec = sec.replace(/\[[^\]]*\]/g, '');
    if (/^\s*(General|Standard)\s*$/i.test(sec)) return { text: generalNumber(v), color };
    // repère la zone numérique (0 # ? , .) hors texte entre guillemets
    let start = -1, end = -1, q = false;
    for (let i = 0; i < sec.length; i++) { const ch = sec[i]; if (ch === '"') { q = !q; continue; } if (q) continue; if (ch === '\\') { i++; continue; } if ('0#?'.includes(ch)) { if (start < 0) start = i; end = i; } else if ((ch === ',' || ch === '.' || ch === ' ') && start >= 0 && /[0#?]/.test(sec.slice(i + 1).replace(/"[^"]*"/g, '').charAt(0))) end = i; }
    const lit = (s) => s.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace(/_.?/g, ' ').replace(/\*./g, '');
    if (start < 0) return { text: lit(sec), color };
    const pre = sec.slice(0, start), num = sec.slice(start, end + 1), post = sec.slice(end + 1);
    const pct = /%/.test(stripQuoted(pre + post));
    if (pct) v *= 100;
    const sci = /^E[+-]/i.test(post.trim());
    const dot = num.indexOf('.');
    const intPart = dot >= 0 ? num.slice(0, dot) : num, decPart = dot >= 0 ? num.slice(dot + 1) : '';
    const minDec = (decPart.match(/0/g) || []).length, maxDec = (decPart.match(/[0#?]/g) || []).length;
    const grouping = /[0#?][, ][0#?]/.test(intPart);
    const minInt = (intPart.match(/0/g) || []).length;
    let s;
    if (sci) { const m = post.trim().match(/^E([+-])(0+)/i); const e = v === 0 ? 0 : Math.floor(Math.log10(Math.abs(v))); const mant = (Math.abs(v) / 10 ** e).toFixed(maxDec); const ee = String(Math.abs(e)).padStart(m ? m[2].length : 2, '0'); return { text: lit(pre) + (v < 0 ? '-' : '') + mant.replace('.', ',') + 'E' + (e < 0 ? '-' : '+') + ee + lit(post.trim().slice(m ? m[0].length : 0)), color }; }
    const fixed = Math.abs(v).toFixed(maxDec);
    let [ip, dp = ''] = fixed.split('.');
    while (dp.length > minDec && dp.endsWith('0')) dp = dp.slice(0, -1);
    if (ip === '0' && minInt === 0) ip = '';
    ip = ip.padStart(minInt, '0');
    if (grouping) ip = groupInt(ip);
    s = ip + (dp.length || (dot >= 0 && minDec) ? ',' + dp : '');
    return { text: lit(pre) + s + lit(post), color };
  }
  function formatDate(v, sec) {
    sec = sec.replace(/\[[^\]]*\]/g, '');
    const d = fromSerial(v); const frac = v - Math.floor(v + 1e-9); let secs = Math.round(frac * 86400); if (secs >= 86400) secs = 86399;
    const H = Math.floor(secs / 3600), Mi = Math.floor(secs / 60) % 60, S = secs % 60;
    const ampm = /AM\/PM|A\/P/i.test(sec);
    const toks = []; const re = /"[^"]*"|\\.|AM\/PM|A\/P|y+|a+|m+|d+|j+|h+|s+|./gi; let m;
    while ((m = re.exec(sec))) toks.push(m[0]);
    let out = '';
    toks.forEach((t, i) => {
      const lo = t.toLowerCase();
      if (t[0] === '"') { out += t.slice(1, -1); return; }
      if (t[0] === '\\') { out += t[1]; return; }
      if (/^(am\/pm|a\/p)$/.test(lo)) { out += H < 12 ? 'AM' : 'PM'; return; }
      const c = lo[0], n = lo.length;
      if (c === 'y' || c === 'a') { out += n <= 2 ? String(d.getUTCFullYear()).slice(-2) : d.getUTCFullYear(); return; }
      if (c === 'd' || c === 'j') { out += n === 1 ? d.getUTCDate() : n === 2 ? String(d.getUTCDate()).padStart(2, '0') : n === 3 ? DAYS[d.getUTCDay()].slice(0, 3) + '.' : DAYS[d.getUTCDay()]; return; }
      if (c === 'h') { const h = ampm ? ((H + 11) % 12) + 1 : H; out += n >= 2 ? String(h).padStart(2, '0') : h; return; }
      if (c === 's') { out += n >= 2 ? String(S).padStart(2, '0') : S; return; }
      if (c === 'm') {
        // minutes si précédé d'une heure ou suivi de secondes
        const prev = toks.slice(0, i).reverse().find((x) => /^[a-z]/i.test(x) && !/^"/.test(x)); const nxt = toks.slice(i + 1).find((x) => /^[a-z]/i.test(x) && !/^"/.test(x));
        if (n <= 2 && ((prev && /^h/i.test(prev)) || (nxt && /^s/i.test(nxt)))) { out += n === 2 ? String(Mi).padStart(2, '0') : Mi; return; }
        out += n === 1 ? d.getUTCMonth() + 1 : n === 2 ? String(d.getUTCMonth() + 1).padStart(2, '0') : n === 3 ? MONTHS_S[d.getUTCMonth()] : n === 5 ? MONTHS[d.getUTCMonth()][0].toUpperCase() : MONTHS[d.getUTCMonth()];
        return;
      }
      out += t;
    });
    return out;
  }
  /* Valeur → { text, color, align } */
  function format(v, fmt) {
    if (v === null || v === undefined || v === '') return { text: '' };
    if (isErr(v)) return { text: errFr(v.code), align: 'center' };
    if (typeof v === 'boolean') return { text: v ? 'VRAI' : 'FAUX', align: 'center' };
    fmt = fmt || 'General';
    const secs = splitSections(fmt);
    if (typeof v === 'string') { const t = secs[3] !== undefined ? secs[3] : secs.find((s) => s.includes('@')); return { text: t && t.includes('@') ? t.replace(/"([^"]*)"/g, '$1').replace('@', v) : v, align: 'left' }; }
    if (typeof v !== 'number') return { text: String(v) };
    if (secs[0] === '@') return { text: generalNumber(v), align: 'left' };
    let sec = secs[0], val = v;
    if (v < 0 && secs.length > 1 && secs[1] !== '') { sec = secs[1]; val = -v; } else if (v === 0 && secs.length > 2 && secs[2] !== '') sec = secs[2];
    if (isDateFormat(sec)) { if (v < 0 || v > 2958465) return { text: '#'.repeat(6), align: 'right' }; return { text: formatDate(val, sec), align: 'right' }; }
    const r = formatNumberSection(val, sec);
    if (v < 0 && (secs.length < 2 || secs[1] === '') && r.text && !/^-/.test(r.text) && Math.abs(v) > 0) {
      // le signe moins n'est pas dans le format : on l'ajoute (sauf si le nombre affiché vaut zéro)
      if (/[1-9]/.test(r.text)) r.text = '-' + r.text;
    }
    r.align = 'right'; return r;
  }
  const NUM_FORMATS = [
    ['General', 'Standard'], ['#,##0', 'Nombre sans décimale (1 234)'], ['#,##0.00', 'Nombre (1 234,56)'], ['#,##0" FCFA"', 'Monétaire FCFA'],
    ['#,##0.00" €"', 'Monétaire euro'], ['0%', 'Pourcentage (12 %)'], ['0.00%', 'Pourcentage (12,34 %)'], ['dd/mm/yyyy', 'Date courte (10/10/2026)'],
    ['dddd d mmmm yyyy', 'Date longue (samedi 10 octobre 2026)'], ['mmmm yyyy', 'Mois et année'], ['hh:mm', 'Heure (14:30)'], ['dd/mm/yyyy hh:mm', 'Date et heure'],
    ['#,##0;[Red]-#,##0', 'Négatifs en rouge'], ['0.00E+00', 'Scientifique'], ['@', 'Texte'],
  ];

  /* ---------------- Saisie dans une cellule ---------------- */
  function parseNumberText(s) {
    let t = String(s).trim().replace(/[   ]/g, '');
    let neg = false; if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (!/^[-+]?(\d+([.,]\d+)?|[.,]\d+)([eE][-+]?\d+)?$/.test(t)) return null;
    const n = parseFloat(t.replace(',', '.')); return neg ? -n : n;
  }
  function parseInput(text) {
    if (text === null || text === undefined) return { v: null };
    const s = String(text);
    if (s === '') return { v: null };
    if (s[0] === '=' && s.length > 1) return { f: canonicalize(s.slice(1)) };
    if (s[0] === "'") return { v: s.slice(1) };
    const u = s.trim().toUpperCase();
    if (u === 'VRAI' || u === 'TRUE') return { v: true }; if (u === 'FAUX' || u === 'FALSE') return { v: false };
    let n = parseNumberText(s); if (n !== null) return { v: n };
    let m;
    if ((m = /^\s*([-+]?[\d\s  ]+(?:[.,]\d+)?)\s*%\s*$/.exec(s)) && (n = parseNumberText(m[1])) !== null) return { v: n / 100, fmt: /[.,]/.test(m[1]) ? '0.00%' : '0%' };
    if ((m = /^\s*([-+]?[\d\s  ]+(?:[.,]\d+)?)\s*(FCFA|F\s?CFA|XOF|F|€|EUR|\$)\s*$/i.exec(s)) && (n = parseNumberText(m[1])) !== null) {
      const cur = m[2].toUpperCase(); return { v: n, fmt: cur === '€' || cur === 'EUR' ? '#,##0.00" €"' : cur === '$' ? '"$"#,##0.00' : '#,##0" FCFA"' };
    }
    if ((m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\s*$/.exec(s))) {
      let y = +m[3]; if (y < 100) y += y < 50 ? 2000 : 1900; const mo = +m[2], d = +m[1];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { v: serial(y, mo, d), fmt: 'dd/mm/yyyy' };
    }
    if ((m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(s))) return { v: serial(+m[1], +m[2], +m[3]), fmt: 'dd/mm/yyyy' };
    if ((m = /^\s*(\d{1,2})[/.-](\d{1,2})\s*$/.exec(s)) && +m[2] <= 12 && +m[1] <= 31) return { v: serial(new Date().getFullYear(), +m[2], +m[1]), fmt: 'dd/mm/yyyy' };
    if ((m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(s))) return { v: (+m[1] * 3600 + +m[2] * 60 + +(m[3] || 0)) / 86400, fmt: m[3] ? 'hh:mm:ss' : 'hh:mm' };
    return { v: s };
  }

  /* ---------------- Évaluation ---------------- */
  class Rng { constructor(s, r1, c1, r2, c2) { Object.assign(this, { s, r1, c1, r2, c2 }); } get rows() { return this.r2 - this.r1 + 1; } get cols() { return this.c2 - this.c1 + 1; } }

  function createEngine(api) {
    // api : { sheetIndex(name) → index|-1, sheetName(i), getCell(s, r, c) → {v, f}|undefined, used(s) → {rows, cols}, formulas() → [[s, r, c], …] }
    const cache = new Map(), computing = new Set(), astCache = new Map();
    const key = (s, r, c) => s * 1e11 + r * MAXC + c;

    function ast(f) {
      let a = astCache.get(f);
      if (!a) { try { a = parse(f); } catch (e) { a = { t: 'err', v: E.NAME, parseError: e.message }; } astCache.set(f, a); if (astCache.size > 20000) astCache.clear(); }
      return a;
    }
    function value(s, r, c) {
      const k = key(s, r, c);
      if (cache.has(k)) return cache.get(k);
      const cell = api.getCell(s, r, c);
      if (!cell) return null;
      if (cell.f == null) return cell.v === undefined ? null : cell.v;
      if (computing.has(k)) return err(E.CIRC);
      computing.add(k);
      let v;
      try { v = finalValue(evalNode(ast(cell.f), { s, r, c }), { s, r, c }); } catch (e) { v = e instanceof FErr ? e : (console.warn(e), err(E.VALUE)); }
      computing.delete(k);
      if (typeof v === 'number' && !isFinite(v)) v = err(E.NUM);
      cache.set(k, v);
      return v;
    }
    function recalc() { cache.clear(); for (const [s, r, c] of api.formulas()) value(s, r, c); }
    function invalidate() { cache.clear(); }
    function evalFormula(f, ctx) { try { return finalValue(evalNode(parse(f), ctx), ctx); } catch (e) { return e instanceof FErr ? e : err(E.VALUE); } }

    /* ---- conversions ---- */
    function rangeValues(g) {
      const u = api.used(g.s); const r2 = Math.min(g.r2, u.rows - 1), c2 = Math.min(g.c2, u.cols - 1);
      const R = Math.max(0, r2 - g.r1 + 1), C = Math.max(0, c2 - g.c1 + 1);
      const out = new Array(Math.max(R, 1));
      if (!R || !C) { // plage entièrement vide : on garde sa forme logique (bornée) pour les fonctions de recherche
        const rr = Math.min(g.rows, 1), cc = Math.min(g.cols, 1); return Array.from({ length: rr }, () => new Array(cc).fill(null));
      }
      for (let i = 0; i < R; i++) { const row = out[i] = new Array(C); for (let j = 0; j < C; j++) row[j] = value(g.s, g.r1 + i, g.c1 + j); }
      return out;
    }
    const toArr = (v) => (v instanceof Rng ? rangeValues(v) : Array.isArray(v) ? v : [[v]]);
    function scalar(v, ctx) {
      if (v instanceof Rng) {
        if (v.rows === 1 && v.cols === 1) return value(v.s, v.r1, v.c1);
        if (ctx && v.cols === 1 && ctx.s === v.s && ctx.r >= v.r1 && ctx.r <= v.r2) return value(v.s, ctx.r, v.c1); // intersection implicite
        if (ctx && v.rows === 1 && ctx.s === v.s && ctx.c >= v.c1 && ctx.c <= v.c2) return value(v.s, v.r1, ctx.c);
        return err(E.VALUE);
      }
      if (Array.isArray(v)) return v.length && v[0].length ? v[0][0] : null;
      return v;
    }
    function finalValue(v, ctx) { v = scalar(v, ctx); return v === undefined ? null : v; }
    function num(v) {
      if (isErr(v)) throw v;
      if (v === null || v === undefined || v === '') return 0;
      if (typeof v === 'number') return v;
      if (typeof v === 'boolean') return v ? 1 : 0;
      const p = parseInput(String(v));
      if (p.v !== undefined && typeof p.v === 'number') return p.v;
      throw err(E.VALUE);
    }
    function str(v) {
      if (isErr(v)) throw v;
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
      if (typeof v === 'number') return generalNumber(v);
      return String(v);
    }
    function bool(v) {
      if (isErr(v)) throw v;
      if (typeof v === 'boolean') return v; if (v === null) return false; if (typeof v === 'number') return v !== 0;
      const u = String(v).toUpperCase(); if (u === 'VRAI' || u === 'TRUE') return true; if (u === 'FAUX' || u === 'FALSE') return false;
      throw err(E.VALUE);
    }
    /* valeurs « numériques » des arguments (SOMME…) : dans les plages on ignore texte et booléens */
    function nums(args, { countText = false } = {}) {
      const out = [];
      for (const a of args) {
        if (a instanceof Rng || Array.isArray(a)) { for (const row of toArr(a)) for (const x of row) { if (isErr(x)) throw x; if (typeof x === 'number') out.push(x); else if (countText && x !== null && x !== '') out.push(typeof x === 'boolean' ? +x : 0); } }
        else if (a !== undefined && !(a && a.empty)) out.push(num(a));
      }
      return out;
    }
    function cmp(a, b) { // ordre Excel : nombres < textes < booléens ; texte insensible à la casse
      const rank = (x) => (x === null ? 0 : typeof x === 'number' ? 1 : typeof x === 'string' ? 2 : 3);
      if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
      if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
      const ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb;
      if (typeof a === 'string') { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
      return a < b ? -1 : a > b ? 1 : 0;
    }
    /* critères des fonctions .SI : ">1000", "<>", "Loyer*", 5 … */
    function criterion(crit) {
      if (isErr(crit)) throw crit;
      if (typeof crit === 'number' || typeof crit === 'boolean') return (x) => x === crit || (typeof crit === 'number' && typeof x === 'string' && parseNumberText(x) === crit);
      let s = crit === null ? '' : String(crit);
      const m = /^(<>|>=|<=|=|>|<)?([\s\S]*)$/.exec(s); const op = m[1] || '=', rest = m[2];
      const n = rest === '' ? null : parseNumberText(rest);
      const dateLike = n === null && rest ? parseInput(rest) : null;
      const target = n !== null ? n : dateLike && typeof dateLike.v === 'number' ? dateLike.v : rest;
      if (typeof target === 'number') {
        return (x) => {
          const xv = typeof x === 'number' ? x : null;
          if (op === '=') return xv === target; if (op === '<>') return xv !== target;
          if (xv === null) return false;
          return op === '>' ? xv > target : op === '<' ? xv < target : op === '>=' ? xv >= target : xv <= target;
        };
      }
      const t = target.toLowerCase();
      if (op === '=' || op === '<>') {
        let test;
        if (t === '') test = (x) => x === null || x === '';
        else if (/[*?]/.test(t)) { const re = new RegExp('^' + t.replace(/~([*?])|([.+^${}()|[\]\\])|(\*)|(\?)/g, (a, esc, sp, st, q) => (esc ? '\\' + esc : sp ? '\\' + sp : st ? '[\\s\\S]*' : '.')) + '$', 'i'); test = (x) => typeof x === 'string' && re.test(x); }
        else test = (x) => x !== null && String(typeof x === 'boolean' ? (x ? 'vrai' : 'faux') : x).toLowerCase() === t;
        return op === '=' ? test : (x) => (t === '' ? !(x === null || x === '') : !test(x));
      }
      return (x) => { if (typeof x !== 'string') return false; const c = x.toLowerCase().localeCompare(t); return op === '>' ? c > 0 : op === '<' ? c < 0 : op === '>=' ? c >= 0 : c <= 0; };
    }
    const flatVals = (v) => toArr(v).flat();
    function multiCrit(pairs) { // [[plage, critère], …] → masque
      const ranges = pairs.map(([r]) => flatVals(r)); const tests = pairs.map(([, c]) => criterion(scalar(c)));
      const n = ranges.length ? Math.max(...ranges.map((x) => x.length)) : 0;
      if (ranges.some((x) => x.length !== n)) throw err(E.VALUE);
      return Array.from({ length: n }, (_, i) => tests.every((t, j) => t(ranges[j][i])));
    }
    function sizedLike(target, src) { // plage de somme : même forme que la plage de critère (comme Excel)
      if (!(target instanceof Rng) || !(src instanceof Rng)) return flatVals(target);
      return flatVals(new Rng(target.s, target.r1, target.c1, target.r1 + src.rows - 1, target.c1 + src.cols - 1));
    }

    function lookupExact(arr, v) {
      const t = criterion(typeof v === 'string' ? v.replace(/^([<>=])/, '=$1') : v);
      for (let i = 0; i < arr.length; i++) if (typeof v === 'string' ? t(arr[i]) : cmp(arr[i], v) === 0 && arr[i] !== null) return i;
      return -1;
    }
    function lookupApprox(arr, v, desc = false) {
      let best = -1;
      for (let i = 0; i < arr.length; i++) { const x = arr[i]; if (x === null || typeof x !== typeof v) continue; const c = cmp(x, v); if (desc ? c >= 0 : c <= 0) best = i; else if (!desc) break; }
      return best;
    }

    /* ---- opérateurs, avec calcul sur des tableaux (SOMMEPROD((A1:A9>0)*B1:B9)) ---- */
    function binop(op, a, b, ctx) {
      const arrA = a instanceof Rng && !(a.rows === 1 && a.cols === 1) || Array.isArray(a);
      const arrB = b instanceof Rng && !(b.rows === 1 && b.cols === 1) || Array.isArray(b);
      if (ctx.array && (arrA || arrB)) {
        const A = toArr(a), B = toArr(b); const R = Math.max(A.length, B.length), C = Math.max(A[0].length, B[0].length);
        const at = (M, i, j) => (M.length === 1 ? (M[0].length === 1 ? M[0][0] : M[0][j]) : M[0].length === 1 ? M[i][0] : (M[i] || [])[j]);
        return Array.from({ length: R }, (_, i) => Array.from({ length: C }, (_, j) => { try { return op1(op, at(A, i, j) ?? null, at(B, i, j) ?? null); } catch (e) { if (e instanceof FErr) return e; throw e; } }));
      }
      return op1(op, scalar(a, ctx), scalar(b, ctx));
    }
    function op1(op, a, b) {
      if (op === '&') return str(a) + str(b);
      if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
        if (isErr(a)) throw a; if (isErr(b)) throw b;
        const c = cmp(a, b);
        return op === '=' ? c === 0 : op === '<>' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
      }
      const x = num(a), y = num(b);
      switch (op) {
        case '+': return x + y; case '-': return x - y; case '*': return x * y;
        case '/': if (y === 0) throw err(E.DIV0); return x / y;
        case '^': { const r = Math.pow(x, y); if (!isFinite(r) || Number.isNaN(r)) throw err(E.NUM); return r; }
      }
      throw err(E.VALUE);
    }

    function resolveRef(ref, ctx) {
      let s = ctx.s;
      if (ref.sheet != null) { s = api.sheetIndex(ref.sheet); if (s < 0) throw err(E.REF); }
      const b = ref.b || ref.a;
      return new Rng(s, Math.min(ref.a.r, b.r), Math.min(ref.a.c, b.c), Math.max(ref.a.r, b.r), Math.max(ref.a.c, b.c));
    }

    function evalNode(n, ctx) {
      switch (n.t) {
        case 'num': case 'str': case 'bool': return n.v;
        case 'err': throw err(n.v);
        case 'empty': return { empty: true };
        case 'ref': return resolveRef(n.ref, ctx);
        case 'name': throw err(E.NAME);
        case 'un': { const v = evalNode(n.a, ctx); if (ctx.array && (v instanceof Rng || Array.isArray(v))) return toArr(v).map((row) => row.map((x) => (n.op === '-' ? -num(x) : num(x)))); const x = num(scalar(v, ctx)); return n.op === '-' ? -x : x; }
        case 'pct': return num(scalar(evalNode(n.a, ctx), ctx)) / 100;
        case 'bin': return binop(n.op, evalNode(n.a, ctx), evalNode(n.b, ctx), ctx);
        case 'fn': return callFn(n, ctx);
      }
      throw err(E.VALUE);
    }

    /* ---- fonctions ---- */
    const lazy = {
      IF(args, ctx, ev) { const t = bool(scalar(ev(0), ctx)); if (t) return args.length > 1 ? ev(1) : true; return args.length > 2 ? ev(2) : false; },
      IFERROR(args, ctx, ev) { try { const v = scalar(ev(0), ctx); if (isErr(v)) throw v; return v; } catch (e) { if (e instanceof FErr) return ev(1); throw e; } },
      IFNA(args, ctx, ev) { try { const v = scalar(ev(0), ctx); if (isErr(v)) throw v; return v; } catch (e) { if (e instanceof FErr && e.code === E.NA) return ev(1); throw e; } },
      IFS(args, ctx, ev) { for (let i = 0; i + 1 < args.length; i += 2) if (bool(scalar(ev(i), ctx))) return ev(i + 1); throw err(E.NA); },
      SWITCH(args, ctx, ev) { const v = scalar(ev(0), ctx); let i = 1; for (; i + 1 < args.length; i += 2) if (cmp(scalar(ev(i), ctx), v) === 0) return ev(i + 1); if (i < args.length) return ev(i); throw err(E.NA); },
      CHOOSE(args, ctx, ev) { const k = Math.trunc(num(scalar(ev(0), ctx))); if (k < 1 || k >= args.length) throw err(E.VALUE); return ev(k); },
      SUMPRODUCT(args, ctx, ev) {
        const arrs = args.map((_, i) => toArr(ev(i, true)));
        const R = arrs[0].length, C = arrs[0][0].length;
        if (arrs.some((a) => a.length !== R || a[0].length !== C)) throw err(E.VALUE);
        let s = 0;
        for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { let p = 1; for (const a of arrs) { const x = a[i][j]; if (isErr(x)) throw x; p *= typeof x === 'number' ? x : typeof x === 'boolean' ? +x : 0; } s += p; }
        return s;
      },
    };
    const fns = {
      SUM: (a) => nums(a).reduce((x, y) => x + y, 0),
      AVERAGE: (a) => { const v = nums(a); if (!v.length) throw err(E.DIV0); return v.reduce((x, y) => x + y, 0) / v.length; },
      AVERAGEA: (a) => { const v = nums(a, { countText: true }); if (!v.length) throw err(E.DIV0); return v.reduce((x, y) => x + y, 0) / v.length; },
      MIN: (a) => { const v = nums(a); return v.length ? Math.min(...v) : 0; },
      MAX: (a) => { const v = nums(a); return v.length ? Math.max(...v) : 0; },
      PRODUCT: (a) => { const v = nums(a); return v.length ? v.reduce((x, y) => x * y, 1) : 0; },
      SUMSQ: (a) => nums(a).reduce((x, y) => x + y * y, 0),
      COUNT: (a) => { let n = 0; for (const x of a) { if (x instanceof Rng || Array.isArray(x)) { for (const row of toArr(x)) for (const y of row) if (typeof y === 'number') n++; } else if (typeof x === 'number' || (typeof x === 'string' && parseNumberText(x) !== null)) n++; } return n; },
      COUNTA: (a) => { let n = 0; for (const x of a) { if (x instanceof Rng || Array.isArray(x)) { for (const row of toArr(x)) for (const y of row) if (y !== null && y !== '') n++; } else if (!(x && x.empty)) n++; } return n; },
      COUNTBLANK: (a) => { if (!(a[0] instanceof Rng)) throw err(E.VALUE); const g = a[0]; let n = 0; for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const v = value(g.s, r, c); if (v === null || v === '') n++; } return n; },
      AND: (a) => { let any = false; for (const x of a) for (const y of toArr(x).flat()) { if (isErr(y)) throw y; if (y === null || (typeof y === 'string' && (x instanceof Rng))) continue; any = true; if (!bool(y)) return false; } if (!any) throw err(E.VALUE); return true; },
      OR: (a) => { let any = false; for (const x of a) for (const y of toArr(x).flat()) { if (isErr(y)) throw y; if (y === null || (typeof y === 'string' && (x instanceof Rng))) continue; any = true; if (bool(y)) return true; } if (!any) throw err(E.VALUE); return false; },
      XOR: (a) => { let n = 0; for (const x of a) for (const y of toArr(x).flat()) { if (y === null) continue; if (bool(y)) n++; } return n % 2 === 1; },
      NOT: (a) => !bool(scalar(a[0])),
      TRUE: () => true, FALSE: () => false,
      ROUND: (a) => roundTo(num(scalar(a[0])), a[1] === undefined ? 0 : num(scalar(a[1])), Math.round),
      ROUNDUP: (a) => roundTo(num(scalar(a[0])), a[1] === undefined ? 0 : num(scalar(a[1])), (x) => (x < 0 ? -Math.ceil(-x - 1e-9) : Math.ceil(x - 1e-9))),
      ROUNDDOWN: (a) => roundTo(num(scalar(a[0])), a[1] === undefined ? 0 : num(scalar(a[1])), (x) => (x < 0 ? -Math.floor(-x + 1e-9) : Math.floor(x + 1e-9))),
      TRUNC: (a) => roundTo(num(scalar(a[0])), a[1] === undefined ? 0 : num(scalar(a[1])), Math.trunc),
      MROUND: (a) => { const x = num(scalar(a[0])), m = num(scalar(a[1])); if (m === 0) return 0; if (x * m < 0) throw err(E.NUM); return Math.round(x / m + 1e-12) * m; },
      INT: (a) => Math.floor(num(scalar(a[0]))),
      ABS: (a) => Math.abs(num(scalar(a[0]))),
      MOD: (a) => { const x = num(scalar(a[0])), d = num(scalar(a[1])); if (d === 0) throw err(E.DIV0); return x - d * Math.floor(x / d); },
      POWER: (a) => op1('^', scalar(a[0]), scalar(a[1])),
      SQRT: (a) => { const x = num(scalar(a[0])); if (x < 0) throw err(E.NUM); return Math.sqrt(x); },
      PI: () => Math.PI, RAND: () => Math.random(),
      RANDBETWEEN: (a) => { const lo = Math.ceil(num(scalar(a[0]))), hi = Math.floor(num(scalar(a[1]))); return lo + Math.floor(Math.random() * (hi - lo + 1)); },
      SIGN: (a) => Math.sign(num(scalar(a[0]))),
      CEILING: (a) => { const x = num(scalar(a[0])), m = a[1] === undefined ? 1 : num(scalar(a[1])); return m === 0 ? 0 : Math.ceil(x / m - 1e-12) * m; },
      FLOOR: (a) => { const x = num(scalar(a[0])), m = a[1] === undefined ? 1 : num(scalar(a[1])); return m === 0 ? 0 : Math.floor(x / m + 1e-12) * m; },
      SUMIF: (a) => { const test = criterion(scalar(a[1])); const keys = flatVals(a[0]); const vals = a[2] !== undefined ? sizedLike(a[2], a[0]) : keys; let s = 0; keys.forEach((k, i) => { if (test(k) && typeof vals[i] === 'number') s += vals[i]; }); return s; },
      SUMIFS: (a) => { const vals = flatVals(a[0]); const pairs = []; for (let i = 1; i + 1 < a.length; i += 2) pairs.push([a[i], a[i + 1]]); const m = multiCrit(pairs); if (m.length !== vals.length) throw err(E.VALUE); let s = 0; m.forEach((ok, i) => { if (ok && typeof vals[i] === 'number') s += vals[i]; }); return s; },
      COUNTIF: (a) => { const test = criterion(scalar(a[1])); return flatVals(a[0]).filter(test).length; },
      COUNTIFS: (a) => { const pairs = []; for (let i = 0; i + 1 < a.length; i += 2) pairs.push([a[i], a[i + 1]]); return multiCrit(pairs).filter(Boolean).length; },
      AVERAGEIF: (a) => { const test = criterion(scalar(a[1])); const keys = flatVals(a[0]); const vals = a[2] !== undefined ? sizedLike(a[2], a[0]) : keys; let s = 0, n = 0; keys.forEach((k, i) => { if (test(k) && typeof vals[i] === 'number') { s += vals[i]; n++; } }); if (!n) throw err(E.DIV0); return s / n; },
      AVERAGEIFS: (a) => { const vals = flatVals(a[0]); const pairs = []; for (let i = 1; i + 1 < a.length; i += 2) pairs.push([a[i], a[i + 1]]); const m = multiCrit(pairs); let s = 0, n = 0; m.forEach((ok, i) => { if (ok && typeof vals[i] === 'number') { s += vals[i]; n++; } }); if (!n) throw err(E.DIV0); return s / n; },
      MAXIFS: (a) => { const vals = flatVals(a[0]); const pairs = []; for (let i = 1; i + 1 < a.length; i += 2) pairs.push([a[i], a[i + 1]]); const v = multiCrit(pairs).map((ok, i) => (ok && typeof vals[i] === 'number' ? vals[i] : null)).filter((x) => x !== null); return v.length ? Math.max(...v) : 0; },
      MINIFS: (a) => { const vals = flatVals(a[0]); const pairs = []; for (let i = 1; i + 1 < a.length; i += 2) pairs.push([a[i], a[i + 1]]); const v = multiCrit(pairs).map((ok, i) => (ok && typeof vals[i] === 'number' ? vals[i] : null)).filter((x) => x !== null); return v.length ? Math.min(...v) : 0; },
      VLOOKUP: (a) => { const v = scalar(a[0]); if (isErr(v)) throw v; const t = toArr(a[1]); const col = Math.trunc(num(scalar(a[2]))); const approx = a[3] === undefined || (a[3] && a[3].empty) ? true : bool(scalar(a[3])); if (col < 1 || col > (a[1] instanceof Rng ? a[1].cols : t[0].length)) throw err(E.REF); const first = t.map((r) => r[0]); const i = approx ? lookupApprox(first, v) : lookupExact(first, v); if (i < 0) throw err(E.NA); const row = t[i]; return row[col - 1] === undefined ? null : row[col - 1]; },
      HLOOKUP: (a) => { const v = scalar(a[0]); if (isErr(v)) throw v; const t = toArr(a[1]); const rowN = Math.trunc(num(scalar(a[2]))); const approx = a[3] === undefined || (a[3] && a[3].empty) ? true : bool(scalar(a[3])); if (rowN < 1) throw err(E.REF); const i = approx ? lookupApprox(t[0], v) : lookupExact(t[0], v); if (i < 0) throw err(E.NA); return t[rowN - 1] ? t[rowN - 1][i] ?? null : null; },
      MATCH: (a) => { const v = scalar(a[0]); const arr = flatVals(a[1]); const type = a[2] === undefined ? 1 : num(scalar(a[2])); const i = type === 0 ? lookupExact(arr, v) : lookupApprox(arr, v, type < 0); if (i < 0) throw err(E.NA); return i + 1; },
      XMATCH: (a) => { const v = scalar(a[0]); const arr = flatVals(a[1]); const i = lookupExact(arr, v); if (i < 0) throw err(E.NA); return i + 1; },
      XLOOKUP: (a) => {
        const v = scalar(a[0]); const keys = flatVals(a[1]); const res = toArr(a[2]); const mode = a[4] === undefined || (a[4] && a[4].empty) ? 0 : num(scalar(a[4])); const rev = a[5] !== undefined && !(a[5] && a[5].empty) && num(scalar(a[5])) < 0;
        const order = keys.map((_, i) => i); if (rev) order.reverse();
        let idx = -1;
        if (mode === 0 || mode === 2) { const t = criterion(typeof v === 'string' && mode === 0 ? v.replace(/([*?~])/g, '~$1') : v); idx = order.find((i) => (typeof v === 'string' ? t(keys[i]) : keys[i] !== null && cmp(keys[i], v) === 0)) ?? -1; }
        else { let best = -1; for (const i of order) { const k = keys[i]; if (k === null || typeof k !== typeof v) continue; const c = cmp(k, v); if (c === 0) { best = i; break; } if (mode === -1 && c < 0 && (best < 0 || cmp(k, keys[best]) > 0)) best = i; if (mode === 1 && c > 0 && (best < 0 || cmp(k, keys[best]) < 0)) best = i; } idx = best; }
        if (idx < 0) { if (a[3] !== undefined && !(a[3] && a[3].empty)) return scalar(a[3]); throw err(E.NA); }
        return res.length === 1 ? res[0][idx] ?? null : (res[idx] || [])[0] ?? null;
      },
      LOOKUP: (a) => { const v = scalar(a[0]); const keys = flatVals(a[1]); const res = a[2] !== undefined ? flatVals(a[2]) : keys; const i = lookupApprox(keys, v); if (i < 0) throw err(E.NA); return res[i] ?? null; },
      INDEX: (a) => {
        const g = a[0]; const r = a[1] === undefined || (a[1] && a[1].empty) ? 0 : Math.trunc(num(scalar(a[1]))); const c = a[2] === undefined || (a[2] && a[2].empty) ? 0 : Math.trunc(num(scalar(a[2])));
        if (g instanceof Rng) {
          let rr = r, cc = c; if (g.rows === 1 && c === 0 && r > 0) { cc = r; rr = 1; }
          if (rr < 0 || cc < 0 || rr > g.rows || cc > g.cols) throw err(E.REF);
          if (rr === 0 && cc === 0) return g;
          if (rr === 0) return new Rng(g.s, g.r1, g.c1 + cc - 1, g.r2, g.c1 + cc - 1);
          if (cc === 0) return g.cols === 1 ? new Rng(g.s, g.r1 + rr - 1, g.c1, g.r1 + rr - 1, g.c1) : new Rng(g.s, g.r1 + rr - 1, g.c1, g.r1 + rr - 1, g.c2);
          return new Rng(g.s, g.r1 + rr - 1, g.c1 + cc - 1, g.r1 + rr - 1, g.c1 + cc - 1);
        }
        const t = toArr(g); const row = t[(r || 1) - 1]; if (!row) throw err(E.REF); const v = row[(c || 1) - 1]; if (v === undefined) throw err(E.REF); return v;
      },
      ROW: (a, ctx) => (a[0] instanceof Rng ? a[0].r1 + 1 : ctx.r + 1),
      COLUMN: (a, ctx) => (a[0] instanceof Rng ? a[0].c1 + 1 : ctx.c + 1),
      ROWS: (a) => (a[0] instanceof Rng ? a[0].rows : toArr(a[0]).length),
      COLUMNS: (a) => (a[0] instanceof Rng ? a[0].cols : toArr(a[0])[0].length),
      OFFSET: (a) => {
        const g = a[0]; if (!(g instanceof Rng)) throw err(E.VALUE);
        const dr = Math.trunc(num(scalar(a[1]))), dc = Math.trunc(num(scalar(a[2])));
        const h = a[3] === undefined || (a[3] && a[3].empty) ? g.rows : Math.trunc(num(scalar(a[3]))), w = a[4] === undefined || (a[4] && a[4].empty) ? g.cols : Math.trunc(num(scalar(a[4])));
        const r1 = g.r1 + dr, c1 = g.c1 + dc; if (r1 < 0 || c1 < 0 || h < 1 || w < 1) throw err(E.REF);
        return new Rng(g.s, r1, c1, r1 + h - 1, c1 + w - 1);
      },
      INDIRECT: (a, ctx) => {
        const t = str(scalar(a[0])).trim(); let s = ctx.s, rest = t;
        const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(t);
        if (m) { s = api.sheetIndex(m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]); rest = m[3]; if (s < 0) throw err(E.REF); }
        const g = parseRange(rest); if (!g) throw err(E.REF);
        return new Rng(s, g.r1, g.c1, g.r2, g.c2);
      },
      ADDRESS: (a) => { const r = num(scalar(a[0])), c = num(scalar(a[1])); const t = a[2] === undefined ? 1 : num(scalar(a[2])); const cs = colName(c - 1), rs = String(r); return (t === 1 || t === 3 ? '$' : '') + cs + (t === 1 || t === 2 ? '$' : '') + rs; },
      ISBLANK: (a) => { const v = scalar(a[0]); return v === null; },
      ISREF: (a) => a[0] instanceof Rng,
      ISNUMBER: (a) => typeof scalar(a[0]) === 'number',
      ISTEXT: (a) => typeof scalar(a[0]) === 'string',
      ISLOGICAL: (a) => typeof scalar(a[0]) === 'boolean',
      ISERROR: (a) => isErr(scalar(a[0])),
      ISERR: (a) => { const v = scalar(a[0]); return isErr(v) && v.code !== E.NA; },
      ISNA: (a) => { const v = scalar(a[0]); return isErr(v) && v.code === E.NA; },
      ISEVEN: (a) => Math.trunc(num(scalar(a[0]))) % 2 === 0,
      ISODD: (a) => Math.abs(Math.trunc(num(scalar(a[0])))) % 2 === 1,
      NA: () => { throw err(E.NA); },
      N: (a) => { const v = scalar(a[0]); return typeof v === 'number' ? v : typeof v === 'boolean' ? +v : 0; },
      TYPE: (a) => { const v = scalar(a[0]); return typeof v === 'number' || v === null ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 4 : isErr(v) ? 16 : 64; },
      CONCATENATE: (a) => a.map((x) => str(scalar(x))).join(''),
      CONCAT: (a) => a.map((x) => (x instanceof Rng || Array.isArray(x) ? toArr(x).flat().map(str).join('') : str(x))).join(''),
      TEXTJOIN: (a) => { const sep = str(scalar(a[0])), skip = bool(scalar(a[1])); const parts = []; a.slice(2).forEach((x) => toArr(x).flat().forEach((y) => { const s = str(y); if (!(skip && s === '')) parts.push(s); })); return parts.join(sep); },
      LEFT: (a) => str(scalar(a[0])).slice(0, a[1] === undefined ? 1 : Math.max(0, num(scalar(a[1])))),
      RIGHT: (a) => { const s = str(scalar(a[0])); const n = a[1] === undefined ? 1 : Math.max(0, num(scalar(a[1]))); return n ? s.slice(-n) : ''; },
      MID: (a) => { const s = str(scalar(a[0])); const st = num(scalar(a[1])), n = num(scalar(a[2])); if (st < 1 || n < 0) throw err(E.VALUE); return s.substr(st - 1, n); },
      LEN: (a) => str(scalar(a[0])).length,
      UPPER: (a) => str(scalar(a[0])).toUpperCase(), LOWER: (a) => str(scalar(a[0])).toLowerCase(),
      PROPER: (a) => str(scalar(a[0])).toLowerCase().replace(/(^|[^a-zà-ÿ])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase()),
      TRIM: (a) => str(scalar(a[0])).replace(/ +/g, ' ').trim(),
      CLEAN: (a) => str(scalar(a[0])).replace(/[\x00-\x1f]/g, ''),
      SUBSTITUTE: (a) => { const s = str(scalar(a[0])), o = str(scalar(a[1])), n = str(scalar(a[2])); if (!o) return s; if (a[3] === undefined) return s.split(o).join(n); const k = num(scalar(a[3])); let idx = -1; for (let i = 0; i < k; i++) { idx = s.indexOf(o, idx + 1); if (idx < 0) return s; } return s.slice(0, idx) + n + s.slice(idx + o.length); },
      REPLACE: (a) => { const s = str(scalar(a[0])); const st = num(scalar(a[1])), n = num(scalar(a[2])); return s.slice(0, st - 1) + str(scalar(a[3])) + s.slice(st - 1 + n); },
      FIND: (a) => { const f = str(scalar(a[0])), s = str(scalar(a[1])); const st = a[2] === undefined ? 1 : num(scalar(a[2])); const i = s.indexOf(f, st - 1); if (i < 0) throw err(E.VALUE); return i + 1; },
      SEARCH: (a) => { const f = str(scalar(a[0])).toLowerCase(), s = str(scalar(a[1])).toLowerCase(); const st = a[2] === undefined ? 1 : num(scalar(a[2])); const re = new RegExp(f.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '.')); const m = re.exec(s.slice(st - 1)); if (!m) throw err(E.VALUE); return m.index + st; },
      REPT: (a) => str(scalar(a[0])).repeat(Math.max(0, Math.trunc(num(scalar(a[1]))))),
      EXACT: (a) => str(scalar(a[0])) === str(scalar(a[1])),
      CHAR: (a) => String.fromCharCode(num(scalar(a[0]))), CODE: (a) => { const s = str(scalar(a[0])); if (!s) throw err(E.VALUE); return s.charCodeAt(0); },
      TEXT: (a) => { const v = scalar(a[0]); let f = str(scalar(a[1])); f = frFormatCode(f); const val = typeof v === 'string' && parseNumberText(v) !== null ? parseNumberText(v) : v; return format(val, f).text; },
      FIXED: (a) => { const d = a[1] === undefined ? 2 : num(scalar(a[1])); const noSep = a[2] !== undefined && bool(scalar(a[2])); return format(num(scalar(a[0])), (noSep ? '0' : '#,##0') + (d > 0 ? '.' + '0'.repeat(d) : '')).text; },
      VALUE: (a) => { const v = scalar(a[0]); if (typeof v === 'number') return v; const p = parseInput(str(v)); if (typeof p.v === 'number') return p.v; throw err(E.VALUE); },
      DATEVALUE: (a) => { const p = parseInput(str(scalar(a[0]))); if (typeof p.v === 'number') return Math.floor(p.v); throw err(E.VALUE); },
      TODAY: () => todaySerial(),
      NOW: () => { const d = new Date(); return todaySerial() + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; },
      DATE: (a) => { const y = Math.trunc(num(scalar(a[0]))), m = Math.trunc(num(scalar(a[1]))), d = Math.trunc(num(scalar(a[2]))); return serial(y < 1900 ? y + 1900 : y, m, d); },
      TIME: (a) => ((num(scalar(a[0])) * 3600 + num(scalar(a[1])) * 60 + num(scalar(a[2]))) / 86400) % 1,
      YEAR: (a) => fromSerial(dnum(a[0])).getUTCFullYear(), MONTH: (a) => fromSerial(dnum(a[0])).getUTCMonth() + 1, DAY: (a) => fromSerial(dnum(a[0])).getUTCDate(),
      HOUR: (a) => Math.floor(frac(dnum(a[0])) * 24 + 1e-9), MINUTE: (a) => Math.floor(frac(dnum(a[0])) * 1440 + 1e-7) % 60, SECOND: (a) => Math.round(frac(dnum(a[0])) * 86400) % 60,
      WEEKDAY: (a) => { const d = fromSerial(dnum(a[0])).getUTCDay(); const t = a[1] === undefined ? 1 : num(scalar(a[1])); return t === 2 ? ((d + 6) % 7) + 1 : t === 3 ? (d + 6) % 7 : d + 1; },
      WEEKNUM: (a) => { const n = dnum(a[0]); const d = fromSerial(n); const jan1 = serial(d.getUTCFullYear(), 1, 1); const t = a[1] === undefined ? 1 : num(scalar(a[1])); const off = t === 2 ? (fromSerial(jan1).getUTCDay() + 6) % 7 : fromSerial(jan1).getUTCDay(); return Math.floor((Math.floor(n) - jan1 + off) / 7) + 1; },
      EDATE: (a) => { const d = fromSerial(dnum(a[0])); const m = Math.trunc(num(scalar(a[1]))); const y = d.getUTCFullYear(), mo = d.getUTCMonth() + m; const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); return serial(y, mo + 1, Math.min(d.getUTCDate(), last)); },
      EOMONTH: (a) => { const d = fromSerial(dnum(a[0])); const m = Math.trunc(num(scalar(a[1]))); return serial(d.getUTCFullYear(), d.getUTCMonth() + m + 2, 0); },
      DAYS: (a) => Math.floor(dnum(a[0])) - Math.floor(dnum(a[1])),
      DATEDIF: (a) => {
        const s = fromSerial(dnum(a[0])), e = fromSerial(dnum(a[1])); const u = str(scalar(a[2])).toUpperCase(); if (e < s) throw err(E.NUM);
        let months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + e.getUTCMonth() - s.getUTCMonth(); if (e.getUTCDate() < s.getUTCDate()) months--;
        if (u === 'Y' || u === 'A') return Math.floor(months / 12); if (u === 'M') return months; if (u === 'D' || u === 'J') return Math.round((e - s) / DAY);
        if (u === 'YM' || u === 'AM') return months % 12;
        if (u === 'MD') { const ref = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - (e.getUTCDate() < s.getUTCDate() ? 1 : 0), s.getUTCDate())); return Math.round((e - ref) / DAY); }
        if (u === 'YD' || u === 'AJ') { let ref = new Date(Date.UTC(e.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate())); if (ref > e) ref = new Date(Date.UTC(e.getUTCFullYear() - 1, s.getUTCMonth(), s.getUTCDate())); return Math.round((e - ref) / DAY); }
        throw err(E.NUM);
      },
      DAYS360: (a) => { const s = fromSerial(dnum(a[0])), e = fromSerial(dnum(a[1])); let d1 = Math.min(30, s.getUTCDate()), d2 = e.getUTCDate(); if (d2 === 31 && d1 >= 30) d2 = 30; return (e.getUTCFullYear() - s.getUTCFullYear()) * 360 + (e.getUTCMonth() - s.getUTCMonth()) * 30 + d2 - d1; },
      NETWORKDAYS: (a) => { let s = Math.floor(dnum(a[0])), e = Math.floor(dnum(a[1])); const hol = new Set(a[2] !== undefined ? flatVals(a[2]).filter((x) => typeof x === 'number').map(Math.floor) : []); let sign = 1; if (e < s) { [s, e] = [e, s]; sign = -1; } let n = 0; for (let d = s; d <= e; d++) { const w = fromSerial(d).getUTCDay(); if (w !== 0 && w !== 6 && !hol.has(d)) n++; } return n * sign; },
      WORKDAY: (a) => { let d = Math.floor(dnum(a[0])); let k = Math.trunc(num(scalar(a[1]))); const hol = new Set(a[2] !== undefined ? flatVals(a[2]).filter((x) => typeof x === 'number').map(Math.floor) : []); const st = k < 0 ? -1 : 1; while (k !== 0) { d += st; const w = fromSerial(d).getUTCDay(); if (w !== 0 && w !== 6 && !hol.has(d)) k -= st; } return d; },
      SUBTOTAL: (a) => { const k = Math.trunc(num(scalar(a[0]))) % 100; const map = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 9: 'SUM' }; if (!map[k]) return delegate(['', 'STDEV', 'STDEVP', '', 'VAR', 'VARP'][k - 6] || 'SUM', a.slice(1)); return fns[map[k]](a.slice(1)); },
      AGGREGATE: (a) => fns.SUBTOTAL([a[0], ...a.slice(2)]),
      RANK: (a) => { const v = num(scalar(a[0])); const arr = nums([a[1]]); const asc = a[2] !== undefined && num(scalar(a[2])) !== 0; if (!arr.includes(v)) throw err(E.NA); return arr.filter((x) => (asc ? x < v : x > v)).length + 1; },
      LARGE: (a) => { const arr = nums([a[0]]).sort((x, y) => y - x); const k = Math.trunc(num(scalar(a[1]))); if (k < 1 || k > arr.length) throw err(E.NUM); return arr[k - 1]; },
      SMALL: (a) => { const arr = nums([a[0]]).sort((x, y) => x - y); const k = Math.trunc(num(scalar(a[1]))); if (k < 1 || k > arr.length) throw err(E.NUM); return arr[k - 1]; },
      MEDIAN: (a) => { const v = nums(a).sort((x, y) => x - y); if (!v.length) throw err(E.NUM); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; },
      COUNTUNIQUE: (a) => new Set(a.flatMap((x) => toArr(x).flat()).filter((x) => x !== null && x !== '').map((x) => (typeof x === 'string' ? 's' + x.toLowerCase() : x))).size,
      NUMBERTEXT: (a) => numberToWords(num(scalar(a[0])), a[1] === undefined ? '' : str(scalar(a[1]))),
      QUOTIENT: (a) => { const d = num(scalar(a[1])); if (d === 0) throw err(E.DIV0); return Math.trunc(num(scalar(a[0])) / d); },
    };
    const frac = (x) => x - Math.floor(x);
    function dnum(v) { const x = scalar(v); if (typeof x === 'string') { const p = parseInput(x); if (typeof p.v === 'number') return p.v; throw err(E.VALUE); } const n = num(x); if (n < 0) throw err(E.NUM); return n; }
    function roundTo(x, d, f) { const k = Math.pow(10, Math.trunc(d)); const y = x * k; const r = f === Math.round ? Math.sign(y) * Math.round(+Math.abs(y).toPrecision(15)) : f(y); return r / k; }

    function delegate(name, args) {
      const F = window.formulajs; if (!F) throw err(E.NAME);
      let fn = name.split('.').reduce((o, k) => (o ? o[k] : undefined), F);
      if (fn && typeof fn === 'object') fn = fn.S || fn.SNGL || fn.INC || fn.DIST; // ECARTYPE → STDEV.S, MODE → MODE.SNGL…
      if (typeof fn !== 'function') throw err(E.NAME);
      const conv = args.map((x) => {
        if (x && x.empty) return undefined;
        if (x instanceof Rng || Array.isArray(x)) return toArr(x).map((row) => row.map((y) => { if (isErr(y)) throw y; return y; }));
        if (isErr(x)) throw x; return x;
      });
      let r = fn(...conv);
      if (r instanceof Error) throw err(ERR_EN[r.message] || r.message || E.VALUE);
      if (r instanceof Date) r = (r.getTime() - EPOCH) / DAY - r.getTimezoneOffset() / 1440;
      if (Array.isArray(r)) return Array.isArray(r[0]) ? r : [r];
      if (typeof r === 'number' && !isFinite(r)) throw err(E.NUM);
      return r === undefined ? null : r;
    }

    function callFn(n, ctx) {
      const name = n.name.replace(/^_XLFN\.|^_XLWS\./, '');
      if (lazy[name]) {
        const ev = (i, arr) => { const a = n.args[i]; if (!a || a.t === 'empty') return name === 'IF' ? 0 : null; return evalNode(a, arr ? { ...ctx, array: true } : ctx); };
        return lazy[name](n.args, ctx, ev);
      }
      const args = n.args.map((a) => {
        if (a.t === 'empty') return { empty: true };
        try { return evalNode(a, ctx); } catch (e) { if (e instanceof FErr && /^IS/.test(name)) return e; throw e; }
      });
      if (fns[name]) return fns[name](args, ctx);
      return delegate(name, args);
    }

    return { value, recalc, invalidate, evalFormula, parse, ast, key, nums: (a) => nums(a) };
  }

  /* code de format saisi en français (jj/mm/aaaa) → codes Excel */
  function frFormatCode(f) {
    let out = '', q = false;
    for (const ch of f) { if (ch === '"') q = !q; out += q ? ch : ch === 'j' ? 'd' : ch === 'J' ? 'D' : ch === 'a' ? 'y' : ch === 'A' ? 'Y' : ch; }
    return out.replace(/ddd?d?/gi, (m) => m.toLowerCase());
  }

  /* ---------------- Nombre en lettres (français) ---------------- */
  const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
  function below100(n) {
    if (n < 20) return UNITS[n];
    if (n < 70) { const t = Math.floor(n / 10), u = n % 10; return TENS[t] + (u === 0 ? '' : u === 1 ? ' et un' : '-' + UNITS[u]); }
    if (n < 80) return 'soixante' + (n === 71 ? ' et onze' : '-' + UNITS[n - 60]);
    if (n === 80) return 'quatre-vingts';
    return 'quatre-vingt-' + UNITS[n - 80];
  }
  function below1000(n, final) {
    const h = Math.floor(n / 100), r = n % 100; let s = '';
    if (h) s = (h > 1 ? UNITS[h] + ' cent' + (r === 0 && final ? 's' : '') : 'cent');
    if (r) { let t = below100(r); if (!final && r === 80) t = 'quatre-vingt'; s += (s ? ' ' : '') + t; }
    return s;
  }
  function intToWords(n) {
    if (n === 0) return 'zéro';
    const parts = []; const scales = [[1e12, 'billion', 'billions'], [1e9, 'milliard', 'milliards'], [1e6, 'million', 'millions']];
    for (const [v, s1, sN] of scales) { const k = Math.floor(n / v); if (k) { parts.push(intToWords(k) + ' ' + (k > 1 ? sN : s1)); n -= k * v; } }
    const th = Math.floor(n / 1000); if (th) { parts.push(th === 1 ? 'mille' : below1000(th, false) + ' mille'); n -= th * 1000; }
    if (n) parts.push(below1000(n, true));
    return parts.join(' ');
  }
  function numberToWords(x, devise = '') {
    if (!isFinite(x)) throw err(E.NUM);
    const neg = x < 0; x = Math.abs(x);
    let ip = Math.floor(x), cents = Math.round((x - ip) * 100); if (cents === 100) { ip++; cents = 0; }
    let s = intToWords(ip);
    if (devise) { s += ' ' + devise; if (cents) s += ' et ' + intToWords(cents) + ' centime' + (cents > 1 ? 's' : ''); }
    else if (cents) s += ' virgule ' + (cents < 10 ? 'zéro ' : '') + intToWords(cents % 10 === 0 && cents >= 10 ? cents / 10 : cents);
    s = (neg ? 'moins ' : '') + s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  window.Studio = window.Studio || {};
  window.Studio.formula = {
    MAXR, MAXC, colName, colIndex, addr, parseAddr, parseRange, rangeName, FErr, err, isErr, errFr, E,
    tokenize, parse, canonicalize, localize, mapRefs, shiftFormula, adjustForStructure, renameSheetInFormula, refText,
    suggest, help, functionList, toFr, toEn, createEngine, Rng, format, isDateFormat, NUM_FORMATS, parseInput, parseNumberText, frFormatCode,
    serial, fromSerial, todaySerial, numberToWords, generalNumber,
  };
})();
