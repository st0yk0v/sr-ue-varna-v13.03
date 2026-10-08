/* ============================================================================
 * ERP – Научни проекти – ИУ Варна  |  Analytics & Session Verification Module
 * Version: 12.21.0-production
 *
 * Отговорности:
 *   • Проследяване на посещения, сесии и потребителско поведение
 *   • Верификация на потребителски сесии и timestamps на admin действия
 *   • Съхранение на анализи локално (localStorage) или към ANALYTICS_ENDPOINT
 *   • Интеграция с ERP app чрез ERPEventBridge (login, approval, status change)
 *
 * DEV_MODE:
 *   true  → всички анализи само в localStorage + конзола (без мрежови заявки)
 *   false → изпраща към window.ERP_CONFIG.ANALYTICS_ENDPOINT при наличен такъв
 *
 * EUPL-1.2 © 2025-2026 Yoni Stoykov – Икономически университет – Варна
 * ============================================================================ */

'use strict';

// ── Storage safety layer ────────────────────────────────────────────────
// Wraps localStorage / sessionStorage so a disabled or full store never
// crashes the analytics module. Falls back to an in-memory object silently.
var _safeLS, _safeSS;
(function(){
    function _makeSafeStore(api){
        var mem = Object.create(null);
        var ok = false;
        try { if (api && typeof api.getItem === 'function') { ok = true; api.setItem('__erp_test__','1'); api.removeItem('__erp_test__'); } } catch (_) {}
        return {
            getItem: function(k){
                if (!ok) return mem[k] || null;
                try { return api.getItem(k); } catch (_) { return mem[k] || null; }
            },
            setItem: function(k, v){
                mem[k] = v;
                if (!ok) return;
                try { api.setItem(k, v); } catch (_) { /* quota exceeded or disabled */ }
            },
            removeItem: function(k){
                delete mem[k];
                if (!ok) return;
                try { api.removeItem(k); } catch (_) {}
            }
        };
    }
    _safeLS = _makeSafeStore(typeof localStorage !== 'undefined' ? localStorage : null);
    _safeSS = _makeSafeStore(typeof sessionStorage !== 'undefined' ? sessionStorage : null);
})();

// ── Safe JSON helpers ───────────────────────────────────────────────────
function _safeJsonParse(raw, fallback){
    if (raw == null) return arguments.length > 1 ? fallback : null;
    try { return JSON.parse(raw); } catch (_) { return arguments.length > 1 ? fallback : null; }
}
function _safeJsonStringify(val, fallback){
    try { return JSON.stringify(val); } catch (_) { return arguments.length > 1 ? fallback : '{}'; }
}

// ── DEV_MODE: auto-detect from ANALYTICS_ENDPOINT presence ─────────────
(function () {
    var ep = String((window.ERP_CONFIG || {}).ANALYTICS_ENDPOINT || '').trim();
    window.DEV_MODE = !ep;
})();

// ── Runtime constants ──────────────────────────────────────────────────
var _ANALYTICS_ENDPOINT = String((window.ERP_CONFIG || {}).ANALYTICS_ENDPOINT || '').trim();
var _APP_VERSION = String(window.__ERP_BUILD || '12.12.0');

// ── Analytics constants ─────────────────────────────────────────────────
var CONFIG = {
    DEBOUNCE_DELAY:     150,
    THROTTLE_DELAY:     200,
    IP_TIMEOUT:         3000,
    DEFAULT_LANGUAGE:    'bg',
    LOCAL_STORAGE_KEY:  'erp_analytics_log',
    ACTIONS_KEY:        'erp_action_log',
    MAX_STORED_EVENTS:   100,
    MAX_STORED_ACTIONS:   200,
    SEND_TIMEOUT:        8000
};

var STATE = {
    language:            _safeLS.getItem('erp-lang') || CONFIG.DEFAULT_LANGUAGE,
    sessionId:           null,
    startTime:           Date.now(),
    trackedInteractions: 0,
    scrollDepth:         0,
    totalFocusTime:      0,
    focusStartTime:      null,
    activeTime:          0,           // ms of true engagement (visible + recent input)
    activeStartTs:       null,        // when current active period began
    lastActivityTs:      Date.now(),  // last user input timestamp
    clientIP:            null,
    clientLocation:      null,
    pageViews:           0,
    sessionType:         'new',
    currentUser:         null,        // email / username
    currentName:         null,        // display name (from Google profile)
    currentRole:         null,
    authenticated:       false,       // true only after real erp-auth login in this session
    appVersion:          _APP_VERSION
};
// Apply saved language preference to <html lang="..."> immediately on load.
(function(){ var l = STATE.language; if (l && l !== 'bg') { try { document.documentElement.lang = l; } catch (_) {} } })();

// Restore persisted user identity from prior session (pre-fill only — does
// NOT set STATE.authenticated; that requires a real erp-auth login event).
(function(){
    var raw = _safeLS.getItem('erp_session_user');
    var u = _safeJsonParse(raw);
    if (u && u.email) {
        STATE.currentUser = u.email;
        STATE.currentRole = u.role || null;
        STATE.currentName = u.name || null;
    }
})();

// Restore cached IP geolocation (24h TTL).
(function(){
    var cached = _safeJsonParse(_safeLS.getItem('erp_location_cache'), null);
    if (cached && cached.location && (Date.now() - (cached.ts || 0) < 86400000)) {
        STATE.clientLocation = cached.location;
        STATE.clientIP = cached.location.ip || null;
    }
})();

// ── Utility helpers ─────────────────────────────────────────────────────
var Utils = {
    $(selector)  { return document.querySelector(selector); },
    $$(selector) { return Array.from(document.querySelectorAll(selector)); },

    debounce(fn, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    throttle(fn, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                fn.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    formatTimestamp(date = new Date()) {
        const pad = n => String(n).padStart(2, '0');
        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    },

    parseUserAgent(ua) {
        ua = ua.toLowerCase();
        let browser = 'Unknown', version = 'Unknown', os = 'Unknown', device = 'Desktop';
        if (ua.includes('edg/') || ua.includes('edge/')) {
            browser = 'Edge';
            version = ua.match(/edg(?:e)?\/(\d+\.\d+)/)?.[1] || 'Unknown';
        } else if (ua.includes('chrome')) {
            browser = 'Chrome';
            version = ua.match(/chrome\/(\d+\.\d+)/)?.[1] || 'Unknown';
        } else if (ua.includes('firefox')) {
            browser = 'Firefox';
            version = ua.match(/firefox\/(\d+\.\d+)/)?.[1] || 'Unknown';
        } else if (ua.includes('safari')) {
            browser = 'Safari';
            version = ua.match(/version\/(\d+\.\d+)/)?.[1] || 'Unknown';
        }
        if (ua.includes('windows'))                        os = 'Windows';
        else if (ua.includes('mac os'))                    os = 'macOS';
        else if (ua.includes('android'))                   os = 'Android';
        else if (ua.includes('ios') || ua.includes('iphone')) os = 'iOS';
        else if (ua.includes('linux'))                     os = 'Linux';
        if (ua.includes('mobile'))       device = 'Mobile';
        else if (ua.includes('tablet')) device = 'Tablet';
        return { browser, version, os, device };
    },

    getScreenResolution() {
        return {
            width:       window.screen.width,
            height:      window.screen.height,
            availWidth:  window.screen.availWidth,
            availHeight: window.screen.availHeight,
            pixelRatio:  window.devicePixelRatio || 1
        };
    },

    getConnection() {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        return conn ? {
            effectiveType: conn.effectiveType,
            downlink:      conn.downlink,
            rtt:           conn.rtt
        } : null;
    },

    getPerformanceMetrics() {
        if (!window.performance || !performance.getEntriesByType) return {};
        const paint = performance.getEntriesByType('paint');
        const nav   = performance.getEntriesByType('navigation')[0];
        return {
            firstPaint:             paint.find(e => e.name === 'first-paint')?.startTime || null,
            firstContentfulPaint:   paint.find(e => e.name === 'first-contentful-paint')?.startTime || null,
            domInteractive:         nav?.domInteractive  || null,
            loadEventEnd:           nav?.loadEventEnd    || null,
            loadTime:               nav ? nav.loadEventEnd - nav.fetchStart : null
        };
    },

    getEngagementLevel(interactions, scrollDepth) {
        const score = (interactions * 0.4) + (scrollDepth * 0.6);
        if (score > 80) return 'Very High';
        if (score > 60) return 'High';
        if (score > 40) return 'Medium';
        if (score > 20) return 'Low';
        return 'Minimal';
    },

    /** Записва аналитично събитие в localStorage. */
    storeAnalyticsEvent(eventType, data) {
        try {
            var stored = _safeLS.getItem(CONFIG.LOCAL_STORAGE_KEY);
            var events = _safeJsonParse(stored, []);
            if (!Array.isArray(events)) events = [];
            events.push({ timestamp: this.formatTimestamp(), eventType: eventType, data: data });
            if (events.length > CONFIG.MAX_STORED_EVENTS) events = events.slice(-CONFIG.MAX_STORED_EVENTS);
            _safeLS.setItem(CONFIG.LOCAL_STORAGE_KEY, _safeJsonStringify(events, '[]'));
        } catch (err) {
            console.warn('[ERP Analytics] storeAnalyticsEvent failed:', err);
        }
    },

    /** Записва действие (login / approval / status-change) в отделен лог. */
    storeActionEvent(actionType, data) {
        try {
            var stored = _safeLS.getItem(CONFIG.ACTIONS_KEY);
            var actions = _safeJsonParse(stored, []);
            if (!Array.isArray(actions)) actions = [];
            actions.push({
                timestamp: this.formatTimestamp(),
                ts:        Date.now(),
                actionType: actionType,
                appVersion: _APP_VERSION,
                data:      data
            });
            if (actions.length > CONFIG.MAX_STORED_ACTIONS) actions = actions.slice(-CONFIG.MAX_STORED_ACTIONS);
            _safeLS.setItem(CONFIG.ACTIONS_KEY, _safeJsonStringify(actions, '[]'));
        } catch (err) {
            console.warn('[ERP Analytics] storeActionEvent failed:', err);
        }
    },

    /** Експорт на аналитичен лог (посещения). */
    exportAnalyticsLog() {
        try {
            var stored = _safeLS.getItem(CONFIG.LOCAL_STORAGE_KEY);
            if (!stored) return null;
            var events = _safeJsonParse(stored);
            if (!events) return null;
            this._downloadJSON(events, 'erp_analytics_' + this.formatTimestamp().replace(/[/: ]/g, '-') + '.json');
            return events;
        } catch (err) {
            console.error('[ERP Analytics] Export failed:', err);
            return null;
        }
    },

    /** Експорт на лог на действия (admin одобрения и т.н.). */
    exportActionLog() {
        try {
            var stored = _safeLS.getItem(CONFIG.ACTIONS_KEY);
            if (!stored) return null;
            var events = _safeJsonParse(stored);
            if (!events) return null;
            this._downloadJSON(events, 'erp_actions_' + this.formatTimestamp().replace(/[/: ]/g, '-') + '.json');
            return events;
        } catch (err) {
            console.error('[ERP Analytics] Action export failed:', err);
            return null;
        }
    },

    _downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }
};

// ── IP & geolocation (ipinfo + ipapi raced, ipify fallback) ─────────────
class IPLocationFetcher {
    async _fetchJson(url, timeout = CONFIG.IP_TIMEOUT) {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), timeout);
        try {
            const res = await fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
            clearTimeout(tid);
            if (!res.ok) return null;
            return await res.json();
        } catch (_) {
            clearTimeout(tid);
            return null;
        }
    }

    /** Single ipinfo call returns IP and full location at once.
     *  PERF: races the two primary providers in parallel and returns the
     *  first usable response, instead of awaiting them sequentially. The
     *  ipify+ipinfo last-ditch chain only runs if both racers fail. Caller
     *  is expected to invoke this off the boot critical path (e.g. behind
     *  requestIdleCallback) — see ANALYTICS.sendPageVisit.
     *  v12.26.0: Skip entirely when running from file:// (CORS blocks all
     *  external fetches from null origin, producing console errors). */
    async getIPAndLocation() {
        if (typeof window !== 'undefined' && window.location &&
            (String(window.location.protocol) === 'file:' || window.location.origin === 'null')) {
            return null;
        }
        const fromIpinfo = info => {
            if (!info || !info.ip) return null;
            const [lat, lng] = String(info.loc || '').split(',');
            return {
                ip: info.ip, country: info.country || 'Unknown', countryCode: info.country || null,
                region: info.region || 'Unknown', city: info.city || 'Unknown', postal: info.postal || null,
                isp: info.org || 'Unknown',
                timezone: info.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null,
                source: 'ipinfo.io'
            };
        };
        const fromIpapi = api => {
            if (!api || api.error || !api.ip) return null;
            return {
                ip: api.ip, country: api.country_name || api.country || 'Unknown',
                countryCode: api.country_code || null, region: api.region || 'Unknown',
                city: api.city || 'Unknown', postal: api.postal || null,
                isp: api.org || api.asn || 'Unknown',
                timezone: api.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                lat: api.latitude ?? null, lng: api.longitude ?? null,
                source: 'ipapi.co'
            };
        };
        // Race primary providers in parallel — 1.8s budget per call instead of
        // the original 3s sequential chain. First non-null wins.
        const racePrimary = () => new Promise(resolve => {
            let pending = 2, settled = false;
            const done = v => { if (!settled) { settled = true; resolve(v); } };
            this._fetchJson('https://ipinfo.io/json', 1800).then(r => {
                const v = fromIpinfo(r); if (v) done(v); else if (--pending === 0) done(null);
            });
            this._fetchJson('https://ipapi.co/json/', 1800).then(r => {
                const v = fromIpapi(r); if (v) done(v); else if (--pending === 0) done(null);
            });
        });
        const winner = await racePrimary();
        if (winner) return winner;
        // Last-ditch: get IP only via ipify, then look it up on ipinfo
        const tiny = await this._fetchJson('https://api.ipify.org?format=json');
        const ip = tiny && tiny.ip;
        if (ip) {
            const lookup = await this._fetchJson(`https://ipinfo.io/${ip}/json`);
            const v = fromIpinfo(lookup);
            if (v) { v.source = 'ipify+ipinfo'; return v; }
            return { ...this._fallback(ip), ip };
        }
        return this._fallback('unknown');
    }

    _fallback(ip) {
        return {
            ip:       ip || 'unknown',
            country:  'Unknown',
            city:     'Unknown',
            region:   'Unknown',
            isp:      'Unknown',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
            lat:      null,
            lng:      null,
            source:   'fallback'
        };
    }
}

// ── Session & behaviour tracking ────────────────────────────────────────
class SessionTracker {
    constructor() {
        this.initSession();
        this.trackActivity();
        this.trackScroll();
        this.trackFocus();
    }

    initSession() {
        var sid = _safeSS.getItem('erp_session');
        if (sid) {
            STATE.sessionType = 'returning';
            var views = parseInt(_safeSS.getItem('session_pageviews') || '0') || 0;
            STATE.pageViews = views + 1;
            _safeSS.setItem('session_pageviews', String(views + 1));
        } else {
            STATE.sessionType = 'new';
            STATE.pageViews   = 1;
            sid = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
            _safeSS.setItem('erp_session',    sid);
            _safeSS.setItem('session_start',  Utils.formatTimestamp());
            _safeSS.setItem('session_start_ts', String(Date.now()));
            _safeSS.setItem('session_pageviews', '1');
        }
        STATE.sessionId = sid;
    }

    /** Activity tracking — covers click, keypress, mousemove (throttled), touch, scroll.
     *  Updates STATE.lastActivityTs. */
    trackActivity() {
        const bumpActivity = () => { STATE.lastActivityTs = Date.now(); };
        const bumpInteraction = () => {
            STATE.lastActivityTs = Date.now();
            STATE.trackedInteractions++;
        };
        // Discrete interactions (click, key, touch) increment counter
        document.addEventListener('click',     bumpInteraction, { passive: true });
        document.addEventListener('keydown',   bumpInteraction, { passive: true });
        document.addEventListener('touchstart', bumpInteraction, { passive: true });
        // Continuous activity (mousemove) — throttled, doesn't count as interaction
        const throttledBump = Utils.throttle(bumpActivity, 1000);
        document.addEventListener('mousemove', throttledBump, { passive: true });
    }

    trackScroll() {
        const handler = Utils.throttle(() => {
            const docHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
            const pct       = (window.scrollY / docHeight) * 100;
            STATE.scrollDepth = Math.max(STATE.scrollDepth, pct);
            STATE.lastActivityTs = Date.now();
        }, 500);
        window.addEventListener('scroll', handler, { passive: true });
    }

    trackFocus() {
        // Start timing immediately — the initial visible period counts.
        if (document.visibilityState === 'visible') {
            STATE.focusStartTime = Date.now();
            STATE.activeStartTs  = Date.now();
        }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                STATE.focusStartTime = Date.now();
                STATE.activeStartTs  = Date.now();
                STATE.lastActivityTs = Date.now();
            } else if (STATE.focusStartTime) {
                STATE.totalFocusTime += Math.floor((Date.now() - STATE.focusStartTime) / 1000);
                STATE.focusStartTime = null;
                // Flush active time when tab hidden
                if (STATE.activeStartTs) {
                    STATE.activeTime += Date.now() - STATE.activeStartTs;
                    STATE.activeStartTs = null;
                }
            }
        });
        // ── Heartbeat: flush focus + active accumulators every 10s while visible ──
        setInterval(() => {
            if (document.visibilityState === 'visible' && STATE.focusStartTime) {
                STATE.totalFocusTime += Math.floor((Date.now() - STATE.focusStartTime) / 1000);
                STATE.focusStartTime = Date.now();
            }
            if (STATE.activeStartTs && document.visibilityState === 'visible') {
                STATE.activeTime += Date.now() - STATE.activeStartTs;
                STATE.activeStartTs = Date.now();
            }
        }, 10000);
    }
}

// ── Analytics sender (localStorage + Formspree endpoint) ────────────────
class AnalyticsSender {
    constructor(ipFetcher) {
        this.ipFetcher     = ipFetcher;
        this.loadTime      = null;
        this._sendingVisit = false;   // concurrent-call dedup for sendPageVisit()
        this._queue = [];              // pending payload batch
        this._flushTimer = null;
        this._SCHEDULE_MS = 5000;      // flush batch every 5s

        // Pre-fetch IP/location after the browser goes idle (non-blocking).
        // Using requestIdleCallback ensures geo lookup never competes with
        // the initial paint, login, or React hydration. The promise resolves
        // lazily; sendPageVisit() awaits it with a 2.5s budget regardless.
        var self = this;
        if (typeof requestIdleCallback !== 'undefined') {
            this._locationPromise = new Promise(function(resolve) {
                requestIdleCallback(function() { resolve(self._prefetchLocation()); }, { timeout: 4000 });
            });
        } else {
            this._locationPromise = new Promise(function(resolve) {
                setTimeout(function() { resolve(self._prefetchLocation()); }, 200);
            });
        }

        // Capture loadTime as soon as page is fully loaded
        if (document.readyState === 'complete') {
            this.loadTime = Utils.getPerformanceMetrics().loadTime || Math.round(performance.now());
        } else {
            window.addEventListener('load', () => {
                this.loadTime = Utils.getPerformanceMetrics().loadTime || Math.round(performance.now());
            }, { once: true });
        }

        // ── Page close (beforeunload + pagehide for iOS Safari) ──
        const sendOnClose = () => this._sendOnClose();
        window.addEventListener('beforeunload', sendOnClose, { once: true });
        window.addEventListener('pagehide',     sendOnClose, { once: true });
    }

    async _prefetchLocation() {
        if (STATE.clientLocation) return;
        try {
            STATE.clientLocation = await this.ipFetcher.getIPAndLocation();
            STATE.clientIP       = STATE.clientLocation ? STATE.clientLocation.ip : null;
            // Cache successful result for 24h so subsequent page loads
            // have geo data before the fetch completes.
            if (STATE.clientLocation && STATE.clientLocation.ip && STATE.clientLocation.ip !== 'unknown') {
                _safeLS.setItem('erp_location_cache', _safeJsonStringify({
                    location: STATE.clientLocation,
                    ts:       Date.now()
                }, '{}'));
            }
        } catch (_) { /* non-blocking */ }
    }

    /** PRIMARY send — fires on tab close (beforeunload / pagehide).
     *  Captures full-session duration, scroll depth, focus time, and role.
     *  Uses sendBeacon for reliability. Declined users → anonymous/visitor.
     *  Each tab close produces its own independent row. */
    _sendOnClose() {
        if (!_ANALYTICS_ENDPOINT) return;

        // Flush any pending focus / active accumulators
        if (STATE.focusStartTime) {
            STATE.totalFocusTime += Math.floor((Date.now() - STATE.focusStartTime) / 1000);
            STATE.focusStartTime = null;
        }
        if (STATE.activeStartTs) {
            STATE.activeTime += Date.now() - STATE.activeStartTs;
            STATE.activeStartTs = null;
        }

        var tech     = this._buildTech();
        var behavior = this._buildBehavior();
        var compact  = this._formatCompact(tech, behavior, 'page_close');
        var payload  = {
            eventType: 'Page visit',
            compact: compact, tech: tech, behavior: behavior,
            location:  STATE.clientLocation,
            session:   this._sessionMeta(),
            appVersion: _APP_VERSION
        };
        Utils.storeAnalyticsEvent('Page visit', payload);

        var authedEx = STATE.authenticated;
        var fspPayload = {
            _analytics_compact: compact,
            _event_type:        'Page visit',
            _trigger:           'page_close',
            _analytics_version: '2.0.0-gdpr-full',
            _timestamp:         Utils.formatTimestamp(),
            _session_id:        STATE.sessionId,
            _user:              authedEx ? (STATE.currentUser || 'anonymous') : 'anonymous',
            _name:              authedEx ? (STATE.currentName || null) : null,
            _role:              authedEx ? (STATE.currentRole || 'visitor') : 'visitor',
            _app_version:       _APP_VERSION
        };
        if (navigator.sendBeacon) {
            try {
                var blob = new Blob([JSON.stringify(fspPayload)], { type: 'text/plain' });
                navigator.sendBeacon(_ANALYTICS_ENDPOINT, blob);
            } catch (_) {}
        }
    }

    /** Direct send of a pre-built Formspree payload (used by sendPageVisit). */
    async _sendToEndpointPayload(fspPayload) {
        if (!_ANALYTICS_ENDPOINT) return false;
        try {
            const controller = new AbortController();
            const tid = setTimeout(function(){controller.abort();}, CONFIG.SEND_TIMEOUT);
            await fetch(_ANALYTICS_ENDPOINT, {
                method:  'POST',
                headers: { 'Accept': 'application/json' },
                body:    JSON.stringify(fspPayload),
                signal:  controller.signal,
                keepalive: true
            });
            clearTimeout(tid);
            return true;
        } catch (_) {
            try {
                var q = _safeJsonParse(_safeLS.getItem('erp_analytics_retry'), []);
                if (Array.isArray(q) && q.length < 10) {
                    q.push({ payload: fspPayload, ts: Date.now() });
                    _safeLS.setItem('erp_analytics_retry', _safeJsonStringify(q, '[]'));
                }
            } catch (_) {}
            return false;
        }
    }

    /** Mid-session analytics event sender — for login, logout, status changes,
     *  or any app-level event that warrants its own Formspree row.  Awaits the
     *  background IP prefetch (2.5 s budget) for geo fields.  Does NOT block
     *  _sendOnClose — each visit may produce multiple independent rows. */
    async sendPageVisit() {
        if (this._sendingVisit || !_ANALYTICS_ENDPOINT) return;
        this._sendingVisit = true;
        try {
            await Promise.race([
                this._locationPromise,
                new Promise(function(r){ setTimeout(r, 2500); })
            ]);
        } catch (_) {}
        // Flush live focus / active accumulators before snapshotting
        if (STATE.focusStartTime) {
            STATE.totalFocusTime += Math.floor((Date.now() - STATE.focusStartTime) / 1000);
            STATE.focusStartTime = Date.now();
        }
        if (STATE.activeStartTs) {
            STATE.activeTime += Date.now() - STATE.activeStartTs;
            STATE.activeStartTs = Date.now();
        }
        var tech     = this._buildTech();
        var behavior = this._buildBehavior();
        var compact  = this._formatCompact(tech, behavior, 'page_visit');
        var payload  = {
            eventType: 'Page visit',
            compact: compact, tech: tech, behavior: behavior,
            location:  STATE.clientLocation,
            session:   this._sessionMeta(),
            appVersion: _APP_VERSION
        };
        Utils.storeAnalyticsEvent('Page visit', payload);
        var authedPV = STATE.authenticated;
        var fspPayload = {
            _analytics_compact: compact,
            _event_type:        'Page visit',
            _trigger:           'mid_session',
            _analytics_version: '2.0.0-gdpr-full',
            _timestamp:         Utils.formatTimestamp(),
            _session_id:        STATE.sessionId,
            _user:              authedPV ? (STATE.currentUser || 'anonymous') : 'anonymous',
            _name:              authedPV ? (STATE.currentName || null) : null,
            _role:              authedPV ? (STATE.currentRole || 'visitor') : 'visitor',
            _app_version:       _APP_VERSION
        };
        await this._sendToEndpointPayload(fspPayload);
        this._sendingVisit = false;
    }

    /** Send a named action event — stored locally AND pushed to Formspree.
     *  Auth events (login/logout) are ALWAYS flushed to the analytics endpoint
     *  so credentials are captured regardless of same-IP or multi-tab dedup.
     *  Mutation events (status_change, admin_approval) also get a Formspree row
     *  for audit trail outside the spreadsheet. */
    async sendAction(actionType, data) {
        var enriched = {
            actionType: actionType,
            ts:        Date.now(),
            timestamp: Utils.formatTimestamp(),
            sessionId: STATE.sessionId,
            user:      STATE.currentUser || (data && data.email) || '',
            role:      STATE.currentRole  || (data && data.role)  || '',
            appVersion: _APP_VERSION
        };
        if (data && typeof data === 'object') {
            Object.keys(data).forEach(function(k){ enriched[k] = data[k]; });
        }
        // Always store locally (audit trail)
        Utils.storeActionEvent(actionType, enriched);

        // ── v6.10.1: Push login/logout/mutation events to Formspree immediately ──
        // Auth events get a dedicated Formspree row so same-IP multi-login is captured.
        // Anonymous visitors and session_verified events are NOT flooded to Formspree
        // (they are covered by the page_visit / page_close rows).
        var isAuthEvent = (actionType === 'user_login' || actionType === 'user_logout');
        var isMutation  = (actionType === 'status_change' || actionType === 'admin_approval');
        if ((isAuthEvent || isMutation) && _ANALYTICS_ENDPOINT) {
            var fspPayload = {
                _analytics_compact: this._formatCompact(this._buildTech(), this._buildBehavior(), actionType),
                _event_type:        'App event',
                _action_type:       actionType,
                _trigger:           'app_event',
                _analytics_version: '2.1.0-gdpr-full',
                _timestamp:         Utils.formatTimestamp(),
                _session_id:        STATE.sessionId,
                _user:              enriched.user || 'anonymous',
                _name:              (data && data.name) || STATE.currentName || null,
                _role:              enriched.role || 'visitor',
                _app_version:       _APP_VERSION,
                _auth_type:         (data && data.authType) || null,
                _from_status:       (data && data.fromStatus) || null,
                _to_status:         (data && data.toStatus) || null,
                _form_id:           (data && (data.formId || data.id)) || null,
                _action:            (data && data.action) || null
            };
            // Fire-and-forget — don't block the UI for analytics
            this._sendToEndpointPayload(fspPayload).catch(function(){});
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    _buildTech() {
        return {
            url:       window.location.href,
            referrer:  document.referrer || 'direct',
            userAgent: Utils.parseUserAgent(navigator.userAgent),
            screen:    Utils.getScreenResolution(),
            connection: Utils.getConnection(),
            loadTime:  this.loadTime
        };
    }

    _buildBehavior() {
        // ── Flush the live focus accumulator before reading ──
        if (document.visibilityState === 'visible' && STATE.focusStartTime) {
            STATE.totalFocusTime += Math.floor((Date.now() - STATE.focusStartTime) / 1000);
            STATE.focusStartTime = Date.now();
        }
        // ── Flush active accumulator (engaged time) ──
        if (document.visibilityState === 'visible' && STATE.activeStartTs) {
            STATE.activeTime += Date.now() - STATE.activeStartTs;
            STATE.activeStartTs = Date.now();
        }
        const idleSec = Math.floor((Date.now() - STATE.lastActivityTs) / 1000);
        return {
            scrollDepth:  Math.round(STATE.scrollDepth),
            timeOnPage:   Math.floor((Date.now() - STATE.startTime) / 1000),
            interactions: STATE.trackedInteractions,
            focusTime:    STATE.totalFocusTime,
            activeTime:   Math.floor(STATE.activeTime / 1000),
            idleSec:      idleSec
        };
    }

    _sessionMeta() {
        // Only include identity fields when the user actually logged in this session.
        // erp_session_user restore does NOT count — avoids stale admin data on exit.
        var authed = STATE.authenticated;
        return {
            id:        STATE.sessionId,
            type:      STATE.sessionType,
            pageViews: STATE.pageViews,
            user:      authed ? STATE.currentUser : null,
            name:      authed ? STATE.currentName : null,
            role:      authed ? STATE.currentRole : null
        };
    }

    _formatCompact(tech, behavior, eventType) {
        const sessionDuration = Math.floor(
            (Date.now() - parseInt(_safeSS.getItem('session_start_ts') || String(Date.now()))) / 1000
        );
        const label  = 'Page visit';
        const header = `\uD83D\uDCCA ERP Visit \u2013 ${label}`;
        const sep    = '\u251C' + '\u2500'.repeat(20);
        const url    = tech.url || '';
        const ref    = tech.referrer || 'direct';
        let b = '';
        b += `\u2502 Timestamp: ${Utils.formatTimestamp()}\n`;
        b += `\u2502 Session: ${STATE.sessionId}\n`;
        b += `\u2502 Duration: ${sessionDuration}s\n`;
        b += `\u2502 Page Views: ${STATE.pageViews}\n`;
        b += `\u2502 Interactions: ${STATE.trackedInteractions}\n`;
        b += `\u2502 Language: ${STATE.language === 'bg' ? '\uD83C\uDDE7\uD83C\uDDEC BG' : '\uD83C\uDDEC\uD83C\uDDE7 EN'}\n`;
        b += `\u2502 Session Type: ${STATE.sessionType === 'new' ? '\uD83C\uDD95 New' : '\uD83D\uDD04 Returning'}\n`;
        if (STATE.authenticated && (STATE.currentUser || STATE.currentName)) {
            if (STATE.currentName) b += `\u2502 Name: ${STATE.currentName}\n`;
            b += `\u2502 Email: ${STATE.currentUser || '\u2014'}\n`;
            b += `\u2502 Username: ${STATE.currentUser || '\u2014'}\n`;
            b += `\u2502 Role: ${STATE.currentRole || '\u2014'}\n`;
        }
        b += `\u2502 App Version: ${_APP_VERSION}\n\n`;
        b += `${sep}\n`;
        var tz = STATE.clientLocation?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
        b += `\u2502 IP: ${STATE.clientIP || STATE.clientLocation?.ip || 'unknown'}\n`;
        b += `\u2502 Country: ${STATE.clientLocation?.country || 'Unknown'}\n`;
        b += `\u2502 City: ${STATE.clientLocation?.city || 'Unknown'}\n`;
        b += `\u2502 Region: ${STATE.clientLocation?.region || 'Unknown'}\n`;
        b += `\u2502 ISP: ${STATE.clientLocation?.isp || 'Unknown'}\n`;
        b += `\u2502 Timezone: ${tz}\n`;
        b += `\u2502 Source: ${STATE.clientLocation?.source || 'unknown'}\n\n`;
        b += `${sep}\n`;
        b += `\u2502 URL: ${url.length > 50 ? url.substring(0, 47) + '\u2026' : url}\n`;
        b += `\u2502 Referrer: ${ref === 'direct' ? 'Direct' : String(ref).substring(0, 50)}\n`;
        b += `\u2502 Browser: ${tech.userAgent.browser} ${tech.userAgent.version}\n`;
        b += `\u2502 OS: ${tech.userAgent.os}\n`;
        b += `\u2502 Device: ${tech.userAgent.device}\n`;
        b += `\u2502 Screen: ${tech.screen.width}x${tech.screen.height}\n`;
        b += `\u2502 Connection: ${tech.connection?.effectiveType || 'Unknown'}\n`;
        b += `\u2502 Load Time: ${tech.loadTime}ms\n\n`;
        b += `${sep}\n`;
        b += `\u2502 Scroll Depth: ${behavior.scrollDepth}%\n`;
        b += `\u2502 Time on Page: ${behavior.timeOnPage}s\n`;
        b += `\u2502 Focus Time: ${behavior.focusTime}s\n`;
        b += `\u2502 Active Time: ${behavior.activeTime || 0}s\n`;
        b += `\u2502 Idle (last input): ${behavior.idleSec || 0}s\n`;
        b += `\u2502 Engagement: ${Utils.getEngagementLevel(behavior.interactions, behavior.scrollDepth)}\n`;
        b += `\u2502 Trigger: ${eventType}\n`;
        return `${header}\n${b}`;
    }
}

// ── ERP event bridge — listens to app-level custom events ───────────────
class ERPEventBridge {
    constructor(sender) {
        this.sender = sender;
        this._bindAppEvents();
    }

    _bindAppEvents() {
        // NOTE: 'erp-ui-mounted' is intentionally NOT tracked as an analytics event —
        // it would produce a duplicate Formspree row alongside the page_visit report.

        // Auth events dispatched via window.dispatchEvent(new CustomEvent('erp-auth', {...}))
        window.addEventListener('erp-auth', (ev) => {
            const d = ev.detail || {};
            if (d.type === 'login') {
                STATE.currentUser  = d.email || d.userId || null;
                STATE.currentRole  = d.role  || null;
                STATE.currentName  = d.name  || d.displayName || d.fullName || null;
                STATE.authenticated = true;   // real login — allow identity fields in analytics
                // ── Persist user identity so analytics survives page reloads ──
                if (STATE.currentUser) {
                    try {
                        _safeLS.setItem('erp_session_user', _safeJsonStringify({
                            email: STATE.currentUser,
                            name:  STATE.currentName,
                            role:  STATE.currentRole,
                            ts:    Date.now()
                        }, '{}'));
                    } catch (_) {}
                }
                this.sender.sendAction('user_login', {
                    email:     d.email,
                    role:      d.role,
                    authType:  d.authType  || 'google',   // 'google' | 'admin' | 'session_restore'
                    timestamp: Utils.formatTimestamp()
                });
                // Record login event in transaction_log for the activity diary
                if (d.email && d.authType !== 'session_restore') {
                    api('loguserlogin', {
                        email: d.email,
                        role: d.role || '',
                        authType: d.authType || 'google',
                        userAgent: navigator.userAgent
                    }).catch(() => {});
                }

            } else if (d.type === 'logout') {
                this.sender.sendAction('user_logout', {
                    email:     STATE.currentUser,
                    role:      STATE.currentRole,
                    timestamp: Utils.formatTimestamp()
                });
                STATE.currentUser  = null;
                STATE.currentRole  = null;
                STATE.currentName  = null;
                STATE.authenticated = false;  // gate identity fields off
                // Clear persisted user identity
                try { _safeLS.removeItem('erp_session_user'); } catch (_) {}
            }
        });

        // Admin status-change / approval events
        // Dispatched by forms-admin.js / dashboard.js:
        //   window.dispatchEvent(new CustomEvent('erp-status-change', { detail: { ... } }))
        window.addEventListener('erp-status-change', (ev) => {
            const d = ev.detail || {};
            this.sender.sendAction('status_change', {
                formId:    d.formId    || d.id,
                fromStatus: d.fromStatus,
                toStatus:   d.toStatus || d.status,
                adminEmail: d.adminEmail || STATE.currentUser,
                role:       STATE.currentRole,
                timestamp:  Utils.formatTimestamp(),
                note:       d.note || d.comment || null
            });
        });

        // Admin approval (contract signing, admin_passed, etc.)
        window.addEventListener('erp-approval', (ev) => {
            const d = ev.detail || {};
            this.sender.sendAction('admin_approval', {
                formId:     d.formId || d.id,
                action:     d.action,          // e.g. 'admin_passed', 'contracted', 'rejected'
                adminEmail: d.adminEmail || STATE.currentUser,
                role:       STATE.currentRole,
                timestamp:  Utils.formatTimestamp(),
                projectCode: d.projectCode || null,
                competition: d.competition  || null
            });
        });

        // Session verification request (called by app on session restore)
        window.addEventListener('erp-session-verify', (ev) => {
            const d = ev.detail || {};
            if (d.email) {
                STATE.currentUser = d.email;
                STATE.currentRole = d.role || STATE.currentRole;
                STATE.currentName = d.name || d.displayName || STATE.currentName;
            }
            this.sender.sendAction('session_verified', {
                email:     d.email,
                role:      d.role,
                sessionType: STATE.sessionType,
                timestamp: Utils.formatTimestamp()
            });
        });
    }
}

// ── Public API — window.ERP_ANALYTICS ───────────────────────────────────
var ERP_ANALYTICS = {
    /**
     * Ръчно запис на действие от app кода:
     *   window.ERP_ANALYTICS.track('admin_approval', { formId, action, adminEmail })
     */
    track(actionType, data = {}) {
        window.analyticsSender?.sendAction(actionType, data);
    },

    /** Вземи всички записани посещения. */
    getLog() {
        return _safeJsonParse(_safeLS.getItem(CONFIG.LOCAL_STORAGE_KEY), []);
    },

    /** Вземи всички записани admin действия. */
    getActionLog() {
        return _safeJsonParse(_safeLS.getItem(CONFIG.ACTIONS_KEY), []);
    },

    exportLog:       () => Utils.exportAnalyticsLog(),
    exportActionLog: () => Utils.exportActionLog(),

    /** Изчисти всички анализи (за тестване). */
    clear() {
        _safeLS.removeItem(CONFIG.LOCAL_STORAGE_KEY);
        _safeLS.removeItem(CONFIG.ACTIONS_KEY);
        console.info('[ERP Analytics] Logs cleared.');
    }
};
window.ERP_ANALYTICS = ERP_ANALYTICS;

// ── Boot ────────────────────────────────────────────────────────────────
function init() {
    // ── Drain failed analytics retries on fresh page load (fire-and-forget) ──
    // Drains FIFO (oldest first) so stuck entries always get a chance, and
    // does NOT block tracker boot — was previously awaited up to 3×8s.
    (function drainRetryQueue(){
        if (!_ANALYTICS_ENDPOINT) return;
        var rq = _safeJsonParse(_safeLS.getItem('erp_analytics_retry'), null);
        if (!Array.isArray(rq) || !rq.length) return;
        // Only retry entries less than 2 hours old
        var cutoff = Date.now() - 2 * 60 * 60 * 1000;
        var fresh = rq.filter(function(e){return e && e.ts > cutoff;});
        // FIFO: drain the OLDEST 3
        var toRetry   = fresh.slice(0, 3);
        var remaining = fresh.slice(toRetry.length);
        // Persist the trimmed queue immediately
        _safeLS.setItem('erp_analytics_retry', _safeJsonStringify(remaining, '[]'));
        toRetry.forEach(function(entry){
            try {
                fetch(_ANALYTICS_ENDPOINT, {
                    method:   'POST',
                    headers:  { 'Accept': 'application/json' },
                    body:     _safeJsonStringify(entry.payload, '{}'),
                    keepalive: true
                }).catch(function(){
                    // Re-queue on failure (bounded to 10).
                    try {
                        var q = _safeJsonParse(_safeLS.getItem('erp_analytics_retry'), []);
                        if (Array.isArray(q) && q.length < 10) {
                            q.push(entry);
                            _safeLS.setItem('erp_analytics_retry', _safeJsonStringify(q, '[]'));
                        }
                    } catch (_) {}
                });
            } catch (_) {}
        });
    })();

    var ipFetcher      = new IPLocationFetcher();
    var analyticsSender = new AnalyticsSender(ipFetcher);
    window.analyticsSender = analyticsSender;

    // Wire up the ERP event bridge (tracks login/approval/status-change)
    new ERPEventBridge(analyticsSender);

    // ── Session tracking: local metrics only (scroll, focus, interactions).
    //    No PII exposed unless STATE.authenticated is set by erp-auth login.
    //    Formspree stream always-on; identity gated behind STATE.authenticated.
    //    _sendOnClose() fires once per tab close — independent multi-visit rows. ──
    if (!window._erpSessionTracked) { window._erpSessionTracked = true; new SessionTracker(); }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

