#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  UEV-ERP Bundle Analysis — T104
#  Generates a visual report of JS/CSS bundle composition.
#
#  Usage:
#    bash scripts/bundle-analyze.sh          # analyze + open report
#    bash scripts/bundle-analyze.sh --json   # output stats JSON only
#    bash scripts/bundle-analyze.sh --ci     # CI mode (fail if budget exceeded)
#
#  Requirements:
#    - Node.js >= 18
#    - webpack-bundle-analyzer (installed on demand)
#    - webpack-stats-plugin (installed on demand)
#
#  Output: scripts/reports/bundle-report.html
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORT_DIR="$SCRIPT_DIR/reports"
REPORT_FILE="$REPORT_DIR/bundle-report.html"
STATS_FILE="$REPORT_DIR/bundle-stats.json"

MODE="html"
if [[ "${1:-}" == "--json" ]]; then MODE="json"; fi
if [[ "${1:-}" == "--ci" ]]; then MODE="ci"; fi

# Performance budgets (in KB)
BUDGET_JS_KB=300
BUDGET_CSS_KB=100
BUDGET_TOTAL_KB=400

mkdir -p "$REPORT_DIR"

echo "[bundle-analyze] Scanning JS/CSS bundles in $REPO..."

# ── Collect file sizes ──
declare -A SIZES
TOTAL_JS=0
TOTAL_CSS=0
TOTAL_ALL=0

# Scan js/ directory
while IFS= read -r -d '' file; do
  size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
  rel="${file#$REPO/}"
  SIZES["$rel"]=$size
  TOTAL_JS=$((TOTAL_JS + size))
  TOTAL_ALL=$((TOTAL_ALL + size))
done < <(find "$REPO/js" -name '*.js' -type f -print0 2>/dev/null)

# Scan css/ directory
while IFS= read -r -d '' file; do
  size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
  rel="${file#$REPO/}"
  SIZES["$rel"]=$size
  TOTAL_CSS=$((TOTAL_CSS + size))
  TOTAL_ALL=$((TOTAL_ALL + size))
done < <(find "$REPO/css" -name '*.css' -type f -print0 2>/dev/null)

# Also check root-level styles.css
for f in "$REPO/styles.css" "$REPO/styles-responsive.css"; do
  if [[ -f "$f" ]]; then
    size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)
    rel="${f#$REPO/}"
    SIZES["$rel"]=$size
    TOTAL_CSS=$((TOTAL_CSS + size))
    TOTAL_ALL=$((TOTAL_ALL + size))
  fi
done

# ── Generate JSON stats ──
echo "{" > "$STATS_FILE"
echo "  \"generated\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> "$STATS_FILE"
echo "  \"budgets\": { \"jsKb\": $BUDGET_JS_KB, \"cssKb\": $BUDGET_CSS_KB, \"totalKb\": $BUDGET_TOTAL_KB }," >> "$STATS_FILE"
echo "  \"totals\": {" >> "$STATS_FILE"
echo "    \"jsBytes\": $TOTAL_JS," >> "$STATS_FILE"
echo "    \"cssBytes\": $TOTAL_CSS," >> "$STATS_FILE"
echo "    \"allBytes\": $TOTAL_ALL," >> "$STATS_FILE"
echo "    \"jsKb\": $((TOTAL_JS / 1024))," >> "$STATS_FILE"
echo "    \"cssKb\": $((TOTAL_CSS / 1024))," >> "$STATS_FILE"
echo "    \"totalKb\": $((TOTAL_ALL / 1024))" >> "$STATS_FILE"
echo "  }," >> "$STATS_FILE"
echo "  \"files\": [" >> "$STATS_FILE"

# Sort files by size (descending) and output
for key in "${!SIZES[@]}"; do
  echo "${SIZES[$key]} $key"
done | sort -rn | while read -r size path; do
  kb=$((size / 1024))
  echo "    {\"path\": \"$path\", \"bytes\": $size, \"kb\": $kb}," >> "$STATS_FILE"
done

# Remove trailing comma from last entry (simple approach)
sed -i '$ s/,$//' "$STATS_FILE" 2>/dev/null || true

echo "  ]" >> "$STATS_FILE"
echo "}" >> "$STATS_FILE"

# ── Output results ──
TOTAL_JS_KB=$((TOTAL_JS / 1024))
TOTAL_CSS_KB=$((TOTAL_CSS / 1024))
TOTAL_KB=$((TOTAL_ALL / 1024))

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Bundle Analysis Report"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  JS:   ${TOTAL_JS_KB}KB / ${BUDGET_JS_KB}KB budget  $([ $TOTAL_JS_KB -le $BUDGET_JS_KB ] && echo '✓' || echo '✗ OVER BUDGET')"
echo "  CSS:  ${TOTAL_CSS_KB}KB / ${BUDGET_CSS_KB}KB budget  $([ $TOTAL_CSS_KB -le $BUDGET_CSS_KB ] && echo '✓' || echo '✗ OVER BUDGET')"
echo "  Total: ${TOTAL_KB}KB / ${BUDGET_TOTAL_KB}KB budget  $([ $TOTAL_KB -le $BUDGET_TOTAL_KB ] && echo '✓' || echo '✗ OVER BUDGET')"
echo ""
echo "  Stats: $STATS_FILE"
echo "═══════════════════════════════════════════════════════"

# ── Mode handling ──
if [[ "$MODE" == "html" ]]; then
  # Generate HTML report
  cat > "$REPORT_FILE" << 'HTMLEOF'
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>UEV-ERP Bundle Report</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;background:#1a1a2e;color:#eee}
table{border-collapse:collapse;width:100%;margin:1rem 0}
th,td{padding:.5rem 1rem;text-align:left;border-bottom:1px solid #333}
th{background:#16213e} tr:hover{background:#0f3460}
.ok{color:#4ecca3} .over{color:#e74c3c}
h1{color:#4ecca3} .summary{display:flex;gap:2rem;margin:1rem 0}
.stat-card{background:#16213e;padding:1rem 2rem;border-radius:8px}
.stat-card h3{margin:0;font-size:.9rem;color:#888}
.stat-card .value{font-size:2rem;font-weight:bold}
</style></head><body>
<h1>📦 UEV-ERP Bundle Analysis</h1>
<div id="summary" class="summary"></div>
<h2>Files (by size, descending)</h2>
<table><thead><tr><th>File</th><th>Size (KB)</th><th>Type</th></tr></thead>
<tbody id="files"></tbody></table>
<script>
fetch('bundle-stats.json').then(r=>r.json()).then(d=>{
  document.getElementById('summary').innerHTML=`
    <div class="stat-card"><h3>JS Total</h3><div class="value ${d.totals.jsKb<=d.budgets.jsKb?'ok':'over'}">${d.totals.jsKb}KB</div></div>
    <div class="stat-card"><h3>CSS Total</h3><div class="value ${d.totals.cssKb<=d.budgets.cssKb?'ok':'over'}">${d.totals.cssKb}KB</div></div>
    <div class="stat-card"><h3>Grand Total</h3><div class="value ${d.totals.totalKb<=d.budgets.totalKb?'ok':'over'}">${d.totals.totalKb}KB</div></div>`;
  const tbody=document.getElementById('files');
  d.files.forEach(f=>{
    const tr=document.createElement('tr');
    const ext=f.path.split('.').pop();
    tr.innerHTML=`<td>${f.path}</td><td>${f.kb}KB</td><td>${ext.toUpperCase()}</td>`;
    tbody.appendChild(tr);
  });
});
</script></body></html>
HTMLEOF
  echo "  Report: $REPORT_FILE"
  # Try to open in browser (macOS/Linux)
  if command -v xdg-open &>/dev/null; then xdg-open "$REPORT_FILE" 2>/dev/null; fi
  if command -v open &>/dev/null; then open "$REPORT_FILE" 2>/dev/null; fi
fi

if [[ "$MODE" == "ci" ]]; then
  # CI mode: exit non-zero if budgets exceeded
  if [[ $TOTAL_JS_KB -gt $BUDGET_JS_KB ]] || [[ $TOTAL_CSS_KB -gt $BUDGET_CSS_KB ]] || [[ $TOTAL_KB -gt $BUDGET_TOTAL_KB ]]; then
    echo "FAIL: Bundle budget exceeded!"
    exit 1
  fi
  echo "PASS: All bundle budgets within limits."
fi
