// ─── BRVM Analyser — Point d'entrée (charge tous les modules) ───
// Architecture 100% autonome — aucune API externe requise
// Données : intégrées + simulation + scraping optionnel en arrière-plan

// Ordre de chargement garanti via les balises <script> dans index.html :
// 1. brvm-stocks.js   → BRVM_STOCKS, BRVM_MARKET_DATA, BRVM_INDICES
// 2. fetcher.js       → BRVMFetcher (4 niveaux fallback)
// 3. fundamental.js   → BRVMFundamental
// 4. technical.js     → BRVMTechnical
// 5. psychological.js → BRVMPsychological
// 6. scoring.js       → BRVMScoring
// 7. pdf-generator.js → BRVMReport
// 8. charts.js        → BRVMCharts
// 9. app-core.js      → BRVMApp (contrôleur principal)
// 10. app-ui.js       → BRVMUI (rendu dashboard + analyses)
// 11. app-portfolio.js → BRVMPortfolio
// 12. app.js          → ce fichier (init + guards)

(function bootstrap() {
  // Vérification intégrité modules
  const required = ['BRVMFetcher','BRVMFundamental','BRVMTechnical','BRVMPsychological',
                     'BRVMScoring','BRVMReport','BRVMCharts','BRVMApp','BRVMUI','BRVMPortfolio'];
  const missing = required.filter(m => typeof window[m] === 'undefined');
  if (missing.length) {
    console.warn('Modules manquants:', missing);
  }

  // Mise à jour automatique du statut marché toutes les minutes
  setInterval(() => {
    const s = BRVMFetcher.getMarketStatus();
    const el = document.getElementById('marketStatus');
    if (!el) return;
    if (s.isOpen) {
      el.textContent = '🟢 Séance en cours';
      el.style.color = '#00A651';
    } else {
      el.textContent = `🔴 Marché fermé${s.nextOpen ? ' — ouvre ' + s.nextOpen : ''}`;
      el.style.color = '#E63946';
    }
  }, 60000);

  // Bridge Android → notification de mise à jour reçue
  window.onAndroidUpdate = function(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      if (data && typeof data === 'object') {
        BRVMFetcher.saveCache(data);
        BRVMApp.refreshData();
      }
    } catch {}
  };

  // Gestion offline/online
  window.addEventListener('online',  () => BRVMApp.showToast('Connexion rétablie — Actualisation...') || BRVMApp.refreshData());
  window.addEventListener('offline', () => BRVMApp.showToast('Mode hors-ligne — Données en cache'));

  // Fermeture modal au clic extérieur
  document.addEventListener('click', e => {
    const modal = document.getElementById('addPositionModal');
    if (modal && e.target === modal) modal.style.display = 'none';
  });

  console.log('BRVM Analyser v1.0.0 — Prêt');
})();
