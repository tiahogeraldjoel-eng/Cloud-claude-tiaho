# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**BRVM Analytics** — site web d'aide à la décision boursière pour la BRVM (Bourse Régionale des Valeurs Mobilières d'Afrique de l'Ouest). Backend FastAPI + frontend HTML/JS/CSS vanilla, déployé sur Render.

URL de production : `https://cloud-claude-tiaho.onrender.com`

## Commandes essentielles

```bash
# Démarrer localement
pip install -r requirements.txt
python run.py                          # → http://localhost:8000

# Démarrer directement avec uvicorn
uvicorn app:app --reload --port 8000

# Déployer (pousser sur main = redéploiement automatique Render)
git push origin main
```

Il n'y a pas de suite de tests formelle. `test_chart.py` est un fichier de test ad hoc.

## Architecture

### Backend Python (`app.py` est le point d'entrée FastAPI)

| Module | Rôle |
|--------|------|
| `app.py` | Routes FastAPI, scheduler APScheduler, logique dividendes |
| `database.py` | Couche SQLite — `DB_PATH = data/brvm.db` |
| `scraper.py` | Scraping afx.kwayisi.org, brvm.org, sikafinance.com, lejecos.com |
| `indicators.py` | Calculs techniques purs Python (SMA, EMA, RSI, MACD, Bollinger, Stochastique, OBV) — **pas de pandas** |
| `recommender.py` | Moteur de recommandations ACHAT/VENTE avec méthode SEKIDE BRVM |
| `portfolio.py` | Analyse de portefeuille, parsing CSV/Excel/PDF de relevés broker |
| `pdf_report.py` | Export PDF via fpdf2 — **import optionnel** (wrappé en `try/except BaseException`) |

### Frontend (`static/`)
Vanilla JS/HTML/CSS — servi directement par FastAPI via `StaticFiles`. Pas de build step, pas de framework.

### Base de données
- SQLite à `data/brvm.db` — créée/migrée automatiquement au démarrage par `db.init_db()`
- 47 actions BRVM hardcodées dans `SEED_STOCKS` (database.py) — à mettre à jour manuellement si le marché change
- Historique 10 ans chargé en background au premier démarrage

### Scheduler (APScheduler)
Au démarrage, `_start_scheduler()` lance :
- Rafraîchissement cours toutes les 20 min, 8h30–15h30 UTC, lun-ven
- Triggers dédiés à 09h50 (post-fixing ouverture) et 15h10 (EOD)
- Actualités toutes les 2h

### Cloudflare Worker (`brvm-prices/`)
Worker séparé déployé sur Cloudflare Workers — CORS proxy JSON pour les cours BRVM, bot Telegram, et suivi de portefeuille. Point d'entrée : `brvm-prices/src/index.js`, config : `wrangler.toml` (racine).

**Portefeuille** :
- `getPortfolio(env)` lit le KV `PORTFOLIO_KV` (namespace `04205b81a57842eda821b6bb9ec52b16`) ; si vide, fallback sur `USER_PORTFOLIO` codé en dur.
- `computePortfolioRows(portfolio, stocks)` est la **source unique** de calcul (P&L, valeur, recommandation), utilisée par Telegram `/portfolio`, `/export`, et les routes HTTP `/portfolio` (HTML stylé, imprimable en PDF) et `/portfolio.csv`.
- `getRecommendation(pnlPct, price, avgCost, liq)` : génère une reco (VENDRE/SURVEILLER/CONSERVER/ALLÉGER) avec horizon de placement et prix cibles (sortie/stop/renforcement). Le seuil de stop-loss dépend de la liquidité (`liq` dans `KNOWN_STOCKS`) : -3% (`H`), -5% (`M`), -8% (`L`) — une variation de quelques % sur une valeur peu échangée (ex. BOAM, avgVol ~95) est souvent du bruit, pas un signal de vente.

## Déploiement Render

- Python 3.11 forcé via `.python-version` et `runtime.txt` (Render utilise sinon Python 3.14 → build Rust échoue)
- Start command : `uvicorn app:app --host 0.0.0.0 --port $PORT` (défini dans `Procfile` et `render.yaml`)
- Health check : `GET /api/status` (retour immédiat, sans réseau)
- Free tier : se met en veille après 15 min d'inactivité → monitorer avec UptimeRobot sur `/api/status` toutes les 5 min

## Points d'attention

**Fiscalité dividendes** : les taux nets par pays UEMOA sont dupliqués dans `app.py` (`_COUNTRY_NET_DIV_FACTOR`) et `portfolio.py` — maintenir les deux en sync.

**Sessions HTTP scraper** : trois sessions `requests` isolées dans `scraper.py` — `SESSION` (AFX), `_BRVM_SESSION` (brvm.org), `_SIKA_SESSION` (sikafinance, requiert headers Sec-Fetch-* pour passer Cloudflare).

**pdf_report** : import wrappé en `try/except BaseException` car `fpdf2` dépend de `cryptography` (Rust/pyo3) qui peut paniquer dans certains environnements. Sur Render ça fonctionne normalement.

**SEKIDE** : méthode d'analyse propriétaire BRVM à 6 points (PM1an/PM2ans, PER actualisé, PCD) documentée dans les commentaires de `recommender.py` — ne pas modifier sans comprendre la logique.

**Tickers BRVM à ne pas confondre** (vérifier `database.py`, source de vérité) :
- `SIVC` = Erium Côte d'Ivoire (ex-Air Liquide CI) — **pas** `LACI`
- `SDSC` = AGL CI / Africa Global Logistics (ex-Bolloré, secteur Transport) — **différent** de `SDCC` = SODECI (eau, Services Publics)
- `UNXC` = Uniwax Côte d'Ivoire (Industrie/textile) — **pas** Unacoopec-CI

**KV portefeuille (`brvm-prices`)** : modifier `USER_PORTFOLIO` dans `index.js` n'a **aucun effet** si le KV `PORTFOLIO_KV` contient déjà des données — le KV a priorité. Pour corriger une position en prod, utiliser les commandes Telegram `/sell` puis `/buy` (recalcule le coût moyen pondéré), pas une édition de code seule.
