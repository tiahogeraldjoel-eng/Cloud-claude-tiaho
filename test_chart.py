import requests, re

# Le Referer est la clé — kwayisi vérifie que la requête vient d'une page du site
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://afx.kwayisi.org/brvm/snts.html",
    "Accept": "*/*",
}

r = requests.get("https://afx.kwayisi.org/chart/brvm/snts", headers=HEADERS, timeout=20)
print("Status:", r.status_code)
matches = re.findall(r'd\("(\d{4}-\d{2}-\d{2})"\)\s*,\s*(\d+)', r.text)
print("Points trouvés:", len(matches))
if matches:
    print("Premier:", matches[0])
    print("Dernier:", matches[-1])

# Test pour tous les symboles
symbols = ["ORAC","SGBC","ETIT","SLBC","ONTBF"]
for sym in symbols:
    headers = {**HEADERS, "Referer": f"https://afx.kwayisi.org/brvm/{sym.lower()}.html"}
    r2 = requests.get(f"https://afx.kwayisi.org/chart/brvm/{sym.lower()}", headers=headers, timeout=15)
    pts = re.findall(r'd\("(\d{4}-\d{2}-\d{2})"\)\s*,\s*(\d+)', r2.text)
    print(f"{sym}: {r2.status_code} — {len(pts)} points (depuis {pts[0][0] if pts else 'N/A'})")
