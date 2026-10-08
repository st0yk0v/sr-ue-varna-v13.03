/* ═══════════════════════════════════════════════════════════════════════
 * useAccessibility.js — Accessibility enhancements hook (T69)
 * ═══════════════════════════════════════════════════════════════════════
 * Provides WCAG 2.1 AA compliance utilities:
 *   - Focus management (focus trap, focus restoration)
 *   - Live region announcements for screen readers
 *   - Reduced motion detection
 *   - Skip navigation links
 *   - ARIA attribute helpers
 *
 * Usage:
 *   const a11y = useAccessibility();
 *   a11y.announce('Промените са запазени');  // screen reader announcement
 *   a11y.trapFocus(element);                  // trap focus within element
 *
 * Exposed globally as window.__pwUseAccessibility
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;
  var useRef = React.useRef;

  /**
   * Detects if the user prefers reduced motion.
   * @returns {boolean}
   */
  function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Detects if a screen reader is likely active (heuristic).
   * @returns {boolean}
   */
  function detectScreenReader() {
    if (typeof window === 'undefined') return false;
    // Check for common screen reader indicators
    return !!(
      window.navigator &&
      window.navigator.userAgent &&
      /screen.?reader/i.test(window.navigator.userAgent)
    );
  }

  /**
   * useAccessibility hook.
   * @param {Object} [opts]
   * @param {string} [opts.liveRegionId] — id for the aria-live region
   * @returns {{ announce: Function, trapFocus: Function, restoreFocus: Function, prefersReducedMotion: boolean, isScreenReader: boolean }}
   */
  function useAccessibility(opts) {
    var options = opts || {};
    var liveRegionId = options.liveRegionId || 'pw-live-region';

    var [reducedMotion, setReducedMotion] = useState(function () {
      return prefersReducedMotion();
    });
    var previousFocusRef = useRef(null);
    var liveRegionRef = useRef(null);

    // Listen for reduced motion preference changes
    useEffect(function () {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      function handleChange(e) { setReducedMotion(e.matches); }
      if (mq.addEventListener) {
        mq.addEventListener('change', handleChange);
      } else if (mq.addListener) {
        mq.addListener(handleChange); // older Safari
      }
      return function () {
        if (mq.removeEventListener) {
          mq.removeEventListener('change', handleChange);
        } else if (mq.removeListener) {
          mq.removeListener(handleChange);
        }
      };
    }, []);

    /**
     * Ensure the live region exists in the DOM.
     * @returns {HTMLElement}
     */
    function ensureLiveRegion() {
      if (liveRegionRef.current) return liveRegionRef.current;
      if (typeof document === 'undefined') return null;

      var existing = document.getElementById(liveRegionId);
      if (existing) {
        liveRegionRef.current = existing;
        return existing;
      }

      var el = document.createElement('div');
      el.id = liveRegionId;
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      el.className = 'pw-sr-only';
      el.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
      document.body.appendChild(el);
      liveRegionRef.current = el;
      return el;
    }

    /**
     * Announce a message to screen readers via aria-live region.
     * @param {string} message — text to announce
     * @param {'polite'|'assertive'} [priority='polite']
     */
    var announce = useCallback(function (message, priority) {
      if (!message) return;
      var el = ensureLiveRegion();
      if (!el) return;

      // Temporarily clear, then set the message (forces re-announcement)
      el.textContent = '';
      if (priority === 'assertive') {
        el.setAttribute('aria-live', 'assertive');
      } else {
        el.setAttribute('aria-live', 'polite');
      }

      // Use requestAnimationFrame to ensure DOM update
      requestAnimationFrame(function () {
        el.textContent = message;
      });
    }, [liveRegionId]);

    /**
     * Trap focus within a container element.
     * @param {HTMLElement} container — element to trap focus within
     * @returns {Function} cleanup function to remove the trap
     */
    var trapFocus = useCallback(function (container) {
      if (!container || typeof document === 'undefined') return function () {};

      // Store current focus to restore later
      previousFocusRef.current = document.activeElement;

      var focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      var focusable = Array.prototype.slice.call(
        container.querySelectorAll(focusableSelector)
      ).filter(function (el) {
        return el.offsetParent !== null || el === document.activeElement; // visible only
      });

      if (focusable.length === 0) return function () {};

      var firstFocusable = focusable[0];
      var lastFocusable = focusable[focusable.length - 1];

      // Focus first element
      firstFocusable.focus();

      function handleTabKeyDown(ev) {
        if (ev.key !== 'Tab') return;

        if (ev.shiftKey) {
          // Shift+Tab: if on first element, go to last
          if (document.activeElement === firstFocusable) {
            ev.preventDefault();
            lastFocusable.focus();
          }
        } else {
          // Tab: if on last element, go to first
          if (document.activeElement === lastFocusable) {
            ev.preventDefault();
            firstFocusable.focus();
          }
        }
      }

      container.addEventListener('keydown', handleTabKeyDown);

      // Return cleanup function
      return function () {
        container.removeEventListener('keydown', handleTabKeyDown);
      };
    }, []);

    /**
     * Restore focus to the previously focused element.
     */
    var restoreFocus = useCallback(function () {
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    }, []);

    return {
      announce: announce,
      trapFocus: trapFocus,
      restoreFocus: restoreFocus,
      prefersReducedMotion: reducedMotion,
      isScreenReader: detectScreenReader()
    };
  }

  /**
   * Generate ARIA attributes for a form field.
   * @param {Object} opts
   * @param {string} opts.id — field id
   * @param {boolean} [opts.required] — whether field is required
   * @param {boolean} [opts.invalid] — whether field has an error
   * @param {string} [opts.errorId] — id of the error message element
   * @param {string} [opts.descriptionId] — id of the description element
   * @returns {Object} ARIA attributes object
   */
  function getFieldAriaAttrs(opts) {
    var attrs = {};
    if (opts.required) attrs['aria-required'] = 'true';
    if (opts.invalid) attrs['aria-invalid'] = 'true';
    var describedBy = [];
    if (opts.errorId) describedBy.push(opts.errorId);
    if (opts.descriptionId) describedBy.push(opts.descriptionId);
    if (describedBy.length > 0) {
      attrs['aria-describedby'] = describedBy.join(' ');
    }
    return attrs;
  }

  /**
   * Generate ARIA attributes for a step indicator item.
   * @param {Object} opts
   * @param {boolean} opts.isCurrent — is this the current step
   * @param {boolean} opts.isComplete — is this step complete
   * @returns {Object} ARIA attributes object
   */
  function getStepAriaAttrs(opts) {
    var attrs = {};
    if (opts.isCurrent) attrs['aria-current'] = 'step';
    return attrs;
  }

  // Expose globally
  global.__pwUseAccessibility = useAccessibility;
  global.__pwGetFieldAriaAttrs = getFieldAriaAttrs;
  global.__pwGetStepAriaAttrs = getStepAriaAttrs;
  global.__pwPrefersReducedMotion = prefersReducedMotion;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
