# Compétence : Système d'alertes pré-ouverture BRVM

Système complet de détection de signaux de trading (MPR/OBI/Iceberg) sur la BRVM,
avec envoi automatique d'alertes Telegram à 9h35 GMT via Cloudflare Worker.

---

## Architecture

```
Cloudflare Worker (cron 9h35 GMT lun-ven)
  └── fetchLiveStocks()
        ├── 1. BRVM.org direct (8 variantes d'URL)
        ├── 2. Proxy allorigins → BRVM.org
        └── 3. Yahoo Finance (.CI/.SN/.BF/.TG/.BJ)
  └── analyzeSignal() → MPR / OBI / Iceberg
  └── sendTelegram() si signal, sinon sendTelegramCalme()
```

GitHub Actions (`workflow_dispatch` uniquement — pas de cron) :
- `deploy-brvm-worker.yml` : déploie le Worker sur push `main` → `brvm-prices/src/**`
- `brvm-signal-alert.yml` : test manuel uniquement

---

## Structure fichiers

```
brvm-prices/
  src/index.js          ← Cloudflare Worker (source principale)
  scripts/signal-alert.js  ← Script Node.js (test manuel)
  wrangler.toml         ← Config Worker + cron
  package.json
.github/workflows/
  deploy-brvm-worker.yml
  brvm-signal-alert.yml
```

---

## Formules des signaux

```js
volRatio  = volume_préouverture / avgVol
momentum  = changePercent / 7.5          // normalisé sur limite BRVM +7.5%

MPR = max(0, volRatio × (1 + max(0, momentum)))
      → seuil > 2.5
      → UNIQUEMENT si changePercent >= 0 (évite faux signaux vendeurs)

OBI = min(1, max(-1, momentum × volRatio × 0.5))
      → seuil >= 0.85
      → approximation (pas de vrai carnet d'ordres BRVM)

Iceberg = volume > avgVol × 3.0
          → UNIQUEMENT si MPR ou OBI déjà actif (signal de confirmation)
```

Niveaux de confiance :
- 🔴 HIGH   : 3 signaux (MPR + OBI + Iceberg)
- 🟠 MEDIUM : 2 signaux
- 🟡 LOW    : 1 signal → surveiller, ne pas agir seul

---

## Position sizing (budget 75 000 FCFA)

```js
disponible = budget × 0.80          // 20% réserve toujours gardée
nbTitres   = floor(disponible / prix)
cible      = prix × 1.04  (+4%)
maxBRVM    = prix × 1.075 (+7.5% = limite journalière)
stopLoss   = prix × 0.97  (-3%)
```

---

## Secrets et variables à configurer

### Cloudflare (wrangler secret put)
```
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
```

### GitHub Secrets
```
CLOUDFLARE_API_TOKEN   ← token "Edit Cloudflare Workers" (pas Global API Key)
CLOUDFLARE_ACCOUNT_ID
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

### GitHub Variables (pas secrets)
```
BRVM_WORKER_URL  ← URL du Worker déployé (optionnel, pour tests manuels)
```

---

## Pièges connus

| Problème | Cause | Solution |
|---|---|---|
| Cron GitHub ne tourne pas depuis main | Branche par défaut ≠ main | Syncer les fichiers sur la branche par défaut |
| "sources indisponibles" en boucle | BRVM_WORKER_URL vide dans GitHub Variables | Configurer la variable OU désactiver le cron GitHub Actions |
| AFX bloqué | afx.kwayisi.org bloque tous les bots | Ne pas utiliser AFX. Utiliser BRVM.org depuis Cloudflare edge |
| BRVM.org bloqué depuis GitHub Actions | Geo-blocking (IP US Azure) | Cloudflare Worker uniquement pour fetch BRVM.org |
| wrangler@3 erreur auth 9106 | Bug connu avec nouveaux tokens | Utiliser wrangler@4 |
| Worker retourne `source: "simulated"` | Toutes sources échouent → fallback statique | Vérifier les secrets Cloudflare + logs Worker |
| MPR déclenche sur vente-panique | Formule sans filtre directionnel | Ajouter `&& changePercent >= 0` |
| Silence total le matin | Marché calme → aucun message envoyé | Ajouter sendTelegramCalme() pour heartbeat |
| 37/47 titres analysés | Certains titres inactifs ce jour-là | Normal si marchés peu liquides |

---

## Déploiement from scratch

1. **Créer le bot Telegram**
   - `@BotFather` → `/newbot` → copier le token
   - Démarrer le bot → récupérer le `chat_id` via `api.telegram.org/bot<TOKEN>/getUpdates`

2. **Configurer Cloudflare**
   - Créer un compte Workers & Pages
   - `wrangler secret put TELEGRAM_BOT_TOKEN`
   - `wrangler secret put TELEGRAM_CHAT_ID`

3. **Configurer GitHub**
   - Secrets : `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   - Token Cloudflare : permissions "Workers Scripts:Edit" + "Account Settings:Read"

4. **Pousser sur main** → deploy workflow se déclenche automatiquement

5. **Vérifier le cron** le lendemain à 9h35 GMT → message Telegram attendu

---

## KNOWN_STOCKS — noms corrects (mis à jour 2026-06)

```js
ABJC: Servair CI          | BNBC: Bernabé CI         | NTLC: Nestlé CI
ORGT: Oragroup            | PRSC: Tractafric Motor CI | SAFC: SAFCA
SHEC: Vivo Energie CI     | STAC: SETAO CI            | STBC: SITAB CI
```

---

## Commandes utiles

```bash
# Tester le Worker localement
cd brvm-prices && npx wrangler dev

# Déployer manuellement
npx wrangler@4 deploy

# Voir les logs du Worker en live
npx wrangler tail

# Tester le script GitHub Actions localement
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=xxx BRVM_WORKER_URL=xxx \
  node brvm-prices/scripts/signal-alert.js
```
