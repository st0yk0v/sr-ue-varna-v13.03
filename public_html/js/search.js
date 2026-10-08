/* ═══════════════════════════════════════════════════════════════════════════
 *  js/processors/search.js — Client-side Search Engine (v12.27.0)
 *
 *  Локално търсене с индексиране и филтриране.
 *  Използва Web Workers когато е възможно за големи данни.
 *
 *  ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /**
   * Филтриране на масив от обекти по search term
   * @param {Array} items - масив от обекти
   * @param {string} query - търсен текст
   * @param {string[]} fields - полета, в които се търси
   * @param {Object} opts - { caseSensitive, fuzzy, maxResults }
   * @returns {Array}
   */
  function search(items, query, fields, opts) {
    if (!items || !items.length || !query) return items || [];
    
    opts = opts || {};
    var q = opts.caseSensitive ? String(query).trim() : String(query).trim().toLowerCase();
    var maxResults = opts.maxResults || 100;
    var threshold = opts.fuzzy ? 0.6 : 1.0; // fuzzy match threshold
    
    if (!q || q.length < 1) return [];
    
    var results = [];
    var searchFields = Array.isArray(fields) && fields.length > 0 ? fields : Object.keys(items[0] || {});
    
    for (var i = 0; i < items.length; i++) {
      if (results.length >= maxResults) break;
      
      var item = items[i];
      var matched = false;
      var score = 0;
      
      for (var fi = 0; fi < searchFields.length && !matched; fi++) {
        var val = String(item[searchFields[fi]] || '');
        if (!opts.caseSensitive) val = val.toLowerCase();
        
        // Exact match
        if (val.indexOf(q) !== -1) {
          matched = true;
          score = 100;
          break;
        }
        
        // Fuzzy match (word level)
        if (opts.fuzzy) {
          var words = val.split(/\s+/);
          for (var wi = 0; wi < words.length; wi++) {
            var sim = _similarity(words[wi], q);
            if (sim >= threshold) {
              matched = true;
              score = Math.round(sim * 100);
              break;
            }
          }
        }
      }
      
      if (matched) {
        results.push({ item: item, score: score });
      }
    }
    
    // Sort by score descending
    results.sort(function(a, b) { return b.score - a.score; });
    
    return results.map(function(r) { return r.item; });
  }

  /**
   * Филтриране по статус/тип/други критерии
   * @param {Array} items
   * @param {Object} filters - { status: 'active', projectType: 'ФНИ', ... }
   * @returns {Array}
   */
  function filter(items, filters) {
    if (!items || !filters) return items || [];
    
    var filterKeys = Object.keys(filters);
    if (filterKeys.length === 0) return items;
    
    return items.filter(function(item) {
      for (var fi = 0; fi < filterKeys.length; fi++) {
        var key = filterKeys[fi];
        var filterVal = String(filters[key] || '').toLowerCase();
        var itemVal = String(item[key] || '').toLowerCase();
        
        if (filterVal && itemVal.indexOf(filterVal) === -1) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Сортиране
   * @param {Array} items
   * @param {string} sortBy - поле
   * @param {string} order - 'asc' или 'desc'
   * @returns {Array}
   */
  function sort(items, sortBy, order) {
    if (!items || !sortBy) return items || [];
    var dir = order === 'desc' ? -1 : 1;
    
    return items.slice().sort(function(a, b) {
      var va = a[sortBy];
      var vb = b[sortBy];
      
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dir;
      }
      return String(va || '').localeCompare(String(vb || '')) * dir;
    });
  }

  /**
   * Пагинация
   * @param {Array} items
   * @param {number} page - 1-based
   * @param {number} pageSize
   * @returns {{ items: Array, total: number, page: number, totalPages: number }}
   */
  function paginate(items, page, pageSize) {
    page = Math.max(1, parseInt(page) || 1);
    pageSize = Math.min(100, Math.max(1, parseInt(pageSize) || 20));
    
    var start = (page - 1) * pageSize;
    var end = Math.min(start + pageSize, items.length);
    
    return {
      items: items.slice(start, end),
      total: items.length,
      page: page,
      totalPages: Math.ceil(items.length / pageSize)
    };
  }

  // ── String similarity (Levenshtein-based) ──
  function _similarity(s1, s2) {
    if (s1 === s2) return 1;
    if (!s1 || !s2) return 0;
    
    var len1 = s1.length;
    var len2 = s2.length;
    var maxLen = Math.max(len1, len2);
    if (maxLen === 0) return 1;
    
    var dist = _levenshtein(s1, s2);
    return 1 - (dist / maxLen);
  }

  function _levenshtein(s1, s2) {
    var len1 = s1.length;
    var len2 = s2.length;
    var matrix = [];
    
    for (var i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (var j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }
    
    for (var i = 1; i <= len1; i++) {
      for (var j = 1; j <= len2; j++) {
        var cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    return matrix[len1][len2];
  }

  // ── Export ──
  global.__uevSearch = {
    search: search,
    filter: filter,
    sort: sort,
    paginate: paginate
  };

})(window);
