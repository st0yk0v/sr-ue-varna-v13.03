/* ═══════════════════════════════════════════════════════════════════════
 * ProcurementRoutes.js — Маршрутна конфигурация на модула
 * Управление на обществените поръчки
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;

  /* ── Route configuration ── */
  function getProcurementRoutes() {
    return [
      {
        path: '/procurement',
        name: 'procurement',
        label: 'Поръчки',
        icon: 'fa-store',
        component: 'ProcurementDashboard',
        exact: true,
        auth: true,
        roles: ['admin', 'manager', 'inspector']
      },
      {
        path: '/procurement/dashboard',
        name: 'procurement_dashboard',
        label: 'Дашборд',
        icon: 'fa-tachometer-alt',
        component: 'ProcurementDashboard',
        exact: false,
        auth: true,
        roles: ['admin', 'manager', 'inspector']
      },
      {
        path: '/procurement/position/:id',
        name: 'procurement_position',
        label: 'Позиция',
        icon: 'fa-map-marker-alt',
        component: 'PositionView',
        exact: false,
        auth: true,
        roles: ['admin', 'manager', 'inspector']
      },
      {
        path: '/procurement/compliance',
        name: 'procurement_compliance',
        label: 'Съответствие',
        icon: 'fa-clipboard-check',
        component: 'ComplianceChecker',
        exact: false,
        auth: true,
        roles: ['admin', 'manager', 'inspector']
      },
      {
        path: '/procurement/penalties',
        name: 'procurement_penalties',
        label: 'Дългове',
        icon: 'fa-calculator',
        component: 'ComplianceChecker',
        exact: false,
        auth: true,
        roles: ['admin', 'manager']
      },
      {
        path: '/procurement/reports',
        name: 'procurement_reports',
        label: 'Доклади',
        icon: 'fa-file-alt',
        component: 'ProcurementDashboard',
        exact: false,
        auth: true,
        roles: ['admin']
      }
    ];
  }

  /* ── Helper to check route access ── */
  function canAccessRoute(routePath, userRole) {
    var routes = getProcurementRoutes();
    var route = routes.find(function (r) { return r.path === routePath; });
    if (!route) return false;
    if (!route.auth) return true;
    if (!userRole) return false;
    return route.roles.indexOf(userRole) >= 0;
  }

  /* ── Helper to get route component ── */
  function getComponentForRoute(path) {
    var routes = getProcurementRoutes();
    var route = routes.find(function (r) {
      if (r.exact) return r.path === path;
      return path.indexOf(r.path) === 0;
    });
    return route ? route.component : null;
  }

  /* ── Register globally ── */
  if (typeof window !== 'undefined') {
    window.getProcurementRoutes = getProcurementRoutes;
    window.canAccessProcurementRoute = canAccessRoute;
    window.getProcurementComponent = getComponentForRoute;
  }

})(window);
