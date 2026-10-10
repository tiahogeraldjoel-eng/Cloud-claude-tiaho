/* Studio Joe — accès à l'IA Claude (Anthropic) pour les fonctions en ligne : écriture manuscrite, traduction.
   Rien n'est envoyé sans l'accord explicite de l'utilisateur, qui fournit sa propre clé API. */
(function () {
  const KEY_STORE = 'studio-anthropic-key';
  const MODEL = 'claude-opus-5-5';
  let sessionKey = '';

  function storedKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
  function forgetKey() { try { localStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ } sessionKey = ''; }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Écran d'accord + clé API. `purpose` décrit ce qui sera envoyé. Renvoie la clé ou null. */
  async function ensureKey({ title = 'Fonction en ligne : IA Claude', purpose = 'le contenu concerné' } = {}) {
    const known = sessionKey || storedKey();
    const res = await Studio.modal({
      title,
      body: `<p style="margin:0">Pour cette fonction, ${esc(purpose)} est envoyé par internet à <strong>Claude (Anthropic)</strong>, puis le résultat revient ici. Le reste de vos documents ne quitte pas votre appareil.</p>
        <p class="hint" style="margin:0">N'utilisez pas cette option pour des documents que vous n'avez pas le droit de transmettre à un service externe. L'utilisation est facturée sur votre compte Anthropic (quelques centimes par page).</p>
        <div class="field"><label for="aiKey">Clé API Anthropic (commence par sk-ant-)</label><input type="text" id="aiKey" autocomplete="off" spellcheck="false" placeholder="sk-ant-..." value="${esc(known)}"></div>
        <label class="row"><input type="checkbox" id="aiRemember" ${storedKey() ? 'checked' : ''}> Mémoriser la clé sur cet appareil</label>
        <p class="hint" style="margin:0">Une clé se crée sur console.anthropic.com (rubrique API Keys). Elle reste dans ce navigateur et n'est envoyée qu'à Anthropic.</p>`,
      buttons: [{ label: 'Annuler', value: null }, { label: 'Oublier la clé', value: 'forget' }, {
        label: 'J\'accepte, continuer', primary: true,
        validate: (b) => { const v = b.querySelector('#aiKey').value.trim(); if (!/^sk-ant-/.test(v)) { Studio.toast('Saisissez une clé qui commence par sk-ant-'); return false; } return true; },
        value: (b) => ({ key: b.querySelector('#aiKey').value.trim(), remember: b.querySelector('#aiRemember').checked }),
      }],
    });
    if (res === 'forget') { forgetKey(); Studio.toast('Clé oubliée sur cet appareil'); return null; }
    if (!res) return null;
    sessionKey = res.key;
    try { if (res.remember) localStorage.setItem(KEY_STORE, res.key); else localStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ }
    return res.key;
  }

  /* Image d'un canvas en JPEG base64, côté le plus long limité. */
  function jpegBase64(canvas, maxSide = 2000) {
    const k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas'); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88).split(',')[1];
  }

  /* Appel Claude avec sortie JSON conforme à `schema`. Renvoie l'objet JSON. */
  async function callJson(key, { system, content, schema, effort = 'medium' }) {
    if (!window.AnthropicSDK) throw new Error('module Claude absent (lib/anthropic-sdk.js)');
    const A = window.AnthropicSDK;
    const client = new A({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort, format: { type: 'json_schema', schema } },
        system,
        messages: [{ role: 'user', content }],
      });
    } catch (e) {
      if (e instanceof A.AuthenticationError) { forgetKey(); throw new Error('clé API refusée par Anthropic : vérifiez-la ou créez-en une nouvelle'); }
      if (e instanceof A.PermissionDeniedError) throw new Error('cette clé n\'a pas accès au modèle demandé');
      if (e instanceof A.RateLimitError) throw new Error('trop de requêtes ou crédit épuisé sur votre compte Anthropic, réessayez plus tard');
      if (e instanceof A.APIConnectionError) throw new Error('pas de connexion internet vers Anthropic');
      if (e instanceof A.APIError) throw new Error(`Anthropic a renvoyé une erreur ${e.status || ''} : ${e.message}`);
      throw e;
    }
    if (response.stop_reason === 'refusal') throw new Error('Claude a refusé ce contenu' + (response.stop_details && response.stop_details.explanation ? ` (${response.stop_details.explanation})` : ''));
    if (response.stop_reason === 'max_tokens') throw new Error('contenu trop long pour une seule requête');
    const block = response.content.find((b) => b.type === 'text');
    if (!block) throw new Error('réponse vide');
    try { return JSON.parse(block.text); } catch (e) { throw new Error('réponse illisible'); }
  }

  window.Studio = window.Studio || {};
  window.Studio.ai = { ensureKey, callJson, jpegBase64, forgetKey, MODEL };
})();
