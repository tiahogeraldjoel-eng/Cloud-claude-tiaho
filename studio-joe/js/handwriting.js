/* Studio Joe — lecture de l'écriture manuscrite avec Claude (Anthropic), en ligne.
   Contrairement à l'OCR Tesseract (hors ligne, texte imprimé), ce module envoie l'image à l'API Claude :
   il ne s'utilise qu'avec la clé API de l'utilisateur et après son accord explicite. */
(function () {
  const KEY_STORE = 'studio-anthropic-key';
  const MODEL = 'claude-opus-5-5';

  function storedKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
  function forgetKey() { try { localStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ } sessionKey = ''; }
  let sessionKey = '';

  /* Demande la clé API et l'accord d'envoi ; renvoie la clé ou null si l'utilisateur annule. */
  async function ensureKey({ force = false } = {}) {
    const known = sessionKey || storedKey();
    const res = await Studio.modal({
      title: 'Écriture manuscrite : lecture par l\'IA Claude',
      body: `<p style="margin:0">Pour lire l'écriture à la main, l'image de la page est envoyée par internet à <strong>Claude (Anthropic)</strong>, puis le texte reconnu revient ici. Le reste de vos documents ne quitte pas votre appareil.</p>
        <p class="hint" style="margin:0">N'utilisez pas cette option pour des documents que vous n'avez pas le droit de transmettre à un service externe. Chaque page lue est facturée sur votre compte Anthropic (quelques centimes par page).</p>
        <div class="field"><label for="hwKey">Clé API Anthropic (commence par sk-ant-)</label><input type="text" id="hwKey" autocomplete="off" spellcheck="false" placeholder="sk-ant-..." value="${force ? '' : known.replace(/"/g, '')}"></div>
        <label class="row"><input type="checkbox" id="hwRemember" ${storedKey() ? 'checked' : ''}> Mémoriser la clé sur cet appareil</label>
        <p class="hint" style="margin:0">Une clé se crée sur console.anthropic.com (rubrique API Keys). Elle reste dans ce navigateur et n'est envoyée qu'à Anthropic.</p>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Oublier la clé', value: 'forget' }, {
        label: 'J\'accepte, lire le texte', primary: true,
        validate: (b) => { const v = b.querySelector('#hwKey').value.trim(); if (!/^sk-ant-/.test(v)) { Studio.toast('Saisissez une clé qui commence par sk-ant-'); return false; } return true; },
        value: (b) => ({ key: b.querySelector('#hwKey').value.trim(), remember: b.querySelector('#hwRemember').checked }),
      }],
    });
    if (res === 'forget') { forgetKey(); Studio.toast('Clé oubliée sur cet appareil'); return null; }
    if (!res) return null;
    sessionKey = res.key;
    try { if (res.remember) localStorage.setItem(KEY_STORE, res.key); else localStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ }
    return res.key;
  }

  // image JPEG, côté le plus long limité pour garder une bonne lisibilité sans envoyer de fichier énorme
  function toJpegBase64(canvas, maxSide = 2000) {
    const k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas'); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88).split(',')[1];
  }

  const SCHEMA = {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            x0: { type: 'integer' }, y0: { type: 'integer' }, x1: { type: 'integer' }, y1: { type: 'integer' },
          },
          required: ['text', 'x0', 'y0', 'x1', 'y1'],
          additionalProperties: false,
        },
      },
    },
    required: ['lines'],
    additionalProperties: false,
  };
  const LANG_HINT = { fra: 'Le document est en français.', eng: 'The document is in English.', 'fra+eng': 'Le document mélange le français et l\'anglais.' };

  /* Transcrit l'image. Renvoie { text, words } au même format que Studio.ocr.recognize (pixels du canvas). */
  async function transcribe(canvas, key, lang = 'fra') {
    if (!window.AnthropicSDK) throw new Error('module Claude absent (lib/anthropic-sdk.js)');
    const client = new window.AnthropicSDK({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        system: 'Tu transcris des documents scannés ou photographiés, notamment de l\'écriture manuscrite, pour un usage administratif et comptable. '
          + 'Recopie le texte exactement tel qu\'il est écrit, ligne par ligne, dans l\'ordre de lecture : ne corrige pas l\'orthographe, ne résume pas, ne traduis pas. '
          + 'Recopie les montants, dates, numéros et signatures lisibles chiffre par chiffre. Écris [illisible] pour un mot que tu ne peux pas lire et ne devine pas les chiffres. '
          + 'Pour chaque ligne, donne sa boîte englobante approximative en coordonnées entières de 0 à 1000 (x0, y0 en haut à gauche ; x1, y1 en bas à droite) relatives à la largeur et à la hauteur de l\'image.',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: toJpegBase64(canvas) } },
            { type: 'text', text: `Transcris tout le texte de cette image, manuscrit et imprimé. ${LANG_HINT[lang] || ''}` },
          ],
        }],
      });
    } catch (e) {
      const A = window.AnthropicSDK;
      if (e instanceof A.AuthenticationError) { forgetKey(); throw new Error('clé API refusée par Anthropic : vérifiez-la ou créez-en une nouvelle'); }
      if (e instanceof A.PermissionDeniedError) throw new Error('cette clé n\'a pas accès au modèle demandé');
      if (e instanceof A.RateLimitError) throw new Error('trop de requêtes ou crédit épuisé sur votre compte Anthropic, réessayez plus tard');
      if (e instanceof A.APIConnectionError) throw new Error('pas de connexion internet vers Anthropic');
      if (e instanceof A.APIError) throw new Error(`Anthropic a renvoyé une erreur ${e.status || ''} : ${e.message}`);
      throw e;
    }
    if (response.stop_reason === 'refusal') throw new Error('Claude a refusé de traiter cette image' + (response.stop_details && response.stop_details.explanation ? ` (${response.stop_details.explanation})` : ''));
    if (response.stop_reason === 'max_tokens') throw new Error('page trop longue : découpez-la ou sélectionnez une zone plus petite');
    const block = response.content.find((b) => b.type === 'text');
    if (!block) throw new Error('réponse vide');
    let data;
    try { data = JSON.parse(block.text); } catch (e) { throw new Error('réponse illisible'); }
    const W = canvas.width, H = canvas.height;
    const words = (data.lines || []).filter((l) => l.text && l.text.trim()).map((l, i) => {
      const x0 = Math.max(0, Math.min(l.x0, l.x1)), x1 = Math.min(1000, Math.max(l.x0, l.x1));
      const y0 = Math.max(0, Math.min(l.y0, l.y1)), y1 = Math.min(1000, Math.max(l.y0, l.y1));
      return { x: x0 / 1000 * W, y: y0 / 1000 * H, w: Math.max(1, (x1 - x0) / 1000 * W), h: Math.max(1, (y1 - y0) / 1000 * H), text: l.text, conf: 90, line: String(i) };
    });
    return { text: words.map((w) => w.text).join('\n'), words, model: response.model };
  }

  window.Studio = window.Studio || {};
  window.Studio.handwriting = { ensureKey, transcribe, forgetKey, hasKey: () => !!(sessionKey || storedKey()) };
})();
