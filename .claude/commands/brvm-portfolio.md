# Compétence : Portefeuille BRVM & moteur de recommandations

Suivi de portefeuille personnel intégré au Cloudflare Worker (`brvm-prices/src/index.js`),
exposé via Telegram (`/portfolio`, `/buy`, `/sell`, `/export`) et via le web
(`/portfolio` page HTML imprimable, `/portfolio.csv`).

---

## Architecture

```
getPortfolio(env)
  └── KV "PORTFOLIO_KV" (namespace 04205b81a57842eda821b6bb9ec52b16)
        si vide → fallback USER_PORTFOLIO (codé en dur dans index.js)

computePortfolioRows(portfolio, stocks)   ← SOURCE UNIQUE DE CALCUL
  └── pour chaque position : price, pnlPct, pnlF, valeur, cout
  └── reco = getRecommendation(pnlPct, price, avgCost, liq)

  Utilisé par :
    - Telegram /portfolio, /export
    - HTTP GET /portfolio    (page HTML stylée BRVM, imprimable en PDF via window.print())
    - HTTP GET /portfolio.csv
```

---

## ⚠️ Piège n°1 : le KV a priorité sur le code

Modifier `USER_PORTFOLIO` dans `index.js` et déployer **n'a aucun effet** si
`PORTFOLIO_KV` contient déjà des données — `getPortfolio()` lit le KV en premier.

**Pour corriger une position en prod**, utiliser les commandes Telegram :
```
/sell SYMBOLE QUANTITE          ← retire la position (ou une partie)
/buy SYMBOLE QUANTITE PRIX       ← rajoute, recalcule le coût moyen pondéré
```

---

## Moteur de recommandations — `getRecommendation(pnlPct, price, avgCost, liq)`

Retourne `{ emoji, label, className, horizon, sortie, entree/stop, detail }`.

**Stop-loss adapté à la liquidité** (`liq` vient de `KNOWN_STOCKS[symbol].liq`) :

```js
const STOP_LOSS_BY_LIQ = { H: -3, M: -5, L: -8 };
```

Pourquoi : sur une valeur peu échangée (ex. BOAM, avgVol ~95 titres/jour), une
variation de -3 à -5% est souvent du bruit de marché, pas un signal de vente.
Un seuil unique de -3% pour tous les titres génère des faux VENDRE.

**Logique** :
| Condition | Reco | Horizon |
|---|---|---|
| `pnlPct <= stopLoss` | 🔴 VENDRE | Immédiat |
| `pnlPct < 0` (au-dessus du stop) | ⚠️ SURVEILLER | Court terme (1-2 sem.) |
| `pnlPct > 80` | 💎 ALLÉGER | Maintenant |
| `15 <= pnlPct <= 80` | 🚀 CONSERVER | Moyen-long terme (3-6 mois) |
| `0 <= pnlPct < 15` | ➡️ CONSERVER | Moyen terme (1-3 mois) |

Chaque reco inclut des prix cibles concrets (sortie, stop, niveau de renforcement)
calculés à partir de `price` et `avgCost`.

---

## Tickers BRVM piégeux (vérifier `database.py`, source de vérité)

| Ticker | Société réelle | À ne pas confondre avec |
|---|---|---|
| `SIVC` | Erium Côte d'Ivoire (ex-Air Liquide CI) | `LACI` (n'existe pas / mauvais nom) |
| `SDSC` | AGL CI — Africa Global Logistics (ex-Bolloré, Transport) | `SDCC` = SODECI (eau, Services Publics — société différente) |
| `UNXC` | Uniwax Côte d'Ivoire (Industrie/textile) | Unacoopec-CI |

---

## Fichiers liés

- `brvm-prices/src/index.js` — Worker principal (portefeuille, reco, Telegram, HTML/CSV)
- `make_portfolio_positions.py` — génère l'Excel `BRVM_Portefeuille_Tiaho_*.xlsx` (positions à garder en sync avec `USER_PORTFOLIO`/KV)
- `database.py` — mapping ticker ↔ société (source de vérité)
