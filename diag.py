"""Nettoie la DB et recharge les données correctes."""
import sys
sys.path.insert(0, r'C:\Users\hp\TutoCom')
import database as db
import scraper

# 1. Vider les anciennes données erronées
conn = db.get_connection()
conn.execute("DELETE FROM prices")
conn.execute("DELETE FROM market_data")
conn.execute("DELETE FROM news")
conn.commit()
conn.close()
print("[OK] Anciennes données supprimées")

# 2. Scraper les données correctes
print("[i] Scraping en cours...")
result = scraper.fetch_all()

# 3. Sauvegarder les nouvelles données
if result['stocks']:
    # Mettre à jour les noms des stocks depuis AFX
    conn = db.get_connection()
    for s in result['stocks']:
        sym  = s['symbol'].upper()
        name = s.get('name', '')
        if name:
            conn.execute("INSERT OR IGNORE INTO stocks (symbol, name) VALUES (?,?)", (sym, name))
            conn.execute("UPDATE stocks SET name=? WHERE symbol=? AND (name='' OR name IS NULL OR name=?)",
                        (name, sym, sym))
    conn.commit()
    conn.close()

    clean = [{
        "symbol":          s['symbol'].upper(),
        "date":            s['date'],
        "open":            s.get('open'),
        "high":            s.get('high'),
        "low":             s.get('low'),
        "close":           s['close'],
        "volume":          s.get('volume'),
        "market_cap":      s.get('market_cap'),
        "variation_pct":   s.get('variation_pct'),
        "reference_price": s.get('reference_price'),
    } for s in result['stocks'] if s.get('close')]

    db.upsert_prices_bulk(clean)
    print(f"[OK] {len(clean)} cours sauvegardés avec les bons prix")

if result['market']:
    m = result['market']
    m.setdefault('brvm_10', None)
    m.setdefault('total_value', None)
    db.upsert_market_data(m)
    print(f"[OK] Marché: composite={m.get('brvm_composite')}, "
          f"hausses={m.get('advances')}, baisses={m.get('declines')}")

if result['news']:
    db.save_news(result['news'])
    print(f"[OK] {len(result['news'])} actualités sauvegardées")

# 4. Vérification
print("\n--- Vérification finale ---")
stocks = db.get_latest_prices_all()
avec = [s for s in stocks if s['close']]
print(f"Titres avec cours: {len(avec)}/{len(stocks)}")
for s in sorted(avec, key=lambda x: -(x['close'] or 0))[:5]:
    print(f"  {s['symbol']:8s} {s['close']:>10,.0f} FCFA  {('+' if (s['variation_pct'] or 0) > 0 else '') if s['variation_pct'] else ''}{s['variation_pct'] or 'N/A'}")
