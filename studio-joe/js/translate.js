/* Studio Joe — traduction de documents avec Claude (en ligne, via js/ai.js). */
(function () {
  const LANGS = [
    ['fr', 'Français'], ['en', 'Anglais'], ['es', 'Espagnol'], ['pt', 'Portugais'], ['de', 'Allemand'], ['it', 'Italien'],
    ['ar', 'Arabe'], ['zh', 'Chinois (simplifié)'], ['ru', 'Russe'], ['tr', 'Turc'], ['nl', 'Néerlandais'],
    ['mos', 'Mooré'], ['dyu', 'Dioula'], ['ff', 'Fulfulde (peul)'], ['ha', 'Haoussa'], ['wo', 'Wolof'], ['sw', 'Swahili'],
  ];
  const NAME = Object.fromEntries(LANGS);
  const LATIN = new Set(['fr', 'en', 'es', 'pt', 'de', 'it', 'tr', 'nl', 'mos', 'dyu', 'ff', 'ha', 'wo', 'sw']);
  const RARE = new Set(['mos', 'dyu', 'ff', 'ha', 'wo']);
  function savedTarget() { try { return localStorage.getItem('studio-translate-to') || 'en'; } catch (e) { return 'en'; } }
  function saveTarget(l) { try { localStorage.setItem('studio-translate-to', l); } catch (e) { /* ignore */ } }
  const options = (sel = savedTarget()) => LANGS.map(([k, l]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${l}</option>`).join('');
  const note = (code) => (RARE.has(code) ? 'Pour les langues nationales, la traduction est utile pour comprendre mais doit être relue par un locuteur avant diffusion.' : '');

  const ensureKey = (purpose) => Studio.ai.ensureKey({ title: 'Traduction par l\'IA Claude', purpose });

  const SYSTEM = (target, ctx) => `Tu es un traducteur professionnel. Traduis vers : ${NAME[target] || target}. `
    + 'Détecte toi-même la langue source. Garde le sens exact, le registre (administratif, juridique, comptable…) et la mise en forme : retours à la ligne, listes, numérotation. '
    + 'Ne traduis pas les noms propres, numéros de pièces, références, montants, dates chiffrées, adresses e-mail ou sites web ; garde les unités et devises (F CFA, FCFA). '
    + 'N\'ajoute aucun commentaire. Si un segment est déjà dans la langue cible, recopie-le tel quel. ' + (ctx || '');

  const ARR_SCHEMA = { type: 'object', properties: { translations: { type: 'array', items: { type: 'string' } } }, required: ['translations'], additionalProperties: false };

  /* Traduit une liste de textes courts ou longs ; renvoie un tableau de même longueur. Découpe en lots si nécessaire. */
  async function translateTexts(key, texts, target, { context = '', onProgress } = {}) {
    const out = new Array(texts.length);
    const batches = []; let cur = [], size = 0;
    texts.forEach((t, i) => {
      if (!String(t).trim()) { out[i] = t; return; }
      if (cur.length && size + t.length > 12000) { batches.push(cur); cur = []; size = 0; }
      cur.push(i); size += t.length;
    });
    if (cur.length) batches.push(cur);
    for (let b = 0; b < batches.length; b++) {
      const idx = batches[b];
      onProgress && onProgress(b / batches.length);
      const data = await Studio.ai.callJson(key, {
        schema: ARR_SCHEMA,
        system: SYSTEM(target, context),
        content: [{ type: 'text', text: `Traduis chacun des ${idx.length} segments suivants. Réponds avec un tableau "translations" contenant exactement ${idx.length} éléments, dans le même ordre.\n\n${JSON.stringify(idx.map((i) => texts[i]))}` }],
      });
      const tr = data.translations || [];
      if (tr.length !== idx.length) throw new Error('la traduction ne correspond pas au nombre de segments, réessayez');
      idx.forEach((i, k) => { out[i] = tr[k]; });
    }
    onProgress && onProgress(1);
    return out;
  }

  const IMG_SCHEMA = { type: 'object', properties: { source_language: { type: 'string' }, original: { type: 'string' }, translation: { type: 'string' } }, required: ['source_language', 'original', 'translation'], additionalProperties: false };
  /* Lit le texte d'une image (imprimé ou manuscrit) et le traduit. */
  async function translateImage(key, canvas, target) {
    return Studio.ai.callJson(key, {
      schema: IMG_SCHEMA,
      system: SYSTEM(target, 'Le texte à traduire se trouve dans une image : lis-le d\'abord (y compris l\'écriture manuscrite), en écrivant [illisible] pour ce que tu ne peux pas lire.'),
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Studio.ai.jpegBase64(canvas) } },
        { type: 'text', text: 'Recopie le texte de l\'image dans "original", puis sa traduction dans "translation". Indique la langue source en français dans "source_language".' },
      ],
    });
  }

  window.Studio = window.Studio || {};
  window.Studio.translate = { LANGS, NAME, LATIN, options, note, savedTarget, saveTarget, ensureKey, translateTexts, translateImage };
})();
