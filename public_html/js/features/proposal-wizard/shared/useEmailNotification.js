/**
 * useEmailNotification - Hook for sending email notifications.
 *
 * Accepts options:
 *   { toEmail, subject, body, template }
 *
 * Calls api('sendemail', { to, subject, body }) when triggered.
 *
 * Returns { send, status, error } where status is one of:
 *   'idle' | 'sending' | 'sent' | 'error'
 *
 * Supports HTML and plain text templates and tracks sent timestamps.
 *
 * @module proposal-wizard/shared/useEmailNotification
 */

(function (global) {
  'use strict';

  // Email validation regex (basic but practical)
  var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * Validate an email address using the basic regex.
   * @param {string} email
   * @returns {boolean}
   */
  function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return EMAIL_REGEX.test(email.trim());
  }

  /**
   * Select template content based on template type.
   * Falls back to plain body when no template is provided.
   *
   * @param {string} template - 'html' | 'text'
   * @param {string} body
   * @param {string} subject
   * @returns {string}
   */
  function applyTemplate(template, body, subject) {
    if (template === 'html') {
      return React.createElement(
        'div',
        { style: { fontFamily: 'Arial, sans-serif', color: '#333' } },
        React.createElement('h2', { style: { color: '#222' }, key: 'subject' }, subject),
        React.createElement('p', { key: 'body' }, body)
      );
    }
    // plain text template returns the body as-is
    return body;
  }

  /**
   * Main hook factory.
   * Creates a stateful hook that exposes send, status, error and timestamps.
   *
   * @param {Object} defaults - Default options (toEmail, subject, body, template)
   * @returns {{ send: Function, status: string, error: string|null, sentAt: Date|null }}
   */
  function useEmailNotification(defaults) {
    defaults = defaults || {};

    var _status = React.useState('idle');
    var status = _status[0];
    var setStatus = _status[1];

    var _error = React.useState(null);
    var error = _error[0];
    var setError = _error[1];

    var _sentAt = React.useState(null);
    var sentAt = _sentAt[0];
    var setSentAt = _sentAt[1];

    /**
     * Send the email notification.
     * Validates the recipient, calls the api, and updates local state.
     *
     * @param {Object} overrides - Per-call options that override defaults.
     * @returns {Promise<void>}
     */
    function send(overrides) {
      overrides = overrides || {};

      var toEmail = overrides.toEmail || defaults.toEmail;
      var subject = overrides.subject || defaults.subject || '';
      var body = overrides.body || defaults.body || '';
      var template = overrides.template || defaults.template || 'text';

      // Validate recipient
      if (!isValidEmail(toEmail)) {
        setError('Invalid email address: ' + toEmail);
        setStatus('error');
        return Promise.reject(new Error('Invalid email address'));
      }

      setStatus('sending');
      setError(null);

      // Compose body through template (for html, this produces React element;
      // the api call should serialize appropriately)
      var composedBody = applyTemplate(template, body, subject);

      // Persist last-composed payload for reference
      var payload = { to: toEmail, subject: subject, body: composedBody };

      return new Promise(function (resolve, reject) {
        api('sendemail', payload)
          .then(function (response) {
            setStatus('sent');
            setSentAt(new Date());
            setError(null);
            resolve(response);
          })
          .catch(function (err) {
            var message = err && err.message ? err.message : 'Failed to send email';
            setError(message);
            setStatus('error');
            reject(err);
          });
      });
    }

    return {
      send: send,
      status: status,
      error: error,
      sentAt: sentAt,
      isValidEmail: isValidEmail
    };
  }

  // Expose
  global.__pwUseEmailNotification = {
    useEmailNotification: useEmailNotification,
    isValidEmail: isValidEmail
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);