/* ═══════════════════════════════════════════════════════════════════════
 * procurement-bundle.js — Bundle for Procurement Management Dashboard
 * Пазарджишка община · 5 спортни площадки
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  // Ensure CSS is loaded
  if (typeof document !== 'undefined') {
    var existing = document.getElementById('procurement-css');
    if (!existing) {
      var link = document.createElement('link');
      link.id = 'procurement-css';
      link.rel = 'stylesheet';
      link.href = 'js/features/procurement/procurement.css';
      document.head.appendChild(link);
    }
  }

  // Load all components
  try {
    // ProcurementDashboard is already loaded
    if (typeof window.ProcurementDashboard === 'undefined') {
      var script = document.createElement('script');
      script.src = 'js/features/procurement/ProcurementDashboard.js';
      document.head.appendChild(script);
    }
    if (typeof window.PositionView === 'undefined') {
      var script = document.createElement('script');
      script.src = 'js/features/procurement/PositionView.js';
      document.head.appendChild(script);
    }
    if (typeof window.ComplianceChecker === 'undefined') {
      var script = document.createElement('script');
      script.src = 'js/features/procurement/ComplianceChecker.js';
      document.head.appendChild(script);
    }
    if (typeof window.getProcurementRoutes === 'undefined') {
      var script = document.createElement('script');
      script.src = 'js/features/procurement/ProcurementRoutes.js';
      document.head.appendChild(script);
    }
  } catch (err) {
    console.warn('[ProcurementBundle] Error loading components:', err);
  }

  // Expose module interface
  global.__procurementLoaded = true;
  global.__procurementVersion = '1.0.0';

  // Auto-initialize if configured
  if (global.__autoLoadProcurement !== false) {
    global.__procurementAutoInit = true;
  }

})(window);
