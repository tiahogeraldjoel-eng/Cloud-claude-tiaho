# -*- coding: utf-8 -*-
"""
portfolio.py — Analyse de portefeuille BRVM
Parsing de relevés PDF + scoring + recommandations par position
"""

from __future__ import annotations
import re
import logging
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# ─── Fiscalité dividendes BRVM (copie locale pour éviter l'import circulaire) ─
# Source canonique : app.py → _COUNTRY_NET_DIV_FACTOR
_COUNTRY_NET_DIV_FACTOR: Dict[str, float] = {
    "Côte d'Ivoire": 0.713,
    "Sénégal":       0.850,
    "Burkina Faso":  0.875,
    "Mali":          0.850,
    "Bénin":         0.850,
    "Niger":         0.850,
    "Togo":          0.850,
    "Guinée-Bissau": 0.850,
}
_DEFAULT_NET_DIV_FACTOR = 0.85

def _net_div_factor(country: Optional[str]) -> float:
    if not country:
        return _DEFAULT_NET_DIV_FACTOR
    return _COUNTRY_NET_DIV_FACTOR.get(country, _DEFAULT_NET_DIV_FACTOR)

# ─── Symboles BRVM — 47 valeurs officiellement cotées (avril 2026) ───────────
# Sources : brvm.org, afx.kwayisi.org — Symboles officiels BRVM uniquement
BRVM_SYMBOLS = {
    # Télécommunications (3)
    "SNTS", "ORAC", "ONTBF",
    # Finance / Banques (17)
    "BICC", "BICB",
    "BOAB", "BOABF", "BOAC", "BOAM", "BOAN", "BOAS",
    "CABC", "CBIBF", "ECOC", "ETIT",
    "NSBC", "ORGT", "SAFC", "SGBC", "SIBC",
    # Distribution Pétrolière (3)
    "SHEC", "TTLC", "TTLS",
    # Industrie / Agroalimentaire (12)
    "BNBC", "CFAC", "FTSC", "NEIC", "NTLC",
    "SEMC", "SICC", "SIVC", "SLBC", "SMBC", "STBC", "UNXC",
    # Agriculture / Plantations (6)
    "PALC", "PRSC", "SCRC", "SOGC", "SPHC", "UNLC",
    # Énergie / Services Publics (2)
    "CIEC", "SDCC",
    # Transport / Logistique (2)
    "ABJC", "SDSC",
    # Services (3)
    "LNBB", "STAC",
    # Total : 47 valeurs
}

# ─── Patterns de parsing PDF ─────────────────────────────────────────────────
# Lignes typiques d'un relevé de portefeuille BRVM :
# "SGBC  Société Générale CI   100  14500  1 450 000  15200  1 520 000  +70 000  +4.83%"
# Colonnes : Symbole | Libellé | Quantité | Prix Achat | Valeur Achat | Prix Actuel | Valeur Actuelle | +/- | %
_LINE_PATTERN = re.compile(
    r'([A-Z]{3,6})\s+'                        # 1: Symbole
    r'(.+?)\s+'                               # 2: Libellé (lazy)
    r'(\d[\d\s]*)\s+'                         # 3: Quantité
    r'([\d\s]+(?:[,\.]\d+)?)\s+'             # 4: Prix d'achat
    r'([\d\s]+(?:[,\.]\d+)?)\s+'             # 5: Valeur achat
    r'([\d\s]+(?:[,\.]\d+)?)'                # 6: Prix actuel ou valeur actuelle
)

_NUMBER_RE = re.compile(r'[\d\s]+(?:[,\.]\d+)?')


def _clean_number(s: str) -> Optional[float]:
    """Nettoie et convertit une chaîne numérique (espaces, virgules) en float."""
    if s is None:
        return None
    s = str(s).strip()
    s = s.replace('\xa0', '').replace(' ', '').replace('\u202f', '')
    s = s.replace(',', '.')
    s = re.sub(r'\.(?=.*\.)', '', s)   # garder seulement le dernier séparateur
    try:
        return float(s)
    except ValueError:
        return None


def _extract_symbol(text: str) -> Optional[str]:
    """Cherche un symbole BRVM connu dans un texte."""
    words = re.findall(r'[A-Z]{3,6}', text.upper())
    for w in words:
        if w in BRVM_SYMBOLS:
            return w
    return None


def parse_portfolio_pdf(file_bytes: bytes) -> Dict:
    """
    Parse un relevé de portefeuille BRVM au format PDF.
    Supporte les formats des principaux courtiers : SGBCI/BRM, Coris Bourse,
    NSIA Finance, BNI Finances, etc.

    Retourne un dict avec :
      - holdings : liste de positions extraites
      - raw_text : texte brut (debug)
      - errors   : messages d'avertissement
      - metadata : infos globales détectées (date, total, etc.)
    """
    import pdfplumber

    holdings = []
    errors   = []
    raw_lines = []
    metadata  = {}

    try:
        import io
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page_num, page in enumerate(pdf.pages):
                page_holdings_before = len(holdings)

                # ── 1. Extraction via tableaux (méthode principale) ───────
                try:
                    tables = page.extract_tables()
                    for table in tables:
                        rows = _parse_table(table, errors)
                        holdings.extend(rows)
                except Exception as e:
                    errors.append(f"Page {page_num+1} tables: {e}")

                # ── 2. Extraction du texte brut ───────────────────────────
                try:
                    text = page.extract_text() or ""
                    raw_lines.extend(text.split('\n'))
                except Exception as e:
                    text = ""
                    errors.append(f"Page {page_num+1} texte: {e}")

                # ── 3. Fallback texte si aucune position trouvée PAR PAGE ─
                # (corrige le bug où on vérifiait le total global)
                if len(holdings) == page_holdings_before:
                    for line in text.split('\n'):
                        row = _parse_text_line(line, errors)
                        if row:
                            holdings.append(row)

        # ── 4. Priorité Coris Bourse : si le format est détecté ──────────────
        full_text = '\n'.join(raw_lines)
        if _is_coris_bourse(full_text):
            # Utiliser le parser colonne-par-colonne (pdfplumber fusionne toutes les
            # cellules d'une même colonne en un seul bloc \n-séparé)
            coris_holdings: List[Dict] = []
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf2:
                for page2 in pdf2.pages:
                    try:
                        tables2 = page2.extract_tables()
                        for tbl in tables2:
                            result = _parse_coris_bourse_table(tbl, errors)
                            if result:
                                coris_holdings = result
                                break
                    except Exception as e2:
                        errors.append(f"Coris Bourse table extract: {e2}")
                    if coris_holdings:
                        break
            if coris_holdings:
                # Remplacer complètement : le parser Coris est plus précis
                holdings = coris_holdings
                metadata = _extract_metadata(full_text)
                logger.info(f"Coris Bourse: {len(holdings)} positions parsées")
            else:
                errors.append("Coris Bourse: aucune position extraite via table — fallback texte")

        # ── 5. Fallback total document : si table-parsing = 0 résultats ──────
        elif not holdings:
            errors.append("Aucun tableau détecté — passage en mode texte brut")
            holdings = _parse_full_text_fallback(full_text, errors)

        # ── 5. Déduplication par symbole (garder première occurrence) ─────
        seen = set()
        deduped = []
        for h in holdings:
            sym = h.get("symbol")
            if sym and sym not in seen:
                seen.add(sym)
                deduped.append(h)
        holdings = deduped

        # ── 6. Métadonnées globales ────────────────────────────────────────
        full_text = '\n'.join(raw_lines)
        metadata = _extract_metadata(full_text)

    except Exception as e:
        errors.append(f"Erreur lecture PDF : {e}")
        logger.error(f"Portfolio PDF parse error: {e}", exc_info=True)

    return {
        "holdings": holdings,
        "raw_text": '\n'.join(raw_lines[:100]),
        "errors": errors,
        "metadata": metadata,
        "holding_count": len(holdings),
    }


def _parse_table(table: List[List], errors: List[str]) -> List[Dict]:
    """Parse un tableau pdfplumber en positions de portefeuille.
    Gère les en-têtes variés des différents courtiers BRVM."""
    rows = []
    if not table:
        return rows

    # Détecter la ligne d'en-tête (cherche jusqu'à la ligne 8)
    header_idx = 0
    header_cols = {}
    # Mots-clés déclencheurs d'en-tête (multi-courtiers)
    HEADER_TRIGGERS = ('quantit', 'prix', 'valeur', 'symbol', 'action', 'titre',
                       'cours', 'nombre', 'montant', 'pm', 'valoris', 'portefeuille',
                       'libel', 'désignation', 'designation', 'position')
    for i, row in enumerate(table[:8]):
        if row is None:
            continue
        row_text = ' '.join(str(c or '').lower() for c in row)
        if any(kw in row_text for kw in HEADER_TRIGGERS):
            header_idx = i
            # Mapper les colonnes selon les en-têtes détectés
            for j, cell in enumerate(row):
                if cell is None:
                    continue
                cell_l = str(cell).lower().strip()
                # Symbole / Code valeur
                if any(k in cell_l for k in ('symbol', 'code', 'ticker', 'isin', 'valeur\ncode')):
                    header_cols.setdefault('symbol', j)
                # Libellé / Nom
                elif any(k in cell_l for k in ('libel', 'nom', 'titre', 'societe', 'soci', 'désign', 'design', 'valeur')):
                    if 'symbol' not in header_cols or j != header_cols.get('symbol'):
                        header_cols.setdefault('name', j)
                # Quantité
                elif any(k in cell_l for k in ('quant', 'qté', 'qte', 'nbre', 'nombre', 'nb ', 'nb\n', 'nbr')):
                    header_cols.setdefault('qty', j)
                # Prix d'achat / PM (Prix Moyen)
                elif any(k in cell_l for k in ('pm', 'p.m', 'prix moy', 'px achat', 'prix achat',
                                                'cours achat', 'pr. achat', 'coût unit', 'cout unit')):
                    header_cols.setdefault('buy_price', j)
                # Valeur d'achat / montant investi
                elif any(k in cell_l for k in ('val. achat', 'valeur achat', 'montant achat',
                                                'invest', 'coût total', 'cout total', 'montant investi')):
                    header_cols.setdefault('buy_value', j)
                # Prix actuel / cours actuel
                elif any(k in cell_l for k in ('cours actuel', 'cours clôt', 'cours clot',
                                                'prix actuel', 'dernier cours', 'clôture', 'cloture',
                                                'px actuel', 'cours\nactuel')):
                    header_cols.setdefault('current_price', j)
                # Valorisation / Valeur de marché
                elif any(k in cell_l for k in ('valoris', 'val. march', 'valeur march', 'valeur actuel',
                                                'montant actuel', 'eval', 'éval')):
                    header_cols.setdefault('market_value', j)
                # Plus/Moins-value
                elif any(k in cell_l for k in ('plus', 'moins', '+/-', 'gain', 'perte', 'p/m', '+/- value')):
                    header_cols.setdefault('pnl', j)
                # % Performance
                elif any(k in cell_l for k in ('% ', '%\n', 'perf', 'rend', 'taux', 'variation')):
                    header_cols.setdefault('pnl_pct', j)
            # Si on n'a pas trouvé de colonne symbole explicite,
            # on laissera _extract_symbol chercher dans toute la ligne
            break

    # Traiter les lignes de données
    for row in table[header_idx + 1:]:
        if row is None or all(c is None or str(c).strip() == '' for c in row):
            continue

        row_vals = [str(c or '').strip() for c in row]
        row_text = ' '.join(row_vals)

        # Chercher le symbole
        symbol = None
        if 'symbol' in header_cols:
            symbol = _extract_symbol(row_vals[header_cols['symbol']])
        if not symbol:
            symbol = _extract_symbol(row_text)
        if not symbol:
            continue

        # Extraire les valeurs numériques selon les colonnes détectées
        def _get(col_key):
            idx = header_cols.get(col_key)
            if idx is not None and idx < len(row_vals):
                return _clean_number(row_vals[idx])
            return None

        qty         = _get('qty')
        buy_price   = _get('buy_price')
        buy_value   = _get('buy_value')
        curr_price  = _get('current_price')
        mkt_value   = _get('market_value')
        pnl         = _get('pnl')
        pnl_pct     = _get('pnl_pct')

        # Si colonnes non détectées, inférer depuis les nombres de la ligne
        nums = [_clean_number(v) for v in row_vals if _NUMBER_RE.fullmatch(v.replace(' ','').replace(',','').replace('.','')+'.0')]
        nums = [n for n in nums if n is not None and n > 0]

        # Fallback : si on a au moins quantité et 2 prix
        if qty is None and len(nums) >= 1:
            # Chercher la quantité (petit nombre entier < 10000)
            for n in nums:
                if n == int(n) and 1 <= n <= 100000:
                    qty = n
                    break

        # Nom
        name = None
        if 'name' in header_cols and header_cols['name'] < len(row_vals):
            name = row_vals[header_cols['name']][:50]

        holding = {
            "symbol":       symbol,
            "name":         name or symbol,
            "quantity":     qty,
            "buy_price":    buy_price,
            "buy_value":    buy_value or (qty * buy_price if qty and buy_price else None),
            "current_price": curr_price,
            "market_value": mkt_value or (qty * curr_price if qty and curr_price else None),
            "pnl":          pnl,
            "pnl_pct":      pnl_pct,
        }
        rows.append(holding)

    return rows


def _parse_text_line(line: str, errors: List[str]) -> Optional[Dict]:
    """Parse une ligne de texte brut pour extraire une position."""
    line = line.strip()
    if len(line) < 10:
        return None

    symbol = _extract_symbol(line)
    if not symbol:
        return None

    # Extraire tous les nombres de la ligne
    nums_raw = re.findall(r'[\d][\d\s\xa0]*(?:[,\.]\d+)?', line)
    nums = []
    for n in nums_raw:
        v = _clean_number(n)
        if v is not None and v > 0:
            nums.append(v)

    if len(nums) < 2:
        return None

    # Heuristique : quantité = premier entier raisonnable, prix = grands nombres
    qty         = None
    buy_price   = None
    curr_price  = None

    sorted_nums = sorted(nums)
    # Quantité typiquement < 10 000, prix > 100
    for n in nums:
        if n == int(n) and 1 <= n <= 50000 and qty is None:
            qty = int(n)
    price_nums = [n for n in nums if n >= 100]
    if len(price_nums) >= 2:
        buy_price  = price_nums[0]
        curr_price = price_nums[1] if price_nums[1] != buy_price else buy_price

    return {
        "symbol":       symbol,
        "name":         symbol,
        "quantity":     qty,
        "buy_price":    buy_price,
        "buy_value":    qty * buy_price if qty and buy_price else None,
        "current_price": curr_price,
        "market_value": qty * curr_price if qty and curr_price else None,
        "pnl":          None,
        "pnl_pct":      None,
    }


def _parse_full_text_fallback(full_text: str, errors: List[str]) -> List[Dict]:
    """
    Fallback robuste : parse l'intégralité du texte extrait d'un PDF
    quand la méthode tables + text-line échoue.
    Cherche des blocs de lignes contenant un symbole BRVM + des nombres.
    Utilisé pour les relevés BRM, Coris, NSIA dont le PDF n'est pas bien structuré.
    """
    holdings = []
    lines = full_text.split('\n')

    # Passe 1 : grouper les lignes autour des symboles BRVM
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        sym = _extract_symbol(line)
        if sym:
            # Accumuler les lignes adjacentes (context window de ±2)
            ctx_lines = lines[max(0, i-1):min(len(lines), i+4)]
            ctx_text  = ' '.join(ctx_lines)

            nums_raw = re.findall(r'[\d][\d\s\xa0]*(?:[,\.]\d+)?', ctx_text)
            nums = []
            for n in nums_raw:
                v = _clean_number(n)
                if v is not None and v > 0:
                    nums.append(v)

            qty        = None
            buy_price  = None
            curr_price = None
            buy_val    = None
            mkt_val    = None

            # Détecter la quantité (entier modéré)
            for n in nums:
                if n == int(n) and 1 <= n <= 200_000 and qty is None:
                    qty = int(n)

            # Prix : grands nombres (cours BRVM typiquement 100–100 000 FCFA)
            price_nums = sorted([n for n in nums if 50 <= n <= 5_000_000], reverse=False)

            # Valeurs (typiquement qty × prix : > 50 000)
            value_nums = sorted([n for n in nums if n > 50_000], reverse=True)

            if len(price_nums) >= 2:
                buy_price  = price_nums[0]
                curr_price = price_nums[1]
            elif len(price_nums) == 1:
                curr_price = price_nums[0]

            if qty and buy_price:
                buy_val = qty * buy_price
            if qty and curr_price:
                mkt_val = qty * curr_price

            # Vérification de cohérence : si on a des valeurs > 50 000, les utiliser directement
            if len(value_nums) >= 2 and qty:
                # Les deux plus grandes valeurs sont souvent valeur_achat / valeur_actuelle
                if abs(value_nums[0] - (qty * curr_price if curr_price else 0)) < value_nums[0] * 0.05:
                    mkt_val = value_nums[0]
                if abs(value_nums[1] - (qty * buy_price if buy_price else 0)) < value_nums[1] * 0.05:
                    buy_val = value_nums[1]

            if sym and (qty or curr_price):
                holdings.append({
                    "symbol":       sym,
                    "name":         sym,
                    "quantity":     qty,
                    "buy_price":    buy_price,
                    "buy_value":    buy_val,
                    "current_price": curr_price,
                    "market_value": mkt_val,
                    "pnl":          None,
                    "pnl_pct":      None,
                })
        i += 1

    # Déduplication interne
    seen: set = set()
    deduped = []
    for h in holdings:
        s = h["symbol"]
        if s not in seen:
            seen.add(s)
            deduped.append(h)

    if deduped:
        errors.append(f"Mode fallback texte : {len(deduped)} position(s) extraite(s)")
    return deduped


# ─── Parser Coris Bourse ─────────────────────────────────────────────────────
#
# Format PDF Coris Bourse (Ouagadougou) — relevé "Etat de Portefeuille" :
#   Colonnes : Désignation | Quantité | Coût Moyen | Coût Global |
#              Prix au Marché | Valeur Marchande | Plus ou moins value
#
# Particularités :
#   • Séparateurs milliers par espace : "21 256" = 21256, "1 264 500" = 1264500
#   • Négatifs écrits avec espace : "- 7 562" = -7562
#   • Noms sur 2 lignes pour les libellés longs (ETIT, SDSC, BOABF, SIBC, CBIBF)
#   • pdfplumber fusionne toutes les cellules → on exploite le texte brut
#   • Symbole toujours à la fin du libellé, précédé de " - "

def _is_coris_bourse(text: str) -> bool:
    """Détecte si le texte provient d'un relevé Coris Bourse."""
    indicators = [
        "coris bourse", "coris-bourse", "etat de portefeuille",
        "coût moyen", "cout moyen", "valeur marchande", "corisbourse",
    ]
    low = text.lower()
    return sum(1 for ind in indicators if ind in low) >= 2


def _parse_coris_bourse_table(table: List[List], errors: List[str]) -> List[Dict]:
    """
    Parse la table pdfplumber d'un relevé Coris Bourse.

    Structure détectée : pdfplumber fusionne toutes les lignes en une seule cellule
    par colonne, séparées par \\n. On reconstruit les lignes en zippant les colonnes.

    Colonnes (index) :
      0 = Désignation (nom + tiret + symbole)
      1 = Quantité
      2 = Coût Moyen     (prix d'achat unitaire moyen)
      3 = Coût Global    (montant total investi)
      4 = Prix au Marché (cours actuel)
      5 = Valeur Marchande
      6 = Plus ou moins value
    """
    if not table or len(table) < 2:
        return []

    # Trouver la ligne de données (celle où col 1 contient des quantités)
    data_row = None
    for row in table[1:]:
        if row and len(row) >= 7 and row[1]:
            vals1 = [v.strip() for v in str(row[1]).split('\n') if v.strip()]
            if vals1 and re.match(r'^\d', vals1[0]):
                data_row = row
                break

    if not data_row:
        errors.append("Coris Bourse: ligne de données non trouvée dans la table")
        return []

    def split_cell(col_idx) -> List[str]:
        """Découpe le contenu d'une cellule en valeurs individuelles."""
        cell = data_row[col_idx] if col_idx < len(data_row) else None
        if not cell:
            return []
        return [v.strip() for v in str(cell).split('\n') if v.strip()]

    # Extraire les colonnes numériques (17 valeurs attendues)
    qtys  = split_cell(1)
    couts = split_cell(2)   # coût moyen
    cgls  = split_cell(3)   # coût global
    prix  = split_cell(4)   # prix marché
    vms   = split_cell(5)   # valeur marchande
    pnls  = split_cell(6)   # +/- value

    n = min(len(qtys), len(couts), len(cgls), len(prix), len(vms), len(pnls))
    if n == 0:
        errors.append("Coris Bourse: colonnes numériques vides")
        return []

    # Extraire les symboles depuis la colonne Désignation
    desig_lines = split_cell(0)
    symbols: List[str] = []
    names:   List[str] = []
    for line in desig_lines:
        # Chercher un symbole BRVM dans la ligne
        sym = next(
            (s for s in re.findall(r'\b([A-Z]{3,6})\b', line) if s in BRVM_SYMBOLS),
            None
        )
        if sym:
            symbols.append(sym)
            # Nom propre : supprimer "- SYMBOLE" en fin de libellé
            clean_name = re.sub(r'\s*[-–]\s*' + sym + r'\s*$', '', line).strip()
            # Supprimer les parties "- " en fin si le symbole était seul sur la ligne suivante
            clean_name = re.sub(r'\s*[-–]\s*$', '', clean_name).strip()
            names.append(clean_name or sym)

    if len(symbols) < n:
        errors.append(
            f"Coris Bourse: {len(symbols)} symboles trouvés, {n} lignes de données — "
            "vérifiez le fichier PDF"
        )
        n = len(symbols)
    elif len(symbols) > n:
        symbols = symbols[:n]
        names   = names[:n]

    holdings: List[Dict] = []
    for i in range(n):
        qty  = _clean_number(qtys[i])
        cm   = _clean_number(couts[i])
        cg   = _clean_number(cgls[i])
        pm   = _clean_number(prix[i])
        vm   = _clean_number(vms[i])
        pnl  = _clean_number(pnls[i])

        pnl_pct = round(pnl / cg * 100, 2) if (cg and pnl is not None and cg != 0) else None

        holdings.append({
            "symbol":        symbols[i],
            "name":          names[i] if i < len(names) else symbols[i],
            "quantity":      qty,
            "buy_price":     cm,     # coût moyen = prix d'achat moyen pondéré
            "buy_value":     cg,     # coût global = montant total investi
            "current_price": pm,     # prix au marché = cours de référence
            "market_value":  vm,     # valeur marchande = évaluation au cours
            "pnl":           pnl,    # plus/moins-value latente
            "pnl_pct":       pnl_pct,
        })

    logger.info(f"Coris Bourse table: {len(holdings)} positions extraites")
    return holdings


def _extract_metadata(text: str) -> Dict:
    """Extrait les métadonnées globales d'un relevé (date, total, etc.)."""
    meta = {}

    # Date du relevé
    date_m = re.search(r'(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})', text)
    if date_m:
        d, m, y = date_m.groups()
        if len(y) == 2:
            y = '20' + y
        meta['statement_date'] = f"{y}-{m.zfill(2)}-{d.zfill(2)}"

    # Total portefeuille
    total_m = re.search(r'(?i)(?:total|valeur\s+globale|total\s+portefeuille)[^\d]*([\d\s\xa0,\.]+)', text)
    if total_m:
        v = _clean_number(total_m.group(1))
        if v and v > 1000:
            meta['total_value'] = v

    # Nom du client
    client_m = re.search(r'(?i)(?:client\s*:|titulaire\s*:)\s*([A-ZÀ-Ü][A-ZÀ-Üa-zà-ü\s\-\(\)]{3,50})', text)
    if client_m:
        meta['client_name'] = client_m.group(1).strip()

    # Numéro de compte (Coris Bourse : "COMPTE N° : 000951401 COMPTE T.O...")
    compte_m = re.search(r'(?i)compte\s+n[°o]\s*[:\-]?\s*(\d{6,15})', text)
    if not compte_m:
        compte_m = re.search(r'(?i)(?:n[°o]|num)\s*[:\-]?\s*(\d{6,15})', text)
    if compte_m:
        meta['account_number'] = compte_m.group(1)

    # Trésorerie / Espèces (Coris Bourse : "Total trésorerie : 4 579" ou "ESPÈCES : 4 579")
    # Utiliser \d{1,3}(?:[ ]\d{3})* pour capturer exactement un nombre avec séparateurs milliers espace
    # (évite de déborder sur le chiffre suivant comme dans "4 579 0,06%")
    _NUM_SEP = r'\d{1,3}(?:[ \xa0\u202f]\d{3})*'
    cash_m = re.search(
        r'(?i)(?:total[ \t]+tr[^\s\n]{0,5}sorerie|esp[^\s\n]{0,3}ces|tr[^\s\n]{0,5}sorerie[ \t]+disponible)'
        r'\s*[:\-]?\s*(' + _NUM_SEP + r')',
        text,
    )
    if cash_m:
        v = _clean_number(cash_m.group(1))
        if v and v >= 0:
            meta['cash'] = v

    # Courtier / SGI détecteur
    if 'coris bourse' in text.lower() or 'coris-bourse' in text.lower():
        meta['broker'] = 'Coris Bourse'
    elif 'sgbci' in text.lower() or 'société générale' in text.lower():
        meta['broker'] = 'SGBCI'
    elif 'nsia' in text.lower():
        meta['broker'] = 'NSIA Finance'
    elif 'brm' in text.lower():
        meta['broker'] = 'BRM'

    # Plus-value globale (Coris Bourse : "TOTAL ACTIONS   7 376 990   1 445 457")
    # Utiliser le pattern \d{1,3}(?: \d{3})* pour distinguer deux nombres contigus
    _NUM_SEP = r'\d{1,3}(?:[ \xa0\u202f]\d{3})*'
    pv_m = re.search(r'(?i)total\s+actions[ \t]+(' + _NUM_SEP + r')[ \t]+(' + _NUM_SEP + r')', text)
    if pv_m:
        val  = _clean_number(pv_m.group(1))
        gain = _clean_number(pv_m.group(2))
        if val and 100_000 < val < 100_000_000:
            meta['total_stock_value'] = val
        if gain and 0 < gain < 100_000_000:
            meta['total_pnl'] = gain

    return meta


# ─── Analyse de portefeuille ─────────────────────────────────────────────────

def analyze_portfolio(holdings: List[Dict], db, ind, rec) -> Dict:
    """
    Analyse complète d'un portefeuille BRVM.
    Pour chaque position : prix actuel, P&L, signal technique, recommandation.
    Retourne un dict avec résumé global + détail par position.
    """
    analyzed = []
    total_cost    = 0.0
    total_current = 0.0
    not_found     = []

    for h in holdings:
        sym = h.get("symbol")
        if not sym:
            continue

        # ── Prix de marché actuel ─────────────────────────────────────────
        latest = db.get_latest_price(sym)
        stock  = db.get_stock(sym)
        fund   = db.get_fundamental(sym)
        country = stock.get("country") if stock else None

        if not latest:
            not_found.append(sym)
            analyzed.append({**h, "found": False, "status": "Titre introuvable"})
            continue

        current_price     = latest.get("close") or h.get("current_price")
        qty               = h.get("quantity") or 0
        buy_price_input   = h.get("buy_price")          # None si non fourni
        buy_val_input     = h.get("buy_value")          # None si non fourni

        # Si prix d'achat inconnu, on ne calcule pas de P&L
        has_cost  = buy_price_input is not None or buy_val_input is not None
        buy_price = buy_price_input or current_price
        buy_val   = buy_val_input or (qty * buy_price if has_cost and qty and buy_price else 0)
        mkt_val   = qty * current_price if qty and current_price else h.get("market_value") or 0

        pnl     = (mkt_val - buy_val) if has_cost and buy_val else None
        pnl_pct = (pnl / buy_val * 100) if pnl is not None and buy_val and buy_val > 0 else None

        # ── Analyse technique ─────────────────────────────────────────────
        prices  = db.get_prices(sym, 365)
        tech    = ind.compute_technical(prices) if len(prices) >= 5 else {}
        signals = tech.get("signals", [])   # signals est une liste de dicts
        # Déduire la tendance à partir des signaux
        trend = "Neutre"
        if signals:
            directions = [s.get("direction","") for s in signals]
            nb_buy  = sum(1 for d in directions if "ACHAT"    in d or "HAUSSIÈRE" in d)
            nb_sell = sum(1 for d in directions if "VENTE"    in d or "BAISSIÈRE" in d)
            if nb_buy > nb_sell:   trend = "Haussière"
            elif nb_sell > nb_buy: trend = "Baissière"
        rsi_val = None
        if tech.get("rsi14"):
            rsi_pts = [p["value"] for p in tech["rsi14"] if p["value"] is not None]
            if rsi_pts:
                rsi_val = rsi_pts[-1]

        # ── Recommandation ────────────────────────────────────────────────
        from recommender import compute_recommendation
        reco = None
        try:
            latest_p  = db.get_latest_price(sym)
            hw = db.get_52w_highlow(sym)   # via le module db injecté
            sentiment = {"score": 50}      # neutre si non dispo
            reco = compute_recommendation(
                prices       = prices,
                fundamentals = fund,
                derived      = None,
                hw           = hw,
                sentiment    = sentiment,
                latest       = latest_p,
            )
        except Exception:
            pass

        reco_signal = reco.get("signal", "NEUTRE") if reco else "NEUTRE"
        reco_score  = reco.get("score", 50) if reco else 50

        # ── Conseil positionnel ───────────────────────────────────────────
        advice = _position_advice(
            pnl_pct  = pnl_pct,
            reco_sig = reco_signal,
            trend    = trend,
            rsi      = rsi_val,
            qty      = qty,
        )

        # ── Dividende net ─────────────────────────────────────────────────
        div_net = None
        div_yield_net = None
        if fund:
            factor = _net_div_factor(country)  # défini localement, pas d'import circulaire
            dps = fund.get("dividend_per_share")
            dy  = fund.get("dividend_yield")
            if dps:
                div_net = round(dps * factor, 2)
            if dy:
                div_yield_net = round(dy * factor, 2)

        # ── Accumulation
        if has_cost:
            total_cost += buy_val or 0
        total_current += mkt_val or 0

        analyzed.append({
            "found":          True,
            "symbol":         sym,
            "name":           stock.get("name") or sym if stock else sym,
            "sector":         stock.get("sector") or "Autre" if stock else "Autre",
            "country":        country or "",
            "quantity":       qty,
            "buy_price":      round(buy_price, 0) if buy_price else None,
            "buy_value":      round(buy_val, 0)   if buy_val   else None,
            "current_price":  round(current_price, 0),
            "market_value":   round(mkt_val, 0)   if mkt_val   else None,
            "pnl":            round(pnl, 0)       if pnl is not None else None,
            "pnl_pct":        round(pnl_pct, 2)   if pnl_pct is not None else None,
            "trend":          trend,
            "rsi":            round(rsi_val, 1)   if rsi_val else None,
            "reco_signal":    reco_signal,
            "reco_score":     round(reco_score, 1),
            "advice":         advice,
            "div_yield_net":  div_yield_net,
            "div_net_dps":    div_net,
            "latest_date":    latest.get("date"),
        })

    # ── Résumé global ─────────────────────────────────────────────────────
    total_pnl     = total_current - total_cost
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost else 0

    # Répartition sectorielle (uniquement positions avec valeur de marché connue)
    sector_alloc = {}
    for a in analyzed:
        if a.get("found"):
            sec = a.get("sector") or "Autre"
            mv  = a.get("market_value") or 0
            if mv > 0:
                sector_alloc[sec] = sector_alloc.get(sec, 0) + mv

    # Diversification
    n_stocks    = sum(1 for a in analyzed if a.get("found"))
    n_sectors   = len(sector_alloc)
    diversif    = _diversification_score(n_stocks, n_sectors, analyzed, total_current)

    # Signaux de recommandation
    buy_count    = sum(1 for a in analyzed if a.get("reco_signal") == "ACHAT")
    sell_count   = sum(1 for a in analyzed if a.get("reco_signal") == "VENTE")
    neutral_count= sum(1 for a in analyzed if a.get("reco_signal") == "NEUTRE")

    # Dividendes annuels estimés
    annual_div = sum(
        (a.get("div_net_dps") or 0) * (a.get("quantity") or 0)
        for a in analyzed if a.get("found")
    )
    div_yield_portfolio = (annual_div / total_current * 100) if total_current else 0

    return {
        "summary": {
            "total_cost":          round(total_cost, 0),
            "total_current":       round(total_current, 0),
            "total_pnl":           round(total_pnl, 0),
            "total_pnl_pct":       round(total_pnl_pct, 2),
            "n_stocks":            n_stocks,
            "n_sectors":           n_sectors,
            "buy_signals":         buy_count,
            "sell_signals":        sell_count,
            "neutral_signals":     neutral_count,
            "annual_dividend_net": round(annual_div, 0),
            "div_yield_portfolio": round(div_yield_portfolio, 2),
            "diversification":     diversif,
            "not_found":           not_found,
        },
        "holdings":  analyzed,
        "sector_allocation": sector_alloc,
        "global_advice": _global_advice(analyzed, total_pnl_pct, diversif, has_cost=total_cost > 0),
    }


def _position_advice(pnl_pct, reco_sig, trend, rsi, qty) -> Dict:
    """Génère un conseil de gestion de position."""
    actions = []
    priority = "info"

    # Basé sur la recommandation globale
    if reco_sig == "ACHAT":
        if pnl_pct is not None and pnl_pct < -10:
            actions.append("Position en perte — signal ACHAT favorable : renforcement possible")
            priority = "buy"
        elif pnl_pct is not None and pnl_pct > 30:
            actions.append("Forte plus-value + signal ACHAT : conserver, surveiller résistances")
            priority = "hold"
        else:
            actions.append("Signal ACHAT : conserver la position, envisager renforcement")
            priority = "hold"

    elif reco_sig == "VENTE":
        if pnl_pct is not None and pnl_pct > 15:
            actions.append("Position en profit + signal VENTE : sécuriser les gains, alléger")
            priority = "sell"
        elif pnl_pct is not None and pnl_pct < -5:
            actions.append("Signal VENTE en perte : stopper la baisse, couper la position")
            priority = "sell_urgent"
        else:
            actions.append("Signal VENTE : réduire ou clôturer la position")
            priority = "sell"

    else:  # NEUTRE
        if pnl_pct is not None and pnl_pct > 20:
            actions.append("Bonne plus-value avec signal neutre : sécuriser partiellement")
            priority = "hold"
        elif pnl_pct is not None and pnl_pct < -15:
            actions.append("Perte significative avec signal neutre : surveiller de près")
            priority = "watch"
        else:
            actions.append("Signal neutre : conserver sans renforcer")
            priority = "hold"

    # Facteur RSI
    if rsi is not None:
        if rsi >= 70:
            actions.append(f"RSI {rsi:.0f} : zone de surachat — vigilance sur retournement")
        elif rsi <= 30:
            actions.append(f"RSI {rsi:.0f} : zone de survente — rebond possible")

    # Facteur tendance
    if trend == "Haussière":
        actions.append("Tendance haussière confirmée ✓")
    elif trend == "Baissière":
        actions.append("Tendance baissière : prudence")

    return {
        "priority":  priority,
        "actions":   actions,
        "summary":   actions[0] if actions else "Surveiller",
    }


def _diversification_score(n_stocks: int, n_sectors: int, holdings: List[Dict], total: float) -> Dict:
    """Évalue la diversification du portefeuille (HHI)."""
    score = 50

    if n_stocks >= 8:   score += 15
    elif n_stocks >= 5: score += 8
    elif n_stocks <= 2: score -= 15

    if n_sectors >= 4:   score += 10
    elif n_sectors >= 2: score += 5

    hhi = 1.0
    if total > 0:
        weights = [(a.get("market_value") or 0) / total for a in holdings if a.get("found")]
        hhi = sum(w**2 for w in weights)
        if hhi < 0.15:   score += 15
        elif hhi < 0.25: score += 8
        elif hhi > 0.5:  score -= 15

    score = max(0, min(100, score))

    if score >= 70:   label, color = "Bien diversifié",        "#22c55e"
    elif score >= 50: label, color = "Diversification correcte","#eab308"
    elif score >= 30: label, color = "Peu diversifié",          "#f97316"
    else:             label, color = "Concentration risquée",   "#ef4444"

    return {"score": score, "label": label, "color": color, "hhi": round(hhi, 3)}


# Secteurs BRVM officiels + titres représentatifs pour conseils de diversification
_BRVM_SECTORS = [
    "Finance", "Télécommunications", "Distribution Pétrolière",
    "Agriculture", "Industrie", "Transport", "Services", "Énergie", "Services Publics",
]
# Titres liquides par secteur — symboles officiels BRVM (47 valeurs cotées)
_SECTOR_EXAMPLES = {
    "Finance":                 ["SGBC", "ECOC", "BOAC", "BICC", "CBIBF", "ETIT", "NSBC"],
    "Télécommunications":      ["SNTS", "ORAC", "ONTBF"],
    "Distribution Pétrolière": ["TTLC", "TTLS", "SHEC"],
    "Agriculture":             ["PALC", "SOGC", "SPHC", "SCRC", "UNLC"],
    "Industrie":               ["NTLC", "SLBC", "STBC", "SICC", "SEMC", "FTSC"],
    "Transport":               ["SDSC", "ABJC"],
    "Services":                ["LNBB", "STAC"],
    "Énergie":                 ["CIEC"],
    "Services Publics":        ["SDCC"],
}


def _global_advice(holdings: List[Dict], pnl_pct: float, diversif: Dict,
                   has_cost: bool = True) -> List[str]:
    """Recommandations globales précises sur l'ensemble du portefeuille."""
    advice = []

    found  = [a for a in holdings if a.get("found")]
    buy_syms   = [a["symbol"] for a in found if a.get("reco_signal") == "ACHAT"]
    sell_syms  = [a["symbol"] for a in found if a.get("reco_signal") == "VENTE"]
    losers     = sorted([a for a in found if a.get("pnl_pct") is not None and a["pnl_pct"] < -10],
                         key=lambda x: x["pnl_pct"])
    winners    = sorted([a for a in found if a.get("pnl_pct") is not None and a["pnl_pct"] > 20],
                         key=lambda x: -x["pnl_pct"])
    high_div   = sorted([a for a in found if (a.get("div_yield_net") or 0) > 4],
                         key=lambda x: -(x.get("div_yield_net") or 0))

    # ── Performance globale (uniquement si prix d'achat connus)
    if not has_cost or pnl_pct is None:
        pass  # pas de prix d'achat fourni, on ne commente pas la performance
    elif pnl_pct >= 20:
        advice.append(f"Excellente performance globale de {pnl_pct:+.1f}% — envisager des prises de bénéfices partielles.")
    elif pnl_pct > 0:
        advice.append(f"Portefeuille en plus-value de {pnl_pct:+.1f}% — bonne performance, continuer à surveiller.")
    elif pnl_pct < -10:
        advice.append(f"Portefeuille en moins-value significative de {pnl_pct:.1f}% — réévaluer la composition.")
    else:
        advice.append(f"Performance légèrement négative ({pnl_pct:.1f}%) — surveiller l'évolution des positions.")

    # ── Signaux techniques individuels
    if buy_syms:
        detail = ", ".join(f"{s}" for s in buy_syms[:5])
        advice.append(f"Signal ACHAT sur {len(buy_syms)} position(s) — renforcement suggéré : {detail}.")
    if sell_syms:
        detail = ", ".join(sell_syms[:5])
        advice.append(f"Signal VENTE sur {len(sell_syms)} position(s) — alléger ou couper : {detail}.")

    # ── Gestion des pertes/gains
    if losers:
        items = ", ".join(f"{a['symbol']} ({a['pnl_pct']:+.0f}%)" for a in losers[:3])
        advice.append(f"Positions en perte à surveiller : {items} — définir un seuil stop-loss.")
    if winners:
        items = ", ".join(f"{a['symbol']} ({a['pnl_pct']:+.0f}%)" for a in winners[:3])
        advice.append(f"Fortes plus-values : {items} — envisager une prise de bénéfices partielle.")

    # ── Dividendes
    if high_div:
        items = ", ".join(f"{a['symbol']} ({a['div_yield_net']:.1f}%)" for a in high_div[:3])
        advice.append(f"Meilleurs rendements dividendes nets dans votre portefeuille : {items}.")

    # ── Diversification sectorielle
    ptf_sectors = {a.get("sector") or "Autre" for a in found}
    missing = [s for s in _BRVM_SECTORS if s not in ptf_sectors and s != "Autre"]

    if diversif["score"] < 40:
        if missing:
            examples = []
            for sec in missing[:3]:
                ex = _SECTOR_EXAMPLES.get(sec, [])
                if ex:
                    examples.append(f"{sec} ({ex[0]}…)")
            miss_txt = ", ".join(examples) if examples else ", ".join(missing[:3])
            advice.append(f"Portefeuille peu diversifié — secteurs absents : {miss_txt}.")
        else:
            advice.append("Concentration élevée — réduire le poids des positions dominantes.")
        if diversif["hhi"] > 0.5:
            top = sorted(found, key=lambda x: -(x.get("market_value") or 0))
            if top:
                sym = top[0]["symbol"]
                advice.append(f"{sym} représente une part trop importante — rééquilibrer.")
    elif diversif["score"] < 60:
        if missing:
            sec = missing[0]
            ex  = _SECTOR_EXAMPLES.get(sec, [])
            advice.append(f"Diversification à améliorer — envisager le secteur {sec}"
                          + (f" (ex : {ex[0]})" if ex else "") + ".")
    else:
        advice.append("Bonne diversification sectorielle — continuer dans cette direction.")

    if not advice:
        advice.append("Portefeuille équilibré — maintenir la stratégie en cours.")

    return advice
