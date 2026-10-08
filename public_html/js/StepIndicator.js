/* ═══════════════════════════════════════════════════════════════════════
 * StepIndicator.js — Wizard step progress indicator (stepper)
 * ═══════════════════════════════════════════════════════════════════════
 * Props: {
 *   steps: Array<{index: number, label_bg: string}>,
 *   currentStep: number,
 *   validation: { step1: Object, step2: Object, step3: Object },
 *   onStepClick?: Function
 * }
 * States: upcoming | current | complete | error
 * Responsive: collapses to compact "Стъпка X от 3" below 768px.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  /**
   * Wizard step navigation indicator (3 steps) with validity markers.
   * @param {Object} props
   * @param {Array<{index:number, label_bg:string}>} [props.steps] — step definitions
   * @param {number} [props.currentStep=1] — active step (1..3)
   * @param {Object} [props.validation] — { step1|step2|step3: { isValid, errors } }
   * @param {Function} [props.onStepClick] — called with the target step index
   * @returns {React.ReactElement}
   */
  function StepIndicator(props) {
    var steps = props.steps || [
      { index: 1, label_bg: 'Основна информация' },
      { index: 2, label_bg: 'Документи' },
      { index: 3, label_bg: 'Бюджет' }
    ];
    var currentStep = props.currentStep || 1;
    var validation = props.validation || {};
    var onStepClick = props.onStepClick;

    // Responsive: detect viewport width for compact mode
    // v12.28.2-UI: Lazy initializer — prevents window.innerWidth being called on every render
    var _width = useState(function () { return window.innerWidth; });
    var viewWidth = _width[0];
    var setViewWidth = _width[1];

    useEffect(function () {
      function handleResize() { setViewWidth(window.innerWidth); }
      window.addEventListener('resize', handleResize);
      return function () { window.removeEventListener('resize', handleResize); };
    }, [setViewWidth]);

    var isCompact = viewWidth < 768;

    // v3.39.1-a11y: Added loading state indicator
    var _isLoading = useState(false);
    var isLoading = _isLoading[0];
    var setLoading = _isLoading[1];

    // Compact mode: simple text + progress bar
    if (isCompact) {
      var total = steps.length;
      var pct = (currentStep / total) * 100;
      return e('div', { className: 'pw-stepper', role: 'navigation', 'aria-label': 'Стъпки на създаване' },
        e('span', {
          style: { fontSize: 13, color: 'var(--pw-neutral-500)', marginRight: 8 },
          'aria-live': 'polite',
          'aria-atomic': 'true'
        },
          'Стъпка ' + currentStep + ' от ' + total
        ),
        e('div', {
          style: {
            flex: 1,
            height: 4,
            background: 'var(--pw-neutral-200)',
            borderRadius: 2,
            overflow: 'hidden'
          },
          role: 'progressbar',
          'aria-valuenow': pct,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-label': 'Напредване в създаването'
        },
          e('div', {
            style: {
              width: pct + '%',
              height: '100%',
              background: currentStep === total ? 'var(--pw-success-600)' : 'var(--pw-navy-700)',
              borderRadius: 2,
              transition: 'width 0.25s ease'
            }
          })
        )
      );
    }

    // Desktop mode: full step indicators
    function getStepState(stepIdx) {
      if (stepIdx === currentStep) return 'current';
      if (stepIdx < currentStep) {
        var val = validation['step' + stepIdx];
        if (val && val.isValid === false && val.errors && val.errors.length > 0) return 'error';
        return 'complete';
      }
      return 'upcoming';
    }

    function isClickable(stepIdx) {
      // Can click: completed steps, current step, or error steps
      var st = getStepState(stepIdx);
      if (st === 'complete' || st === 'current' || st === 'error') return true;
      // Check all previous steps are valid
      for (var i = 1; i < stepIdx; i++) {
        var v = validation['step' + i];
        if (!v || !v.isValid) return false;
      }
      return true;
    }

    return e('div', { className: 'pw-stepper', role: 'navigation', 'aria-label': 'Стъпки на създаване' },
      steps.map(function (step, idx) {
        var stepState = getStepState(step.index);
        var clickable = isClickable(step.index);
        var itemClass = 'pw-step-item pw-' + stepState;
        if (clickable && onStepClick) itemClass += ' pw-clickable';

        var elements = [];

        // Connector (before this step, except first)
        if (idx > 0) {
          var prevState = getStepState(steps[idx - 1].index);
          var connClass = 'pw-step-connector' + (prevState === 'complete' ? ' pw-complete' : '');
          elements.push(e('div', { key: 'conn-' + idx, className: connClass }));
        }

        // Step circle + label
        elements.push(
          e('div', {
            key: 'step-' + step.index,
            className: itemClass,
            onClick: clickable && onStepClick ? function () { onStepClick(step.index); } : undefined,
            onKeyDown: clickable && onStepClick ? function (ev) {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                onStepClick(step.index);
              }
            } : undefined,
            tabIndex: clickable ? 0 : -1,
            role: clickable ? 'button' : undefined,
            'aria-current': stepState === 'current' ? 'step' : undefined,
            'title': clickable ? 'Натисни за да се насочиш към стъпка ' + step.index : undefined
          },
            e('span', { className: 'pw-step-number', 'aria-hidden': 'true' },
              stepState === 'complete' ? '✓' : step.index
            ),
            e('span', { className: 'pw-step-label' }, step.label_bg)
          )
        );

        return elements;
      })
    );
  }

  global.__pwStepIndicator = React.memo(StepIndicator);

})(window);
