/**
 * useCsvImport - CSV import hook for bulk data upload
 * 
 * Provides CSV parsing with validation, progress tracking, and cancellation support.
 * Attaches to global.__pwUseCsvImport for cross-module access.
 */

(function() {
  'use strict';

  /**
   * Simple CSV parser with PapaParse-style logic
   * Handles quoted fields, escaped quotes, custom delimiters
   * 
   * @param {string} csvText - Raw CSV text
   * @param {Object} options - Parse options
   * @param {string} options.delimiter - Field delimiter (default: ',')
   * @param {boolean} options.skipEmptyLines - Skip empty lines (default: true)
   * @returns {Array<Array<string>>} Parsed rows as arrays of field values
   */
  function parseCsv(csvText, options = {}) {
    const delimiter = options.delimiter || ',';
    const skipEmptyLines = options.skipEmptyLines !== false;
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < csvText.length) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            // Escaped quote
            currentField += '"';
            i += 2;
            continue;
          } else {
            // Closing quote
            inQuotes = false;
            i++;
            continue;
          }
        } else {
          currentField += char;
          i++;
          continue;
        }
      }

      // Not in quotes
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }

      if (char === delimiter) {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      }

      if (char === '\n' || (char === '\r' && nextChar !== '\n')) {
        // End of row
        currentRow.push(currentField);
        if (!skipEmptyLines || currentRow.some(f => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
        // Handle \r\n
        if (char === '\r' && csvText[i] === '\n') {
          i++;
        }
        continue;
      }

      if (char === '\r' && nextChar === '\n') {
        // \r\n handled above
        i++;
        continue;
      }

      currentField += char;
      i++;
    }

    // Handle last field/row if no trailing newline
    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      if (!skipEmptyLines || currentRow.some(f => f.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * Convert parsed rows to array of objects using header row
   * 
   * @param {Array<Array<string>>} rows - Parsed CSV rows
   * @returns {Array<Object>} Array of objects with header keys
   */
  function rowsToObjects(rows) {
    if (rows.length === 0) return [];
    
    const headers = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1);
    
    return dataRows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] !== undefined ? row[index] : '';
      });
      return obj;
    });
  }

  /**
   * Default validator - accepts all rows
   * @param {Object} row - Row object to validate
   * @returns {{valid: boolean, errors: Array<string>}} Validation result
   */
  function defaultValidate(row) {
    return { valid: true, errors: [] };
  }

  /**
   * Create the CSV import hook
   * 
   * @param {Object} options - Hook options
   * @param {Function} options.onImport - Callback when import completes successfully
   * @param {Function} options.onError - Callback when import encounters errors
   * @param {Function} options.validate - Row validator function (row) => {valid, errors}
   * @returns {Object} Hook API
   */
  function createUseCsvImport(options = {}) {
    const {
      onImport = () => {},
      onError = () => {},
      validate = defaultValidate
    } = options;

    // Internal state
    let cancelled = false;
    let progress = {
      totalRows: 0,
      processedRows: 0,
      validRows: 0,
      errorRows: 0,
      errors: [],
      currentRow: null
    };

    /**
     * Reset progress state
     */
    function resetProgress() {
      progress = {
        totalRows: 0,
        processedRows: 0,
        validRows: 0,
        errorRows: 0,
        errors: [],
        currentRow: null
      };
      cancelled = false;
    }

    /**
     * Update progress and notify
     * @param {Partial<Object>} updates - Progress updates
     */
    function updateProgress(updates) {
      progress = { ...progress, ...updates };
    }

    /**
     * Parse and import CSV data
     * 
     * @param {string} csvText - Raw CSV text to import
     * @param {Object} parseOptions - Parse options
     * @param {string} parseOptions.delimiter - Field delimiter
     * @returns {Promise<{data: Array<Object>, progress: Object}>} Import result
     */
    async function importCsv(csvText, parseOptions = {}) {
      resetProgress();

      try {
        // Parse CSV
        const rows = parseCsv(csvText, {
          delimiter: parseOptions.delimiter || ',',
          skipEmptyLines: parseOptions.skipEmptyLines !== false
        });

        if (rows.length === 0) {
          const result = { data: [], progress: { ...progress } };
          onImport(result);
          return result;
        }

        const totalDataRows = rows.length - 1; // Exclude header
        updateProgress({ totalRows: totalDataRows });

        // Convert to objects
        const objects = rowsToObjects(rows);
        const validData = [];
        const allErrors = [];

        // Process each row with validation
        for (let i = 0; i < objects.length; i++) {
          if (cancelled) {
            updateProgress({ currentRow: null });
            break;
          }

          const row = objects[i];
          updateProgress({ 
            processedRows: i + 1,
            currentRow: row
          });

          const validation = validate(row);
          
          if (validation.valid) {
            validData.push(row);
            updateProgress({ validRows: progress.validRows + 1 });
          } else {
            const rowErrors = validation.errors.map(err => ({
              row: i + 1, // 1-indexed for user display
              field: err.field || 'unknown',
              message: err.message || err,
              data: row
            }));
            allErrors.push(...rowErrors);
            updateProgress({ 
              errorRows: progress.errorRows + 1,
              errors: [...progress.errors, ...rowErrors]
            });
          }

          // Yield to event loop for cancellation check
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        const finalProgress = { ...progress, currentRow: null };
        const result = { 
          data: validData, 
          progress: finalProgress,
          errors: allErrors
        };

        if (allErrors.length > 0) {
          onError(result);
        } else {
          onImport(result);
        }

        return result;
      } catch (err) {
        const errorResult = {
          data: [],
          progress: { ...progress, currentRow: null },
          errors: [{ message: err.message, stack: err.stack }]
        };
        onError(errorResult);
        throw err;
      }
    }

    /**
     * Cancel ongoing import
     */
    function cancel() {
      cancelled = true;
    }

    /**
     * Get current progress
     * @returns {Object} Current progress state
     */
    function getProgress() {
      return { ...progress };
    }

    /**
     * Check if import is cancelled
     * @returns {boolean}
     */
    function isCancelled() {
      return cancelled;
    }

    // Return hook API
    return {
      importCsv,
      cancel,
      getProgress,
      isCancelled,
      parseCsv,
      rowsToObjects
    };
  }

  // Create and export the hook
  const useCsvImport = createUseCsvImport;

  // Attach to global for cross-module access
  if (typeof global !== 'undefined') {
    global.__pwUseCsvImport = useCsvImport;
  } else if (typeof window !== 'undefined') {
    window.__pwUseCsvImport = useCsvImport;
  }

  // Also support CommonJS/ESM export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = useCsvImport;
  }

  // Export for ES modules
  if (typeof exports !== 'undefined') {
    exports.useCsvImport = useCsvImport;
  }
})();