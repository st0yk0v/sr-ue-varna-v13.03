/* ═══════════════════════════════════════════════════════════════════════
 * browserCompat.js — Cross-browser compatibility for Proposal Wizard
 * ═══════════════════════════════════════════════════════════════════════
 * Provides browser detection, polyfills, CSS feature detection,
 * and browser-specific workarounds for the Proposal Wizard.
 *
 * Exposed globally as window.__pwBrowserCompat
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /* ── Browser Detection ── */
  /**
   * Detects the current browser name and version.
   * @returns {Object} { name, version, engine }
   */
  function detectBrowser() {
    var ua = (global.navigator && global.navigator.userAgent) || '';
    var name = 'unknown';
    var version = '';
    var engine = 'unknown';

    if (ua.indexOf('Trident/') !== -1 || ua.indexOf('MSIE ') !== -1) {
      name = 'ie11';
      engine = 'trident';
      var ieMatch = ua.match(/(?:MSIE |rv:)(\d+(\.\d+)?)/);
      version = ieMatch ? ieMatch[1] : '11';
    } else if (ua.indexOf('Edg/') !== -1 || ua.indexOf('Edge/') !== -1) {
      name = 'edge';
      engine = 'blink';
      var edgeMatch = ua.match(/Edg(?:e)?\/(\d+(\.\d+)?)/);
      version = edgeMatch ? edgeMatch[1] : '';
    } else if (ua.indexOf('Chrome/') !== -1 && ua.indexOf('Edg/') === -1 && ua.indexOf('OPR/') === -1) {
      name = 'chrome';
      engine = 'blink';
      var chromeMatch = ua.match(/Chrome\/(\d+(\.\d+)?)/);
      version = chromeMatch ? chromeMatch[1] : '';
    } else if (ua.indexOf('Firefox/') !== -1) {
      name = 'firefox';
      engine = 'gecko';
      var ffMatch = ua.match(/Firefox\/(\d+(\.\d+)?)/);
      version = ffMatch ? ffMatch[1] : '';
    } else if (ua.indexOf('Safari/') !== -1 && ua.indexOf('Chrome/') === -1) {
      name = 'safari';
      engine = 'webkit';
      var safariMatch = ua.match(/Version\/(\d+(\.\d+)?)/);
      version = safariMatch ? safariMatch[1] : '';
    }

    return { name: name, version: version, engine: engine, ua: ua };
  }

  /* ── Polyfills ── */

  // Array.from polyfill (IE11)
  if (typeof global.Array.from !== 'function') {
    global.Array.from = function (arrayLike, mapFn, thisArg) {
      if (arrayLike == null) {
        throw new TypeError('Array.from requires an array-like object');
      }
      var items = Object(arrayLike);
      var len = parseInt(items.length, 10) || 0;
      var result = new Array(len);
      var i;
      if (typeof mapFn === 'function') {
        for (i = 0; i < len; i++) {
          result[i] = mapFn.call(thisArg, items[i], i);
        }
      } else {
        for (i = 0; i < len; i++) {
          result[i] = items[i];
        }
      }
      return result;
    };
  }

  // Object.assign polyfill (IE11)
  if (typeof global.Object.assign !== 'function') {
    global.Object.assign = function (target) {
      if (target == null) {
        throw new TypeError('Cannot convert undefined or null to object');
      }
      var to = Object(target);
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        if (source != null) {
          for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
              to[key] = source[key];
            }
          }
        }
      }
      return to;
    };
  }

  // Promise.prototype.finally polyfill
  if (typeof global.Promise !== 'function' || !global.Promise.prototype.finally) {
    if (typeof global.Promise === 'function') {
      global.Promise.prototype.finally = function (callback) {
        var constructor = this.constructor;
        return this.then(
          function (value) { return constructor.resolve(callback()).then(function () { return value; }); },
          function (reason) { return constructor.resolve(callback()).then(function () { throw reason; }); }
        );
      };
    }
  }

  // String.prototype.startsWith polyfill (IE11)
  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (searchString, position) {
      position = position || 0;
      return this.substr(position, searchString.length) === searchString;
    };
  }

  /* ── CSS Feature Detection ── */
  /**
   * Detects CSS feature support.
   * @returns {Object} Feature support flags
   */
  function detectCSSFeatures() {
    var features = {
      grid: false,
      variables: false,
      flexboxGap: false
    };

    // CSS Grid detection
    var testEl = global.document && global.document.createElement('div');
    if (testEl && testEl.style) {
      // Grid support
      testEl.style.display = 'grid';
      features.grid = testEl.style.display === 'grid';

      // CSS Variables support
      testEl.style.setProperty('--test-var', '1');
      features.variables = testEl.style.getPropertyValue('--test-var') === '1';

      // Flexbox gap detection
      testEl.style.display = 'flex';
      testEl.style.gap = '1px';
      features.flexboxGap = testEl.style.gap === '1px' || testEl.style.gap === '1px 0px';
    }

    return features;
  }

  /* ── Browser-Specific Fixes ── */

  /**
   * Applies browser-specific CSS classes and workarounds.
   * Call once on wizard initialization.
   */
  function applyBrowserFixes() {
    var browser = detectBrowser();
    var cssFeatures = detectCSSFeatures();
    var html = global.document && global.document.documentElement;
    var body = global.document && global.document.body;

    if (!html || !body) return;

    // Add browser class to <html>
    html.classList.add('pw-browser-' + browser.name);
    if (browser.version) {
      html.classList.add('pw-browser-' + browser.name + '-' + browser.version.split('.')[0]);
    }

    // Add engine class
    html.classList.add('pw-engine-' + browser.engine);

    // CSS feature classes
    if (!cssFeatures.grid) {
      html.classList.add('pw-no-grid');
    }
    if (!cssFeatures.variables) {
      html.classList.add('pw-no-variables');
    }
    if (!cssFeatures.flexboxGap) {
      html.classList.add('pw-no-flexbox-gap');
    }

    // Safari flexbox bug workarounds
    if (browser.name === 'safari') {
      html.classList.add('pw-safari-flex-fix');
      // Safari < 14 flexbox min-height bug workaround
      var majorVersion = parseInt(browser.version, 10) || 0;
      if (majorVersion && majorVersion < 14) {
        html.classList.add('pw-safari-flex-min-height-fix');
      }
    }

    // IE11 workarounds
    if (browser.name === 'ie11') {
      html.classList.add('pw-ie11');
      // Disable animations for IE11
      html.classList.add('pw-no-animations');
    }

    // Firefox-specific fixes
    if (browser.name === 'firefox') {
      html.classList.add('pw-firefox');
    }

    // Edge-specific fixes
    if (browser.name === 'edge') {
      html.classList.add('pw-edge');
    }

    // Store detection result for runtime access
    global.__pwBrowserInfo = browser;
    global.__pwCSSFeatures = cssFeatures;
  }

  /**
   * Injects minimal browser-specific CSS fixes as a <style> element.
   * Called by applyBrowserFixes for browsers needing extra CSS.
   */
  function injectBrowserStyles() {
    if (!global.document) return;
    var browser = global.__pwBrowserInfo || detectBrowser();
    var css = '';

    // Safari flexbox gap fallback
    if (browser.name === 'safari' && !(global.__pwCSSFeatures && global.__pwCSSFeatures.flexboxGap)) {
      css += '.pw-safari-flex-fix .pw-modal-box > * { margin-bottom: 16px; }';
      css += '.pw-safari-flex-fix .pw-modal-footer > * { margin-right: 8px; }';
    }

    // IE11 fallbacks
    if (browser.name === 'ie11') {
      css += '.pw-ie11 .pw-modal-box { display: block; }';
      css += '.pw-ie11 .pw-step-content { display: block; }';
      css += '.pw-ie11 .pw-modal-footer { display: block; text-align: right; }';
      css += '.pw-ie11 .pw-modal-footer > * { display: inline-block; margin-left: 8px; }';
    }

    if (css) {
      var styleEl = global.document.createElement('style');
      styleEl.type = 'text/css';
      styleEl.setAttribute('data-pw-browser-fixes', 'true');
      styleEl.appendChild(global.document.createTextNode(css));
      global.document.head.appendChild(styleEl);
    }
  }

  /* ── T68: Enhanced Cross-browser Compatibility ── */

  /**
   * Detects known browser bugs and limitations.
   * @returns {Object} Map of bug names to boolean
   */
  function detectKnownBugs() {
    var browser = detectBrowser();
    var bugs = {
      // Safari: date input min/max not enforced
      safariDateInput: browser.name === 'safari',
      // Firefox: flexbox overflow bug with scroll containers
      firefoxFlexOverflow: browser.name === 'firefox',
      // Safari: position: sticky inside flex container
      safariStickyFlex: browser.name === 'safari',
      // All browsers: smooth scroll support
      smoothScroll: 'scrollBehavior' in (document.documentElement.style || {}),
      // Safari: 100vh includes address bar
      safariVh: browser.name === 'safari',
      // Chrome: input zoom on small screens
      chromeInputZoom: browser.name === 'chrome'
    };
    return bugs;
  }

  /**
   * Apply smooth scroll polyfill if needed.
   */
  function applySmoothScrollPolyfill() {
    if (!document.documentElement.style || 'scrollBehavior' in document.documentElement.style) return;
    // Minimal smooth scroll polyfill using requestAnimationFrame
    if (typeof Element !== 'undefined' && Element.prototype.scrollIntoView) {
      var origScroll = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (arg) {
        if (arg === false || (arg && arg.behavior === 'auto')) {
          origScroll.call(this, false);
        } else {
          origScroll.call(this, true);
        }
      };
    }
  }

  /**
   * Apply Safari 100vh fix using --vh custom property.
   */
  function applySafariVhFix() {
    if (typeof document === 'undefined') return;
    function setVh() {
      var vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', vh + 'px');
    }
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
  }

  /**
   * Apply Chrome input zoom fix (ensure inputs are at least 16px font).
   */
  function applyChromeInputZoomFix() {
    if (typeof document === 'undefined') return;
    var style = document.createElement('style');
    style.type = 'text/css';
    style.setAttribute('pwa-chrome-zoom-fix', 'true');
    style.appendChild(document.createTextNode(
      '@media screen and (max-width: 768px) { ' +
      '.pw-root input, .pw-root select, .pw-root textarea { font-size: 16px !important; } ' +
      '}'
    ));
    document.head.appendChild(style);
  }

  /**
   * Apply all T68 enhanced compatibility fixes.
   * Call once on wizard initialization.
   */
  function applyEnhancedFixes() {
    var browser = detectBrowser();
    var bugs = detectKnownBugs();

    applySmoothScrollPolyfill();

    if (bugs.safariVh) {
      applySafariVhFix();
    }

    if (bugs.chromeInputZoom) {
      applyChromeInputZoomFix();
    }

    // Store bug detection for runtime access
    global.__pwKnownBugs = bugs;
  }

  /* ── Public API ── */
  var api = {
    detectBrowser: detectBrowser,
    detectCSSFeatures: detectCSSFeatures,
    detectKnownBugs: detectKnownBugs,
    applyBrowserFixes: function () {
      applyBrowserFixes();
      injectBrowserStyles();
    },
    applyEnhancedFixes: applyEnhancedFixes,
    applySafariVhFix: applySafariVhFix,
    applyChromeInputZoomFix: applyChromeInputZoomFix
  };

  global.__pwBrowserCompat = api;

})(typeof window !== 'undefined' ? window : this);
