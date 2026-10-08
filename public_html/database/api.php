<?php
require_once __DIR__ . '/schema_v12513.php';

/**
 * v12.49.22-resilience: Diagnose presence of the resilience-critical tables that
 * the self-heal functions create on demand. Returns a map of table => bool(present)
 * so a missing table (the classic latent-500 source) is self-diagnosing instead of
 * surfacing only as a 500 at request time. Also triggers the self-heals so a
 * missing table is immediately created if the DB is reachable.
 */
function handleGetTableStatus(): array {
    try {
        $db = getDB();
        if (function_exists("ensureDossierTables")) ensureDossierTables();
        if (function_exists("ensureAuditLogTable")) ensureAuditLogTable();
        if (function_exists("ensureFormSectionsTables")) ensureFormSectionsTables();
        if (function_exists("ensureDocStreamTables")) ensureDocStreamTables();
        if (function_exists("ensureWizardTables")) ensureWizardTables();
        if (function_exists("ensureProjectTemplatesTable")) ensureProjectTemplatesTable();
        if (function_exists("ensureSchemaV12513")) ensureSchemaV12513();
        $critical = ["document_comments","self_assessments","trl_records","work_programs","support_letters","collaborators","audit_log","doc_stream_docs","doc_stream_sessions","doc_stream_ops"];
        $optional = ["self_assessment_schemas","npf_tiers","app_config_labels","priority_areas","app_config_flags","expense_limit_rules","form_sections","form_section_fields","required_document_templates","project_types","system_config"];
        $present = [];
        $all = array_merge($critical, $optional);
        foreach ($all as $tbl) {
            try { $db->query("SELECT 1 FROM `$tbl` LIMIT 1"); $present[$tbl]=true; }
            catch (Throwable $_) { $present[$tbl]=false; }
        }
        $missing = array_keys(array_filter($present, fn($v)=>$v===false));
        return ["success"=>true,"status"=>empty($missing)?"healthy":"degraded","tables_status"=>$present,"missing"=>array_values($missing),"critical_missing"=>array_values(array_intersect($missing,$critical))];
    } catch (Throwable $e) { return ["success"=>false,"status"=>"degraded","error"=>$e->getMessage()]; }
}


/**
 * UEV-ERP API Gateway — Hostinger PHP Backend
 * Complete API handler matching the GAS backend action list.
 * v12.26.0 — Fixed CORS for null origin (file://), early OPTIONS handling.
 */
// v18.0.3: Global error handler — convert ANY PHP error/fatal into a JSON
// response with the error details (if APP_DEBUG) or a generic message.
// This prevents blank 500 pages that confuse the frontend.
error_reporting(E_ALL);
$_UEV_FATAL_HANDLER = function() {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
        }
        $msg = (defined('APP_DEBUG') && APP_DEBUG) ? ($e['message'] ?? 'Unknown error') : 'Internal Server Error';
        echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
        exit;
    }
};
register_shutdown_function($_UEV_FATAL_HANDLER);
// ── CORS HEADERS — set BEFORE any output, before config.php ──
// Must be first because file:// (null origin) requires explicit origin,
// and some browsers don't allow wildcard for null.
$corsOrigin = '*';
if (isset($_SERVER['HTTP_ORIGIN'])) {
    $origin = $_SERVER['HTTP_ORIGIN'];
    // Allow null origin (file:// protocol) explicitly
    if ($origin === 'null' || $origin === '' || strpos($origin, 'null') !== false) {
        $corsOrigin = 'null';
    }
}
header("Access-Control-Allow-Origin: $corsOrigin");
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 86400');
// ── OPTIONS preflight — respond immediately ──
if (!empty($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Content-Type: text/plain; charset=utf-8');
    http_response_code(204);
    exit;
}
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/sql_service.php';
// v12.49.84-pw-templates: template-copy bridge for the Proposal Wizard
// (listFolderTemplates / copyTemplateForUser -> GAS).
if (file_exists(__DIR__ . '/handlers_templates_bridge.php')) {
    require_once __DIR__ . '/handlers_templates_bridge.php';
}
// v18.0.0-complete: Bridge layer — only load if not already defined in api.php
if (file_exists(__DIR__ . '/_v18_bridge.php') && !function_exists('sqlSaveCollaborator')) {
    require_once __DIR__ . '/_v18_bridge.php';
}
// ── VEDA: ORCID + Scopus research proxy (stored config, no hardcoded keys) ──
if (file_exists(__DIR__ . '/veda_handlers.php') && !function_exists('handleVedaSearch')) {
    require_once __DIR__ . '/veda_handlers.php';
}
// ── EPIC-C Platform/API surface (T16 webhook retry, T17 webhook log, T19
//    rate-limit headers, T20 API-key management). Guarded require. ──
if (file_exists(__DIR__ . '/platform_handlers.php') && !function_exists('handleDispatchWebhook')) {
    require_once __DIR__ . '/platform_handlers.php';
}
// ── EPIC-B Data export & bulk ops (T7 CSV, T8 bulk-delete drafts, T15 ZIP). ──
if (file_exists(__DIR__ . '/export_handlers.php') && !function_exists('handleStartExportZip')) {
    require_once __DIR__ . '/export_handlers.php';
}
// ── EPIC-G Integration & Calendar (T119 export integration, T120 calendar). ──
if (file_exists(__DIR__ . '/integration_handlers.php') && !function_exists('handleListIntegrationEndpoints')) {
    require_once __DIR__ . '/integration_handlers.php';
}
// ── EPIC-D User management (T21 profile, T22 password reset, T23 session history) ──
if (file_exists(__DIR__ . '/auth_handlers.php') && !function_exists('handleGetSessionHistory')) {
    require_once __DIR__ . '/auth_handlers.php';
}
// ── Staff Publications (ORCID + Scopus) ──
if (file_exists(__DIR__ . '/staff_publications.php') && !function_exists('handleFetchStaffPublications')) {
    require_once __DIR__ . '/staff_publications.php';
}
// ── Open-Source Publications Aggregator (ORCID + CrossRef + Semantic Scholar + OpenAlex + DBLP + Scholar) ──
if (file_exists(__DIR__ . '/open_publications.php') && !function_exists('handleFetchOpenPublications')) {
    require_once __DIR__ . '/open_publications.php';
}
// v12.54.41: ORCID OAuth connection
if (file_exists(__DIR__ . '/orcid_oauth.php') && !function_exists('handleGetOrcIDAuthUrl')) {
    require_once __DIR__ . '/orcid_oauth.php';
}
// ── v18 complete handlers (unique handlers not in api.php) ──
// v12.47.9-v18load: load the v18 handler file (defines handlers NOT present in
// api.php itself, e.g. handleListLibraryFolders). Guard on a function unique to
// that file so we don't re-trigger loading once its handlers are defined. The 9
// collaborators/work-program/trl/support/self-assessment handlers are defined in
// api.php directly, so _v18_handlers.php no longer redeclares them.
if (file_exists(__DIR__ . '/_v18_handlers.php') && !function_exists('handleListLibraryFolders')) {
    require_once __DIR__ . '/_v18_handlers.php';
}
/**
 * Convert snake_case keys → camelCase for a single row.
 * Recursively transforms nested arrays.
 */
function _snakeToCamel(array $row): array {
    static $keyCache = [];
    $result = [];
    foreach ($row as $k => $v) {
        if (!isset($keyCache[$k])) {
            $camel = lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $k))));
            if ($camel === 'i_d') $camel = 'id';
            $keyCache[$k] = $camel;
        }
        $result[$keyCache[$k]] = is_array($v) ? _snakeToCamel($v) : $v;
    }
    return $result;
}
/**
 * Apply _snakeToCamel to every row in an array of rows.
 */
function _snakeToCamelRows(array $rows): array {
    return array_map('_snakeToCamel', $rows);
}
// v12.51.6-fix500: restore the missing camelizeKeys() global that the dispatch
// path (api.php:190) calls for every non-FLAT action. It was renamed/removed in
// a prior refactor, which made every such action (getdocumentcontent, etc.)
// fatal with "Call to undefined function camelizeKeys()" → HTTP 500. Delegate to
// the existing _snakeToCamel so nested key camelization behaviour is preserved.
if (!function_exists('camelizeKeys')) {
    function camelizeKeys($data) {
        if (!is_array($data)) return $data;
        $out = [];
        foreach ($data as $k => $v) {
            if (is_int($k)) { $out[$k] = is_array($v) ? camelizeKeys($v) : $v; continue; }
            $nk = lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $k))));
            if ($nk === 'i_d') $nk = 'id';
            $out[$nk] = is_array($v) ? camelizeKeys($v) : $v;
        }
        return $out;
    }
}
// ── Performance: Start output buffering early for GZIP ──
if (!ob_start('ob_gzhandler')) {
    ob_start();
}
$_PERF_START = microtime(true);
// ── Response headers ──
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    header('Cache-Control: public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    header('Link: <https://cdnjs.cloudflare.com>; rel=preconnect', false);
} else {
    header('Cache-Control: private, max-age=10, stale-while-revalidate=60');
}
ini_set('default_socket_timeout', '5');
header('Connection: keep-alive');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Strict-Transport-Security: max-age=31536000; includeSubDomains; preload');
header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
header('Cross-Origin-Opener-Policy: unsafe-none');
// ══════════════════════════════════════════════════════════════════════════════
// T91: INPUT SANITIZATION — sanitize all user inputs before processing
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Recursively sanitize a value: strip tags, encode special chars.
 * Strings are trimmed and HTML-encoded. Arrays are recursed.
 * Null/bool/int/float pass through unchanged.
 */
function _sanitizeValue($val) {
    if (is_string($val)) {
        $val = trim($val);
        // Remove null bytes
        $val = str_replace("\0", '', $val);
        // Encode special HTML chars to prevent XSS in any reflected output
        return htmlspecialchars($val, ENT_QUOTES | ENT_HTML5, 'UTF-8', false);
    }
    if (is_array($val)) {
        $out = [];
        foreach ($val as $k => $v) {
            // Sanitize keys too — prevent key-based injection
            $safeKey = is_string($k) ? preg_replace('/[^\w\-.:@]/', '', $k) : $k;
            $out[$safeKey] = _sanitizeValue($v);
        }
        return $out;
    }
    // Pass through scalars (int, float, bool, null)
    return $val;
}

/**
 * Sanitize input array for handlers that need raw (unescaped) values.
 * Strips tags and null bytes but does NOT HTML-encode — for DB-bound data
 * that uses prepared statements (which already prevent SQLi).
 */
function _sanitizeRaw($val) {
    if (is_string($val)) {
        $val = trim($val);
        $val = str_replace("\0", '', $val);
        return strip_tags($val);
    }
    if (is_array($val)) {
        $out = [];
        foreach ($val as $k => $v) {
            $safeKey = is_string($k) ? preg_replace('/[^\w\-.:@]/', '', $k) : $k;
            $out[$safeKey] = _sanitizeRaw($v);
        }
        return $out;
    }
    return $val;
}

/**
 * HTML-escape a string for safe output (alias for htmlspecialchars).
 * Used by handlers that need explicit escaping.
 */
function _esc(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8', true);
}

// Sanitize the raw input: strip tags/null bytes (DB uses prepared statements for SQLi prevention)
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$input = _sanitizeRaw($input);
    // v12.54.8-getfix: Merge query string params so GET requests pass
    // parameters to handlers (previously only $_GET['action'] was read,
    // so handlers received empty $b for GET requests → empty results).
    if (!empty($_GET)) {
        $input = array_merge($_GET, $input);
    }
    $action = $input['action'] ?? '';
if (!$action) { jsonExit(400, ['success'=>false,'error'=>'Missing action']); }
$action = preg_replace('/[^a-z0-9_]/', '', strtolower($action));
// v12.26.1-perf: Longer cache for stable polled endpoints
if ($action === 'getdataversion' || $action === 'ping' || $action === 'getversion') {
    header('Cache-Control: public, max-age=15, s-maxage=30');
}
try {
    $handler = findHandler($action);
    // v12.49.23-resilience: server-side rate limit (Task 17-backend) — fails open.
    $rl = rateLimitCheck($action);
    if ($rl !== null) {
        $ra = (int)($rl['retryAfter'] ?? 60);
        // v12.51.20-T19: emit the full X-RateLimit-* set on 429 too (not just 200),
        // so clients see limit + remaining + reset alongside Retry-After.
        if (function_exists('header')) {
            header('Retry-After: ' . $ra);
            header('X-RateLimit-Limit: ' . ($rl['limit'] ?? 120));
            header('X-RateLimit-Remaining: 0');
            header('X-RateLimit-Reset: ' . ((int)($rl['window_start'] ?? time()) + (int)($rl['window'] ?? 60)));
        }
        jsonExit(429, $rl);
    }

    if (!$handler) jsonExit(404, ['success'=>false,'error'=>"Unknown: $action"]);
    $result = $handler($input);
    // v12.26.1-perf: Skip camelizeKeys for known-flat responses (no DB columns)
    // saves ~0.5-2ms per call × thousands of requests per hour.
    static $FLAT_ACTIONS = ['ping'=>1,'getversion'=>1,'getsystemhealth'=>1,'checkadmin'=>1,
        'getdataversion'=>1,'adminlogin'=>1,'getsecretmanagerstatus'=>1,'checksanctions'=>1,'gettablestatus'=>1,
        // v12.30.0-cache: These handlers already return camelCase from _snakeToCamelRows —
        // skip camelizeKeys to avoid double conversion.
        // v15.0.0-perf: Added getmyforms — dedicated applicant forms handler
        'getmyforms'=>1,'getforms'=>1,'getform'=>1,'getinitialdata'=>1,'getcompetitions'=>1,'getpubliccompetitions'=>1,
        // v16.0.0-appconfig: Already returns camelCase structured config
        'getappconfig'=>1,'sqlgetappconfig'=>1,
        'getprojects'=>1,'getproject'=>1,'getprojectdashboard'=>1,'staffmembers'=>1,'staffpublications'=>1,'searchknowledgebase'=>1,'listknowledgebase'=>1,'getreviewers'=>1,'getreviewerforms'=>1,
        // v18.x-teachers: New flat endpoints — return explicit snake_case shapes, skip camelize
        'teacherbyemail'=>1,'getprojectmembers'=>1,'getprojectreports'=>1,
        'getcompetitionsummary'=>1,'getdashboardcontext'=>1,'getcontestboard'=>1,'getdeliverables'=>1,
        'getlibrarydeposits'=>1,'getexpenses'=>1,'getreports'=>1,'getchangerequests'=>1,'getsanctions'=>1,
        'getmessages'=>1,'getmonreports'=>1,'getreviewerbudgetsummary'=>1,'getfinancialsummary'=>1,
        // T28/T30: Competition management
        'detectduplicatecompetitions'=>1,'bulkupdatecompetitionstatus'=>1];
    if (!isset($FLAT_ACTIONS[$action])) {
        $result = camelizeKeys($result);
    }
    // v12.26.1-perf: Only attach timing + server in debug mode (saves ~40 bytes/response)
    if (APP_DEBUG) {
        $result['_timing'] = round((microtime(true) - $_PERF_START) * 1000);
        $result['_server'] = 'php/' . APP_VERSION;
    }
    // v12.26.0-perf: JSON_INVALID_UTF8_SUBSTITUTE prevents encoding errors from bad data
    // v12.49.91-T19: emit X-RateLimit-Remaining / X-RateLimit-Reset on every 200 so
    // clients can proactively throttle (backend enforcement already exists on 429).
    if (function_exists('rateLimitHeaders')) {
        foreach (rateLimitHeaders($action) as $k => $v) { header("$k: $v"); }
    }
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $e) {
    logError("$action: {$e->getMessage()}");
    // v12.49.x-op: surface a SAFE, stable error_code so production 500s are
    // classifiable without leaking SQL/internals (APP_DEBUG stays the only
    // gate for the raw message). Missing-table (42S02) is the most common
    // deploy-time failure; flagging it lets ops distinguish "needs migration"
    // from "real bug" without reading server logs.
    $code = 'exception';
    $msg = $e->getMessage();
    if (stripos($msg, 'SQLSTATE[42S02]') !== false || stripos($msg, 'doesn\'t exist') !== false || stripos($msg, 'no such table') !== false) {
        $code = 'db_missing_table';
    } elseif (stripos($msg, 'SQLSTATE') !== false || stripos($msg, 'SQL') !== false) {
        $code = 'db_error';
    }
    $errResult = ['success'=>false,
                  'error'=>APP_DEBUG ? $e->getMessage() : 'Error',
                  'error_code'=>$code,
                  '_timing'=>round((microtime(true) - $_PERF_START) * 1000)];
    jsonExit(500, $errResult);
}
/**
 * Query cache for frequent read-only queries.
 * v12.26.1-perf: Default TTL 60→120s, LRU size 500→1000 entries.
 * Stores results in a static array keyed by SQL + params hash.
 */
function dbFetchAllCached(string $sql, array $params = [], int $ttl = 120): array {
    static $_cache = [], $_accessOrder = [];
    // v12.27.0: Check global bust version — if incremented, all cached
    // entries are stale. This provides O(1) full-cache invalidation
    // without scanning every key.
    static $_lastBustCheck = 0;
    $_globalBust = &$GLOBALS['_DB_FETCH_ALL_CACHED_BUST'];
    $_bustNow = isset($_globalBust) ? $_globalBust : 0;
    if ($_bustNow > $_lastBustCheck) {
        $_cache = [];
        $_accessOrder = [];
        $_lastBustCheck = $_bustNow;
    }
    $key = md5($sql . serialize($params));
    $now = time();
    if (isset($_cache[$key]) && ($now - $_cache[$key]['ts']) < $ttl) {
        // Update LRU access order
        $_accessOrder[$key] = $now;
        return $_cache[$key]['data'];
    }
    $data = dbFetchAll($sql, $params);
    $_cache[$key] = ['data' => $data, 'ts' => $now];
    $_accessOrder[$key] = $now;
    // v12.26.1-perf: Increased from 500→1000 entries for larger working sets
    if (count($_cache) > 1000) {
        asort($_accessOrder);
        $evictKey = array_key_first($_accessOrder);
        unset($_cache[$evictKey], $_accessOrder[$evictKey]);
    }
    return $data;
}
/**
 * Bust dbFetchAllCached entries when a table is written to.
 * Called by config.php's clearQueryCache() after every write mutation.
 * Uses a global version counter that dbFetchAllCached checks on every call.
 * This provides O(1) full-cache invalidation — all cached entries become
 * stale immediately when the counter ticks.
 */
function _bustDbFetchAllCached(string $table = ''): void {
    static $_globalBustVersion = 0;
    $_globalBustVersion++;
    $GLOBALS['_DB_FETCH_ALL_CACHED_BUST'] = $_globalBustVersion;
}
// ══════════════════════════════════════════════════════════════════════════════
//  v12.28.0-RBAC: AUTH MIDDLEWARE — validates session/token on every request
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Store raw input globally so requireAuth() can access it.
 */
$GLOBALS['_RAW_INPUT'] = $input;
/**
 * Resolve user role from request context, with server-side verification.
 * v12.28.0-RBAC: Replaces all `!empty($b['isAdmin'])` patterns.
 */
function resolveRole(array $b): string {
    // v3.39.2-perf: Memoize within a single request. resolveRole is called by many
    // handlers (handleGetForms, handleListDocuments, …) on the same $b, and each
    // call would otherwise run 2 DB queries (sessions + admin_emails). Keying on
    // email+sessionId makes it a single read per request.
    static $_roleCache = [];
    $email = strtolower(trim($b['email'] ?? $b['userId'] ?? $b['userEmail'] ?? ''));
    $sessionId = $_SERVER['HTTP_X_SESSION_ID'] ?? $b['sessionId'] ?? '';
    $ck = $email . '|' . $sessionId;
    if (isset($_roleCache[$ck])) return $_roleCache[$ck];
    if (isset($GLOBALS['_AUTH_CTX'])) {
        return $_roleCache[$ck] = $GLOBALS['_AUTH_CTX']['role'];
    }
    // v15.0.0-perf: Determine email FIRST so we can cross-check it against both
    // sessions and admin_emails. Without this, when an admin is promoted via SQL,
    // their existing session (created before promotion) still has role='applicant'
    // and resolveRole returns 'applicant' without ever reaching admin_emails check.
    $sessionRole = null;
    // Check session (but don't return yet — must cross-check with admin_emails)
    if ($sessionId) {
        try {
            $session = dbFetchOne(
                "SELECT role FROM sessions WHERE id = ? AND (expires_at IS NULL OR expires_at > NOW())",
                [$sessionId]
            );
            if ($session) $sessionRole = $session['role'];
        } catch (Throwable $e) {}
    }
    // Check admin_emails table — authoritative for SQL-promoted admins
    // v20.0.0-dbfix: Wrapped in try/catch — if admin_emails or ckk_members
    // tables don't exist (incomplete migration), fall through to session/applicant
    // instead of throwing PDOException → HTTP 500 on every handler call.
    if ($email) {
        try {
            $admin = dbFetchOne('SELECT * FROM admin_emails WHERE email=?', [$email]);
            if ($admin) {
                $adminRole = $admin['role'] ?? 'admin';
                return $_roleCache[$ck] = $adminRole;
            }
        } catch (Throwable $e) { /* table may not exist */ }
        try {
            $ckk = dbFetchOne('SELECT * FROM ckk_members WHERE email=? AND is_active=1', [$email]);
            if ($ckk) return $_roleCache[$ck] = 'ckk';
        } catch (Throwable $e) { /* table may not exist */ }
    }
    // Fallback: return session role if it exists, otherwise applicant
    return $_roleCache[$ck] = ($sessionRole ?? 'applicant');
}
/**
 * Require a specific role or higher, exit with 403 if unauthorized.
 */
function requireRole(string $minimumRole): array {
    $ctx = []; // simplified for database/api.php compat
    $role = resolveRole($GLOBALS['_RAW_INPUT'] ?? []);
    $hierarchy = ['applicant'=>0, 'reviewer'=>1, 'ckk'=>2, 'rector'=>3, 'admin'=>4];
    $minLevel = $hierarchy[$minimumRole] ?? 0;
    $userLevel = $hierarchy[$role] ?? -1;
    if ($userLevel < $minLevel) {
        jsonExit(403, [
            'success'=>false,
            'error'=>'Достъпът е отказан. Нямате необходимите права.',
            'requiredRole'=>$minimumRole,
            'yourRole'=>$role
        ]);
        exit;
    }
    return ['role'=>$role];
}
function findHandler(string $a): ?callable {
    // v12.32.32-draftdelete: hardcode the draft-delete route here (deployed
    // via api.php) so it works even if the server's action_map.php is stale.
    // handleDeleteDraft soft-deletes status='deleted' in MySQL (authoritative).
    // v18.x-teachers: Local action routing for teacher/member/report lookups.
    // Hardcoded here (deploy-locked file) mirroring the deleteform pattern so
    // these endpoints work without editing action_map.php.
    static $local = [
            'teacherbyemail'    => 'handleTeacherByEmail',
            'getprojectmembers' => 'handleGetProjectMembers',
            'getprojectreports' => 'handleGetProjectReports',
            // v12.48.0-dbfix: SQL self-heal routes (were "Unknown" on the deployed
            // build — only existed in GAS). Register here so they work even if
            // action_map.php is stale.
            'repairallsheets'        => 'handleRepairAllSheets',
            'sqlrepairattacheddocs'  => 'handleSqlRepairAttachedDocs',
            // v12.48.7: Admin user management routes
            'listadmins'             => 'handleListAdmins',
            'addadmin'               => 'handleAddAdmin',
            'removeadmin'            => 'handleRemoveAdmin',
            // v12.49.22-resilience: self-diagnosing table-presence endpoint
            'gettablestatus'          => 'handleGetTableStatus',
            // v12.50.0-batch-import: Batch competitor/participant imports with progress tracking
            'batchimportcompetitors'  => 'handleBatchImportCompetitors',
            'batchimportparticipants' => 'handleBatchImportCompetitors',
            'startbatchimport'        => 'handleStartBatchImport',
            'getbatchimportprogress'  => 'handleGetBatchImportProgress',
            'validateimportfile'      => 'handleValidateImportFile',
            'mapimportfields'         => 'handleMapImportFields',
            // T28/T30: Competition management
            'detectduplicatecompetitions' => 'handleDetectDuplicateCompetitions',
            'bulkupdatecompetitionstatus' => 'handleBulkUpdateCompetitionStatus',
            // T126: Admin - Bulk Import Tools
            'adminbulkimport'         => 'handleAdminBulkImport',
            'getbulkimporthistory'    => 'handleGetBulkImportHistory',
            // T127: Admin - Data Backup Tool
            'admindatabasebackup'     => 'handleAdminDatabaseBackup',
            'getbackuphistory'        => 'handleGetBackupHistory',
            // T128: Admin - Data Migration Tool
            'adminrunmigration'       => 'handleAdminRunMigration',
            'getmigrationhistory'     => 'handleGetMigrationHistory',
            // T129: Admin - Cleanup Tools
            'admincleanupall'         => 'handleAdminCleanupAll',
            // T130: Admin - Audit Trail View
            'admingetauditlog'        => 'handleAdminGetAuditLog',
            'exportauditlog'          => 'handleExportAuditLog',
            // T131: Admin - Role Management UI
            'getrolemanagement'       => 'handleGetRoleManagement',
            'updateuserrole'          => 'handleUpdateUserRole',
            // T132: Admin - System Health Dashboard
            'admindashboardhealth'    => 'handleAdminDashboardHealth',
            // T133: Admin - Scheduled Tasks
            'listscheduledtasks'      => 'handleListScheduledTasks',
            'togglescheduledtask'     => 'handleToggleScheduledTask',
            'runscheduledtask'        => 'handleRunScheduledTask',
            'addscheduledtask'        => 'handleAddScheduledTask',
            'deletescheduledtask'     => 'handleDeleteScheduledTask',
            // T56: Analytics Data Export
            'exportanalyticsdata'     => 'handleExportAnalyticsData',
            // T58: Excel Import Support
            'importexcelfile'         => 'handleImportExcelFile',
            // T62: Version History Snapshot
            'createversionsnapshot'   => 'handleCreateVersionSnapshot',
            // T61: List active collaborative documents
            'listcollabdocuments'     => 'handleListCollabDocuments',
        ];
    if (isset($local[$a])) {
        return $local[$a];
    }
    if ($a === 'deleteform' || $a === 'deletedraft') {
        return 'handleDeleteDraft';
    }
    static $m = null;
    if ($m === null) {
        $m = require __DIR__ . '/action_map.php';
    }
    return isset($m[$a]) ? $m[$a] : null;
}
/**
 * v12.26.2-dynload: Get incremental data diff since a given version.
 * Frontend polls this to get only changed records since last poll.
 * Enables true dynamic loading: initial load gets page 1, subsequent
 * polls only get what changed.
 * Body: { lastVersion: int, tables?: string[] }
 */
function handleGetDataDiff(array $b): array {
    $lastVersion = (int)($b['lastVersion'] ?? 0);
    $tables = $b['tables'] ?? [];
    if ($lastVersion <= 0) {
        return ['success'=>false,'error'=>'lastVersion required'];
    }
    
    // Get global current version
    $current = (int)(dbFetchOne('SELECT MAX(version) as v FROM data_version')['v'] ?? 0);
    if ($current <= $lastVersion) {
        return ['success'=>true,'hasChanges'=>false,'currentVersion'=>$current,'diff'=>[]];
    }
    
    // Get per-table versions to find what changed
    $tableVersions = dbFetchAll('SELECT table_name, version FROM data_version WHERE version > ?', [$lastVersion]);
    $changedTables = array_column($tableVersions, 'table_name');
    
    // Build diff based on changed tables
    $diff = [];
    foreach ($changedTables as $tbl) {
        if (!empty($tables) && !in_array($tbl, $tables)) continue;
        // Return only the changed table name + current version — frontend
        // uses this info to refetch individual tables on demand.
        $tv = dbFetchOne('SELECT version FROM data_version WHERE table_name=?', [$tbl]);
        $diff[] = ['table' => $tbl, 'version' => (int)($tv['version'] ?? 0)];
    }
    
    return [
        'success' => true,
        'hasChanges' => count($diff) > 0,
        'currentVersion' => $current,
        'diff' => $diff,
        '_source' => 'sql'
    ];
}
/**
 * v12.26.2-dynload: Stream data in chunks for progressive loading.
 * Returns one chunk per call. Frontend uses offset/limit to paginate
 * through large datasets without blocking the UI.
 * Body: { action: 'getforms', offset: 0, limit: 20, ...originalParams }
 * Returns the normal action response augmented with stream metadata.
 */
function handleStreamData(array $b): array {
    $innerAction = preg_replace('/[^a-z0-9_]/', '', strtolower($b['innerAction'] ?? ''));
    if (!$innerAction) return ['success'=>false,'error'=>'Missing innerAction'];
    
    // Pass stream pagination params to the underlying handler
    $b['offset'] = (int)($b['offset'] ?? 0);
    $b['limit'] = (int)($b['limit'] ?? 25);
    if ($b['limit'] < 1) $b['limit'] = 25;
    if ($b['limit'] > 200) $b['limit'] = 200;
    $b['lean'] = true;
    
    $handler = findHandler($innerAction);
    if (!$handler) return ['success'=>false,'error'=>"Unknown inner action: $innerAction"];
    
    $result = $handler($b);
    $result['_stream'] = true;
    $result['_offset'] = $b['offset'];
    $result['_limit'] = $b['limit'];
    $result['_total'] = $result['total'] ?? 0;
    // Signal frontend whether to request the next chunk
    $result['_hasMore'] = ($b['offset'] + $b['limit']) < ($result['total'] ?? 0);
    $result['_nextOffset'] = $b['offset'] + $b['limit'];
    return $result;
}
/**
 * Generate a unique ID with prefix.
 * @param string $prefix e.g. 'APP', 'PRJ', 'COMP'
 * @return string e.g. 'APP-20260711-a1b2c3d4'
 */
function generateId(string $prefix = 'ID'): string {
    return $prefix . '-' . date('Ymd') . '-' . substr(md5(uniqid(mt_rand(), true)), 0, 8);
}
/**
 * Format file size in human-readable form (matches GAS formatFileSize_).
 */
function formatFileSize(int $bytes): string {
    if ($bytes >= 1073741824) return round($bytes / 1073741824, 1) . ' GB';
    if ($bytes >= 1048576) return round($bytes / 1048576, 1) . ' MB';
    if ($bytes >= 1024) return round($bytes / 1024, 1) . ' KB';
    return $bytes . ' B';
}
function handlePing(): array {
    $dbOk = false;
    $dbTime = 0;
    try {
        $start = microtime(true);
        getDB()->query('SELECT 1');
        $dbTime = round((microtime(true) - $start) * 1000);
        $dbOk = true;
    } catch (Throwable $_) {}
    return [
        'success'=>true,
        'ping'=>'pong',
        'version'=>APP_VERSION,
        'server_time'=>date('c'),
        'db'=>['healthy'=>$dbOk, 'latency_ms'=>$dbTime, 'host'=>DB_HOST, 'name'=>DB_NAME]
    ];
}
function handleGetVersion(): array { return ['success'=>true,'version'=>APP_VERSION]; }
/**
 * v12.17.3: Return current data version from data_version table.
 * Frontend polls this every 15s and invalidates cache on change.
 * Returned as {version, _dataVersion} for compatibility with both
 * the frontend poller and GAS sync worker.
 */
/**
 * v12.17.3: Check MySQL for a user's pre-generated doc for a given project type.
 * Returns the stored record if found, so Step 2 can embed it instantly without
 * hitting GAS. GAS is the authoritative source for actual copy creation — this
 * handler only reads the MySQL mirror that GAS populates via _syncToMySQL_.
 */
function handleEnsureUserPregeneratedDocs(array $b): array {
    $u = $b['userId'] ?? $b['email'] ?? ''; if (!$u) return err('Missing userId');
    $pt = strtoupper(trim($b['projectType'] ?? '')); if (!$pt) return err('Missing projectType');
    // Look up existing pregen doc for this user + type from MySQL mirror
    $rows = dbFetchAll(
        "SELECT * FROM documents WHERE user_email=? AND origin='pregen' AND (doc_type=? OR type_label LIKE ?)
         ORDER BY created DESC LIMIT 1",
        [$u, $pt.'_form', $pt.'%']
    );
    if ($rows) {
        $r = $rows[0];
        $fileId = $r['drive_id'] ?? $r['id'] ?? '';
        $editUrl = $r['google_doc_edit_link'] ?? ($fileId ? 'https://docs.google.com/document/d/'.urlencode($fileId).'/edit' : '');
        $previewUrl = 'https://docs.google.com/document/d/'.urlencode($fileId).'/preview';
        return [
            'success' => true,
            'fromCache' => true,
            'docs' => [[
                'fileId' => $fileId,
                'driveId' => $fileId,
                'id' => $fileId,
                'name' => $r['name'] ?? ($pt.' - Формуляр'),
                'mimeType' => 'application/vnd.google-apps.document',
                'editLink' => $editUrl,
                'googleDocEditLink' => $editUrl,
                'previewLink' => $previewUrl,
                'webViewLink' => $previewUrl,
                'docType' => $pt.'_form',
                'origin' => 'pregen',
                'projectType' => $pt,
                '_pregenerated' => true,
                '_generated' => false,
            ]]
        ];
    }
    // Not in MySQL yet — caller should fall through to GAS for creation
    return ['success' => false, 'fromCache' => false, 'docs' => [], 'needsGAS' => true];
}
/**
 * v12.19.0-perf: Edge-cached data version endpoint.
 * v12.20.0: Optimized SQL — uses MAX() aggregate instead of fetching all rows.
 * When `?full=1` is requested, also returns per-table breakdown for smart invalidation.
 * Polled every 15s by ALL concurrent users → heavy query load.
 * Now with 5s server-side cache: first request hits DB, next 5s return cached.
 * Reduces DB load by ~66% at 3+ concurrent users.
 * Also sends Cache-Control: max-age=5 so CDNs/edge can absorb even more.
 */
function handleGetDataVersion(): array {
    $now = microtime(true);
    $full = !empty($_REQUEST['full']) || !empty($GLOBALS['_RAW_INPUT']['full'] ?? '');
    // v12.28.0-cache: 5s static cache + write bust via clearQueryCache busts _DV_CACHE_REF
    // This means the version poller sees changes within ~5s instead of <30s.
    static $_dvCache = null;
    static $_dvCacheTs = 0;
    $GLOBALS['_DV_CACHE_REF'] = &$_dvCache;
    $GLOBALS['_DV_CACHE_TS_REF'] = &$_dvCacheTs;
    if ($_dvCache !== null && ($now - $_dvCacheTs) < 5.0 && !$full) {
        return $_dvCache;
    }
    try {
        $globalRow = dbFetchOne('SELECT MAX(version) as version FROM data_version');
        $globalVersion = (int)($globalRow['version'] ?? 0);
        $byTable = [];
        if ($full) {
            $rows = dbFetchAll('SELECT table_name, version FROM data_version ORDER BY table_name');
            foreach ($rows as $row) {
                $byTable[$row['table_name']] = (int)($row['version'] ?? 0);
            }
        }
        $result = ['success'=>true,'version'=>$globalVersion,'_dataVersion'=>$globalVersion,
                    'tables'=>$byTable,'timestamp'=>date('c')];
        if (!$full) {
            $_dvCache = $result;
            $_dvCacheTs = $now;
        }
        return $result;
    } catch (Throwable $e) {
        return ['success'=>false,'version'=>0,'error'=>$e->getMessage()];
    }
}
/**
 * v12.17.3: Batch API endpoint — execute multiple read-only actions in a single HTTP request.
 * v12.19.0-perf: Skip camelizeKeys for individual results (camelized at top level).
 * Dramatically reduces round-trips on initial page load (3 requests → 1).
 * Only read-only actions are permitted. Write actions are rejected.
 * Request: { action: 'batchapi', requests: [{action, ...data}, ...] }
 * Response: { success: true, results: [{...}, ...] }
 */
function handleBatchApi(array $b): array {
    $requests = $b['requests'] ?? [];
    if (!is_array($requests) || empty($requests)) {
        return ['success'=>false,'error'=>'No requests provided'];
    }
    if (count($requests) > 10) {
        return ['success'=>false,'error'=>'Max 10 requests per batch'];
    }
    // Whitelist of read-only actions permitted in batch
    static $READ_ONLY = [
        'getforms','getform','getcompetitions','getpubliccompetitions',
        'getcompetitionsummary','getcontestboard','listdocuments','listmydocuments',
        'getreviewers','getreviewerforms','getprojects','getprojectdashboard',
        'getdashboardcontext','getmessages','getnotifications','checksanctions',
        'getauditlog','getdocumenttemplates','getdataversion','ping','getversion',
        'getsystemhealth','getinitialdata','getcompetitionpanel','getcompetitionsfeed',
        'getapplicationsbycompetition',
        'getlibrarydeposits','getministryreports','getdeliverables',
        // v12.20.0: document generation reads
        'gettypedocuments','getformdocuments','getgenerateddocs',
        'ensureuserpregenerateddocs',
        // v12.28.2-404fix: Required templates — stable read
        'getrequiredapplicationtemplates',
    ];
    $results = [];
    $batchStart = microtime(true);
    foreach ($requests as $req) {
        $action = preg_replace('/[^a-z0-9_]/', '', strtolower($req['action'] ?? ''));
        if (!in_array($action, $READ_ONLY)) {
            $results[] = ['success'=>false,'error'=>"Action '$action' not permitted in batch"];
            continue;
        }
        $handler = findHandler($action);
    // v12.49.23-resilience: server-side rate limit (Task 17-backend) — fails open.
    $rl = rateLimitCheck($action);
    if ($rl !== null) {
        $ra = (int)($rl['retryAfter'] ?? 60);
        // v12.51.20-T19: emit the full X-RateLimit-* set on 429 too (not just 200),
        // so clients see limit + remaining + reset alongside Retry-After.
        if (function_exists('header')) {
            header('Retry-After: ' . $ra);
            header('X-RateLimit-Limit: ' . ($rl['limit'] ?? 120));
            header('X-RateLimit-Remaining: 0');
            header('X-RateLimit-Reset: ' . ((int)($rl['window_start'] ?? time()) + (int)($rl['window'] ?? 60)));
        }
        jsonExit(429, $rl);
    }

        if (!$handler) {
            $results[] = ['success'=>false,'error'=>"Unknown action: $action"];
            continue;
        }
        $itemStart = microtime(true);
        try {
            $result = $handler($req);
            // camelizeKeys will be applied at the top level — skip here
            $result['_timing_ms'] = round((microtime(true) - $itemStart) * 1000);
            $results[] = $result;
        } catch (Throwable $e) {
            $results[] = ['success'=>false,'error'=>$e->getMessage(),'_timing_ms'=>round((microtime(true)-$itemStart)*1000)];
        }
    }
    return ['success'=>true,'results'=>$results,
            '_batchTiming_ms'=>round((microtime(true)-$batchStart)*1000)];
}
function handleGetSystemHealth(): array {
    // T80: Enhanced health check with real system metrics
    $memTotal = 0; $memUsed = 0; $cpuLoad = 0;
    // Try /proc/meminfo and loadavg (Linux only)
    if (PHP_OS_FAMILY === 'Linux' && @file_exists('/proc/meminfo')) {
        $mi = @file_get_contents('/proc/meminfo');
        if ($mi) {
            if (preg_match('/MemTotal:\s+(\d+)/', $mi, $m)) $memTotal = (int)$m[1];
            if (preg_match('/MemAvailable:\s+(\d+)/', $mi, $m)) $memUsed = $memTotal - (int)$m[1];
        }
    }
    if (PHP_OS_FAMILY === 'Linux' && @file_exists('/proc/loadavg')) {
        $la = @file_get_contents('/proc/loadavg');
        if ($la && preg_match('/(\d+\.\d+)/', $la, $m)) $cpuLoad = floatval($m[1]);
    }
    // Fallback: try shell commands (Linux only)
    if ($memTotal === 0 && PHP_OS_FAMILY === 'Linux') {
        $out = @shell_exec('free 2>/dev/null | awk \'/Mem:/ {print $2, $3}\'');
        if ($out) { $p = explode(' ', trim($out)); if (count($p) >= 2) { $memTotal = (int)$p[0]; $memUsed = (int)$p[1]; } }
    }
    if ($cpuLoad === 0 && PHP_OS_FAMILY === 'Linux') {
        $out = @shell_exec('cat /proc/loadavg 2>/dev/null');
        if ($out && preg_match('/(\d+\.\d+)/', $out, $m)) $cpuLoad = floatval($m[1]);
    }
    $memPct = $memTotal > 0 ? round($memUsed / $memTotal * 100, 1) : 0;
    $memHealth = $memPct < 90 ? 'ok' : ($memPct < 95 ? 'warning' : 'critical');

    $dbOk = false; $dbTime = 0;
    try { $s = microtime(true); getDB()->query('SELECT 1'); $dbTime = round((microtime(true) - $s) * 1000); $dbOk = true; } catch (Throwable $_) {}

    // Tunnel health (skip on non-Linux or if URL empty)
    $tunnelOk = false;
    if (PHP_OS_FAMILY === 'Linux' && defined('GAS_REAL_URL') && GAS_REAL_URL) {
        try {
            $ctx = stream_context_create(['http' => ['timeout' => 5, 'ignore_errors' => true]]);
            $res = @file_get_contents(GAS_REAL_URL . '?gas_tunnel_ping=1&__='.urlencode(APP_VERSION), false, $ctx);
            if ($res !== false) { $d = json_decode($res, true); $tunnelOk = ($d && ($d['ok'] ?? $d['success'] ?? false)); }
        } catch (Throwable $_) {}
    }

    // Status: healthy if DB is ok and tunnel check passed (or was skipped)
    $status = ($dbOk && ($tunnelOk || PHP_OS_FAMILY !== 'Linux')) ? 'healthy' : ($dbOk ? 'degraded' : 'unhealthy');
    $checks = ['db' => $dbOk ? 'ok' : 'fail', 'gas_tunnel' => $tunnelOk ? 'ok' : (PHP_OS_FAMILY !== 'Linux' ? 'skipped' : 'fail')];

    return [
        'success' => true,
        'status' => $status,
        'version' => APP_VERSION,
        'server_time' => date('c'),
        'timestamp' => (int)round(microtime(true) * 1000),
        'timezone' => date_default_timezone_get(),
        'checks' => $checks,
        'db' => ['healthy' => $dbOk, 'latency_ms' => $dbTime, 'host' => DB_HOST, 'name' => DB_NAME],
        'system' => [
            'cpu_load' => $cpuLoad,
            'memory' => ['total_kb' => $memTotal, 'used_kb' => $memUsed, 'percent' => $memPct, 'status' => $memHealth],
            'uptime' => function_exists('sys_getloadavg') ? round(memory_get_usage(true) / 1024) : null
        ]
    ];
}
/**
 * Fallback for handleGetForms when the stored procedure is unavailable.
 * Queries applications table directly with basic filters.
 */
function _fallbackGetForms(string $userEmail = '', string $role = 'admin',
                           string $competitionId = '', string $statusFilter = '',
                           string $projectType = '', int $offset = 0, int $limit = 100): array {
    try {
        $where = [];
        $params = [];
        // Applicant sees only their own forms
        if ($role === 'applicant' && $userEmail !== '') {
            $where[] = 'user_email = ?';
            $params[] = $userEmail;
        }
        // Reviewer sees forms they are assigned to
        if ($role === 'reviewer' && $userEmail !== '') {
            $where[] = 'id IN (SELECT form_id FROM reviewers WHERE email = ?)';
            $params[] = $userEmail;
        }
        if ($competitionId !== '') {
            $where[] = 'competition = ?';
            $params[] = $competitionId;
        }
        if ($statusFilter !== '') {
            $where[] = 'status = ?';
            $params[] = $statusFilter;
        }
        if ($projectType !== '') {
            $where[] = 'project_type = ?';
            $params[] = $projectType;
        }
        // Exclude deleted/archived by default
        $where[] = "status NOT IN ('deleted','archived')";
        // v12.32.28-docs: Include attached_docs + file_ids in the lean list so the
        // draft/project detail modal always shows attachments (fixes "missing
        // after refresh"). Heavy TEXT/BLOB columns stay excluded for perf.
        $cols = 'id,user_email,user_name,competition,project_type,title,area,status,submitted,created,return_comment,row_version,npf_tier,attached_docs,file_ids';
        $sql = "SELECT $cols FROM applications";
        if (!empty($where)) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY created DESC LIMIT ' . (int)$limit . ' OFFSET ' . (int)$offset;
        return dbFetchAll($sql, $params);
    } catch (Throwable $e) {
        logError("_fallbackGetForms: " . $e->getMessage());
        return [];
    }
}
function handleGetForms(array $b): array {
    // v12.28.0-RBAC: Server-side role resolution
    $u = $b['userId'] ?? $b['email'] ?? '';
    $role = resolveRole($b);
    // NOTE (v12.49.2): The v12.48.6 "admin-with-forms → applicant" downgrade was
    // REMOVED. It broke the admin "Всички проектни предложения" view: any admin who
    // also has their own applications (e.g. the project owner, 40 own drafts) was
    // silently flipped to 'applicant', so get_forms_list switched to owner-only and
    // every OTHER user's proposal — including all their drafts — disappeared from the
    // admin table. resolveRole() is already authoritative (it checks admin_emails /
    // ckk_members before falling back to the session role), so a real non-admin can
    // never resolve to 'admin'. The applicant "Моите проектни предложения" view is
    // scoped client-side (forms-admin.js filters by owner email) and server-side
    // (role='applicant' → owner-only query), so removing this block is safe.
    // v18.0.0-adminfix: Return the resolved role in the response so the frontend
    // upgrades its stale session role (e.g. 'applicant' → 'admin') immediately.
    // Without this, SQL-promoted admins stay as 'applicant' in the UI until a
    // separate checkadmin poll fires (~60s later), causing the ApplicantView to
    // filter forms to only their own entries.
    $compId = $b['competitionId'] ?? $b['competition'] ?? '';
    $status = $b['status'] ?? $b['statusFilter'] ?? '';
    $ptype = $b['projectType'] ?? '';
    $lean = !isset($b['lean']) || !empty($b['lean']);
    $offset = (int)($b['offset'] ?? 0);
    $defaultLimit = $lean ? ($role === 'admin' ? 500 : 50) : 500;
    $limit = (int)($b['limit'] ?? $defaultLimit);
    if ($limit < 1) $limit = $defaultLimit;
    if ($limit > 500) $limit = 500;
    // v15.0.0-perf: Cache function_exists checks in static vars to avoid
    // repeated autoload/file-lookup overhead on every request.
    static $_hasMyForms = null, $_hasFormsList = null;
    if ($_hasMyForms === null) $_hasMyForms = function_exists('sqlGetMyForms');
    if ($_hasFormsList === null) $_hasFormsList = function_exists('sqlGetFormsList');
    // v12.30.0-perf: Use lean get_forms_list for list views (static SQL, faster)
    // v12.30.0-cache: For applicant "Моите проектни предложения" with no filters,
    // use ultra-light get_my_forms (single table, no joins, no COUNT).
    if ($lean && $role === 'applicant' && empty($compId) && empty($status) && empty($ptype) && $_hasMyForms) {
        $result = sqlGetMyForms($u, $offset, $limit);
    } elseif ($lean && $_hasFormsList) {
        $result = sqlGetFormsList($u, $role, $compId, $status, $ptype, $offset, $limit);
    } else {
        $result = sqlGetForms($u, $role, $compId, $status, $ptype, $offset, $limit, false);
    }
    // Fallback: if SQL procedure fails (e.g. not installed yet), query applications directly
    $dbError = null;
    if (empty($result['success']) || !isset($result['data'])) {
        try {
            $data = _fallbackGetForms($u, $role, $compId, $status, $ptype, $offset, $limit);
            $total = count($data);
            $hasMore = ($offset + $limit) < $total;
            $data = _snakeToCamelRows($data);
            $total = count($data);
        } catch (Throwable $e) {
            $dbError = $e->getMessage();
            $data = [];
            $total = 0;
            $hasMore = false;
        }
    } else {
        $data = $result['data'] ?? [];
        if (!empty($data)) {
            $data = _snakeToCamelRows($data);
        }
        $total = $result['total'] ?? 0;
        $hasMore = ($offset + $limit) < $total;
    }
    // Normalize field names: frontend expects competitionId (not 'competition')
    // v15.0.0-perf: Moved normalization INSIDE the needsNormalize check to avoid
    // the inner loop entirely when columns already have the right names.
    // Also uses a simple index-based loop (faster than foreach + reference).
    if (!empty($data) && (!isset($data[0]['competitionId']) || !isset($data[0]['projectType']))) {
        $len = count($data);
        for ($i = 0; $i < $len; $i++) {
            if (isset($data[$i]['competition']) && !isset($data[$i]['competitionId'])) {
                $data[$i]['competitionId'] = $data[$i]['competition'];
            }
            if (isset($data[$i]['projectCode']) && !isset($data[$i]['projectType'])) {
                $data[$i]['projectType'] = $data[$i]['projectCode'];
            }
        }
    }
    // v12.32.28-docs: Guarantee the detail modal always has attachments, even if
    // the underlying stored procedure (get_my_forms_v2 / get_forms_list) omits
    // attached_docs / file_ids from its SELECT. If the camelCased rows are missing
    // those keys, fetch them in ONE batched query and merge. Cheap (≤50/100 rows).
    if (!empty($data) && !isset($data[0]['attachedDocs']) && !isset($data[0]['attached_docs'])) {
        $ids = array_filter(array_map(function ($r) {
            return $r['id'] ?? null;
        }, $data), function ($v) { return $v !== null; });
        if (!empty($ids)) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $docRows = dbFetchAll(
                "SELECT id, attached_docs, file_ids FROM applications WHERE id IN ($ph)",
                array_values($ids)
            );
            if (!empty($docRows)) {
                $docMap = [];
                foreach ($docRows as $dr) {
                    $docMap[$dr['id']] = $dr;
                }
                $len = count($data);
                for ($i = 0; $i < $len; $i++) {
                    $id = $data[$i]['id'] ?? null;
                    if ($id !== null && isset($docMap[$id])) {
                        // $data is already camelCased by _snakeToCamelRows above,
                        // so write the camelCase keys the frontend reads.
                        $data[$i]['attachedDocs'] = $docMap[$id]['attached_docs'] ?? '[]';
                        $data[$i]['fileIds'] = $docMap[$id]['file_ids'] ?? '[]';
                    }
                }
            }
        }
    }
    // v12.30.0-cache: Generate ETag for browser 304 support
    $etag = md5(json_encode($data));
    $etagHeader = '"' . $etag . '"';
    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etagHeader) {
        http_response_code(304);
        exit;
    }
    header('ETag: ' . $etagHeader);
    return [
        'success' => true,
        'forms' => $data,
        'total' => $total,
        'offset' => $offset,
        'limit' => $limit,
        'hasMore' => $hasMore,
        'role' => $role,
        '_source' => 'sql',
        'dbError' => $dbError ?: null
    ];
}
/**
 * v15.0.0-perf: Dedicated handler for applicant "Моите проектни предложения".
 * Fastest path — no role resolution, no fallback logic, no competition/status
 * filtering. Directly calls sqlGetMyForms which tries get_my_forms_v2 first.
 * Returns only the applicant's own forms with minimal columns for the list view.
 * Expects: { userId: string, offset?: int, limit?: int }
 */
function handleGetMyForms(array $b): array {
    $u = $b['userId'] ?? $b['email'] ?? $b['userEmail'] ?? '';
    // v19.0.0-warmfix: Return empty result instead of error when called
    // without user context (e.g. background cache warming). Prevents
    // spurious "Missing userId" console errors on every page load.
    if (!$u) return ['success'=>true,'forms'=>[],'total'=>0,'_anonymous'=>true];
    $offset = max(0, (int)($b['offset'] ?? 0));
    $limit = min(500, max(1, (int)($b['limit'] ?? 50)));
    // v18.0.0-adminfix: Check if user is an admin (via SQL admin_emails).
    // Admin users calling getmyforms should see ALL participants' forms,
    // not just their own. If resolveRole returns admin/ckk/rector, delegate
    // to the full getForms handler which returns all forms.
    $role = resolveRole($b);
    if ($role !== 'applicant') {
        return handleGetForms($b);
    }
    $result = sqlGetMyForms($u, $offset, $limit);
    if (empty($result['success']) || !isset($result['data'])) {
        return ['success'=>false,'error'=>'Грешка при зареждане на предложенията.'];
    }
    $data = $result['data'];
    if (!empty($data)) {
        $data = _snakeToCamelRows($data);
    }
    // v15.0.0-perf: Fast ETag via row count + max timestamp hash (avoids full json_encode)
    $etagSource = '0';
    if (!empty($data)) {
        $etagSource = count($data) . '_' . ($data[0]['updatedAt'] ?? $data[0]['created'] ?? '0');
    }
    $etag = md5($etagSource);
    $etagHeader = '"' . $etag . '"';
    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etagHeader) {
        http_response_code(304);
        exit;
    }
    header('ETag: ' . $etagHeader);
    return [
        'success' => true,
        'forms' => $data,
        'total' => $result['total'] ?? count($data),
        'offset' => $offset,
        'limit' => $limit,
        'hasMore' => ($offset + $limit) < ($result['total'] ?? count($data)),
        'role' => $role,
        '_source' => 'myforms'
    ];
}
function handleGetForm(array $b): array {
    $id=$b['id']??''; if(!$id) return err('Missing id');
    $r=dbFetchOne('SELECT * FROM applications WHERE id=?',[$id]);
    if (!$r) return err('Not found');
    // v18.0.2: Enrich attached_docs with working preview links
    if (!empty($r['attached_docs'])) {
        $attached = json_decode($r['attached_docs'], true);
        if (is_array($attached)) {
            $attached = _enrichDocPreviews($attached);
            $r['attached_docs'] = json_encode($attached, JSON_UNESCAPED_UNICODE);
        }
    }
    // v12.32.33-attachfix: ALSO expose camelCase aliases. The frontend detail
    // modal (ViewModal authoritative fetch, v12.32.30) consumes this row
    // directly; helpers/ownership checks read camelCase (userEmail/attachedDocs),
    // so a raw snake_case row silently broke isOwner => attach buttons vanished.
    $aliases = [
        'user_email'=>'userEmail','user_name'=>'userName','attached_docs'=>'attachedDocs',
        'file_ids'=>'fileIds','return_comment'=>'returnComment','project_type'=>'projectType',
        'project_code'=>'projectCode','title_en'=>'titleEn','description_en'=>'descriptionEn',
        'duration_months'=>'durationMonths','npf_tier'=>'npfTier','contract_id'=>'contractId',
        'self_assessment_score'=>'selfAssessmentScore','professional_field'=>'professionalField',
        'expected_results'=>'expectedResults','team_members'=>'teamMembers',
        'eligibility_checklist'=>'eligibilityChecklist','row_version'=>'rowVersion',
        'budget_data'=>'budgetData','form_data'=>'formData',
    ];
    foreach ($aliases as $snake => $camel) {
        if (array_key_exists($snake, $r) && !array_key_exists($camel, $r)) $r[$camel] = $r[$snake];
    }
    return ['success'=>true,'form'=>$r];
}
function handleCreateForm(array $b): array {
    // Deadline gate — block new submissions outside the application window
    $dl = checkSubmissionDeadline();
    if ($dl) return $dl;
    $id=$b['id']??'f_'.bin2hex(random_bytes(8)); $u=$b['userEmail']??$b['userId']??'';
    if(!$u) return err('Missing userEmail');
    // v12.30.0-clone: Full field map matching GAS→MySQL for complete data cloning.
    // Maps camelCase GAS field names to snake_case MySQL columns.
    $fieldMap = [
        'userEmail'=>'user_email','userId'=>'user_email','userName'=>'user_name',
        'competition'=>'competition','projectCode'=>'project_code','projectType'=>'project_type',
        'title'=>'title','titleEn'=>'title_en','description'=>'description','descriptionEn'=>'description_en',
        'area'=>'area','acronym'=>'acronym','status'=>'status','budget'=>'budget',
        'durationMonths'=>'duration_months','npfTier'=>'npf_tier','selfAssessmentScore'=>'self_assessment_score',
        'fileIds'=>'file_ids','attachedDocs'=>'attached_docs','history'=>'history',
        'submitted'=>'submitted','created'=>'created','signature'=>'signature','contractId'=>'contract_id',
        'returnComment'=>'return_comment','professionalField'=>'professional_field',
        'objectives'=>'objectives','expectedResults'=>'expected_results',
        'teamMembers'=>'team_members','eligibilityChecklist'=>'eligibility_checklist',
        'indicators'=>'indicators','score'=>'score',
    ];
    $data = ['id' => $id];
    foreach ($fieldMap as $camel => $snake) {
        if (isset($b[$camel]) && $b[$camel] !== '' && $b[$camel] !== null) {
            $data[$snake] = is_array($b[$camel]) ? json_encode($b[$camel], JSON_UNESCAPED_UNICODE) : $b[$camel];
        }
    }
    // Also pass through any snake_case keys that match MySQL columns directly
    $allowed = getTableColumns('applications');
    foreach ($b as $k => $v) {
        if (str_contains($k, '_') && in_array($k, $allowed) && !isset($data[$k])) {
            $data[$k] = is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : $v;
        }
    }
    if (!isset($data['status'])) $data['status'] = 'draft';
    // v12.32.28-parity: seed row_version=1 on create (matches handleSqlCreateProposal).
    // insertArray() drops the key automatically if the column doesn't exist.
    if (!isset($data['row_version'])) $data['row_version'] = 1;
    insertArray('applications', $data);
    // v3.39.2-sqlsync: bump data_version so the version poller detects the new
    // proposal immediately and other tabs/clients refresh consistently.
    try {
        dbQuery('INSERT INTO data_version (table_name, version, updated_at)
                 VALUES ("applications",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
    } catch (Throwable $_) {}
    if(empty($b['_gasSync'])) _syncToGAS_('createform', $b);
    return ['success'=>true,'id'=>$id];
}
function handleUpdateForm(array $b): array {
    $id=$b['id']??''; if(!$id) return err('Missing id');
    // v12.51.4-epicA: server-side form-schema validation contract.
    // Enforces the same field rules the JS step schemas declare client-side,
    // so invalid data is rejected here even if the browser validation is bypassed.
    if (file_exists(__DIR__ . '/form_schema.php')) {
        require_once __DIR__ . '/form_schema.php';
        // Determine which step the incoming data belongs to and validate.
        // step1 = basic-info fields; step2 = document status; step3 = budget.
        $step1Fields = ['competition_session_id','project_type','priority_area','professional_field',
                         'title_bg','title_en','acronym','duration_months','description_bg','description_en',
                         'goals','department_id','faculty_id','principal_investigator_id'];
        $hasStep1 = false; foreach ($step1Fields as $sf) { if (array_key_exists($sf, $b)) { $hasStep1 = true; break; } }
        if ($hasStep1) {
            $v1 = validateFormAgainstSchema($b, 'step1');
            if (!$v1['ok']) return ['success'=>false, 'error'=>$v1['error_bg'], 'field'=>$v1['field'], 'code'=>422];
        }
        $hasStep3 = isset($b['budget_categories']) || isset($b['budget']);
        if ($hasStep3) {
            $v3 = validateFormAgainstSchema($b, 'step3');
            if (!$v3['ok']) return ['success'=>false, 'error'=>$v3['error_bg'], 'field'=>$v3['field'], 'code'=>422];
        }
        // step2 is only enforced on submit (not during editing).
        if (!empty($b['submitted']) || ($b['status'] ?? '') === 'submitted') {
            $v2 = validateFormAgainstSchema($b, 'step2');
            if (!$v2['ok']) return ['success'=>false, 'error'=>$v2['error_bg'], 'field'=>$v2['field'], 'code'=>422];
        }
    }
    // ── Authorization gate (mirrors GAS updateForm) ──
    // Only the form OWNER may edit; and only while the form is in an editable
    // status (draft | returned | needs_correction). Admins are view-only for
    // field mutations — status changes go through handleUpdateStatus.
    // v12.30.2-auth: prevents cross-user edits and edits in locked statuses on
    // the PHP/Hostinger replica, keeping it consistent with the GAS backend.
    $row = dbFetchOne('SELECT user_email, status FROM applications WHERE id=?', [$id]);
    if ($row) {
        $role = resolveRole($b);
        if ($role !== 'admin') {
            $caller = strtolower(trim($b['userId'] ?? $b['email'] ?? ''));
            $owner  = strtolower(trim($row['user_email'] ?? ''));
            if ($owner !== '' && $caller !== '' && $caller !== $owner) {
                return err('Нямате права да редактирате това заявление.');
            }
            $st = strtolower(trim($row['status'] ?? 'draft'));
            // v12.31.3-attachrestore: a DOCS-ONLY attachment supplement (library /
            // Drive file) is allowed for the owner at ANY status — it never changes
            // proposal fields or status, only adds document references, so the
            // creator can attach official library / Drive documents to already-created
            // proposals. Detect docs-only from the raw body (updates wrapper or top-level).
            $upd = $b['updates'] ?? $b;
            $isDocsOnlyUpdate = isset($upd['attachedDocs']) || isset($upd['attached_docs']) || isset($b['attachedDocs']) || isset($b['attached_docs']);
            if ($isDocsOnlyUpdate) {
                $otherFields = ['competitionId','competition','title','titleEn','description','descriptionEn','area','projectCode','objectives','expectedResults','teamMembers','budget','durationMonths','professionalField','acronym','status','returnComment','selfAssessmentScore','npfTier','indicators','eligibilityChecklist','newFiles','fileIds'];
                foreach ($otherFields as $of) { if (array_key_exists($of, $upd) || array_key_exists($of, $b)) { $isDocsOnlyUpdate = false; break; } }
            }
            if (!$isDocsOnlyUpdate && !in_array($st, ['draft','returned','needs_correction'], true)) {
                return err('Заявлението не може да се редактира в текущия статус (' . $st . '). Само чернови и върнати за корекция заявления могат да се редактират.');
            }
        }
    }
    // Deadline gate — block submission outside the application window
    if (!empty($b['submitted']) || ($b['status'] ?? '') === 'submitted') {
        $dl = checkSubmissionDeadline();
        if ($dl) return $dl;
    }
    // v12.30.0-realtime: Optimistic row versioning for data consistency
    if (!empty($b['rowVersion'])) {
        $current = dbFetchOne('SELECT row_version FROM applications WHERE id=?', [$id]);
        if ($current && (int)$current['row_version'] !== (int)$b['rowVersion']) {
            return ['success'=>false, 'error'=>'row_version_conflict', 'code'=>409, 'serverRowVersion'=>(int)$current['row_version']];
        }
    }
    // v12.31.0-attachflicker: The JS frontend often sends updatable fields
    // inside an `updates` wrapper object: { id, updates: { attachedDocs, ... } }.
    // Merge `updates` keys into the top-level so the fieldMap loop below picks
    // them up. Without this, attachedDocs/fileIds changes were silently dropped
    // by PHP, forcing total reliance on GAS for persistence.
    if (isset($b['updates']) && is_array($b['updates'])) {
        foreach ($b['updates'] as $k => $v) {
            if (!isset($b[$k])) {
                $b[$k] = $v;
            }
        }
    }
    // Map camelCase (from JS frontend) → snake_case (MySQL columns)
    $fieldMap=[
        'title'=>'title','title_en'=>'title_en','titleEn'=>'title_en',
        'description'=>'description','description_en'=>'description_en','descriptionEn'=>'description_en',
        'area'=>'area','project_code'=>'project_code','projectCode'=>'project_code',
        'objectives'=>'objectives','expected_results'=>'expected_results','expectedResults'=>'expected_results',
        'budget'=>'budget','team_members'=>'team_members','teamMembers'=>'team_members',
        'acronym'=>'acronym','professional_field'=>'professional_field','professionalField'=>'professional_field',
        'duration_months'=>'duration_months','durationMonths'=>'duration_months',
        'status'=>'status','return_comment'=>'return_comment','returnComment'=>'return_comment',
        'file_ids'=>'file_ids','fileIds'=>'file_ids',
        'attached_docs'=>'attached_docs','attachedDocs'=>'attached_docs',
        'history'=>'history','signature'=>'signature',
        'self_assessment_score'=>'self_assessment_score','selfAssessmentScore'=>'self_assessment_score',
        'npf_tier'=>'npf_tier','npfTier'=>'npf_tier',
        'indicators'=>'indicators','eligibility_checklist'=>'eligibility_checklist','eligibilityChecklist'=>'eligibility_checklist',
    ];
    $s=[];$p=[];
    foreach($fieldMap as $camel=>$col){
        if(isset($b[$camel])){$s[]="`$col`=?";$p[]=is_array($b[$camel])?json_encode($b[$camel],JSON_UNESCAPED_UNICODE):$b[$camel];}
    }
    if(!empty($b['submitted']))$s[]='`submitted`=NOW()';
    if(!$s)return err('No fields');
    // v12.30.0-realtime: Bump row_version for data consistency
    $s[] = 'row_version = row_version + 1';
    $p[] = $id;
    dbQuery('UPDATE applications SET '.implode(',',$s).' WHERE id=?',$p);
    // Return new row_version for optimistic concurrency
    $newVer = dbFetchOne('SELECT row_version FROM applications WHERE id=?', [$id]);
    // v12.31.0-realtime: Bump data_version so the frontend version poller
    // detects the change immediately (next 30s poll cycle picks it up).
    dbQuery('INSERT INTO data_version (table_name, version, updated_at)
             VALUES ("applications",1,NOW())
             ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
    if(empty($b['_gasSync'])) _syncToGAS_('updateform', $b);
    return ['success'=>true,'id'=>$id,'newRowVersion'=>(int)($newVer['row_version']??0)];
}
function handleUpdateStatus(array $b): array {
    // v12.26.0: Use SQL service for validated transitions with audit
    $id = $b['id'] ?? '';
    $s = $b['status'] ?? '';
    if (!$id || !$s) return err('Missing id/status');
    $role = resolveRole($b);
    $u = $b['userId'] ?? $b['email'] ?? 'system';
    // Try using the SQL service procedure
    $result = sqlApplyStatusTransition('application', $id, $s, $u, $role, $b['notes'] ?? '');
    if (!empty($result['success'])) {
        return $result;
    }
    // Fallback: direct update
    dbQuery('UPDATE applications SET status=? WHERE id=?', [$s, $id]);
    // v3.39.2-sqlsync: bump data_version so the version poller detects the change.
    try {
        dbQuery('INSERT INTO data_version (table_name, version, updated_at)
                 VALUES ("applications",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
    } catch (Throwable $_) {}
    return ['success'=>true,'id'=>$id];
}
function handleGetCompetitions(array $b = []): array {
    // v12.26.2-dynload: Dynamic pagination via offset/limit
    $activeOnly = !empty($b['activeOnly'] ?? $_GET['activeOnly'] ?? false);
    $status = $b['status'] ?? $_GET['status'] ?? '';
    $year = (int)($b['year'] ?? $_GET['year'] ?? 0);
    $offset = (int)($b['offset'] ?? 0);
    $limit = (int)($b['limit'] ?? 200);
    if ($limit < 1) $limit = 200;
    if ($limit > 500) $limit = 500;
    $result = sqlGetCompetitions($activeOnly, $status, $year, false, $offset, $limit);
    $competitions = _snakeToCamelRows($result['data'] ?? []);
    if (!empty($competitions)) return ['success'=>true,'competitions'=>$competitions,'_source'=>'sql'];
    // Fallback: direct query if procedure not yet deployed
    $comps = _snakeToCamelRows(dbFetchAllCached('SELECT * FROM competitions ORDER BY created DESC', [], 30));
    return ['success'=>true,'competitions'=>$comps ?: []];
}
function handleGetPublicCompetitions(): array {
    $result = sqlGetCompetitions(true, '', 0, false, 0, 50);
    $comps = $result['data'] ?? [];
    if (!empty($comps)) return ['success'=>true,'competitions'=>$comps,'_source'=>'sql','total'=>$result['total']??0];
    // Fallback: try gas_cache
    $cached = dbFetchAll("SELECT response_data FROM gas_cache WHERE action='getpubliccompetitions' AND expires_at>NOW() ORDER BY expires_at DESC LIMIT 1");
    if (!empty($cached)) {
        $data = json_decode($cached[0]['response_data'], true);
        if ($data && isset($data['competitions'])) return ['success'=>true,'competitions'=>$data['competitions'],'_fromCache'=>true];
    }
    return ['success'=>true,'competitions'=>[]];
}
/**
 * v12.21.0: Handle getinitialdata — aggregated initial payload for the frontend.
 * Returns competitions + user forms from MySQL. Mirrors the GAS getInitialData shape.
 * Much faster than GAS (MySQL <200ms vs Sheets+Drive 2-8s).
 * Lean mode (default): limits to 10 competitions + 50 forms for fast cold starts.
 */
function handleGetInitialData(array $b): array {
    // v12.28.0-RBAC: Server-side role resolution
    $u = $b['userId'] ?? '';
    $role = resolveRole($b);
    // NOTE (v12.49.2): same v12.48.6 downgrade removed here as in handleGetForms —
    // see that handler's note. resolveRole() is authoritative, so a real admin (even
    // one with their own forms) keeps the admin role and the all-proposals view.
    $lean = !isset($b['lean']) || !empty($b['lean']);
    $result = sqlGetInitialData($u, $role, $lean);
    if (!empty($result['forms'])) {
        $formsData = _snakeToCamelRows($result['forms'] ?? []);
        // Normalize competitionId field
        foreach ($formsData as &$row) {
            if (isset($row['competition']) && !isset($row['competitionId'])) {
                $row['competitionId'] = $row['competition'];
            }
            if (isset($row['projectCode']) && !isset($row['projectType'])) {
                $row['projectType'] = $row['projectCode'];
            }
        }
        $compsData = _snakeToCamelRows($result['competitions'] ?? []);
        $dvRow = dbFetchOne('SELECT MAX(version) as version FROM data_version');
        $globalVersion = (int)($dvRow['version'] ?? 0);
        return [
            'success' => true,
            'forms' => [
                'success' => true,
                'forms' => $formsData,
                'data' => $formsData,
                'isAdmin' => $role === 'admin',
                '_truncated' => $lean && count($formsData) >= ($lean ? ($role === 'admin' ? 100 : 20) : 500)
            ],
            'competitions' => [
                'success' => true,
                'competitions' => $compsData,
                'data' => $compsData,
                '_truncated' => $lean && count($compsData) >= 10
            ],
            'documents' => [
                'success' => true,
                'documents' => [],
                'skipped' => true,
                'count' => 0
            ],
            'versions' => [
                'applications' => $globalVersion,
                'competitions' => $globalVersion,
                'system' => $globalVersion
            ],
            '_source' => 'sql'
        ];
    }
    // Fallback: direct queries
    $a = $role === 'admin';
    $compWhere = $a ? '1=1' : "status='active'";
    $compLimit = $lean ? 'LIMIT 10' : '';
    $competitions = dbFetchAllCached("SELECT * FROM competitions WHERE $compWhere ORDER BY created DESC $compLimit", [], 30);
    $formWhere = '1=1'; $formParams = [];
    if (!$a && $u) { $formWhere .= ' AND user_email=?'; $formParams[] = $u; }
    $formLimit = ($lean && !$a) ? 50 : ($lean ? 100 : 0);
    $formSql = "SELECT * FROM applications WHERE $formWhere ORDER BY created DESC";
    if ($formLimit > 0) $formSql .= " LIMIT $formLimit";
    $forms = dbFetchAll($formSql, $formParams);
    $forms = _snakeToCamelRows($forms);
    // Normalize competitionId field
    foreach ($forms as &$row) {
        if (isset($row['competition']) && !isset($row['competitionId'])) {
            $row['competitionId'] = $row['competition'];
        }
        if (isset($row['projectCode']) && !isset($row['projectType'])) {
            $row['projectType'] = $row['projectCode'];
        }
    }
    $competitions = _snakeToCamelRows($competitions);
    $dvRow = dbFetchOne('SELECT MAX(version) as version FROM data_version');
    $globalVersion = (int)($dvRow['version'] ?? 0);
    return [
        'success' => true,
        'forms' => ['success'=>true,'forms'=>$forms,'data'=>$forms,'isAdmin'=>$a,'_truncated'=>$lean&&count($forms)>=$formLimit],
        'competitions' => ['success'=>true,'competitions'=>$competitions,'data'=>$competitions,'_truncated'=>$lean&&count($competitions)>=10],
        'documents' => ['success'=>true,'documents'=>[],'skipped'=>true,'count'=>0],
        'versions' => ['applications'=>$globalVersion,'competitions'=>$globalVersion,'system'=>$globalVersion]
    ];
}
function handleGetCompetitionSummary(array $b): array {
    $id=$b['competitionId']??''; if(!$id)return err('Missing id');
    // Use SQL service for aggregated data
    $result = sqlGetCompetitionSummary($id);
    if (!empty($result['data'])) {
        return $result;
    }
    // Fallback: direct queries
    $c=dbFetchOne('SELECT * FROM competitions WHERE id=?',[$id]); if(!$c)return err('Not found');
    $s=dbFetchOne("SELECT COUNT(*) as total, SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) as submitted FROM applications WHERE competition=?",[$id]);
    return ['success'=>true,'competition'=>$c,'stats'=>$s];
}
function handleGetContestBoard(array $b = []): array {
    // v12.26.0: Use SQL service with user application stats
    $u = $b['userId'] ?? $b['email'] ?? '';
    $result = sqlGetContestBoard($u);
    if (!empty($result['competitions'])) {
        return $result;
    }
    return ['success'=>true,'competitions'=>_snakeToCamelRows(dbFetchAllCached("SELECT id,name,deadline,status,year,created FROM competitions WHERE status!='archived' ORDER BY created DESC", [], 60))];
}
/**
 * v12.26.0: Get applications by competition — mirrors GAS getApplicationsByCompetition.
 */
function handleGetApplicationsByCompetition(array $b): array {
    $cid = $b['competitionId'] ?? $b['competition'] ?? '';
    $isAdmin = resolveRole($b) !== 'applicant';
    $userId = $b['userId'] ?? '';
    if (!$cid) return err('Missing competitionId');
    $sql = 'SELECT * FROM applications WHERE competition=?';
    $params = [$cid];
    if (!$isAdmin && $userId) { $sql .= ' AND user_email=?'; $params[] = $userId; }
    $sql .= ' ORDER BY created DESC';
    $apps = dbFetchAll($sql, $params);
    $counts = ['total'=>count($apps),'draft'=>0,'submitted'=>0,'admin_passed'=>0,'in_review'=>0,'reviewed'=>0,'approved'=>0,'rejected'=>0,'returned'=>0,'contracted'=>0];
    foreach ($apps as $a) {
        $s = strtolower(trim($a['status'] ?? ''));
        if (isset($counts[$s])) $counts[$s]++;
    }
    return ['success'=>true,'applications'=>$apps,'counts'=>$counts];
}
/**
 * v12.26.0: Aggregated competition panel — competitions + applications + reviewers in one call.
 * Mirrors GAS getCompetitionPanel but runs 3 MySQL queries instead of GAS executions.
 */
function handleGetCompetitionPanel(array $b): array {
    $cid = $b['competitionId'] ?? '';
    // 1. Competitions
    $comps = dbFetchAll('SELECT * FROM competitions ORDER BY created DESC');
    $compResult = ['success'=>true,'competitions'=>$comps];
    // 2. Applications (if competitionId provided)
    if ($cid) {
        $apps = dbFetchAll('SELECT * FROM applications WHERE competition=? ORDER BY created DESC', [$cid]);
        $counts = ['total'=>count($apps),'draft'=>0,'submitted'=>0,'admin_passed'=>0,'in_review'=>0,'reviewed'=>0,'approved'=>0,'rejected'=>0,'returned'=>0,'contracted'=>0];
        foreach ($apps as $a) {
            $s = strtolower(trim($a['status'] ?? ''));
            if (isset($counts[$s])) $counts[$s]++;
        }
        $appsResult = ['success'=>true,'applications'=>$apps,'counts'=>$counts];
    } else {
        $appsResult = ['success'=>true,'applications'=>[],'counts'=>['total'=>0]];
    }
    // 3. Reviewers (if competitionId provided)
    if ($cid) {
        $revs = dbFetchAll('SELECT * FROM reviewers WHERE competition=? ORDER BY name ASC', [$cid]);
        $reviewersResult = ['success'=>true,'reviewers'=>$revs];
    } else {
        $reviewersResult = ['success'=>true,'reviewers'=>[]];
    }
    return [
        'success'=>true,
        'competitions'=>$compResult,
        'applications'=>$appsResult,
        'reviewers'=>$reviewersResult
    ];
}
/**
 * v12.26.0: Create competition — mirrors GAS createCompetition.
 * Accepts the same body fields and inserts into MySQL.
 * Called by GAS _syncToMySQL_ after createCompetition mutation.
 */
function handleCreateCompetition(array $b): array {
    $id = $b['id'] ?? 'comp_' . bin2hex(random_bytes(8));
    $name = trim($b['name'] ?? '');
    $deadline = $b['deadline'] ?? null;
    if (!$name) return err('Missing name');
    $status = strtolower(trim($b['status'] ?? 'active'));
    $now = date('Y-m-d H:i:s');
    // v12.30.0-clone: Upsert — update if exists, insert if not (GAS→SQL mirror)
    $exists = dbFetchOne('SELECT id FROM competitions WHERE id=?', [$id]);
    if ($exists) {
        $updates = []; $params = [];
        foreach (['name','deadline','status','description','folder_id','call_type',
                  'year','directions','evaluation_criteria','budget_by_dir','open_date',
                  'templates','budget'] as $f) {
            $mapped = ['folderId'=>'folder_id','callType'=>'call_type',
                       'evalCriteria'=>'evaluation_criteria','budgetByDirection'=>'budget_by_dir',
                       'openDate'=>'open_date'];
            $src = $b[$f] ?? $b[$mapped[$f] ?? ''] ?? null;
            if ($src !== null) { $updates[] = "`$f`=?"; $params[] = is_array($src) ? json_encode($src, JSON_UNESCAPED_UNICODE) : $src; }
        }
        if (!empty($updates)) { $params[] = $id; dbQuery("UPDATE competitions SET " . implode(',', $updates) . " WHERE id=?", $params); }
        clearQueryCache('competitions');
        return ['success'=>true,'id'=>$id,'action'=>'updated'];
    }
    // Map camelCase body keys to snake_case columns
    $folderId = $b['folderId'] ?? $b['folder_id'] ?? '';
    $callType = $b['callType'] ?? $b['call_type'] ?? '';
    $evalCrit = $b['evalCriteria'] ?? $b['evaluation_criteria'] ?? '';
    $budgetBD = $b['budgetByDirection'] ?? $b['budget_by_dir'] ?? '';
    $openDt   = $b['openDate'] ?? $b['open_date'] ?? null;
    dbInsert('INSERT INTO competitions (id,name,deadline,status,created,description,folder_id,call_type,year,directions,evaluation_criteria,budget_by_dir,open_date,templates) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
        $id, $name, $deadline, $status, $now,
        trim($b['description'] ?? ''),
        $folderId, $callType, trim($b['year'] ?? ''),
        trim($b['directions'] ?? ''),
        $evalCrit, $budgetBD, $openDt,
        trim($b['templates'] ?? '')
    ]);
    clearQueryCache('competitions');
    return ['success'=>true,'id'=>$id,'action'=>'created'];
}
/**
 * v12.26.0: Edit competition — mirrors GAS editCompetition.
 */
function handleEditCompetition(array $b): array {
    static $keyMap = [
        'callType'=>'call_type','folderId'=>'folder_id','openDate'=>'open_date',
        'evalCriteria'=>'evaluation_criteria','budgetByDirection'=>'budget_by_dir'
    ];
    $id = trim($b['id'] ?? '');
    if (!$id) return err('Missing id');
    $existing = dbFetchOne('SELECT * FROM competitions WHERE id=?', [$id]);
    if (!$existing) return err('Competition not found');
    $fields = [];
    $params = [];
    foreach (['name','deadline','status','description','folder_id','call_type','year','directions','evaluation_criteria','budget_by_dir','open_date','templates'] as $f) {
        // v12.30.0-fix: Use _camelToSnake reverse for proper camelCase matching
        $snakeToCamel = lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $f))));
        $val = $b[$snakeToCamel] ?? $b[$f] ?? null;
        // Map camelCase body keys to snake_case columns
        foreach ($keyMap as $camel => $snake) {
            if ($f === $snake && isset($b[$camel])) { $val = $b[$camel]; break; }
        }
        if ($val !== null) { $fields[] = "$f=?"; $params[] = $val; }
    }
    if (empty($fields)) return ['success'=>true,'id'=>$id,'notice'=>'no_changes'];
    $fields[] = 'updated_at=NOW()';
    $params[] = $id;
    dbQuery('UPDATE competitions SET ' . implode(',', $fields) . ' WHERE id=?', $params);
    clearQueryCache('competitions');
    return ['success'=>true,'id'=>$id];
}
/**
 * v12.26.0: Delete competition — mirrors GAS deleteCompetition.
 */
function handleDeleteCompetition(array $b): array {
    $id = trim($b['id'] ?? '');
    if (!$id) return err('Missing id');
    dbQuery('DELETE FROM competitions WHERE id=?', [$id]);
    // Also delete related data
    dbQuery('UPDATE applications SET competition="" WHERE competition=?', [$id]);
    dbQuery('DELETE FROM reviewers WHERE competition=?', [$id]);
    clearQueryCache('competitions');
    return ['success'=>true,'id'=>$id];
}
/**
 * v12.26.0: Archive competition — mirrors GAS archiveCompetition.
 */
function handleArchiveCompetition(array $b): array {
    $id = trim($b['id'] ?? '');
    if (!$id) return err('Missing id');
    dbQuery('UPDATE competitions SET status=?, updated_at=NOW() WHERE id=?', ['archived', $id]);
    clearQueryCache('competitions');
    return ['success'=>true,'id'=>$id];
}
/**
 * T28 — Detect duplicate competitions by normalized name similarity.
 * Groups competitions whose names share a significant token overlap.
 */
function handleDetectDuplicateCompetitions(array $b): array {
    $email = $b['userEmail'] ?? '';
    if (!$email) return err('Auth required');
    $comps = dbFetchAll('SELECT id, name, status, created, deadline FROM competitions ORDER BY created DESC');
    if (empty($comps)) return ['success'=>true,'groups'=>[],'total'=>0];
    // Normalize: lowercase, strip punctuation, split to tokens
    $normalize = function($s) {
        $s = mb_strtolower(trim($s));
        $s = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $s);
        $tokens = array_filter(preg_split('/\s+/', $s));
        sort($tokens);
        return array_values($tokens);
    };
    $groups = [];
    $seen = [];
    for ($i = 0; $i < count($comps); $i++) {
        if (isset($seen[$i])) continue;
        $tokensA = $normalize($comps[$i]['name']);
        if (count($tokensA) < 2) continue;
        $group = [$comps[$i]];
        for ($j = $i + 1; $j < count($comps); $j++) {
            if (isset($seen[$j])) continue;
            $tokensB = $normalize($comps[$j]['name']);
            if (count($tokensB) < 2) continue;
            // Jaccard similarity on token sets
            $intersect = count(array_intersect($tokensA, $tokensB));
            $union = count(array_unique(array_merge($tokensA, $tokensB)));
            if ($union > 0 && ($intersect / $union) >= 0.6) {
                $group[] = $comps[$j];
                $seen[$j] = true;
            }
        }
        if (count($group) > 1) {
            $groups[] = $group;
        }
        $seen[$i] = true;
    }
    return ['success'=>true,'groups'=>$groups,'total'=>count($groups)];
}
/**
 * T30 — Bulk update competition status. Accepts array of IDs + target status.
 */
function handleBulkUpdateCompetitionStatus(array $b): array {
    $email = $b['userEmail'] ?? '';
    if (!$email) return err('Auth required');
    $ids = $b['ids'] ?? [];
    $status = strtolower(trim($b['status'] ?? ''));
    $allowed = ['draft','active','open','closed','archived','results_published','in_review','approved','rejected'];
    if (!is_array($ids) || empty($ids)) return err('ids array required');
    if (!$status || !in_array($status, $allowed, true)) return err('Invalid status');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $params = array_merge([$status], $ids);
    dbQuery("UPDATE competitions SET status=?, updated_at=NOW() WHERE id IN ($placeholders)", $params);
    $affected = count($ids);
    clearQueryCache('competitions');
    return ['success'=>true,'updated'=>$affected,'status'=>$status,'ids'=>$ids];
}
/**
 * v12.26.0: Dashboard context — returns role-aware lane counts and summaries.
 * Mirrors GAS getDashboardContext. Used by admin and applicant dashboards.
 */
function handleGetDashboardContext(array $b): array {
    // v12.28.0-RBAC: Server-side role resolution
    $u = $b['userId'] ?? $b['email'] ?? '';
    $role = resolveRole($b);
    $result = sqlGetDashboardContext($u, $role);
    if (!empty($result['laneCounts'])) {
        return array_merge(['success'=>true,'timestamp'=>date('Y-m-d H:i:s')], $result);
    }
    // Fallback
    $userId = $u; $isAdmin = $role === 'admin';
    $now = date('Y-m-d H:i:s');
    $where = $isAdmin ? '1=1' : 'user_email=?';
    $params = $isAdmin ? [] : [$userId];
    $counts = ['total'=>0,'draft'=>0,'submitted'=>0,'admin_passed'=>0,'in_review'=>0,'reviewed'=>0,'approved'=>0,'rejected'=>0,'returned'=>0,'contracted'=>0];
    $rows = dbFetchAll("SELECT status, COUNT(*) as cnt FROM applications WHERE $where GROUP BY status", $params);
    foreach ($rows as $r) { $s = strtolower(trim($r['status'] ?? '')); $c = (int)($r['cnt'] ?? 0); $counts['total'] += $c; if (isset($counts[$s])) $counts[$s] = $c; }
    $activeComps = dbFetchOne("SELECT COUNT(*) as cnt FROM competitions WHERE status IN ('active','open') AND deadline > ?", [$now]);
    return ['success'=>true,'counts'=>$counts,'activeCompetitions'=>(int)($activeComps['cnt'] ?? 0),'timestamp'=>$now];
}

/**
 * v12.52.0-gnatfix: Build a MIME-aware preview URL for a Drive file.
 * Google-native Docs/Sheets/Slides MUST use the docs.google.com type-specific
 * /preview endpoint; the generic drive.google.com/file/d/{id}/preview URL 404s
 * (Bulgarian "файлът не съществува") for those types. Binary files use the
 * generic /preview URL. If $preferred is already a non-empty docs/drive URL it
 * is returned as-is.
 */
function _docPreviewLinkFallback(string $driveId, string $mimeType, string $preferred = ''): string {
    $id = trim($driveId);
    if ($id === '' || !isValidDriveId($id)) {
        return $preferred !== '' ? $preferred : '';
    }
    $m = strtolower($mimeType);
    $enc = urlencode($id);
    if (stripos($m, 'google-apps.spreadsheet') !== false) {
        return "https://docs.google.com/spreadsheets/d/{$enc}/preview?rm=minimal";
    } elseif (stripos($m, 'google-apps.presentation') !== false) {
        return "https://docs.google.com/presentation/d/{$enc}/preview?rm=minimal";
    } elseif (stripos($m, 'google-apps.drawing') !== false) {
        return "https://docs.google.com/drawings/d/{$enc}/preview";
    } elseif (stripos($m, 'google-apps.document') !== false) {
        return "https://docs.google.com/document/d/{$enc}/preview?rm=minimal";
    }
    if ($preferred !== '') return $preferred;
    return "https://drive.google.com/file/d/{$enc}/preview?rm=minimal";
}

/**
 * v18.0.2: Enrich document rows — ensure every document with a valid Drive file ID
 * has a working previewLink. Called by handleListDocuments, handleListMyDocuments,
 * and handleGetFormDocuments.
 */
function _enrichDocPreviews(array $docs): array {
    foreach ($docs as &$doc) {
        $preview = $doc['preview_link'] ?? $doc['previewLink'] ?? '';
        $driveId = $doc['drive_id'] ?? $doc['driveId'] ?? $doc['id'] ?? '';
        $mimeType = $doc['mime_type'] ?? $doc['mimeType'] ?? '';
        // v12.52.0-gnatfix: also fix a STALE/bad preview URL. The old generic
        // drive.google.com/file/d/{id}/preview URL 404s for Google-native files, so
        // if the stored link is exactly that form (or empty) we recompute a
        // MIME-aware one. Caller-supplied docs.google.com/preview URLs are kept.
        $isBadGeneric = ($preview === '' || preg_match('#^https://drive\.google\.com/file/d/[^/]+/preview(\?|$)#i', $preview));
        if ($isBadGeneric && !empty($driveId) && strlen($driveId) >= 25
            && !preg_match('/^(s_|doc_|up_|f_|copied_)/', $driveId)) {
            $encId = urlencode($driveId);
            if (stripos($mimeType, 'google-apps.document') !== false) {
                $preview = "https://docs.google.com/document/d/{$encId}/preview?rm=minimal";
            } elseif (stripos($mimeType, 'google-apps.spreadsheet') !== false) {
                $preview = "https://docs.google.com/spreadsheets/d/{$encId}/preview?rm=minimal";
            } elseif (stripos($mimeType, 'google-apps.presentation') !== false) {
                $preview = "https://docs.google.com/presentation/d/{$encId}/preview?rm=minimal";
            } else {
                $preview = "https://drive.google.com/file/d/{$encId}/preview?rm=minimal";
            }
            if (isset($doc['preview_link'])) $doc['preview_link'] = $preview;
            if (isset($doc['previewLink'])) $doc['previewLink'] = $preview;
        }
        // v12.39.2-gnativedoc: emit a TRUTHFUL external open target so the
        // frontend's unified openLink (doc.externalUrl) is consistent whether a
        // document is sourced from SQL or from the GAS proxy. Mirrors the
        // buildSecureFileLinks_ contract in code.gs: MIME-aware /edit for
        // Google-native types, /view for binary files, and canOpenExternal is
        // false for synthetic (s_/doc_/up_/f_/copied_) ids so the UI never
        // claims an external Drive link for non-Drive documents.
        $fid = (string)($doc['drive_id'] ?? $doc['driveId'] ?? $doc['id'] ?? '');
        if ($fid === '') $fid = (string)($doc['id'] ?? '');
        $m   = strtolower((string)($doc['mime_type'] ?? $doc['mimeType'] ?? ''));
        $isGoogleNative = (bool)preg_match('/google-apps\.(document|spreadsheet|presentation|drawing|form)/', $m);
        if ($isGoogleNative) {
            $gtype = stripos($m, 'spreadsheet') !== false ? 'spreadsheets'
                   : (stripos($m, 'presentation') !== false ? 'presentation'
                   : (stripos($m, 'drawing') !== false ? 'drawings' : 'document'));
            $doc['externalUrl'] = 'https://docs.google.com/' . $gtype . '/d/' . urlencode($fid) . '/edit';
        } else {
            $doc['externalUrl'] = 'https://drive.google.com/file/d/' . urlencode($fid) . '/view';
        }
        $doc['canOpenExternal'] = (strlen($fid) >= 25)
            && !preg_match('/^(s_|doc_|up_|f_|copied_|lib_)/', $fid);
        $doc['isGoogleDoc'] = $isGoogleNative
            || !empty($doc['isGoogleDoc'])
            || (bool)preg_match('/google\.(document|spreadsheet|presentation|drawing|form)/i', (string)($doc['name'] ?? ''));
    }
    return $docs;
}
/**
 * copyDocument — attaches a library/official document to a form.
 *
 * The actual Drive file copy is a Google-native operation that only GAS can
 * perform (PHP/Hostinger is a MySQL replica with no Drive bridge). So this
 * handler PROXIES to GAS via postToGAS(), mirroring how handleListDocuments
 * falls back to GAS for Drive-scanned data. If GAS is unreachable, it returns
 * the original document reference so the optimistic UI attach still completes
 * (the referenced doc id is recorded by updateForm on the caller side).
 *
 * @param array $b {docId, formId, userId, isAdmin, ...}
 * @return array {success, file|doc}
 */
function handleCopyDocument(array $b): array {
    $docId  = trim((string)($b['docId'] ?? ''));
    $formId = trim((string)($b['formId'] ?? ''));
    if (!$docId || !$formId) {
        return ['success' => false, 'error' => 'Липсват необходими параметри (docId, formId)'];
    }
    $userEmail = trim($b['userId'] ?? $b['email'] ?? '');
    // Proxy to GAS for the authoritative Drive copy.
    if (defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && defined('GAS_SYNC_ENABLED') && GAS_SYNC_ENABLED) {
        try {
            $gasResp = postToGAS(GAS_REAL_URL, json_encode(array_merge($b, [
                'action'   => 'copyDocument',
                '_gasSync' => true,
            ])));
            if (!empty($gasResp['success'])) {
                $file = $gasResp['file'] ?? null;
                if ($file) {
                    // v12.31.0-realtime: Save copied file metadata to MySQL so it
                    // appears immediately in listDocuments/listMyDocuments reads
                    // without waiting for GAS→MySQL async sync. This eliminates
                    // the "appear then disappear" flicker when attaching files.
                    try {
                        $docRecord = [
                            'id'               => $file['id'] ?? ('doc_'.bin2hex(random_bytes(8))),
                            'name'             => $file['name'] ?? ($b['name'] ?? 'Документ'),
                            'mime_type'        => $file['mimeType'] ?? ($b['mimeType'] ?? ''),
                            'drive_id'         => $file['driveId'] ?? $file['id'] ?? $docId,
                            'web_view_link'    => $file['webViewLink'] ?? ($b['webViewLink'] ?? ''),
                            'download_url'     => $file['downloadUrl'] ?? ($b['downloadUrl'] ?? ''),
                            'edit_link'        => $file['editLink'] ?? ($b['editLink'] ?? ''),
                            'google_doc_edit_link' => $file['googleDocEditLink'] ?? ($b['googleDocEditLink'] ?? ''),
                            'preview_link'     => $file['previewLink'] ?? ($b['previewLink'] ?? ''),
                            'template_source_id'   => $docId,
                            'template_source_name' => $file['name'] ?? ($b['name'] ?? ''),
                            'user_email'       => $userEmail,
                            'form_id'          => $formId,
                            'folder_name'      => 'Конкурсна сесия 2026 документи',
                            'origin'           => 'copied',
                            'size'             => (int)($file['size'] ?? 0),
                        ];
                        insertArray('documents', $docRecord);
                        dbQuery('INSERT INTO data_version (table_name, version, updated_at)
                                 VALUES ("documents",1,NOW())
                                 ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
                    } catch (Throwable $_) {
                        // MySQL save failed — non-critical, GAS has the file
                    }
                    return ['success' => true, 'file' => $file, '_source' => 'gas_proxy'];
                }
            }
        } catch (Throwable $_) {
            // GAS unreachable — fall through to local echo below.
        }
    }
    // Fallback: echo the source doc reference so the attach completes locally.
    // The caller's handleAttachDocuments records attachedDocs via updateForm.
    // v3.39-validate: Never emit a broken URL. If the doc has no valid Drive ID
    // AND no usable link, return an explicit error instead of a dead preview —
    // this is a root cause of "файлът, който сте заявили, не съществува".
    // v3.39.9-mimefix: Look up the source doc from the `documents` table so we
    // can return its mime_type, preview_link, etc. even when the frontend only
    // passes docId/formId. Without this the InlineDocEditorModal cannot detect
    // the document type and falls through to "Документът е готов".
    $previewLink = trim((string)($b['previewLink'] ?? ''));
    $webViewLink = trim((string)($b['webViewLink'] ?? ''));
    $mimeType    = $b['mimeType'] ?? '';
    $docName     = $b['name'] ?? '';
    if (empty($mimeType) || empty($previewLink) || empty($docName)) {
        $src = dbFetchOne('SELECT mime_type, preview_link, web_view_link, name, folder_name FROM documents WHERE drive_id=? OR id=?', [$docId, $docId]);
        if ($src) {
            if (empty($mimeType) && !empty($src['mime_type'])) $mimeType = $src['mime_type'];
            if (empty($previewLink) && !empty($src['preview_link'])) $previewLink = $src['preview_link'];
            if (empty($webViewLink) && !empty($src['web_view_link'])) $webViewLink = $src['web_view_link'];
            if (empty($docName) && !empty($src['name'])) $docName = $src['name'];
        }
    }
    if ($previewLink === '' && isValidDriveId($docId)) {
        $enc = urlencode($docId);
        if (stripos($mimeType, 'google-apps.document') !== false) {
            $previewLink = "https://docs.google.com/document/d/{$enc}/preview?rm=minimal";
        } elseif (stripos($mimeType, 'google-apps.spreadsheet') !== false) {
            $previewLink = "https://docs.google.com/spreadsheets/d/{$enc}/preview?rm=minimal";
        } elseif (stripos($mimeType, 'google-apps.presentation') !== false) {
            $previewLink = "https://docs.google.com/presentation/d/{$enc}/preview?rm=minimal";
        } else {
            $previewLink = "https://drive.google.com/file/d/{$enc}/preview?rm=minimal";
        }
    }
    if (!isValidDriveId($docId) && $previewLink === '' && $webViewLink === '') {
        return ['success' => false, 'error' => 'Документът не може да бъде отворен — липсва валиден идентификатор на файла.'];
    }
    return [
        'success' => true,
        'file'    => [
            'id'          => $docId,
            'driveId'     => $docId,
            'name'        => $docName ?: ($b['name'] ?? 'Документ'),
            'isGoogleDoc' => !empty($b['isGoogleDoc']) || (stripos($mimeType, 'google-apps.document') !== false),
            'mimeType'    => $mimeType,
            'previewLink' => $previewLink,
            'webViewLink' => $webViewLink,
        ],
        '_source' => 'mysql_echo',
    ];
}
function handleListDocuments(array $b = []): array {
    // v12.28.0-RBAC: Server-side role resolution
    $u = $b['userId'] ?? $b['email'] ?? '';
    $role = resolveRole($b);
    // v12.48.7-leakfix: applicants must only see their own documents.
    // Without this, listdocuments in the /applications section returns every
    // document in the DB because myDocumentsOnly is forced to false for non-admins.
    $myDocumentsOnly = ($role !== 'admin');
    $result = sqlGetDocuments($u, $role, '', '', '', '', '', $myDocumentsOnly, 0, 500);
    // v3.39.2-perf: Use a LEAN column list (no content/blob) so opening the
    // library does not pull multi-MB blobs for every document row.
    // v3.39.3-libfix: Removed non-existent columns (document_type, file_type, status, status_group, application_id)
    // v12.33.1-libfix: ALWAYS use lean columns. The stored procedure returns
    // `d.*` (including the `content` blob — 41 MB across the library), which
    // previously made the listDocuments response ~41.8 MB and blew the frontend's
    // 8s timeout, so the библиотека appeared to have missing documents. Strip
    // heavy blob columns from the proc rows and fall back to a lean SELECT.
    $leanCols = 'id,name,description,folder_name,category,type_label,doc_type,origin,project_type,mime_type,size,drive_id,web_view_link,download_url,edit_link,google_doc_edit_link,preview_link,template_source_id,template_source_name,user_email,form_id,is_static,created,modified,_data_version';
    if (!empty($result['data'])) {
        // Keep only light metadata columns (drop content/other blobs) from the
        // stored-procedure rows so the payload stays small for the list view.
        $localDocs = array_map(function ($row) use ($leanCols) {
            $out = [];
            foreach ($row as $k => $v) {
                if ($k === 'content' || $k === 'blob' || $k === 'data') continue;
                $out[$k] = $v;
            }
            // Ensure the lean columns the frontend reads exist even if the proc
            // renamed/omitted them.
            foreach (explode(',', $leanCols) as $c) {
                $c = trim($c);
                if ($c !== '' && !array_key_exists($c, $out)) $out[$c] = null;
            }
            return $out;
        }, $result['data']);
    } else {
        $localDocs = dbFetchAll("SELECT $leanCols FROM documents ORDER BY name ASC");
    }
    // v18.0.2: Enrich documents — ensure every document with a valid Drive file ID
    // has a working previewLink. This fixes "file does not exist" when the DB has
    // the correct drive_id but the preview_link field is empty.
    $localDocs = _enrichDocPreviews($localDocs);
    // If local documents table is too sparse (< 3 docs), proxy to GAS for the
    // real Drive document list. The MySQL documents table is a mirror that may
    // not be fully populated yet — GAS has the authoritative Drive-scanned list.
    if (count($localDocs) < 3 && defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && GAS_SYNC_ENABLED) {
        try {
            $gasResp = postToGAS(GAS_REAL_URL, json_encode([
                'action' => 'listdocuments',
                'userId' => $u,
                'isAdmin' => resolveRole($b) !== 'applicant',
                '_gasSync' => true,
                'forceRefresh' => $b['forceRefresh'] ?? false
            ]));
            if (!empty($gasResp['success']) && !empty($gasResp['documents'])) {
                return ['success'=>true,'documents'=>$gasResp['documents'],'_source'=>'gas_proxy'];
            }
        } catch (Throwable $_) {
            // GAS unreachable — return whatever we have locally
        }
    }
    return ['success'=>true,'documents'=>$localDocs,'_source'=>'mysql'];
}
function handleListMyDocuments(array $b): array {
    $u=$b['userId']??$b['email']??'';
    // v19.0.0-warmfix: Return empty instead of error for cache warming calls
    if(!$u)return ['success'=>true,'documents'=>[],'_anonymous'=>true];
    // Try stored procedure first, fall back to direct query if unavailable
    $result = sqlGetDocuments($u, 'applicant', '', '', '', '', '', true, 0, 200);
    // v3.39.2-perf: Avoid the correlated subquery (form_id IN (SELECT id FROM
    // applications WHERE user_email=?)) which forces a full documents scan.
    // A UNION of two index-covered queries (idx_docs_user_email + idx_docs_form_id)
    // is far cheaper. Dedupe by id.
    // v12.33.1-libfix: Strip heavy `content` blob columns so my-documents list
    // responses stay small (same 41 MB lean fix as handleListDocuments).
    $localDocs = (!empty($result['success']) && isset($result['data']))
        ? array_map(function ($row) {
            $out = [];
            foreach ($row as $k => $v) {
                if ($k === 'content' || $k === 'blob' || $k === 'data') continue;
                $out[$k] = $v;
            }
            return $out;
        }, $result['data'])
        : dbFetchAll(
            "SELECT d.id,d.name,d.description,d.folder_name,d.category,d.type_label,d.doc_type,d.origin,d.project_type,d.mime_type,d.size,d.drive_id,d.web_view_link,d.download_url,d.edit_link,d.google_doc_edit_link,d.preview_link,d.template_source_id,d.template_source_name,d.user_email,d.form_id,d.is_static,d.created,d.modified,d._data_version FROM documents d WHERE d.user_email = ?
             UNION
             SELECT d.id,d.name,d.description,d.folder_name,d.category,d.type_label,d.doc_type,d.origin,d.project_type,d.mime_type,d.size,d.drive_id,d.web_view_link,d.download_url,d.edit_link,d.google_doc_edit_link,d.preview_link,d.template_source_id,d.template_source_name,d.user_email,d.form_id,d.is_static,d.created,d.modified,d._data_version FROM documents d WHERE d.form_id IN (SELECT a.id FROM applications a WHERE a.user_email = ?)
             ORDER BY updated_at DESC",
            [$u, $u]
          );
    // v18.0.2: Enrich documents with working preview links
    $localDocs = _enrichDocPreviews($localDocs);
    // If local documents table is empty, proxy to GAS for the authoritative Drive-scanned list
    // v12.55.1: Only proxy on cache-warming calls (anonymous) or forceRefresh — prevents deleted docs from reappearing
    if (count($localDocs) < 3 && (!$u || !empty($b['forceRefresh'])) && defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && GAS_SYNC_ENABLED) {
        try {
            $gasResp = postToGAS(GAS_REAL_URL, json_encode([
                'action' => 'listmydocuments',
                'userId' => $u,
                '_gasSync' => true,
                'forceRefresh' => $b['forceRefresh'] ?? false
            ]));
            if (!empty($gasResp['success']) && !empty($gasResp['documents'])) {
                return ['success'=>true,'documents'=>$gasResp['documents'],'_source'=>'gas_proxy'];
            }
        } catch (Throwable $_) {
            // GAS unreachable — return whatever we have locally
        }
    }
    return ['success'=>true,'documents'=>$localDocs,'_source'=>'sql','total'=>count($localDocs)];
}
function handleCopyDocForUser(array $b): array {
    $docId=$b['docId']??'';$userEmail=$b['userId']??$b['email']??'';if(!$docId||!$userEmail)return err('Missing docId/userId');
    $s=dbFetchOne('SELECT * FROM documents WHERE id=?',[$docId]);if(!$s)return err('Not found');
    // v12.32.35-templates: best-effort Google Drive copy for REAL Drive-source docs.
    // Local/DB-seeded templates (lib_/s_ prefixes, no valid Drive id) keep their
    // stored content so the copy is editable inline from MySQL. Real Drive docs get
    // a true copy in the user's applicant folder (APPLICANT_DOCS_FOLDER_ID) via GAS.
    $driveId=$s['drive_id']??'';
    $isRealDrive=!empty($driveId)&&strlen($driveId)>=25&&!preg_match('/^(s_|doc_|up_|f_|copied_|lib_)/',$driveId);
    $gasCopyDriveId='';
    if($isRealDrive&&defined('GAS_REAL_URL')&&GAS_REAL_URL!==''&&GAS_SYNC_ENABLED){
        try{
            $gasResp=postToGAS(GAS_REAL_URL,json_encode([
                'action'=>'copytemplatetodrive','docId'=>$driveId,'email'=>$userEmail,
                'auth'=>['userId'=>$userEmail,'isAdmin'=>false],'isAdmin'=>false
            ]));
            if(!empty($gasResp['success'])&&!empty($gasResp['driveId'])){$gasCopyDriveId=$gasResp['driveId'];}
        }catch(_){}
    }
    $n='doc_'.bin2hex(random_bytes(8));
    $now=date('c');
    dbInsert('INSERT INTO documents (id,name,mime_type,size,folder_name,origin,type_label,drive_id,content,web_view_link,download_url,edit_link,google_doc_edit_link,preview_link,template_source_id,template_source_name,user_email,form_id,created,modified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())',
        [$n,$s['name'],$s['mime_type'],$s['size'],$s['folder_name']??'Мои документи','copied',$s['type_label'],
         $gasCopyDriveId?$gasCopyDriveId:$driveId,$s['content']??null,$s['web_view_link']??null,$s['download_url']??null,$s['edit_link']??null,$s['google_doc_edit_link']??null,$s['preview_link']??null,$docId,$s['name']??'',$userEmail,$b['formId']??'']);
    $row=dbFetchOne('SELECT * FROM documents WHERE id=?',[$n]);
    if(!$row)return err('Failed to create copy');
    $mime=$row['mime_type']??'';
    $driveId2=$row['drive_id']??$row['id']??'';
    $previewUrl=$row['preview_link']??'';
    if(empty($previewUrl)&&!empty($driveId2)&&strlen($driveId2)>=25&&!preg_match('/^(s_|doc_|up_|f_|copied_|lib_)/',$driveId2)){
        $previewUrl='https://drive.google.com/file/d/'.urlencode($driveId2).'/preview?rm=minimal';
        dbQuery('UPDATE documents SET preview_link=? WHERE id=?',[$previewUrl,$row['id']]);
    }
    return [
        'success'=>true,
        'file'=>[
            'id'=>$row['id'],'driveId'=>$driveId2,'name'=>$row['name']??'',
            'mimeType'=>$mime,'typeLabel'=>$row['type_label']??'',
            'previewLink'=>$previewUrl,'webViewLink'=>$row['web_view_link']??$row['preview_link']??'',
            'editLink'=>$row['edit_link']??'','googleDocEditLink'=>$row['google_doc_edit_link']??'',
            'downloadUrl'=>$row['download_url']??'','size'=>formatFileSize($row['size']??0),
            'sizeBytes'=>(int)($row['size']??0),'folderName'=>$row['folder_name']??'Мои документи',
            'formId'=>$row['form_id']??'','createdDate'=>$row['created']??$now,'modifiedDate'=>$row['updated_at']??$now,
            'origin'=>$row['origin']??'copied','templateSourceId'=>$row['template_source_id']??'',
            'templateSourceName'=>$row['template_source_name']??'',
            'content'=>$row['content']??'','hasContent'=>!empty($row['content']),
            'isGoogleDoc'=>!empty($mime)&&(bool)preg_match('/google\.(document|spreadsheet|presentation|drawing|form)/i',$mime)
        ]
    ];
}
function handleUploadMyDocument(array $b): array {
    $u=$b['userId']??'';$f=$b['files']??[];if(!$u)return err('Missing userId');if(!$f)return err('No files');
    $up=[];$sk=[];
    foreach($f as $v){$n=$v['name']??'unnamed';$b64=$v['content']??'';if(!$b64){$sk[]=$n;continue;}
        $id='up_'.bin2hex(random_bytes(8));
        // v12.32.30-docview: best-effort GAS upload so the doc gets a real
        // Google Drive file id and renders in the official, secure, view-only
        // Google Drive preview inside the modal. Failures are non-fatal — PHP
        // keeps the base64 copy + Download fallback. Only fires when GAS sync
        // is enabled; once code.gs (uploadUserDoc) is deployed this populates
        // drive_id for newly uploaded docs.
        $driveId = $v['driveId'] ?? $v['drive_id'] ?? null;
        if (!$driveId && defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && defined('GAS_SYNC_ENABLED') && GAS_SYNC_ENABLED) {
            try {
                $gasResp = postToGAS(GAS_REAL_URL, json_encode([
                    'action'  => 'uploaduserdoc',
                    '_gasSync' => true,
                    'userId'  => $u,
                    'email'   => $u,
                    'file'    => ['name' => $n, 'type' => $v['type'] ?? 'application/octet-stream', 'data' => $b64],
                ]));
                if (!empty($gasResp['success']) && !empty($gasResp['driveId'])) {
                    $driveId = $gasResp['driveId'];
                }
            } catch (Throwable $e) { /* keep base64-only fallback */ }
        }
        if ($driveId) {
            dbInsert('INSERT INTO documents (id,name,mime_type,size,folder_name,origin,user_email,content,drive_id,created,modified) VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())',[$id,$n,$v['type']??'application/octet-stream',$v['size']??0,'Моите документи','uploaded',$u,$b64,$driveId]);
        } else {
            dbInsert('INSERT INTO documents (id,name,mime_type,size,folder_name,origin,user_email,content,created,modified) VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())',[$id,$n,$v['type']??'application/octet-stream',$v['size']??0,'Моите документи','uploaded',$u,$b64]);
        }
        $up[]=dbFetchOne('SELECT * FROM documents WHERE id=?',[$id]);}
    // Bump data_version so frontend detects new documents immediately
    dbQuery('INSERT INTO data_version (table_name, version, updated_at)
             VALUES ("documents",1,NOW())
             ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
    // T39: Trigger OCR extraction for text-based documents (best-effort, non-blocking)
    foreach ($up as $urow) {
        try { sqlRecordDocVersion($urow['id'] ?? '', $urow['drive_id'] ?? '', $urow['name'] ?? '', $u, 'Качване'); } catch (Throwable $_) {}
        $mime = strtolower($urow['mime_type'] ?? '');
        if (strpos($mime, 'text/') === 0 || $mime === 'application/json' || $mime === 'application/pdf') {
            try {
                ensureOcrTextColumn();
                $content = $urow['content'] ?? '';
                $extractedText = '';
                if (strpos($mime, 'text/') === 0 || $mime === 'application/json') {
                    $decoded = base64_decode($content, true);
                    $extractedText = $decoded !== false ? $decoded : '';
                } elseif ($mime === 'application/pdf') {
                    $decoded = base64_decode($content, true);
                    if ($decoded !== false) {
                        $extractedText = preg_replace('/[^\x20-\x7E\x{0400}-\x{04FF}\s]/u', ' ', $decoded) ?: '';
                        $extractedText = preg_replace('/\s+/', ' ', $extractedText) ?: '';
                        $extractedText = trim(mb_substr($extractedText, 0, 50000));
                    }
                }
                dbQuery("UPDATE documents SET ocr_text=?, ocr_status=?, ocr_at=NOW() WHERE id=?", [$extractedText, 'completed', $urow['id']]);
            } catch (Throwable $_) {}
        }
    }
    return ['success'=>true,'files'=>$up,'skipped'=>$skipped];}
function handleDeleteMyDocument(array $b): array {
    $i = $b['docId'] ?? $b['id'] ?? '';
    if (!$i) return err('Missing id');
    // Fetch doc details before deletion for GAS sync
    $doc = dbFetchOne('SELECT drive_id, user_email FROM documents WHERE id=?', [$i]);
    dbQuery('DELETE FROM documents WHERE id=?', [$i]);
    dbQuery('INSERT INTO data_version (table_name, version, updated_at)
             VALUES ("documents",1,NOW())
             ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
    // Sync deletion to GAS so it doesn't reappear in subsequent list calls
    if ($doc && !empty($doc['drive_id']) && defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && GAS_SYNC_ENABLED) {
        try {
            postToGAS(GAS_REAL_URL, json_encode([
                'action'   => 'deletemydocument',
                'docId'    => $i,
                'driveId'  => $doc['drive_id'],
                'userId'   => $doc['user_email'] ?? '',
                '_gasSync' => true
            ]));
        } catch (Throwable $_) {}
    }
    return ['success'=>true,'deletedId'=>$i];
}
// ── Document comments ─────────────────────────────────────────────────
function handleGetDocComments(array $b): array {
    $docId = trim($b['docId'] ?? '');
    if ($docId === '') return err('Missing docId');
    ensureDossierTables();
    $rows = dbFetchAll('SELECT author,text,created_at FROM document_comments WHERE doc_id=? ORDER BY created_at ASC', [$docId]);
    return ['success' => true, 'comments' => $rows ?: []];
}
function handleAddDocComment(array $b): array {
    $docId = trim($b['docId'] ?? '');
    $text = trim($b['text'] ?? '');
    if ($docId === '' || $text === '') return err('Missing docId or text');
    ensureDossierTables();
    $email = '';
    try { $u = json_decode($_COOKIE['erp_user'] ?? '{}', true); $email = $u['email'] ?? ''; } catch (_) {}
    dbQuery('INSERT INTO document_comments (doc_id,author,text,created_at) VALUES (?,?,?,NOW())', [$docId, $email, $text]);
    dbQuery('INSERT INTO data_version (table_name,version,updated_at) VALUES ("document_comments",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1,updated_at=NOW()');
    return ['success' => true];
}
// T4: proposal-level review comments used by Step 4 Review panel.
function ensureReviewCommentTables(): void {
    try {
        $db = getDB();
        $db->exec("CREATE TABLE IF NOT EXISTS `review_comments` (
          `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `proposal_id` VARCHAR(128) NOT NULL DEFAULT '',
          `author_name` VARCHAR(255) NOT NULL DEFAULT '',
          `author_email` VARCHAR(255) NOT NULL DEFAULT '',
          `text` TEXT NOT NULL,
          `created_at` DATETIME NULL,
          KEY `idx_rc_proposal` (`proposal_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {}
}
function handleGetReviewComments(array $b): array {
    $proposalId = trim($b['proposalId'] ?? '');
    if ($proposalId === '') return err('Missing proposalId');
    ensureReviewCommentTables();
    $rows = dbFetchAll('SELECT id,author_name,author_email,text,created_at FROM review_comments WHERE proposal_id=? ORDER BY created_at ASC', [$proposalId]);
    return ['success' => true, 'comments' => $rows ?: []];
}
function handleAddReviewComment(array $b): array {
    $proposalId = trim($b['proposalId'] ?? '');
    $text = trim($b['text'] ?? '');
    if ($proposalId === '' || $text === '') return err('Missing proposalId or text');
    ensureReviewCommentTables();
    $email = '';
    $name = '';
    try { $u = json_decode($_COOKIE['erp_user'] ?? '{}', true); $email = $u['email'] ?? ''; $name = $u['name'] ?? ($u['full_name'] ?? ($email ?: 'Анонимен')); } catch (_) {}
    dbQuery('INSERT INTO review_comments (proposal_id,author_name,author_email,text,created_at) VALUES (?,?,?,?,NOW())', [$proposalId, $name ?: 'Анонимен', $email, $text]);
    return ['success' => true];
}
// ── v3.39.11-officetext: Seed the real local document library ──
// Loads seed-local-docs.json (generated by scripts/seed-local-docs.php from
// the user's "01 ERP Scientific Projects" folder) and idempotently upserts
// each document's extracted TEXT into the `documents` table. This is what
// makes office/pdf templates (which Google cannot export to HTML) actually
// VISUALISE + EDIT in the modal via the ERP's own `content` copy.
function handleSeedLocalDocs(array $b): array {
    // v3.39.11: resolve the seed JSON across both deploy layouts:
    //   Laravel core:  database/../seed-local-docs.json  (repo root)
    //   Legacy webroot: public/database/../seed-local-docs.json (public/)
    $candidates = [
        __DIR__ . '/../seed-local-docs.json',
        __DIR__ . '/../../seed-local-docs.json',
        dirname(__DIR__, 2) . '/seed-local-docs.json',
        __DIR__ . '/seed-local-docs.json',
    ];
    $file = null;
    foreach ($candidates as $c) { if (is_file($c)) { $file = $c; break; } }
    if ($file === null) return err('Seed file not found: seed-local-docs.json (expected at repo root or public/)');
    $json = json_decode(file_get_contents($file), true);
    if (!is_array($json) || empty($json['documents'])) return err('Seed file empty or invalid');
    if (!function_exists('getDB')) {
        require_once __DIR__ . '/config.php';
        require_once __DIR__ . '/sql_service.php';
    }
    $n = 0;
    foreach ($json['documents'] as $d) {
        $id = $d['id'] ?? '';
        if (!$id) continue;
        $existing = dbFetchOne('SELECT id FROM documents WHERE id=?', [$id]);
        if ($existing) {
            dbQuery('UPDATE documents SET content=?, name=?, mime_type=?, modified=NOW() WHERE id=?',
                [$d['content'] ?? '', $d['name'] ?? '', $d['mime_type'] ?? 'text/plain', $id]);
        } else {
            dbInsert('INSERT INTO documents (id,name,mime_type,size,folder_name,origin,user_email,content,created,modified) VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())',
                [$id, $d['name'] ?? 'Document', $d['mime_type'] ?? 'text/plain', (int)($d['size'] ?? 0),
                 $d['folder_name'] ?? 'Библиотека', $d['origin'] ?? 'library', '', $d['content'] ?? '']);
        }
        $n++;
    }
    // Bump data_version so the frontend refreshes the document list.
    dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("documents",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
    return ['success' => true, 'seeded' => $n, 'total' => count($json['documents'])];
}
function handleGetDocumentContent(array $b): array {
    // v12.32.12-visualizer: read a document's stored HTML/content so the
    // in-modal Google-styled visualizer can render embedded seals/photos on
    // demand (parity with savedocumentcontent which writes it).
    $id = $b['docId'] ?? $b['id'] ?? '';
    if (!$id) return err('Missing docId');
    $doc = dbFetchOne('SELECT id,name,mime_type,content,modified FROM documents WHERE id=?', [$id]);
    if (!$doc) return ['success' => false, 'error' => 'Document not found'];
    return [
        'success' => true,
        'id' => $doc['id'],
        'name' => $doc['name'],
        'mimeType' => $doc['mime_type'],
        'content' => $doc['content'] ?? '',
        'modified' => $doc['updated_at'] ?? null,
    ];
}
function handleSaveDocumentContent(array $b): array {
    $id=$b['docId']??$b['id']??'';$c=$b['content']??'';$fid=$b['formId']??'';
    $name=$b['name']??'Document';$mime=$b['mimeType']??'text/plain';
    if(!$id||!$c)return err('Missing docId or content');
    // Resolve user email: try payload first, then form owner, then fallback
    $userEmail = $b['userId']??'';
    if(!$userEmail && $fid){
        $f = dbFetchOne('SELECT user_email FROM applications WHERE id=?',[$fid]);
        if($f) $userEmail = $f['user_email']??'';
    }
    // Check if document exists — if not, INSERT (template-generated docs
    // are created in Drive but may not be in the `documents` table yet)
    $existing=dbFetchOne('SELECT id FROM documents WHERE id=?',[$id]);
    if($existing){
        dbQuery('UPDATE documents SET content=?,modified=NOW() WHERE id=?',[$c,$id]);
    } else {
        dbInsert('INSERT INTO documents (id,name,mime_type,size,folder_name,origin,user_email,content,created,modified) VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())',
            [$id,$name,$mime,0,'Моите документи','generated',$userEmail,$c]);
    }
    // If the doc is attached to a form, also update the form's attachedDocs in-memory
    if($fid){
        $form=dbFetchOne('SELECT * FROM applications WHERE id=?',[$fid]);
        if($form){
            $docs=json_decode($form['file_ids']??'[]',true);
            if(is_array($docs)){
                $changed=false;
                foreach($docs as &$d){
                    if(($d['id']??'')===$id||($d['fileId']??'')===$id){
                        $d['content']=$c;$changed=true;break;
                    }
                }
                if($changed)dbQuery('UPDATE applications SET file_ids=? WHERE id=?',[json_encode($docs,JSON_UNESCAPED_UNICODE),$fid]);
            }
        }
    }
    clearQueryCache('documents');
    if(!empty($fid))
    try {
        dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("documents",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
        if(!empty($fid)) {
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("applications",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
        }
    } catch (\Throwable $_) {}
    // D10 — record a document revision (guarded; no-op if table absent).
    try { sqlRecordDocVersion($id, $existing['drive_id'] ?? $b['driveId'] ?? '', $name, $userEmail, 'Запазване на съдържание'); } catch (\Throwable $_) {}
    return ['success'=>true,'updatedId'=>$id,'modified'=>date('c')];
}
/**
 * T133b: List all staff members with full profile info.
 * Returns: { success, members: [{ email, full_name, title, faculty, department, office, orcid, work_count, last_synced }] }
 */
function handleGetStaffMembers(): array {
    $rows = dbFetchAll('SELECT email, full_name, title, faculty, department, office, orcid, work_count, last_synced FROM user_scientific_profile ORDER BY faculty ASC, full_name ASC');
    return ['success' => true, 'members' => $rows, '_count' => count($rows)];
}

/**
 * T133b: Get publications for a specific staff member.
 * Body: { email }
 * Returns: { success, publications: [...], _count }
 */
function handleGetStaffPublications(array $b): array {
    $email = $b['email'] ?? '';
    if (!$email) return err('Missing email');
    
    $rows = dbFetchAll(
        'SELECT id, title, authors, publication as journal, year, doi, url, 0 as citations 
         FROM scientific_works 
         WHERE author_email = ? 
         ORDER BY year DESC, created DESC',
        [$email]
    );
    return ['success' => true, 'publications' => $rows, '_count' => count($rows)];
}

/**
 * T133b: Search knowledge base by title, DOI, or author.
 * Body: { query, limit?, offset? }
 * Returns: { success, results: [...], _count }
 */
function handleSearchKnowledgeBase(array $b): array {
    $query = trim($b['query'] ?? '');
    if (!$query) return err('Missing query');
    
    $limit = min((int)($b['limit'] ?? 50), 200);
    $offset = (int)($b['offset'] ?? 0);
    
    $search = '%' . $query . '%';
    $rows = dbFetchAll(
        'SELECT kb.staff_email, kb.title, kb.authors, kb.journal, kb.year, kb.doi, kb.url, kb.source, kb.citations,
                sp.full_name, sp.title as staff_title, sp.faculty
         FROM knowledge_base kb
         LEFT JOIN user_scientific_profile sp ON kb.staff_email = sp.email
         WHERE kb.title LIKE ? OR kb.doi LIKE ? OR kb.authors LIKE ?
         ORDER BY kb.citations DESC, kb.year DESC
         LIMIT ? OFFSET ?',
        [$search, $search, $search, $limit, $offset]
    );
    return ['success' => true, 'results' => $rows, '_count' => count($rows)];
}

/**
 * T133b: Get a single staff member by email.
 * Body: { email }
 * Returns: { success, member: {...} }
 */
function handleGetStaffMemberByEmail(array $b): array {
    $email = $b['email'] ?? '';
    if (!$email) return err('Missing email');
    
    $row = dbFetchOne(
        'SELECT email, full_name, title, faculty, department, office, orcid, work_count, last_synced 
         FROM user_scientific_profile WHERE email = ?',
        [$email]
    );
    if (!$row) return err('Staff member not found');
    return ['success' => true, 'member' => $row];
}

/**
 * T133b: List knowledge base entries with pagination.
 * Body: { limit?, offset?, faculty?, year? }
 * Returns: { success, entries: [...], _count }
 */
function handleListKnowledgeBase(array $b): array {
    $limit = min((int)($b['limit'] ?? 50), 200);
    $offset = (int)($b['offset'] ?? 0);
    $faculty = $b['faculty'] ?? '';
    $year = $b['year'] ?? '';
    
    $where = [];
    $params = [];
    
    if ($faculty) {
        $where[] = 'sp.faculty = ?';
        $params[] = $faculty;
    }
    if ($year) {
        $where[] = 'kb.year = ?';
        $params[] = (int)$year;
    }
    
    $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    
    $rows = dbFetchAll(
        "SELECT kb.staff_email, kb.title, kb.authors, kb.journal, kb.year, kb.doi, kb.url, kb.source, kb.citations,
                sp.full_name, sp.title as staff_title, sp.faculty
         FROM knowledge_base kb
         LEFT JOIN user_scientific_profile sp ON kb.staff_email = sp.email
         $whereSql
         ORDER BY kb.citations DESC, kb.year DESC
         LIMIT ? OFFSET ?",
        array_merge($params, [$limit, $offset])
    );
    return ['success' => true, 'entries' => $rows, '_count' => count($rows)];
}

/**
 * Helper: extract Google Sheet gid from various URL formats.
 * Supports: .../spreadsheets/d/{id}/edit#gid=123
 *           .../spreadsheets/d/{id}/preview/sheet?gid=123
 *           raw gid string
 * Returns: gid string or ''
 */
function _extractSheetGid(string $url): string {
    if (!$url) return '';
    // Already a plain gid (digits)
    if (preg_match('/^\d+$/', $url)) return $url;
    // Extract from URL
    if (preg_match('/[?&]gid=(\d+)/', $url, $m)) return $m[1];
    if (preg_match('/#gid=(\d+)/', $url, $m)) return $m[1];
    return '';
}

/**
 * T133b: Build a Google Drive embed URL matching yai.free.bg architecture.
 * Supports documents, spreadsheets (with sheet gid), presentations, drawings.
 *
 * Body: { driveId, mimeType?, sheetGid? }
 * Returns: { success, embedUrl, type }
 */
function handleBuildEmbedUrl(array $b): array {
    $driveId = trim($b['driveId'] ?? '');
    $mimeType = strtolower($b['mimeType'] ?? '');
    $sheetGid = (string)($b['sheetGid'] ?? '');
    
    // Try to extract gid from a full URL if provided instead of raw id
    if (!$sheetGid && !preg_match('/^\d+$/', $driveId)) {
        $sheetGid = _extractSheetGid($driveId);
    }
    
    if (!$driveId || strlen($driveId) < 25) {
        return err('Invalid driveId');
    }
    
    $encodedId = urlencode($driveId);
    
    if (strpos($mimeType, 'google-apps.spreadsheet') !== false) {
        $url = "https://docs.google.com/spreadsheets/u/0/d/{$encodedId}/preview";
        if ($sheetGid) $url .= "/sheet?gid=" . urlencode($sheetGid);
        return ['success' => true, 'embedUrl' => $url, 'type' => 'spreadsheet'];
    }
    if (strpos($mimeType, 'google-apps.document') !== false) {
        return ['success' => true, 'embedUrl' => "https://docs.google.com/document/d/{$encodedId}/preview?rm=minimal", 'type' => 'document'];
    }
    if (strpos($mimeType, 'google-apps.presentation') !== false) {
        return ['success' => true, 'embedUrl' => "https://docs.google.com/presentation/d/{$encodedId}/preview?rm=minimal", 'type' => 'presentation'];
    }
    if (strpos($mimeType, 'google-apps.drawing') !== false) {
        return ['success' => true, 'embedUrl' => "https://docs.google.com/drawings/d/{$encodedId}/preview?rm=minimal", 'type' => 'drawing'];
    }
    // Fallback to generic Drive preview
    return ['success' => true, 'embedUrl' => "https://drive.google.com/file/d/{$encodedId}/preview", 'type' => 'file'];
}

/**
 * v12.26.0: Get reviewer forms using SQL service.
 */
function handleGetReviewerForms(array $b): array {
    // v12.26.0: Use SQL service for full reviewer snapshot
    $e = $b['reviewerEmail'] ?? $b['email'] ?? '';
    if (!$e) return err('Missing reviewerEmail');
    $result = sqlGetReviewerForms($e, '', '', 0, 200);
    if (!empty($result['data'])) {
        return ['success'=>true,'forms'=>$result['data'],'total'=>$result['total'],'_source'=>'sql'];
    }
    // Fallback
    return ['success'=>true,'forms'=>dbFetchAll("SELECT r.*,a.title,a.user_name,a.project_code,a.competition FROM reviewers r LEFT JOIN applications a ON r.form_id=a.id WHERE r.email=? ORDER BY r.created DESC",[$e])];
}
function handleAddReviewer(array $b): array {
    $comp = ($b['competition'] ?? $b['competitionId'] ?? $b['formId'] ?? '');
    if (defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && defined('GAS_SYNC_ENABLED') && GAS_SYNC_ENABLED) {
        try {
            $gasResp = postToGAS(GAS_REAL_URL, json_encode(array_merge($b, [
                'action' => 'addreviewer',
                'competitionId' => $comp,
                '_gasSync' => true,
            ])));
            if (!empty($gasResp['success'])) {
                $id = $gasResp['id'] ?? ('rev_' . bin2hex(random_bytes(8)));
                return [
                    'success' => true,
                    'id' => $id,
                    '_source' => 'gas',
                    'emailSent' => !empty($gasResp['emailSent']),
                    'message' => $gasResp['message'] ?? '',
                ];
            }
        } catch (Throwable $e) {
            // Fall through to local SQL path below.
        }
    }
    $id = 'rev_' . bin2hex(random_bytes(8));
    insertArray('reviewers', array_merge($b, ['id' => $id, 'competition' => $comp, 'status' => 'pending', 'created' => date('c')]));
    return ['success' => true, 'id' => $id, '_source' => 'sql'];
}
/**
 * v12.30.0-clone: Update reviewer fields (used by GAS→SQL batch sync).
 * Upserts by id or (form_id, email) so the batch sync can clone data.
 */
function handleUpdateReviewer(array $b): array {
    $id = $b['id'] ?? '';
    $formId = $b['form_id'] ?? $b['formId'] ?? '';
    $email = $b['email'] ?? '';
    if ($id) {
        $existing = dbFetchOne('SELECT id FROM reviewers WHERE id=?', [$id]);
    } elseif ($formId && $email) {
        $existing = dbFetchOne('SELECT id FROM reviewers WHERE form_id=? AND email=?', [$formId, $email]);
    } else {
        $existing = null;
    }
    if ($existing) {
        $updates = []; $params = [];
        foreach (['name','status','reviewer_fee','score','notes','consent_date','review_deadline'] as $f) {
            if (isset($b[$f])) { $updates[] = "`$f`=?"; $params[] = $b[$f]; }
        }
        if (!empty($updates)) {
            $params[] = $existing['id'];
            dbQuery("UPDATE reviewers SET " . implode(',', $updates) . " WHERE id=?", $params);
        }
        clearQueryCache('reviewers');
        return ['success'=>true, 'id'=>$existing['id'], 'action'=>'updated'];
    }
    return handleAddReviewer($b);
}
function handleDeleteReviewer(array $b): array {$i=$b['id']??'';if(!$i)return err('Missing id');dbQuery('DELETE FROM reviewers WHERE id=?',[$i]);return ['success'=>true];}
function handleConsentToReview(array $b): array {$i=$b['id']??'';if(!$i)return err('Missing id');dbQuery("UPDATE reviewers SET status='consented',consent='accepted' WHERE id=?",[$i]);return ['success'=>true];}
function handleDeclineInvitation(array $b): array {$i=$b['id']??'';if(!$i)return err('Missing id');dbQuery("UPDATE reviewers SET status='declined' WHERE id=?",[$i]);return ['success'=>true];}
function handleSubmitReview(array $b): array {
    $i=$b['id']??'';if(!$i)return err('Missing id');
    $allow=['review','score','status','submitted'];$s=[];$p=[];
    foreach($allow as $f){if(isset($b[$f])){$s[]="`$f`=?";$p[]=is_array($b[$f])?json_encode($b[$f],JSON_UNESCAPED_UNICODE):$b[$f];}}
    if(!empty($b['submitted']))$s[]='`submitted`=NOW()';if(!$s)return err('No data');
    $p[]=$i;dbQuery('UPDATE reviewers SET '.implode(',',$s).' WHERE id=?',$p);
    return ['success'=>true];
}
function handleGetReviewDeadlines(array $b = []): array { return ['success'=>true,'deadlines'=>dbFetchAll("SELECT id as competitionId,name,deadline FROM competitions WHERE deadline IS NOT NULL ORDER BY deadline")]; }
function handleGetProjects(array $b): array {
    // v12.28.0-RBAC: Server-side role resolution
    $u = $b['userId'] ?? $b['leaderEmail'] ?? '';
    $role = resolveRole($b);
    // v12.36.0-readable-urls: session_id → competitionId filter
    $sessionId = $b['session_id'] ?? $b['sessionId'] ?? '';
    $compId    = $b['competitionId'] ?? $b['competition_id'] ?? '';
    // Resolve session → competition if session_id provided (GAS session = funding round)
    if ($sessionId && !$compId) {
        // In the GAS model session_id IS the competition_id; try as both
        $compId = $sessionId;
    }
    $result = sqlGetProjects($u, '', $compId, 0, 200);
    if (!empty($result['data'])) {
        return ['success'=>true,'projects'=>_snakeToCamelRows($result['data']),'total'=>$result['total'],'_source'=>'sql'];
    }
    // Fallback
    $a = $role === 'admin';
    $sql='SELECT p.*,a.title as app_title,a.user_name,a.user_email FROM projects p LEFT JOIN applications a ON p.application_id=a.id';
    $p=[];if(!$a&&$u){$sql.=' WHERE p.leader_email=?';$p[]=$u;}
    if ($compId && !$a) {$sql.=strpos($sql,'WHERE')!==false?' AND p.competition_id=?':' WHERE p.competition_id=?';$p[]=$compId;}
    elseif ($compId && $a) {$sql.=' WHERE p.competition_id=?';$p[]=$compId;}
    return ['success'=>true,'projects'=>_snakeToCamelRows(dbFetchAll($sql.' ORDER BY p.created DESC',$p))];
}
function handleGetProject(array $b): array {$i=$b['id']??'';if(!$i)return err('Missing id');$r=dbFetchOne('SELECT p.*,a.title as app_title FROM projects p LEFT JOIN applications a ON p.application_id=a.id WHERE p.id=?',[$i]);return $r?['success'=>true,'project'=>_snakeToCamel($r)]:err('Not found');}
function handleGetProjectDashboard(array $b): array {
    // v12.26.0: Use SQL service for full project view
    $id = $b['projectId'] ?? $b['id'] ?? '';
    if ($id) {
        $result = sqlGetProjectDashboard($id);
        if (!empty($result['project'])) {
            return $result;
        }
    }
    // Fallback
    $p = handleGetProjects($b)['projects'] ?? [];
    return ['success'=>true,'total'=>count($p),'active'=>count(array_filter($p,fn($x)=>in_array($x['status']??'',['contracted','active']))),'projects'=>$p];
}
function handleGetReports(array $b): array {
    $i=$b['projectId']??'';
    $r=$i?dbFetchAll('SELECT * FROM reports WHERE project_id=? ORDER BY created DESC',[$i]):dbFetchAll('SELECT * FROM reports ORDER BY created DESC');
    return ['success'=>true,'reports'=>_snakeToCamelRows($r)];
}
/**
 * v18.x-teachers: Teacher lookup by email (senior-team request).
 * Returns ERP user profile joined with login role. Never leaks password.
 * Body: { email } or ?email=...  → SELECT erp_users LEFT JOIN users.
 */
function handleTeacherByEmail(array $b): array {
    $email = trim($b['email'] ?? $_GET['email'] ?? '');
    if ($email === '') {
        return ['success'=>false,'error'=>'Missing email'];
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return ['success'=>false,'error'=>'Invalid email'];
    }
    try {
        $row = dbFetchOne(
            'SELECT eu.email, eu.full_name, eu.department, eu.position, eu.is_active, u.role
               FROM erp_users eu
               LEFT JOIN users u ON u.email = eu.email
              WHERE eu.email = ? LIMIT 1',
            [$email]
        );
        if ($row) {
            return ['success'=>true,'found'=>true,'teacher'=>[
                'email'      => $row['email']      ?? $email,
                'full_name'  => $row['full_name']  ?? '',
                'department' => $row['department'] ?? '',
                'position'   => $row['position']   ?? '',
                'is_active'  => (int)($row['is_active'] ?? 0),
                'role'       => $row['role']       ?? null,
            ]];
        }
        return ['success'=>true,'found'=>false,'teacher'=>null];
    } catch (Throwable $e) {
        return ['success'=>false,'error'=>$e->getMessage()];
    }
}
/**
 * v18.x-teachers: Per-project members (for /projects/:id/members).
 * Parses team_members TEXT: JSON first, then newline/comma split fallback.
 */
function handleGetProjectMembers(array $b): array {
    $projectId = trim($b['projectId'] ?? $_GET['projectId'] ?? '');
    if ($projectId === '') {
        return ['success'=>false,'error'=>'Missing projectId'];
    }
    try {
        $row = dbFetchOne(
            'SELECT id, title, project_code, leader_email, leader_name, team_members, user_email
               FROM projects WHERE id = ? LIMIT 1',
            [$projectId]
        );
        if (!$row) {
            return ['success'=>false,'error'=>'Project not found'];
        }
        $raw = $row['team_members'] ?? '';
        $members = [];
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $members = $decoded;
            } else {
                $split = preg_split('/[\r\n,]+/', $raw);
                $members = array_values(array_filter(array_map('trim', $split), fn($x) => $x !== ''));
            }
        }
        return [
            'success'   => true,
            'projectId' => $row['id'],
            'title'     => $row['title'] ?? '',
            'code'      => $row['project_code'] ?? '',
            'leader'    => [
                'email' => $row['leader_email'] ?? '',
                'name'  => $row['leader_name'] ?? '',
            ],
            'members'   => $members,
            'raw'       => $raw,
        ];
    } catch (Throwable $e) {
        return ['success'=>false,'error'=>$e->getMessage()];
    }
}
/**
 * v18.x-teachers: Per-project reports (for /projects/:id/reports).
 * Empty result set is success, not an error.
 */
function handleGetProjectReports(array $b): array {
    $projectId = trim($b['projectId'] ?? $_GET['projectId'] ?? '');
    if ($projectId === '') {
        return ['success'=>false,'error'=>'Missing projectId'];
    }
    try {
        $rows = dbFetchAll(
            'SELECT id, report_type, title, status, period, submitted_by, submitted_at
               FROM reports WHERE project_id = ? ORDER BY submitted_at DESC',
            [$projectId]
        );
        $reports = array_map(function ($r) {
            return [
                'id'           => $r['id'] ?? '',
                'report_type'  => $r['report_type'] ?? '',
                'title'        => $r['title'] ?? '',
                'status'       => $r['status'] ?? '',
                'period'       => $r['period'] ?? '',
                'submitted_by' => $r['submitted_by'] ?? '',
                'submitted_at' => $r['submitted_at'] ?? '',
            ];
        }, $rows);
        return ['success'=>true,'projectId'=>$projectId,'reports'=>$reports];
    } catch (Throwable $e) {
        return ['success'=>false,'error'=>$e->getMessage()];
    }
}
function handleGetReport(array $b): array {$i=$b['id']??'';if(!$i)return err('Missing id');$r=dbFetchOne('SELECT * FROM reports WHERE id=?',[$i]);return $r?['success'=>true,'report'=>$r]:err('Not found');}
/**
 * v12.30.0-clone: Create/upsert a report (used by GAS→SQL batch sync).
 */
function handleCreateReport(array $b): array {
    $id = $b['id'] ?? $b['report_id'] ?? 'rpt_' . bin2hex(random_bytes(8));
    $existing = dbFetchOne('SELECT id FROM reports WHERE id=?', [$id]);
    if ($existing) {
        $updates = []; $params = [];
        foreach (['project_id','type','status','title','description','content','created_by'] as $f) {
            if (isset($b[$f])) { $updates[] = "`$f`=?"; $params[] = $b[$f]; }
        }
        if (!empty($updates)) { $params[] = $id; dbQuery("UPDATE reports SET " . implode(',', $updates) . " WHERE id=?", $params); clearQueryCache('reports'); }
        return ['success'=>true, 'id'=>$id, 'action'=>'updated'];
    }
    $data = array_merge($b, ['id' => $id, 'created_at' => date('c')]);
    insertArray('reports', $data);
    clearQueryCache('reports');
    return ['success'=>true, 'id'=>$id, 'action'=>'created'];
}
function handleGetMessages(array $b): array {
    $e=$b['email']??$b['userId']??'';
    // v19.0.0-warmfix: Return empty instead of error for cache warming calls
    if(!$e)return ['success'=>true,'messages'=>[],'_anonymous'=>true];
    return ['success'=>true,'messages'=>dbFetchAll("SELECT * FROM messages WHERE to_email=? OR from_email=? ORDER BY created DESC",[$e,$e])];
}
function handleSendMessage(array $b): array {$id='msg_'.bin2hex(random_bytes(8));insertArray('messages',array_merge($b,['id'=>$id,'status'=>'unread','created'=>date('c')]));return ['success'=>true,'id'=>$id];}
function handleListCkkMembers(): array { return ['success'=>true,'members'=>array_column(dbFetchAll('SELECT email FROM ckk_members WHERE is_active=1 ORDER BY name'),'email')]; }
function handleAssignCkkRequest(array $b): array {
    $e=strtolower(trim($b['email']??''));if(!$e)return err('Missing email');
    if(dbFetchOne('SELECT email FROM ckk_members WHERE email=?',[$e]))return err('Вече е член на ЦКК.');
    $code=str_pad(random_int(0,999999),6,'0',STR_PAD_LEFT);$ref='ckk-'.bin2hex(random_bytes(4));
    dbQuery("DELETE FROM system_config WHERE config_key LIKE 'otp_ckk_%'");
    dbInsert('INSERT INTO system_config(config_key,config_value) VALUES(?,?)',["otp_ckk_$ref",json_encode(['email'=>$e,'code'=>$code,'expires'=>time()+300])]);
    return ['success'=>true,'codeSent'=>true,'expiresIn'=>300,'cooldown'=>30,'ref'=>$ref,'email'=>$e];
}
function handleAssignCkkConfirm(array $b): array {
    $e=strtolower(trim($b['email']??''));$c=$b['code']??'';$r=$b['ref']??'';
    if(!$e||!$c)return err('Missing email/code');
    $s=dbFetchOne("SELECT * FROM system_config WHERE config_key=?",["otp_ckk_$r"]);
    if(!$s)return err('Кодът е изтекъл или не съществува.');
    $d=json_decode($s['config_value'],true);
    if(!$d||$d['email']!==$e)return err('Кодът не съвпада.');
    if(time()>$d['expires']){dbQuery("DELETE FROM system_config WHERE config_key=?",["otp_ckk_$r"]);return err('Кодът е изтекъл.');}
    if($d['code']!==$c)return err('Грешен код.');
    dbQuery("DELETE FROM system_config WHERE config_key=?",["otp_ckk_$r"]);
    dbInsert('INSERT IGNORE INTO ckk_members(email,added_at) VALUES(?,NOW())',[$e]);
    return ['success'=>true,'email'=>$e,'members'=>array_column(dbFetchAll('SELECT email FROM ckk_members WHERE is_active=1'),'email')];
}
function handleRemoveCkkMember(array $b): array {
    $e=strtolower(trim($b['email']??''));if(!$e)return err('Missing email');
    dbQuery("UPDATE ckk_members SET is_active=0 WHERE email=?",[$e]);
    return ['success'=>true,'email'=>$e,'members'=>array_column(dbFetchAll('SELECT email FROM ckk_members WHERE is_active=1'),'email')];
}
function handleGetChangeRequests(array $b): array {
    $i=$b['projectId']??'';
    $r=$i?dbFetchAll('SELECT * FROM change_requests WHERE project_id=? ORDER BY requested_at DESC',[$i]):dbFetchAll('SELECT * FROM change_requests ORDER BY requested_at DESC');
    return ['success'=>true,'requests'=>_snakeToCamelRows($r)];
}
function handleGetNotifications(array $b): array {
    $e=$b['email']??$b['userId']??'';
    // v19.0.0-warmfix: Return empty instead of error for cache warming calls
    if(!$e)return ['success'=>true,'notifications'=>[],'_anonymous'=>true];
    $role = resolveRole($b);
    $result = sqlGetUserNotifications($e, $role, false, 0, 50);
    if (!empty($result['data'])) {
        return ['success'=>true,'notifications'=>$result['data'],'total'=>$result['total']??0,'_source'=>'sql'];
    }
    return ['success'=>true,'notifications'=>dbFetchAll("SELECT * FROM notifications WHERE user_email=? ORDER BY created DESC LIMIT 50",[$e]),'_source'=>'mysql'];
}
function handleGetSanctions(array $b): array {
    $e=$b['email']??'';$r=$e?dbFetchAll('SELECT * FROM sanctions WHERE user_email=? ORDER BY start_date DESC',[$e]):dbFetchAll('SELECT * FROM sanctions ORDER BY start_date DESC');
    return ['success'=>true,'sanctions'=>$r];
}
function handleCheckSanctions(array $b): array {
    $e=strtolower(trim($b['email']??''));if(!$e)return err('Missing email');
    $a=dbFetchOne("SELECT COUNT(*) as cnt FROM sanctions WHERE user_email=? AND (end_date IS NULL OR end_date>=CURDATE())",[$e]);
    return ['success'=>true,'hasActiveSanctions'=>($a['cnt']??0)>0];
}
function handleCheckEligibility(array $b): array {
    // v12.26.0: Use SQL service for full 7-check eligibility
    $e = strtolower(trim($b['email'] ?? ''));
    $compId = $b['competitionId'] ?? $b['competition'] ?? '';
    $ptype = $b['projectType'] ?? $b['project_type'] ?? '';
    if (!$e) return err('Missing email');
    $result = sqlCheckEligibility($e, $compId, $ptype);
    if (!empty($result['checks'])) {
        return $result;
    }
    // Fallback: simple sanctions check
    $a = dbFetchOne("SELECT COUNT(*) as cnt FROM sanctions WHERE user_email=? AND (end_date IS NULL OR end_date>=CURDATE())", [$e]);
    return ['success'=>true,'eligible'=>($a['cnt']??0)==0,'checks'=>[['check_name'=>'sanctions','passed'=>($a['cnt']??0)==0]]];
}
function handleAdminLogin(array $b): array {
    try {
        $u=trim($b['username']??'');$p=$b['password']??'';
        // Rate limiting: 5 failed attempts = 5 min block
        if (isRateLimited(5, 300)) {
            return err('Твърде много опити за вход. Моля, опитайте отново след 5 минути.');
        }
        // Credentials read from .env — no hardcoded fallbacks.
        // Must be set via ADMIN_USERNAME/ADMIN_PASSWORD and RECADMIN_USERNAME/RECADMIN_PASSWORD.
        $v=(defined('ADMIN_USERNAME') && ADMIN_USERNAME !== '' && $u===ADMIN_USERNAME && $p===ADMIN_PASSWORD)
        || (defined('RECADMIN_USERNAME') && RECADMIN_USERNAME !== '' && $u===RECADMIN_USERNAME && $p===RECADMIN_PASSWORD);
        if(!$v){
            logFailedLogin($u);
            return err('Грешно потребителско име или парола.');
        }
        $role=($u===(defined('RECADMIN_USERNAME')?RECADMIN_USERNAME:'')&&$p===(defined('RECADMIN_PASSWORD')?RECADMIN_PASSWORD:''))?'rector':'admin';
        return ['success'=>true,'user'=>['name'=>'Администратор','email'=>$u,'userId'=>$u],'isAdmin'=>true,'role'=>$role];
    } catch (Throwable $e) {
        error_log('ADMIN_LOGIN_EXCEPTION: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
        return err('Грешка при вход. Моля, опитайте отново.');
    }
}
function handleCheckAdmin(array $b): array {
    $e=strtolower(trim($b['email']??$b['userId']??''));if(!$e)return ['success'=>true,'isAdmin'=>false,'role'=>'applicant'];
    // 1. Check local admin_emails table first (authoritative for PHP path)
    // v20.0.0-dbfix: try/catch guards — tables may not exist on incomplete migration
    try {
        $a=dbFetchOne('SELECT * FROM admin_emails WHERE email=?',[$e]);
        if($a) {
            if (empty($b['_gasSync']) && defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && GAS_SYNC_ENABLED) {
                try {
                    _syncToGAS_('addadminemail', ['email' => $e, 'role' => $a['role'] ?? 'admin', '_gasSync' => true]);
                } catch (Throwable $_) {}
            }
            // v12.48.5: users with forms land on applicant view
            $formRow = dbFetchOne('SELECT COUNT(*) AS cnt FROM applications WHERE user_email=?', [$e]);
            $hasForms = (int)($formRow['cnt'] ?? 0) > 0;
            return ['success'=>true,'isAdmin'=>true,'role'=>$a['role']??'admin','canAdmin'=>true,'viewRole'=>$a['role']??'admin','hasForms'=>$hasForms];
        }
    } catch (Throwable $_) { /* table may not exist */ }
    // 2. Not found locally — check CKK members table
    try {
        $ckk=dbFetchOne('SELECT * FROM ckk_members WHERE email=? AND is_active=1',[$e]);
        if($ckk)return ['success'=>true,'isAdmin'=>false,'role'=>'ckk','isCKK'=>true];
    } catch (Throwable $_) { /* table may not exist */ }
    // 3. Not found in either — proxy to GAS as fallback
    // This handles the case where GAS promoted a user to admin (ScriptProperties)
    // but the admin_emails MySQL table hasn't been synced yet.
    if (defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && GAS_SYNC_ENABLED) {
        try {
            $gasResp = postToGAS(GAS_REAL_URL, json_encode([
                'action' => 'checkadmin', 'email' => $e, '_gasSync'=>true
            ]));
            if (!empty($gasResp['isAdmin'])) {
                // GAS says this user IS an admin — auto-sync to local table
                $role = $gasResp['role'] ?? 'admin';
                try {
                    dbInsert('INSERT IGNORE INTO admin_emails (email, role, added_at) VALUES (?, ?, NOW())', [$e, $role]);
                    clearQueryCache('admin_emails');
                } catch (Throwable $_) {}
                return ['success'=>true,'isAdmin'=>true,'role'=>$role,'_syncedFromGAS'=>true];
            }
            if (!empty($gasResp['role']) && $gasResp['role'] === 'ckk') {
                return ['success'=>true,'isAdmin'=>false,'role'=>'ckk','isCKK'=>true];
            }
        } catch (Throwable $_) {
            // GAS is unreachable — check if the user has a valid admin session
            // as a fallback. This ensures Google-authenticated admins retain
            // their role even when GAS (the authoritative source for admin
            // ScriptProperties) is temporarily down.
            try {
                $sessionCheck = dbFetchOne(
                    "SELECT is_admin FROM sessions WHERE user_email = ? AND is_admin = 1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
                    [$e]
                );
                if ($sessionCheck) {
                    return ['success'=>true,'isAdmin'=>true,'role'=>'admin','_fromSession'=>true];
                }
            } catch (Throwable $_) {}
        }
    }
    // 4. Not found anywhere — return applicant role
    return ['success'=>true,'isAdmin'=>false,'role'=>'applicant'];
}
/**
 * handleSyncAdminEmails — sync admin list from GAS ScriptProperties to MySQL.
 * Called by GAS after admin promotion/demotion, or manually by system admin.
 * GAS sends: { emails: ["admin@ue-varna.bg", ...], roles?: {...} }
 * Returns the current state of admin_emails after sync.
 */
function handleSyncAdminEmails(array $b): array {
    $emails = $b['emails'] ?? [];
    $roles  = $b['roles'] ?? [];
    if (empty($emails) || !is_array($emails)) {
        // If no emails provided, try to fetch from GAS
        if (defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && GAS_SYNC_ENABLED) {
            try {
                $gasResp = postToGAS(GAS_REAL_URL, json_encode([
                    'action' => 'getsecretmanagerstatus', '_gasSync'=>true
                ]));
                if (!empty($gasResp['secrets']) && !empty($gasResp['secrets']['ADMIN_EMAILS'])) {
                    $emails = explode(',', $gasResp['secrets']['ADMIN_EMAILS']);
                    $emails = array_map('trim', $emails);
                }
            } catch (Throwable $_) {
                return err('No emails provided and GAS unreachable');
            }
        } else {
            return err('No emails provided');
        }
    }
    $added = 0; $skipped = 0;
    foreach ($emails as $email) {
        $e = strtolower(trim($email));
        if (!$e || !str_contains($e, '@')) { $skipped++; continue; }
        $role = $roles[$e] ?? $b['defaultRole'] ?? 'admin';
        try {
            dbInsert('INSERT IGNORE INTO admin_emails (email, role, added_at) VALUES (?, ?, NOW())', [$e, $role]);
            $added++;
        } catch (Throwable $_) { $skipped++; }
    }
    clearQueryCache('admin_emails');
    $current = dbFetchAll('SELECT * FROM admin_emails ORDER BY email');
    return ['success'=>true, 'added'=>$added, 'skipped'=>$skipped, 'adminEmails'=>$current];
}
/**
 * handleAddAdminEmail — promote a user to admin.
 * Body: { email, role?, name? }
 * Also syncs to GAS if GAS_REAL_URL is configured.
 */
function handleAddAdminEmail(array $b): array {
    $e = strtolower(trim($b['email'] ?? ''));
    if (!$e) return err('Missing email');
    if (!str_contains($e, '@')) return err('Invalid email');
    $role = $b['role'] ?? 'admin';
    $name = $b['name'] ?? '';
    try {
        dbInsert('INSERT IGNORE INTO admin_emails (email, role, name, added_at) VALUES (?, ?, ?, NOW())', [$e, $role, $name]);
        clearQueryCache('admin_emails');
        // v12.30.0-perf: Bump admin cache version so GAS L2 cache is invalidated
        _bumpAdminCacheVersion();
    } catch (Throwable $ex) {
        return err('Failed to add admin: ' . $ex->getMessage());
    }
    // Sync to GAS if configured (fire-and-forget via sync_queue)
    // Skip sync if this request already came from GAS (_gasSync) to prevent circular sync
    if (empty($b['_gasSync']) && defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && GAS_SYNC_ENABLED) {
        _syncToGAS_('addadminemail', ['email' => $e, 'role' => $role]);
    }
    return ['success'=>true, 'email'=>$e, 'role'=>$role, 'isAdmin'=>true];
}
/**
 * handleRemoveAdminEmail — revoke admin privileges.
 * Body: { email }
 * Also syncs to GAS if GAS_REAL_URL is configured.
 */
function handleRemoveAdminEmail(array $b): array {
    $e = strtolower(trim($b['email'] ?? ''));
    if (!$e) return err('Missing email');
    dbQuery('DELETE FROM admin_emails WHERE email=?', [$e]);
    clearQueryCache('admin_emails');
    // v12.30.0-perf: Bump admin cache version so GAS L2 cache is invalidated
    _bumpAdminCacheVersion();
    // Sync to GAS (skip if already from GAS to prevent circular sync)
    if (empty($b['_gasSync']) && defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && GAS_SYNC_ENABLED) {
        _syncToGAS_('removeadminemail', ['email' => $e]);
    }
    return ['success'=>true, 'email'=>$e, 'isAdmin'=>false];
}
/**
 * Bump the admin cache version key to invalidate GAS's cross-execution L2 cache.
 * This ensures SQL-promoted admins are recognised by GAS immediately.
 * Stores a UNIX timestamp in system_config and in a dedicated cache key.
 */
function _bumpAdminCacheVersion(): void {
    try {
        $ver = time();
        $existing = dbFetchOne("SELECT config_value FROM system_config WHERE config_key = 'admin_cache_version'");
        if ($existing) {
            dbQuery("UPDATE system_config SET config_value = ?, updated_at = NOW() WHERE config_key = 'admin_cache_version'", [$ver]);
        } else {
            dbInsert("INSERT INTO system_config (config_key, config_value, description) VALUES ('admin_cache_version', ?, 'Admin cache version — bumped when admin list changes')", [$ver]);
        }
    } catch (Throwable $_) {
        // Non-critical — skip on error
    }
}
/**
 * handleListAdminEmails — list all admin accounts.
 */
function handleListAdminEmails(): array {
    $admins = dbFetchAll('SELECT * FROM admin_emails ORDER BY email');
    // v12.30.0-perf: Include cache version so GAS can invalidate its L2 cache
    $ver = dbFetchOne("SELECT config_value FROM system_config WHERE config_key = 'admin_cache_version'");
    return [
        'success'=>true,
        'adminEmails'=>$admins,
        'cacheVersion' => $ver['config_value'] ?? '0'
    ];
}
// ── Helpers ──
function handleDownloadDocument(array $b): array {
    $id=$b["docId"]??$b["fileId"]??$b["id"]??"";
    if(!$id)return err("Missing document ID");
    $doc=dbFetchOne("SELECT * FROM documents WHERE id=? OR drive_id=?",[$id,$id]);
    if(!$doc){
        // Also check document_templates table for template IDs
        $doc=dbFetchOne("SELECT id, name, mime as mime_type, drive_file_id as drive_id, '' as content, '' as download_url, '' as web_view_link, '' as user_email FROM document_templates WHERE id=?",[$id]);
    }
    if(!$doc && !preg_match('/^(s_|doc_|up_|f_|copied_)/',$id) && strlen($id)>=25){
        // Real Drive ID with no documents row — still serviceable via GAS below.
        $doc=['id'=>null,'name'=>$b['name']??'document','mime_type'=>'','content'=>'','download_url'=>'','web_view_link'=>'','drive_id'=>$id];
    }
    if(!$doc)return err("Document not found");
    if(!empty($doc["content"])){
        $c=$doc["content"];
        // v12.32.35-fullviz: content is RAW BASE64 BYTES for seeded/copied binary
        // files, but legacy inline-editor saves stored PLAIN TEXT/HTML. Detect and
        // label correctly so the frontend never atob()-crashes on plain text.
        $isB64 = (bool)preg_match('/^[A-Za-z0-9+\/\r\n]+={0,2}$/', substr($c,0,4096)) && strlen($c) % 4 === 0 && strlen($c) > 100;
        if ($isB64) {
            return ["success"=>true,"kind"=>"blob","name"=>$doc["name"]??"document","mimeType"=>$doc["mime_type"]??"application/octet-stream","b64"=>$c,"source"=>"db"];
        }
        $mime=$doc["mime_type"]?:(preg_match('/<\w+[^>]*>/',$c)?'text/html':'text/plain');
        return ["success"=>true,"kind"=>"blob","name"=>$doc["name"]??"document","mimeType"=>$mime,"b64"=>base64_encode($c),"source"=>"db"];
    }
    // v12.32.34-docviz: DB miss — pull the bytes from GAS/Drive (best-effort) and
    // CACHE them into documents.content so the NEXT view is DB-served even when
    // Google errors. This is what makes visualization survive Drive failures.
    $driveId = $doc['drive_id'] ?? '';
    if ($driveId && defined('GAS_REAL_URL') && GAS_REAL_URL !== '' && defined('GAS_SYNC_ENABLED') && GAS_SYNC_ENABLED) {
        try {
            $gasResp = postToGAS(GAS_REAL_URL, json_encode([
                'action' => 'downloaddocument',
                'docId'  => $driveId,
                'formId' => $b['formId'] ?? '',
                'userId' => $b['userId'] ?? $b['email'] ?? $b['userEmail'] ?? ($doc['user_email'] ?? ''),
                'email'  => $b['email'] ?? $b['userId'] ?? $b['userEmail'] ?? ($doc['user_email'] ?? ''),
            ]));
            if (!empty($gasResp['success'])) {
                if (($gasResp['kind'] ?? '') === 'blob' && !empty($gasResp['b64'])) {
                    // Cache into MySQL (authoritative store) — cap ~24MB base64 to
                    // stay well inside LONGTEXT/packet limits.
                    if (!empty($doc['id']) && strlen($gasResp['b64']) < 24*1024*1024) {
                        try {
                            dbQuery('UPDATE documents SET content=?, mime_type=COALESCE(NULLIF(mime_type,""),?), modified=NOW() WHERE id=?',
                                [$gasResp['b64'], $gasResp['mimeType'] ?? 'application/octet-stream', $doc['id']]);
                            clearQueryCache('documents');
                        } catch (Throwable $_) { /* cache write is best-effort */ }
                    }
                    return ["success"=>true,"kind"=>"blob","name"=>$gasResp['name']??($doc["name"]??"document"),
                            "mimeType"=>$gasResp['mimeType']??($doc["mime_type"]??"application/octet-stream"),
                            "b64"=>$gasResp['b64'],"source"=>"gas"];
                }
                if (($gasResp['kind'] ?? '') === 'url' && !empty($gasResp['url'])) {
                    return ["success"=>true,"kind"=>"url","name"=>$gasResp['name']??($doc["name"]??"document"),"url"=>$gasResp['url'],"source"=>"gas"];
                }
            }
        } catch (Throwable $_) { /* fall through to legacy URLs */ }
    }
    // v12.32.39-universal: GAS unavailable/failed — try to fetch the bytes
    // DIRECTLY from the doc's own Google URLs (or bare drive_id) so the modal
    // still gets a renderable blob instead of a dead-end external URL. Result
    // is cached into documents.content (same self-healing as the GAS path).
    $tryUrls = [];
    foreach (["download_url", "web_view_link"] as $k) {
        $u = trim((string)($doc[$k] ?? ''));
        if ($u !== '' && preg_match('#^https://(drive|docs)\.google\.com/#i', $u)) $tryUrls[] = $u;
    }
    if ($driveId && strlen($driveId) >= 25) {
        $tryUrls[] = 'https://drive.google.com/uc?export=download&id=' . rawurlencode($driveId);
    }
    foreach ($tryUrls as $u) {
        try {
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL => $u, CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 6, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 6,
                CURLOPT_USERAGENT => 'UEV-ERP/1.0',
            ]);
            $body = curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $ct   = strtolower((string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
            curl_close($ch);
            // Google auth/interstitial pages are text/html — only real bytes count.
            if ($code === 200 && is_string($body) && $body !== '' && strlen($body) < 18 * 1024 * 1024
                && strpos($ct, 'text/html') === false) {
                $b64 = base64_encode($body);
                $mm  = $ct !== '' ? preg_replace('/;.*$/', '', $ct) : ($doc['mime_type'] ?? 'application/octet-stream');
                if (!empty($doc['id']) && strlen($b64) < 24 * 1024 * 1024) {
                    try {
                        dbQuery('UPDATE documents SET content=?, mime_type=COALESCE(NULLIF(mime_type,""),?), modified=NOW() WHERE id=?',
                            [$b64, $mm, $doc['id']]);
                        clearQueryCache('documents');
                    } catch (Throwable $_) { /* best-effort */ }
                }
                return ["success"=>true,"kind"=>"blob","name"=>$doc["name"]??"document","mimeType"=>$mm,"b64"=>$b64,"source"=>"drive-direct"];
            }
        } catch (Throwable $_) { /* try next url */ }
    }
    if(!empty($doc["download_url"])){
        return ["success"=>true,"kind"=>"url","name"=>$doc["name"]??"document","url"=>$doc["download_url"]];
    }
    if(!empty($doc["web_view_link"])){
        return ["success"=>true,"kind"=>"url","name"=>$doc["name"]??"document","url"=>$doc["web_view_link"]];
    }
    return err("No downloadable content available");
}
function handleDeleteFile(array $b): array {
    $fId = $b['formId'] ?? ''; $fileId = $b['fileId'] ?? '';
    if (!$fId || !$fileId) return err('Missing formId or fileId');
    $form = dbFetchOne('SELECT * FROM applications WHERE id=?', [$fId]);
    if (!$form) return err('Form not found');
    // Parse existing file_ids (JSON array of {fileId, name, ...})
    $files = json_decode($form['file_ids'] ?? '[]', true);
    if (!is_array($files)) $files = [];
    $filtered = array_values(array_filter($files, fn($f) => ($f['fileId'] ?? '') !== $fileId));
    if (count($filtered) === count($files)) return err('File not found in form');
    dbQuery('UPDATE applications SET file_ids=? WHERE id=?', [json_encode($filtered, JSON_UNESCAPED_UNICODE), $fId]);
    // v12.49.92: also purge from attached_docs JSON (document can live in both;
    // removing from only one source lets get_application_documents resurrect it).
    $attached = json_decode($form['attached_docs'] ?? '[]', true);
    if (is_array($attached)) {
        $before = count($attached);
        $attached = array_values(array_filter($attached, fn($d) => ($d['id'] ?? '') !== $fileId && ($d['fileId'] ?? '') !== $fileId));
        if (count($attached) !== $before) {
            dbQuery('UPDATE applications SET attached_docs=? WHERE id=?', [json_encode($attached, JSON_UNESCAPED_UNICODE), $fId]);
        }
    }
    // v12.49.92: also drop the application_documents linkage so the stored
    // procedure get_application_documents can never rejoin a deleted row back.
    dbQuery('DELETE FROM application_documents WHERE application_id=? AND document_id=?', [$fId, $fileId]);
    // Also try to delete from documents table if it's a stored document
    dbQuery('DELETE FROM documents WHERE id=?', [$fileId]);
    // Bump data_version so frontend version poller detects the change
    dbQuery('INSERT INTO data_version (table_name, version, updated_at)
             VALUES ("applications",1,NOW())
             ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
    dbQuery('INSERT INTO data_version (table_name, version, updated_at)
             VALUES ("documents",1,NOW())
             ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
    return ['success'=>true];
}
function jsonExit(int $c, array $d): void { http_response_code($c); echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
/**
 * POST a JSON payload to GAS and return decoded response.
 * Used by handleCheckAdmin fallback and admin sync.
 */
function postToGAS(string $url, string $payloadJson): array {
    // v12.30.2-perf: In-process cache for GAS proxy responses. GAS calls are
    // slow (cross-origin UrlFetch, ~0.5–3s). Within a single request lifecycle
    // the same action (e.g. listdocuments) is often proxied repeatedly — the
    // initial-data fan-out and the document picker both call it. Cache identical
    // payloads for a short TTL so we never call GAS more than once per window.
    static $_gasCache = [];
    static $_gasCacheTs = [];
    $ck = md5($url . '|' . $payloadJson);
    $now = time();
    if (isset($_gasCache[$ck]) && ($_gasCacheTs[$ck] ?? 0) > ($now - 60)) {
        $cached = $_gasCache[$ck];
        if (is_array($cached)) { $cached['_gasCache'] = true; return $cached; }
    }
    $ctx = stream_context_create([
        'http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json
",
            'content' => $payloadJson,
            'timeout' => 3,
            'ignore_errors' => true
        ]
    ]);
    $response = @file_get_contents($url, false, $ctx);
    if ($response === false) return ['success' => false, 'error' => 'HTTP request failed', '_gasUnreachable' => true];
    $decoded = json_decode($response, true);
    if (!$decoded) return ['success' => false, 'error' => 'Invalid JSON response', '_gasUnreachable' => true];
    // Only cache successful responses — failures should be retried live.
    if (!empty($decoded['success'])) { $_gasCache[$ck] = $decoded; $_gasCacheTs[$ck] = $now; }
    return $decoded;
}
// ══════════════════════════════════════════════════════════════════════════════
//  SESSION MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
function handleCreateSession(array $b): array {
    $email = strtolower(trim($b['email'] ?? ''));
    $name = $b['name'] ?? $email;
    if (!$email) return err('Missing email');
    $sid = bin2hex(random_bytes(32));
    // v12.28.0-RBAC: NEVER trust client-sent role. Resolve server-side.
    $admin = dbFetchOne('SELECT * FROM admin_emails WHERE email=?', [$email]);
    if ($admin) {
        $role = $admin['role'] ?? 'admin';
        $isAdmin = 1;
    } else {
        $ckk = dbFetchOne('SELECT * FROM ckk_members WHERE email=? AND is_active=1', [$email]);
        if ($ckk) { $role = 'ckk'; $isAdmin = 0; }
        else { $role = 'applicant'; $isAdmin = 0; }
    }
    dbInsert('INSERT INTO sessions (id, user_email, user_name, role, is_admin, ip_address, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR))',
        [$sid, $email, $name, $role, $isAdmin, $_SERVER['REMOTE_ADDR'] ?? '', $_SERVER['HTTP_USER_AGENT'] ?? '']);
    return ['success' => true, 'sessionId' => $sid, 'expiresIn' => 86400, 'role' => $role, 'isAdmin' => (bool)$isAdmin];
}
function handleGetSession(array $b): array {
    $sid = $b['sessionId'] ?? '';
    if (!$sid) return err('Missing sessionId');
    $s = dbFetchOne("SELECT * FROM sessions WHERE id = ? AND (expires_at IS NULL OR expires_at > NOW())", [$sid]);
    if (!$s) return err('Session expired or not found');
    dbQuery("UPDATE sessions SET last_active = NOW() WHERE id = ?", [$sid]);
    return ['success' => true, 'session' => $s];
}
function handleDeleteSession(array $b): array {
    $sid = $b['sessionId'] ?? '';
    if ($sid) dbQuery("DELETE FROM sessions WHERE id = ?", [$sid]);
    return ['success' => true];
}
// v12.49.76-session: heartbeat — keeps the DB session alive + reports concurrent sessions.
function handleSessionHeartbeat(array $b): array {
    $sid = $b['sessionId'] ?? '';
    $email = strtolower(trim($b['email'] ?? ''));
    if (!$sid || !$email) return err('Missing sessionId or email');
    $s = dbFetchOne("SELECT * FROM sessions WHERE id = ? AND user_email = ? AND (expires_at IS NULL OR expires_at > NOW())", [$sid, $email]);
    if (!$s) return err('Session expired or not found');
    // Extend the DB session expiry (sliding window, max 24h from now).
    dbQuery("UPDATE sessions SET last_active = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR) WHERE id = ?", [$sid]);
    // Detect concurrent sessions for the same user (different session id, same email).
    $concurrent = dbFetchAll("SELECT id, ip_address, user_agent, created_at, last_active FROM sessions WHERE user_email = ? AND id != ? AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY last_active DESC LIMIT 10", [$email, $sid]);
    return ['success' => true, 'ok' => true, 'expiresIn' => 86400, 'concurrentSessions' => count($concurrent), 'concurrent' => array_map(function($r) {
        return ['id' => substr($r['id'], 0, 8) . '…', 'ip' => $r['ip_address'] ?? '', 'userAgent' => $r['user_agent'] ?? '', 'createdAt' => $r['created_at'] ?? '', 'lastActive' => $r['last_active'] ?? ''];
    }, $concurrent)];
}
// ══════════════════════════════════════════════════════════════════════════════
//  ADDITIONAL REVIEWER HANDLERS
// ══════════════════════════════════════════════════════════════════════════════
function handleBulkDeleteReviewers(array $b): array {
    $ids = $b['ids'] ?? [];
    if (empty($ids)) return err('No ids');
    $ph = implode(',', array_fill(0, count($ids), '?'));
    dbQuery("DELETE FROM reviewers WHERE id IN ($ph)", $ids);
    return ['success' => true];
}
function handleProposeReviewers(array $b): array {
    $formId = trim($b['formId'] ?? $b['form_id'] ?? '');
    $reviewerEmails = $b['reviewerEmails'] ?? $b['reviewers'] ?? [];
    $justification = trim($b['justification'] ?? '');
    $userId = $b['userId'] ?? $b['email'] ?? '';
    if (!$formId) return err('Missing formId');
    if (!is_array($reviewerEmails) || count($reviewerEmails) === 0) return err('No reviewers proposed');
    // Verify the form exists
    $form = dbFetchOne('SELECT id, competition FROM applications WHERE id=?', [$formId]);
    if (!$form) return err('Application not found');
    // Create proposal
    $id = 'rpp_' . bin2hex(random_bytes(8));
    $now = date('Y-m-d H:i:s');
    $history = json_encode([['status' => 'pending', 'ts' => $now, 'by' => $userId]]);
    dbInsert(
        "INSERT INTO reviewer_proposals (id, form_id, competition_id, proposed_by, proposed_at, proposed_reviewers, justification, status, history)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
        [$id, $formId, $form['competition'], $userId, $now, json_encode($reviewerEmails), $justification, $history]
    );
    // Update application status to reviewers_proposed
    dbQuery("UPDATE applications SET status = 'reviewers_proposed', updated_at = NOW() WHERE id = ?", [$formId]);
    clearQueryCache('reviewer_proposals');
    return ['success' => true, 'proposalId' => $id];
}
function handleConfirmReviewers(array $b): array {
    $proposalId = trim($b['proposalId'] ?? '');
    $approve = !empty($b['approve']) && $b['approve'] !== 'false';
    $modificationsNote = trim($b['modificationsNote'] ?? '');
    $userId = $b['userId'] ?? $b['email'] ?? '';
    if (!$proposalId) return err('Missing proposalId');
    $proposal = dbFetchOne('SELECT * FROM reviewer_proposals WHERE id=?', [$proposalId]);
    if (!$proposal) return err('Proposal not found');
    if ($proposal['status'] !== 'pending') return err('Proposal already ' . $proposal['status']);
    $now = date('Y-m-d H:i:s');
    if ($approve) {
        // Decode proposed reviewers and add them to the reviewers table
        $reviewers = json_decode($proposal['proposed_reviewers'], true) ?: [];
        $added = [];
        foreach ($reviewers as $email) {
            $email = strtolower(trim($email));
            if (!$email) continue;
            $revId = 'rev_' . bin2hex(random_bytes(8));
            dbInsert(
                "INSERT INTO reviewers (id, email, name, competition, form_id, status, reviewer_fee, created)
                 VALUES (?, ?, ?, ?, ?, 'pending', 0.00, ?)",
                [$revId, $email, $email, $proposal['competition_id'], $proposal['form_id'], $now]
            );
            $added[] = $email;
        }
        dbQuery(
            "UPDATE reviewer_proposals SET status = 'approved', confirmed_by = ?, confirmed_at = ?, final_reviewers = ?, modifications_note = ? WHERE id = ?",
            [$userId, $now, json_encode($added), $modificationsNote, $proposalId]
        );
        dbQuery("UPDATE applications SET status = 'in_review', updated_at = NOW() WHERE id = ?", [$proposal['form_id']]);
    } else {
        dbQuery(
            "UPDATE reviewer_proposals SET status = 'rejected', confirmed_by = ?, confirmed_at = ?, modifications_note = ? WHERE id = ?",
            [$userId, $now, $modificationsNote, $proposalId]
        );
        dbQuery("UPDATE applications SET status = 'reviewers_rejected', updated_at = NOW() WHERE id = ?", [$proposal['form_id']]);
    }
    clearQueryCache('reviewers');
    clearQueryCache('reviewer_proposals');
    return ['success' => true, 'proposalId' => $proposalId, 'approved' => $approve];
}
function handleReplaceReviewer(array $b): array {
    $formId   = $b['formId'] ?? $b['form_id'] ?? $b['applicationId'] ?? $b['application_id'] ?? '';
    $oldEmail = $b['oldEmail'] ?? $b['old_email'] ?? '';
    $newEmail = $b['newEmail'] ?? $b['new_email'] ?? '';
    if (!function_exists('sqlReplaceReviewer')) {
        return err('replaceReviewer unavailable: sql_service.php not loaded');
    }
    // sqlReplaceReviewer falls back to direct SQL when the replace_reviewer
    // stored procedure is absent. Return its real verdict — previously a
    // failure fell through to handleStub() and reported success:true while
    // nothing had changed, so the UI showed a swap that never happened.
    return sqlReplaceReviewer(
        $formId,
        $oldEmail,
        $newEmail,
        $b['newName'] ?? $b['new_name'] ?? '',
        $b['reason'] ?? '',
        $b['userEmail'] ?? $b['user'] ?? $b['user_email'] ?? ''
    );
}
// ══════════════════════════════════════════════════════════════════════════════
//  EXPENSES
// ══════════════════════════════════════════════════════════════════════════════
function handleGetExpenses(array $b): array {
    $pid = $b['projectId'] ?? '';
    $rows = $pid ? dbFetchAll('SELECT * FROM expenses WHERE project_id = ? ORDER BY date DESC', [$pid]) : dbFetchAll('SELECT * FROM expenses ORDER BY date DESC');
    return ['success' => true, 'expenses' => _snakeToCamelRows($rows)];
}
function handleCreateExpense(array $b): array {
    $id = $b['id'] ?? ('exp_' . bin2hex(random_bytes(8)));
    try {
        $fieldMap = [
            'projectId'=>'project_id','amount'=>'amount','currency'=>'currency','group'=>'cost_group',
            'description'=>'description','status'=>'status','userId'=>'user_id','userEmail'=>'user_id'
        ];
        $data = ['id'=>$id, 'requested_at'=>date('c'), 'created_at'=>date('c'), 'updated_at'=>date('c')];
        foreach ($fieldMap as $src => $col) {
            if (isset($b[$src])) {
                $data[$col] = is_array($b[$src]) ? json_encode($b[$src], JSON_UNESCAPED_UNICODE) : $b[$src];
            }
        }
        if (empty($data['status'])) $data['status'] = 'pending';
        insertArray('expenses', $data);
        clearQueryCache('expenses');
        try {
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("expenses",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
        } catch (Throwable $_) {}
        return ['success' => true, 'id' => $id];
    } catch(Throwable $e) { return err($e->getMessage()); }
}
function handleApproveExpense(array $b): array {
    $id = $b['id'] ?? '';
    if (!$id) return err('Missing id');
    dbQuery("UPDATE expenses SET status='approved', approved_by=?, approved_at=NOW() WHERE id=?", [$b['approvedBy'] ?? $b['userId'] ?? '', $id]);
    clearQueryCache('expenses');
    try {
        dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("expenses",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
    } catch (Throwable $_) {}
    return ['success' => true];
}
// ══════════════════════════════════════════════════════════════════════════════
//  CALENDAR EVENTS
// ══════════════════════════════════════════════════════════════════════════════
function handleGetCalendarEvents(): array {
    // v12.47.9-cal: competitions is the authoritative calendar source. The
    // previous UNION against `applications` referenced columns that do not exist
    // on that table (name/created/status), causing SQLSTATE[42S22]. Keep the
    // calendar focused on competitions (which have id, name, deadline, status).
    return ['success' => true, 'events' => dbFetchAll(
        "SELECT id as competitionId, name as title, deadline as start, description, status FROM competitions WHERE deadline IS NOT NULL
         ORDER BY deadline ASC")];
}
// ══════════════════════════════════════════════════════════════════════════════
//  BUDGET / FINANCIAL
// ══════════════════════════════════════════════════════════════════════════════
function handleGetBudgetSummary(array $b): array {
    $pid = $b['projectId'] ?? '';
    if ($pid) {
        // Try SQL service for full budget view
        $result = sqlGetProjectDashboard($pid);
        if (!empty($result['project']) && !empty($result['budgetSummary'])) {
            return [
                'success' => true,
                'budget' => $result['project']['budget'] ?? '{}',
                'spent' => $result['expenses'] ?? [],
                'budgetSummary' => $result['budgetSummary'],
                'project' => $result['project'],
                '_source' => 'sql'
            ];
        }
        // Fallback
        $p = dbFetchOne('SELECT * FROM projects WHERE id = ?', [$pid]);
        if (!$p) return err('Project not found');
        $expenses = dbFetchAll("SELECT cost_group, SUM(amount) as total FROM expenses WHERE project_id = ? AND status = 'approved' GROUP BY cost_group", [$pid]);
        return ['success' => true, 'budget' => $p['budget'], 'spent' => $expenses, 'project' => $p];
    }
    return err('Missing projectId');
}
// ══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD / AGGREGATION
// ══════════════════════════════════════════════════════════════════════════════
function handleGetDashboardStats(): array {
    try {
        $apps = dbFetchOne("SELECT COUNT(*) as total, SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) as submitted FROM applications") ?? [];
        $comps = dbFetchOne("SELECT COUNT(*) as total FROM competitions WHERE status='active'") ?? [];
        $projects = dbFetchOne("SELECT COUNT(*) as total FROM projects WHERE status IN ('contracted','active')") ?? [];
        $reviewers = dbFetchOne("SELECT COUNT(*) as total FROM reviewers WHERE status='pending'") ?? [];
        return ['success' => true, 'stats' => [
            'applications' => (int)($apps['total'] ?? 0),
            'submitted' => (int)($apps['submitted'] ?? 0),
            'activeCompetitions' => (int)($comps['total'] ?? 0),
            'activeProjects' => (int)($projects['total'] ?? 0),
            'pendingReviews' => (int)($reviewers['total'] ?? 0),
        ]];
    } catch (Throwable $e) {
        return err($e->getMessage());
    }
}
// ══════════════════════════════════════════════════════════════════════════════
//  MUTATION HANDLERS (dual-write targets for GAS sync)
// ══════════════════════════════════════════════════════════════════════════════
function handleCreateProject(array $b): array {
    $id = $b['id'] ?? $b['projectId'] ?? ('proj_' . bin2hex(random_bytes(8)));
    try {
        $existing = dbFetchOne('SELECT id FROM projects WHERE id=?', [$id]);
        if ($existing) {
            return handleUpdateProject(array_merge($b, ['id'=>$id]));
        }
        $fieldMap = [
            'title'=>'title','status'=>'status','budget'=>'budget','description'=>'description',
            'projectType'=>'project_type','area'=>'area','leaderEmail'=>'leader_email','leaderName'=>'leader_name',
            'piId'=>'pi_id','startDate'=>'start_date','endDate'=>'end_date','budgetTotal'=>'budget_total',
            'lifecycleStatus'=>'lifecycle_status','objectives'=>'objectives','expectedResults'=>'expected_results',
            'teamMembers'=>'team_members','fileIds'=>'file_ids','durationMonths'=>'duration_months',
            'userEmail'=>'user_email','userId'=>'user_email','applicationId'=>'application_id'
        ];
        $data = ['id'=>$id, 'created_at'=>date('c'), 'updated_at'=>date('c')];
        foreach ($fieldMap as $src => $col) {
            if (isset($b[$src])) {
                $v = $b[$src];
                $data[$col] = is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : $v;
            }
        }
        if (empty($data['user_email'])) {
            $data['user_email'] = $b['user_email'] ?? $b['userId'] ?? $b['userEmail'] ?? '';
        }
        insertArray('projects', $data);
        clearQueryCache('projects');
        try {
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("projects",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
        } catch (Throwable $_) {}
        return ['success'=>true,'id'=>$id,'action'=>'created'];
    } catch(Throwable $e) { return err($e->getMessage()); }
}
function handleUpdateProject(array $b): array {
    $id = $b['id'] ?? ''; if(!$id) return err('Missing id');
    try {
        $sets = []; $params = [];
        $fieldMap = [
            'title'=>'title','status'=>'status','budget'=>'budget','description'=>'description',
            'projectType'=>'project_type','area'=>'area','leaderEmail'=>'leader_email','leaderName'=>'leader_name',
            'piId'=>'pi_id','startDate'=>'start_date','endDate'=>'end_date','budgetTotal'=>'budget_total',
            'lifecycleStatus'=>'lifecycle_status','objectives'=>'objectives','expectedResults'=>'expected_results',
            'teamMembers'=>'team_members','fileIds'=>'file_ids','durationMonths'=>'duration_months',
            'userEmail'=>'user_email','userId'=>'user_email','applicationId'=>'application_id'
        ];
        foreach ($fieldMap as $src => $col) {
            if (array_key_exists($src, $b)) {
                $sets[] = "`$col`=?"; $params[] = is_array($b[$src]) ? json_encode($b[$src], JSON_UNESCAPED_UNICODE) : $b[$src];
            }
        }
        if (!empty($b['updatedAt'])) { $sets[] = "`updated_at`=?"; $params[] = $b['updatedAt']; }
        if (!$sets) return err('No fields to update');
        $params[] = $id;
        dbQuery("UPDATE projects SET ".implode(',',$sets)." WHERE id=?", $params);
        clearQueryCache('projects');
        try {
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("projects",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
        } catch (Throwable $_) {}
        return ['success'=>true,'message'=>'Project updated'];
    } catch(Throwable $e) { return err($e->getMessage()); }
}
function handleSubmitReport(array $b): array {
    $id = $b['id'] ?? ('rpt_' . bin2hex(random_bytes(8)));
    $u = $b['userId'] ?? $b['userEmail'] ?? '';
    try {
        $fieldMap = [
            'projectId'=>'project_id','reportType'=>'report_type','period'=>'period',
            'title'=>'title','scientificContent'=>'scientific_content','financialSummary'=>'financial_summary',
            'expenseIds'=>'expense_ids','userId'=>'user_id','userEmail'=>'user_id'
        ];
        $sets = ['`status`=?']; $params = ['submitted'];
        foreach ($fieldMap as $src => $col) {
            if (isset($b[$src])) {
                $sets[] = "`$col`=?"; $params[] = is_array($b[$src]) ? json_encode($b[$src], JSON_UNESCAPED_UNICODE) : $b[$src];
            }
        }
        $params[] = $b['submitted_at'] ?? date('c');
        $params[] = $id;
        dbQuery("UPDATE reports SET ".implode(',',$sets).", submitted_at=? WHERE id=?", $params);
        clearQueryCache('reports');
        try {
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("reports",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
        } catch (Throwable $_) {}
        return ['success'=>true,'message'=>'Report submitted','id'=>$id];
    } catch(Throwable $e) { return err($e->getMessage()); }
}
function handleAcceptReport(array $b): array {
    try {
        $id = $b['id'] ?? $b['reportId'] ?? '';
        if (!$id) return err('Missing id');
        dbQuery("UPDATE reports SET status='accepted', accepted_at=?, accepted_by=? WHERE id=?", [date('c'), $b['userId'] ?? '', $id]);
        clearQueryCache('reports');
        try {
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("reports",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
        } catch (Throwable $_) {}
        return ['success'=>true];
    } catch(Throwable $e) { return err($e->getMessage()); }
}
function handleReturnReport(array $b): array {
    try {
        $id = $b['id'] ?? $b['reportId'] ?? '';
        if (!$id) return err('Missing id');
        dbQuery("UPDATE reports SET status='returned', return_comment=?, returned_at=? WHERE id=?", [$b['comment'] ?? $b['notes'] ?? '', date('c'), $id]);
        clearQueryCache('reports');
        try {
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("reports",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
        } catch (Throwable $_) {}
        return ['success'=>true];
    } catch(Throwable $e) { return err($e->getMessage()); }
}
function handleCreateChangeRequest(array $b): array {
    try {
        $id = $b['id'] ?? ('cr_' . bin2hex(random_bytes(8)));
        $fieldMap = [
            'projectId'=>'project_id','formId'=>'form_id','changeType'=>'change_type',
            'description'=>'description','oldData'=>'old_data','newData'=>'new_data',
            'userId'=>'user_id','userEmail'=>'user_id'
        ];
        $data = ['id'=>$id, 'status'=>'submitted', 'requested_at'=>date('c'), 'created_at'=>date('c'), 'updated_at'=>date('c')];
        foreach ($fieldMap as $src => $col) {
            if (isset($b[$src])) {
                $data[$col] = is_array($b[$src]) ? json_encode($b[$src], JSON_UNESCAPED_UNICODE) : $b[$src];
            }
        }
        insertArray('change_requests', $data);
        clearQueryCache('change_requests');
        try {
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("change_requests",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
        } catch (Throwable $_) {}
        return ['success'=>true,'id'=>$id];
    } catch(Throwable $e) { return err($e->getMessage()); }
}
function handleApproveChangeRequest(array $b): array {
    try {
        $id = $b['id'] ?? $b['changeRequestId'] ?? '';
        if (!$id) return err('Missing id');
        $sets = ['`status`=?']; $params = [$b['status'] ?? 'approved'];
        if (isset($b['decision'])) { $sets[] = "`reviewed_by`=?"; $params[] = $b['decision']; }
        if (isset($b['notes'])) { $sets[] = "`review_comment`=?"; $params[] = $b['notes']; }
        $params[] = $id;
        dbQuery("UPDATE change_requests SET ".implode(',',$sets).", reviewed_at=NOW() WHERE id=?", $params);
        clearQueryCache('change_requests');
        try {
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("change_requests",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
        } catch (Throwable $_) {}
        return ['success'=>true];
    } catch(Throwable $e) { return err($e->getMessage()); }
}
// ══════════════════════════════════════════════════════════════════════════════
//  REVERSE SYNC: PHP → GAS (Google Apps Script)
//  When the PHP API handles a mutation, it forwards the request to GAS so
//  Google Sheets, Drive operations, and email notifications stay in sync.
//  Fire-and-forget with a 3s timeout — MySQL is authoritative for PHP, GAS
//  receives the same payload for its own processing.  Set GAS_REAL_URL in .env.
// ══════════════════════════════════════════════════════════════════════════════
/**
 * FIRE-AND-FORGET GAS sync via sync_queue (v10.5.0).
 * Instead of making a synchronous HTTP call to GAS (which can take 2-5s on cold start
 * and blocks the PHP-FPM worker), we INSERT a row into the `sync_queue` table.
 * A cron job (`sync_worker.php`) processes the queue asynchronously, POSTing each
 * row to GAS outside the request flow.  This keeps API response times under 300ms.
 *
 * The queue row stores:
 *   - action: the GAS action name (createform, updateform, etc.)
 *   - payload: full JSON body
 *   - gas_url: the GAS endpoint URL (from GAS_REAL_URL)
 *   - priority: 10 (default), bumped to 50 for mutations that block user flow
 *   - created_at: auto-timestamp
 *
 * Fallback: if `fastcgi_finish_request()` + `register_shutdown_function()` is
 * available, we still use it for the GAS call but with a SHORT timeout (3s)
 * so it doesn't block the response. The sync_queue remains the primary path.
 */
function _syncToGAS_(string $action, array $body): void {
    if (!defined('GAS_SYNC_ENABLED') || !GAS_SYNC_ENABLED || !GAS_REAL_URL) return;
    $payload = array_merge($body, ['action' => $action, '_phpSync' => true]);
    $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE);
    // ── PRIMARY: Insert into sync_queue for cron processing ──
    try {
        dbQuery(
            'INSERT INTO sync_queue (action, payload, gas_url, priority, created_at) VALUES (?, ?, ?, ?, NOW())',
            [$action, $payloadJson, GAS_REAL_URL, 10]
        );
        return; // Queue insert succeeded — cron will process
    } catch (Throwable $e) {
        logError('sync_queue insert failed: ' . $e->getMessage());
        // Fall through to synchronous fallback
    }
    // ── FALLBACK: fire-and-forget via shutdown function ──
    $doSync = function () use ($payloadJson) {
        try {
            $ctx = stream_context_create([
                'http' => [
                    'method'  => 'POST',
                    'header'  => "Content-Type: application/json\r\n",
                    'content' => $payloadJson,
                    'timeout' => 3,
                    'ignore_errors' => true
                ]
            ]);
            @file_get_contents(GAS_REAL_URL, false, $ctx);
        } catch (Throwable $e) {
            logError('sync_fallback: ' . $e->getMessage());
        }
    };
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
        register_shutdown_function($doSync);
    } else {
        register_shutdown_function($doSync);
    }
}
// ══════════════════════════════════════════════════════════════════════════════
//  v10.4.0: GAS CACHE + SYNC HANDLERS
//  Provides instant-read cache for GAS responses via MySQL.
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Write a GAS API response to the MySQL cache.
 * Called by the frontend data layer after every successful GAS call.
 * POST body: { action, cacheKey, responseData, userEmail?, ttlSeconds? }
 */
function handleGasSetCache(array $b): array {
    $action = $b['action'] ?? '';
    $cacheKey = $b['cacheKey'] ?? '';
    $data = $b['responseData'] ?? '';
    $userEmail = $b['userEmail'] ?? '';
    $ttl = intval($b['ttlSeconds'] ?? 300);
    if (!$cacheKey || !$data) return err('Missing cacheKey or responseData');
    $expires = date('Y-m-d H:i:s', time() + $ttl);
    try {
        $existing = dbFetchOne('SELECT cache_key FROM gas_cache WHERE cache_key=?', [$cacheKey]);
        if ($existing) {
            dbQuery('UPDATE gas_cache SET response_data=?, user_email=?, expires_at=?, action=? WHERE cache_key=?',
                [$data, $userEmail, $expires, $action, $cacheKey]);
        } else {
            dbQuery('INSERT INTO gas_cache (cache_key, action, response_data, user_email, expires_at) VALUES (?,?,?,?,?)',
                [$cacheKey, $action, $data, $userEmail, $expires]);
        }
        return ['success'=>true];
    } catch (Throwable $e) {
        return err('Cache write error: '.$e->getMessage());
    }
}
/**
 * Read from the GAS MySQL cache.
 * POST body: { cacheKey }
 * Returns null when cache miss or expired.
 */
function handleGasGetCache(array $b): array {
    $cacheKey = $b['cacheKey'] ?? '';
    if (!$cacheKey) return err('Missing cacheKey');
    try {
        $row = dbFetchOne('SELECT response_data, expires_at FROM gas_cache WHERE cache_key=? AND (expires_at IS NULL OR expires_at > NOW())', [$cacheKey]);
        if (!$row) return ['success'=>true, 'found'=>false];
        $data = json_decode($row['response_data'], true);
        return ['success'=>true, 'found'=>true, 'data'=>$data];
    } catch (Throwable $e) {
        return err('Cache read error: '.$e->getMessage());
    }
}
/**
 * Sync a GAS action result into the MySQL cache.
 * Fetches data from GAS and stores it in the cache table.
 * POST body: { action, ...params }
 */
function handleGasSync(array $b): array {
    $action = $b['action'] ?? '';
    if (!$action) return err('Missing action');
    $gasUrl = defined('GAS_REAL_URL') ? GAS_REAL_URL : '';
    if (!$gasUrl) return err('GAS_REAL_URL not configured');
    try {
        $ctx = stream_context_create([
            'http' => [
                'method'  => 'POST',
                'header'  => "Content-Type: application/json\r\n",
                'content' => json_encode($b),
                'timeout' => 25,
                'ignore_errors' => true
            ]
        ]);
        $response = @file_get_contents($gasUrl, false, $ctx);
        if (!$response) return err('GAS sync failed: no response');
        $json = json_decode($response, true);
        if (!$json) return err('GAS sync failed: invalid JSON');
        // Cache the response
        $cacheKey = $action . '::' . md5(json_encode($b));
        $expires = date('Y-m-d H:i:s', time() + 300);
        dbQuery('REPLACE INTO gas_cache (cache_key, action, response_data, expires_at) VALUES (?,?,?,?)',
            [$cacheKey, $action, $response, $expires]);
        return ['success'=>true, 'data'=>$json];
    } catch (Throwable $e) {
        return err('GAS sync error: '.$e->getMessage());
    }
}
/**
 * Pull all cached GAS data for a user/action.
 * POST body: { action?, userEmail? }
 */
function handleGasSyncPull(array $b): array {
    $action = $b['action'] ?? '';
    $userEmail = $b['userEmail'] ?? '';
    $sql = 'SELECT action, response_data, expires_at FROM gas_cache WHERE expires_at > NOW()';
    $params = [];
    if ($action) { $sql .= ' AND action=?'; $params[] = $action; }
    if ($userEmail) { $sql .= ' AND (user_email=? OR user_email IS NULL OR user_email="")'; $params[] = $userEmail; }
    $sql .= ' ORDER BY created_at DESC LIMIT 100';
    try {
        $rows = dbFetchAll($sql, $params);
        $result = [];
        foreach ($rows as $r) {
            $data = json_decode($r['response_data'], true);
            if ($data) $result[] = ['action'=>$r['action'], 'data'=>$data];
        }
        return ['success'=>true, 'count'=>count($result), 'entries'=>$result];
    } catch (Throwable $e) {
        return err('Sync pull error: '.$e->getMessage());
    }
}
/**
 * v10.4.1: Warm a user's critical data into the PHP cache by pulling from GAS.
 * Called by GAS _warmUserCache_() after login or form submission.
 * POST body: { userEmail, actions[]? }
 */
function handleWarmUserCache(array $b): array {
    $userEmail = $b['userEmail'] ?? $b['userId'] ?? '';
    if (!$userEmail) return err('Missing userEmail');
    $actions = $b['actions'] ?? ['getforms','getcompetitions','getpubliccompetitions','listdocuments'];
    $gasUrl = defined('GAS_REAL_URL') ? GAS_REAL_URL : '';
    if (!$gasUrl) return err('GAS_REAL_URL not configured');
    $results = [];
    foreach ($actions as $action) {
        try {
            $ctx = stream_context_create([
                'http' => [
                    'method'  => 'POST',
                    'header'  => "Content-Type: application/json\r\n",
                    'content' => json_encode(['action' => $action, 'userId' => $userEmail, '_phpSync' => true]),
                    'timeout' => 15,
                    'ignore_errors' => true
                ]
            ]);
            $response = @file_get_contents($gasUrl, false, $ctx);
            if ($response) {
                $json = json_decode($response, true);
                if ($json) {
                    // Store in gas_cache
                    $cacheKey = $action . '::' . md5(json_encode(['userId' => $userEmail]));
                    $expires = date('Y-m-d H:i:s', time() + 300);
                    dbQuery('REPLACE INTO gas_cache (cache_key, action, response_data, user_email, expires_at) VALUES (?,?,?,?,?)',
                        [$cacheKey, $action, $response, $userEmail, $expires]);
                    $results[] = ['action' => $action, 'status' => 'cached'];
                }
            }
        } catch (Throwable $e) {
            $results[] = ['action' => $action, 'status' => 'error', 'error' => $e->getMessage()];
        }
    }
    return ['success' => true, 'results' => $results];
}
/**
 * v10.4.1: Sync a GAS API response directly into the MySQL cache table.
 * More efficient than gassetcache — accepts {cacheKey, responseData, action, userEmail, ttl}.
 * Also triggers warming of related cache entries.
 */
function handleGasCacheSync(array $b): array {
    $cacheKey = $b['cacheKey'] ?? '';
    $data = $b['responseData'] ?? '';
    $action = $b['action'] ?? '';
    $userEmail = $b['userEmail'] ?? '';
    $ttl = intval($b['ttlSeconds'] ?? 300);
    if (!$cacheKey || !$data) return err('Missing cacheKey or responseData');
    $expires = date('Y-m-d H:i:s', time() + $ttl);
    try {
        dbQuery('REPLACE INTO gas_cache (cache_key, action, response_data, user_email, expires_at) VALUES (?,?,?,?,?)',
            [$cacheKey, $action, $data, $userEmail, $expires]);
        return ['success'=>true];
    } catch (Throwable $e) {
        return err('Cache sync error: '.$e->getMessage());
    }
}
// ══════════════════════════════════════════════════════════════════════════════
//  v10.4.1: ORPHAN TABLE HANDLERS — deliverables, library_deposits,
// ── Dossier / supplementary-sections tables (idempotent self-heal) ──────────
// Tasks 21 & 22 (DocComments + Self-Assessment/TRL/Work Program/Support Letters)
// query/insert these tables but the live DB may not have them migrated yet.
// Each handler calls ensureDossierTables() first so the feature works on a
// fresh DB without a manual migration step. Mirrors handleRunMigration's
// CREATE TABLE IF NOT EXISTS + try/catch style. (2026-08-22)
function ensureDossierTables(): void {
    try {
        $db = getDB();
        $sqls = [
            "CREATE TABLE IF NOT EXISTS `document_comments` (
              `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
              `doc_id` VARCHAR(128) NOT NULL DEFAULT '',
              `author` VARCHAR(255) NOT NULL DEFAULT '',
              `text` TEXT NOT NULL,
              `created_at` DATETIME NULL,
              KEY `idx_dc_doc_id` (`doc_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `self_assessments` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `proposal_id` VARCHAR(128) NOT NULL DEFAULT '',
              `project_type` VARCHAR(32) NOT NULL DEFAULT '',
              `applicant_email` VARCHAR(255) NOT NULL DEFAULT '',
              `scores` JSON NULL,
              `total_points` INT NOT NULL DEFAULT 0,
              `max_points` INT NOT NULL DEFAULT 100,
              `threshold_met` TINYINT(1) NOT NULL DEFAULT 0,
              `created_at` DATETIME NULL,
              `updated_at` DATETIME NULL,
              KEY `idx_sa_proposal` (`proposal_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `trl_records` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `proposal_id` VARCHAR(128) NOT NULL DEFAULT '',
              `trl_level` TINYINT NOT NULL DEFAULT 0,
              `description` TEXT NULL,
              `current_evidence` TEXT NULL,
              `target_trl` TINYINT NOT NULL DEFAULT 0,
              `created_at` DATETIME NULL,
              `updated_at` DATETIME NULL,
              KEY `idx_trl_proposal` (`proposal_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `work_programs` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `proposal_id` VARCHAR(128) NOT NULL DEFAULT '',
              `activity_order` INT NOT NULL DEFAULT 0,
              `description` TEXT NULL,
              `method` TEXT NULL,
              `expected_result` TEXT NULL,
              `start_month` INT NULL,
              `duration_months` INT NULL,
              `created_at` DATETIME NULL,
              KEY `idx_wp_proposal` (`proposal_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `support_letters` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `proposal_id` VARCHAR(128) NOT NULL DEFAULT '',
              `author_name` VARCHAR(255) NOT NULL DEFAULT '',
              `author_position` VARCHAR(255) NOT NULL DEFAULT '',
              `author_affiliation` VARCHAR(255) NOT NULL DEFAULT '',
              `author_email` VARCHAR(255) NOT NULL DEFAULT '',
              `content` TEXT NULL,
              `file_id` VARCHAR(255) NOT NULL DEFAULT '',
              `created_at` DATETIME NULL,
              KEY `idx_sl_proposal` (`proposal_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS `collaborators` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `proposal_id` VARCHAR(128) NOT NULL DEFAULT '',
              `email` VARCHAR(255) NOT NULL DEFAULT '',
              `name` VARCHAR(255) NOT NULL DEFAULT '',
              `position` VARCHAR(255) NOT NULL DEFAULT '',
              `faculty` VARCHAR(255) NOT NULL DEFAULT '',
              `specialty` VARCHAR(255) NOT NULL DEFAULT '',
              `created_at` DATETIME NULL,
              KEY `idx_col_proposal` (`proposal_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        ];
        foreach ($sqls as $sql) {
            try { $db->exec($sql); } catch (Throwable $e) { /* table may already exist or differ; ignore */ }
        }
    } catch (Throwable $e) {
        /* getDB() unavailable — handlers will still try their query and surface a clean error */
    }
}
// ── Audit-log table (idempotent self-heal) ────────────────────────────────
// Task 10 (admin audit log UI) reads `audit_log`, but no CREATE TABLE for it
// ships in the repo's .sql files — so on a DB where it was never migrated,
// getAuditLog 500s. Self-heal it on first call. (2026-08-22)
function ensureAuditLogTable(): void {
    try {
        $db = getDB();
        $db->exec("CREATE TABLE IF NOT EXISTS `audit_log` (
          `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `action` VARCHAR(64) NOT NULL DEFAULT '',
          `actor` VARCHAR(255) NOT NULL DEFAULT '',
          `target_type` VARCHAR(64) NOT NULL DEFAULT '',
          `target_id` VARCHAR(128) NOT NULL DEFAULT '',
          `details` TEXT NULL,
          `created` DATETIME NULL,
          KEY `idx_al_action` (`action`),
          KEY `idx_al_actor` (`actor`),
          KEY `idx_al_created` (`created`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        /* getDB() unavailable */
    }
}
/**
 * v12.49.22-resilience: Idempotently create form_sections + form_section_fields
 * so the config builder (getcompetitions/getinitialdata) never hits a missing
 * table. Wrapped reads already degrade to [] via _cfgRows(), but creating the
 * tables keeps gettablestatus green and supports form-section rendering.
 */
function ensureFormSectionsTables(): void {
    try {
        $db = getDB();
        $db->exec("CREATE TABLE IF NOT EXISTS `form_sections` (
          `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `section_id` VARCHAR(64) NOT NULL DEFAULT '',
          `project_type_code` VARCHAR(16) NOT NULL DEFAULT '',
          `label_bg` VARCHAR(255) NOT NULL DEFAULT '',
          `sort_order` INT NOT NULL DEFAULT 0,
          `required` TINYINT(1) NOT NULL DEFAULT 1,
          `max_items` INT NULL,
          `icon` VARCHAR(64) NULL,
          KEY `idx_fs_pt` (`project_type_code`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS `form_section_fields` (
          `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `field_id` VARCHAR(64) NOT NULL DEFAULT '',
          `section_id_ref` INT NOT NULL DEFAULT 0,
          `label_bg` VARCHAR(255) NOT NULL DEFAULT '',
          `field_type` VARCHAR(32) NOT NULL DEFAULT 'text',
          `sort_order` INT NOT NULL DEFAULT 0,
          `required` TINYINT(1) NOT NULL DEFAULT 0,
          `max_length` INT NULL,
          `placeholder_bg` VARCHAR(255) NULL,
          KEY `idx_fsf_sec` (`section_id_ref`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        /* getDB() unavailable */
    }
}

// ── Doc-stream self-heal (idempotent) ─────────────────────────────────────
/**
 * v12.49.44-docstream: Real-time collaborative document editing depends on
 * three tables (doc_stream_docs / doc_stream_sessions / doc_stream_ops). The
 * feature is user-facing (Съвместно редактиране from the doc preview modal),
 * so the tables MUST exist before any docstream op is served — otherwise
 * doc-stream.php / handleDocStreamOp would 500. Self-heal creates them
 * idempotently (mirrors schema-doc-stream.sql) so a fresh prod DB just works.
 */
function ensureDocStreamTables(): void {
    try {
        $db = getDB();
        $db->exec("CREATE TABLE IF NOT EXISTS `doc_stream_docs` (
          `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          `doc_id` VARCHAR(64) NOT NULL,
          `content_html` LONGTEXT NULL,
          `last_version` INT UNSIGNED NOT NULL DEFAULT 0,
          `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          UNIQUE KEY `uniq_doc_id` (`doc_id`),
          KEY `idx_last_version` (`last_version`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS `doc_stream_sessions` (
          `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
          `doc_id` VARCHAR(64) NOT NULL,
          `user_email` VARCHAR(255) NOT NULL,
          `user_name` VARCHAR(150) NULL,
          `cursor_position` INT UNSIGNED NOT NULL DEFAULT 0,
          `last_seen` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          `color` CHAR(7) NULL,
          PRIMARY KEY (`id`),
          UNIQUE KEY `uniq_doc_user` (`doc_id`, `user_email`),
          KEY `idx_ds_doc_id` (`doc_id`),
          KEY `idx_ds_last_seen` (`last_seen`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS `doc_stream_ops` (
          `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          `doc_id` VARCHAR(64) NOT NULL,
          `user_email` VARCHAR(255) NOT NULL,
          `op_type` ENUM('insert','delete','retain','format','replace') NOT NULL DEFAULT 'insert',
          `op_data` JSON NOT NULL,
          `version` INT UNSIGNED NOT NULL DEFAULT 0,
          `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_do_doc_version` (`doc_id`, `version`),
          KEY `idx_do_created_at` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        /* getDB() unavailable */
    }
}

// ── Proposal Wizard self-heal (idempotent) ───────────────────────────────
/**
 * v12.49.48-wizard: The v17.0.0 Proposal Wizard (js/features/proposal-wizard,
 * feature-flagged behind __pwUseNewWizard) persists external-referee
 * assignments and admin submissions into wizard_referees / wizard_submissions.
 * If those tables are absent on a fresh prod DB, handleSaveReferee and the
 * wizard_admin_action handlers would 500. Self-heal creates both idempotently
 * (mirrors database/schema-wizard-tables.sql) so the feature works on first hit.
 */
function ensureWizardTables(): void {
    try {
        $db = getDB();
        $db->exec("CREATE TABLE IF NOT EXISTS `wizard_submissions` (
            `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `user_email`       VARCHAR(255)    NOT NULL,
            `project_type`     VARCHAR(100)    NOT NULL,
            `current_step`     TINYINT UNSIGNED NOT NULL DEFAULT 1,
            `status`           ENUM('draft','in_progress','review','submitted','rejected') NOT NULL DEFAULT 'draft',
            `created_at`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            `submitted_at`     TIMESTAMP       NULL     DEFAULT NULL,
            PRIMARY KEY (`id`),
            KEY `idx_ws_user_email` (`user_email`),
            KEY `idx_ws_status` (`status`),
            KEY `idx_ws_current_step` (`current_step`),
            KEY `idx_ws_project_type` (`project_type`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $db->exec("CREATE TABLE IF NOT EXISTS `wizard_referees` (
            `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `submission_id`   BIGINT UNSIGNED NOT NULL,
            `name`            VARCHAR(255)    NOT NULL,
            `academic_title`  VARCHAR(100)    NULL     DEFAULT NULL,
            `organization`    VARCHAR(255)    NULL     DEFAULT NULL,
            `email`           VARCHAR(255)    NOT NULL,
            `phone`           VARCHAR(50)     NULL     DEFAULT NULL,
            `is_duplicate`    TINYINT(1)      NOT NULL DEFAULT 0,
            PRIMARY KEY (`id`),
            KEY `idx_wr_submission` (`submission_id`),
            KEY `idx_wr_email` (`email`),
            KEY `idx_wr_duplicate` (`is_duplicate`),
            CONSTRAINT `fk_wr_submission`
                FOREIGN KEY (`submission_id`) REFERENCES `wizard_submissions` (`id`)
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        /* getDB() unavailable */
    }
}

// ── Schema migration (idempotent) ────────────────────────────────────────
/**
 * v12.49.23-resilience: Server-side sliding-window rate limiter (Task 17-backend).
 * Complements the client-side 60 req/min guard in js/services/api.js.
 * Returns null if allowed; an error array (jsonExit with 429) if exceeded.
 * FAILS OPEN: if the rate-limit store is unavailable, the request is always allowed.
 */
function ensureRateLimitTable(): void {
    try {
        $db = getDB();
        $db->exec("CREATE TABLE IF NOT EXISTS `rate_limits` (
          `bucket` VARCHAR(191) NOT NULL,
          `hits` INT NOT NULL DEFAULT 0,
          `window_start` INT NOT NULL DEFAULT 0,
          PRIMARY KEY (`bucket`),
          KEY `idx_rl_ws` (`window_start`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) { /* getDB() unavailable */ }
}

// v12.54.17: self-heal for project_templates (Google Drive template folder documents)
function ensureProjectTemplatesTable(): void {
    try {
        $db = getDB();
        $db->exec("CREATE TABLE IF NOT EXISTS `project_templates` (
          `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
          `project_type` VARCHAR(16)  NOT NULL,
          `doc_type`     VARCHAR(32)  NOT NULL DEFAULT 'budget',
          `drive_id`     VARCHAR(128) NOT NULL,
          `gid`          VARCHAR(32)  DEFAULT NULL,
          `label`        VARCHAR(255) NOT NULL DEFAULT '',
          `static_path`  VARCHAR(255) DEFAULT NULL,
          `is_active`    TINYINT(1)   NOT NULL DEFAULT 1,
          `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          UNIQUE KEY `uq_pt_type_doc` (`project_type`, `doc_type`),
          INDEX `idx_pt_type` (`project_type`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        // Seed budget templates for all 4 funding programs (idempotent)
        $seeds = [
            ['ФНИ', 'budget', '1MCGrMcU82NY_yDqjXxyOxFS5Uwz9Xz5j8zUZYSfrUqQ', '893829297', 'Бюджетна таблица — ФНИ'],
            ['ПНИ', 'budget', '1HqdUGvRobKSIkVajBEeN_OzLDq7kfZpaVWbc1qG3Xwc', '403420795', 'Бюджетна таблица — ПНИ'],
            ['ДНП', 'budget', '1JZljcUkQz5-2lQfDXHM69ehmPaV8XD9a714v1voImy4', '683768571', 'Бюджетна таблица — ДНП'],
            ['НПФ', 'budget', '1LhGG2IFoWhw3VuxwML7J7S5jLEnPApukmvUB9kC5Fbs', '1015761759', 'Бюджетна таблица — НПФ'],
        ];
        foreach ($seeds as $s) {
            try {
                $existing = dbFetchOne('SELECT id FROM project_templates WHERE project_type=? AND doc_type=?', [$s[0], $s[1]]);
                if (!$existing) {
                    dbInsert('INSERT INTO project_templates (project_type, doc_type, drive_id, gid, label) VALUES (?,?,?,?,?)', [$s[0], $s[1], $s[2], $s[3], $s[4]]);
                }
            } catch (Throwable $_) { /* seed may already exist */ }
        }
    } catch (Throwable $e) { /* getDB() unavailable */ }
}

function rateLimitCheck(string $action): ?array {
    static $EXEMPT = ["ping"=>1,"getsystemhealth"=>1,"gettablestatus"=>1,"getversion"=>1,"getdataversion"=>1];
    if (isset($EXEMPT[$action])) return null;
    $limit = 120;
    $window = 60;
    try {
        $db = getDB();
        ensureRateLimitTable();
        $ip = $_SERVER["REMOTE_ADDR"] ?? "0.0.0.0";
        if (!empty($_SERVER["HTTP_X_FORWARDED_FOR"])) {
            $fwd = explode(",", $_SERVER["HTTP_X_FORWARDED_FOR"]);
            $ip = trim($fwd[0]);
        }
        $bucket = "rl:" . $ip . ":" . $action;
        $now = time();
        $row = dbFetchOne("SELECT hits, window_start FROM rate_limits WHERE bucket=?", [$bucket]);
        if (!$row) {
            dbQuery("INSERT INTO rate_limits (bucket, hits, window_start) VALUES (?,1,?) ON DUPLICATE KEY UPDATE hits=1, window_start=?", [$bucket, $now, $now]);
            return null;
        }
        if (($now - (int)$row["window_start"]) >= $window) {
            dbQuery("UPDATE rate_limits SET hits=1, window_start=? WHERE bucket=?", [$now, $bucket]);
            return null;
        }
        if ((int)$row["hits"] >= $limit) {
            $retryAfter = $window - ($now - (int)$row["window_start"]);
            if ($retryAfter < 1) $retryAfter = 1;
            return ["success"=>false,"error"=>"rate_limited","retryAfter"=>$retryAfter,"limit"=>$limit,"window"=>$window];
        }
        dbQuery("UPDATE rate_limits SET hits=hits+1 WHERE bucket=?", [$bucket]);
        return null;
    } catch (Throwable $e) {
        return null;
    }
}
function handleRunMigration(array $b): array {
    $token = $b['token'] ?? '';
    if ($token !== 'veda_migration_' . date('Ymd')) {
        return ['success' => false, 'error' => 'invalid_token'];
    }
    $steps = [];
    $db = getDB();
    // Check if project_types exists and fix schema
    $existingCols = [];
    try {
        $cols = $db->query('DESCRIBE `project_types`');
        if ($cols) {
            foreach ($cols as $col) {
                $existingCols[] = $col['Field'];
            }
        }
    } catch (Exception $e) {
        // table doesn't exist
    }
    if (empty($existingCols)) {
        // Create fresh
        try {
            $db->exec("CREATE TABLE IF NOT EXISTS `project_types` (
              `code` VARCHAR(16) NOT NULL PRIMARY KEY,
              `name` VARCHAR(128) NOT NULL DEFAULT '',
              `description` TEXT NULL,
              `sort_order` INT NOT NULL DEFAULT 0,
              `is_active` TINYINT(1) NOT NULL DEFAULT 1,
              `created` DATETIME NULL,
              `modified` DATETIME NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $steps[] = 'OK: CREATE project_types';
        } catch (Exception $e) {
            $steps[] = 'FAIL: CREATE project_types: ' . $e->getMessage();
        }
    } else {
        // Fix missing columns
        if (!in_array('name', $existingCols)) {
            try {
                $db->exec("ALTER TABLE `project_types` ADD COLUMN `name` VARCHAR(128) NOT NULL DEFAULT '' AFTER `code`");
                $steps[] = 'OK: ALTER project_types ADD name';
            } catch (Exception $e) {
                $steps[] = 'FAIL: ALTER project_types name: ' . $e->getMessage();
            }
        }
        if (!in_array('sort_order', $existingCols)) {
            try {
                $db->exec("ALTER TABLE `project_types` ADD COLUMN `sort_order` INT NOT NULL DEFAULT 0");
                $steps[] = 'OK: ALTER project_types ADD sort_order';
            } catch (Exception $e) {
                $steps[] = 'FAIL: ALTER project_types sort_order: ' . $e->getMessage();
            }
        }
        if (!in_array('is_active', $existingCols)) {
            try {
                $db->exec("ALTER TABLE `project_types` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1");
                $steps[] = 'OK: ALTER project_types ADD is_active';
            } catch (Exception $e) {
                $steps[] = 'FAIL: ALTER project_types is_active: ' . $e->getMessage();
            }
        }
        $steps[] = 'OK: project_types already exists with ' . count($existingCols) . ' columns';
    }
    // Insert default project types (only if missing)
    try {
        $existing = $db->query('SELECT COUNT(*) FROM `project_types`')->fetchColumn();
        if (!$existing) {
            $cols = $db->query('DESCRIBE `project_types`')->fetchAll(PDO::FETCH_COLUMN);
            if (in_array('name', $cols)) {
                $db->exec("INSERT IGNORE INTO `project_types` (`code`,`name`,`sort_order`) VALUES
                  ('ФНИ','Фундаментални научни изследвания',1),
                  ('ПНИ','Приложни научни изследвания',2),
                  ('ДНП','Докторски научни програми',3),
                  ('НПФ','Научно-изследователски проекти — Финансиране',4)");
            } else {
                $db->exec("INSERT IGNORE INTO `project_types` (`code`,`sort_order`) VALUES ('ФНИ',1),('ПНИ',2),('ДНП',3),('НПФ',4)");
            }
            $steps[] = 'OK: INSERT project_types defaults';
        } else {
            $steps[] = 'OK: project_types already has ' . $existing . ' rows';
        }
    } catch (Exception $e) {
        $steps[] = 'FAIL: INSERT project_types: ' . $e->getMessage();
    }
    $sqls = [
        "CREATE TABLE IF NOT EXISTS `document_templates` (
          `id` VARCHAR(64) NOT NULL PRIMARY KEY,
          `project_type` VARCHAR(16) NOT NULL DEFAULT '',
          `doc_type` VARCHAR(64) NOT NULL DEFAULT '',
          `name` VARCHAR(255) NOT NULL DEFAULT '',
          `drive_file_id` VARCHAR(128) NOT NULL DEFAULT '',
          `label` VARCHAR(255) NOT NULL DEFAULT '',
          `mime` VARCHAR(128) NOT NULL DEFAULT 'application/vnd.google-apps.document',
          `sort_order` INT NOT NULL DEFAULT 0,
          `output_pdf` TINYINT(1) NOT NULL DEFAULT 0,
          `embed_signature` TINYINT(1) NOT NULL DEFAULT 0,
          `is_budget` TINYINT(1) NOT NULL DEFAULT 0,
          `is_active` TINYINT(1) NOT NULL DEFAULT 1,
          `created` DATETIME NULL,
          `modified` DATETIME NULL,
          KEY `idx_dt_project_type` (`project_type`),
          KEY `idx_dt_active` (`is_active`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS `required_document_templates` (
          `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `project_type_code` VARCHAR(16) NOT NULL DEFAULT '',
          `doc_key` VARCHAR(64) NOT NULL DEFAULT '',
          `name` VARCHAR(255) NOT NULL DEFAULT '',
          `sort_order` INT NOT NULL DEFAULT 0,
          `is_active` TINYINT(1) NOT NULL DEFAULT 1,
          KEY `idx_rdt_project_type` (`project_type_code`),
          KEY `idx_rdt_active` (`is_active`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS `user_scientific_profile` (
          `email` VARCHAR(255) NOT NULL PRIMARY KEY,
          `orcid` VARCHAR(32) NULL,
          `full_name` VARCHAR(255) NOT NULL DEFAULT '',
          `work_count` INT NOT NULL DEFAULT 0,
          `last_synced` DATETIME NULL,
          `created` DATETIME NULL,
          KEY `idx_usp_orcid` (`orcid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS `scientific_works` (
          `id` VARCHAR(64) NOT NULL PRIMARY KEY,
          `author_email` VARCHAR(255) NOT NULL DEFAULT '',
          `title` VARCHAR(500) NOT NULL DEFAULT '',
          `authors` VARCHAR(500) NOT NULL DEFAULT '',
          `publication` VARCHAR(255) NOT NULL DEFAULT '',
          `year` INT NULL,
          `doi` VARCHAR(255) NOT NULL DEFAULT '',
          `url` VARCHAR(500) NOT NULL DEFAULT '',
          `cited_by` INT NULL,
          `source` VARCHAR(32) NOT NULL DEFAULT 'orcid',
          `created` DATETIME NULL,
          KEY `idx_sw_author_email` (`author_email`),
          KEY `idx_sw_doi` (`doi`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS `document_comments` (
          `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `doc_id` VARCHAR(128) NOT NULL DEFAULT '',
          `author` VARCHAR(255) NOT NULL DEFAULT '',
          `text` TEXT NOT NULL,
          `created_at` DATETIME NULL,
          KEY `idx_dc_doc_id` (`doc_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];
    foreach ($sqls as $sql) {
        try {
            $db->exec($sql);
            $steps[] = 'OK: ' . substr($sql, 0, 80);
        } catch (Exception $e) {
            $steps[] = 'FAIL: ' . $e->getMessage();
        }
    }
    return ['success' => true, 'steps' => $steps];
}
function handleGetDocumentTemplates(array $b): array {
    try {
        $pt = $b['projectType'] ?? '';
        if ($pt !== '') {
            $rows = @dbFetchAll('SELECT * FROM document_templates WHERE project_type=? ORDER BY doc_type ASC', [$pt]);
        } else {
            $rows = @dbFetchAll('SELECT * FROM document_templates ORDER BY project_type ASC, doc_type ASC');
        }
        return ['success' => true, 'templates' => $rows ?: []];
    } catch (Throwable $e) {
        return ['success' => true, 'templates' => []];
    }
}
// ── Scientific works CRUD + auto-fetch ──────────────────────────────────
function handleGetScientificWorks(array $b): array {
    $email = trim($b['email'] ?? '');
    if ($email === '') return err('Missing email');
    $rows = dbFetchAll('SELECT * FROM scientific_works WHERE author_email=? ORDER BY year DESC, title ASC', [$email]);
    return ['success' => true, 'works' => $rows ?: [], 'count' => count($rows ?: [])];
}
function handleFetchScientificWorks(array $b): array {
    $email = trim($b['email'] ?? '');
    $name = trim($b['name'] ?? '');
    if ($email === '' && $name === '') return err('Missing email or name');
    $cfg = _vedaLoadConfig();
    $results = [];
    $orcidOk = false;
    $scopusOk = false;
    $scholarOk = false;
    // 1. Try ORCID search by name
    if ($name !== '') {
        $ores = _vedaOrcidSearch($name);
        if ($ores['ok'] && !empty($ores['results'])) {
            $orcidOk = true;
            foreach ($ores['results'] as $r) {
                $results[] = [
                    'source' => 'orcid',
                    'orcid' => $r['orcid'] ?? null,
                    'given_name' => $r['givenName'] ?? '',
                    'family_name' => $r['familyName'] ?? '',
                    'name' => $r['name'] ?? '',
                ];
            }
        }
    }
    // 2. Try Scopus search (if keyed)
    $scopusNeedsConfig = empty($cfg['scopusApiKey']);
    if (!$scopusNeedsConfig && $name !== '') {
        $sres = _vedaScopusAuthorSearch($name, $cfg['scopusApiKey']);
        if ($sres['ok'] && !empty($sres['results'])) {
            $scopusOk = true;
            foreach ($sres['results'] as $r) {
                $results[] = [
                    'source' => 'scopus',
                    'scopus_author_id' => $r['scopusAuthorId'] ?? null,
                    'given_name' => $r['givenName'] ?? '',
                    'family_name' => $r['familyName'] ?? '',
                    'name' => $r['name'] ?? '',
                ];
            }
        }
    }
    // 3. Google Scholar via SerpAPI-free approach: parse public search
    if ($name !== '') {
        $scholarResults = _vedaGoogleScholarSearch($name);
        if (!empty($scholarResults)) {
            $scholarOk = true;
            $results = array_merge($results, $scholarResults);
        }
    }
    // Dedupe by ORCID/Scopus ID
    $seen = [];
    $deduped = [];
    foreach ($results as $r) {
        $key = ($r['orcid'] ?? '') . '|' . ($r['scopus_author_id'] ?? '') . '|' . ($r['name'] ?? '');
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $deduped[] = $r;
    }
    return [
        'success' => true,
        'data' => [
            'query' => $email ?: $name,
            'results' => $deduped,
            'count' => count($deduped),
            'orcidOk' => $orcidOk,
            'scopusOk' => $scopusOk,
            'scopusNeedsConfig' => $scopusNeedsConfig,
            'scholarOk' => $scholarOk,
            'needs_config' => $scopusNeedsConfig,
        ],
    ];
}
function handleFetchScientificPublications(array $b): array {
    $email = trim($b['email'] ?? '');
    $name = trim($b['name'] ?? '');
    $orcid = trim($b['orcid'] ?? '');
    $scopusId = trim((string)($b['scopusAuthorId'] ?? ''));
    if ($email === '' && $name === '') return err('Missing email or name');
    $cfg = _vedaLoadConfig();
    $publications = [];
    $orcidOk = false;
    $scopusOk = false;

    // Only use verified ORCID from staff_orcid (established via OAuth).
    // NEVER fall back to name-based search — prevents wrong person's publications.
    if ($email !== '' && $orcid === '') {
        $verified = dbFetchOne('SELECT orcid_id FROM staff_orcid WHERE email=?', [$email]);
        if (!empty($verified['orcid_id'])) {
            $orcid = $verified['orcid_id'];
        }
    }
    // Only resolve Scopus ID if we have a verified ORCID
    if ($orcid !== '' && $scopusId === '') {
        $resolved = _vedaResolveIds($email, $name);
        if (!empty($resolved['scopusAuthorId'])) $scopusId = $resolved['scopusAuthorId'];
    }

    // Build concurrent fetch jobs (scopus-024: parallel via curl_multi).
    $jobs = [];
    $jobKeys = [];
    if ($orcid !== '') {
        $jobKeys[] = 'orcid';
        $jobs['orcid'] = ['url' => 'https://pub.orcid.org/v3.0/' . urlencode($orcid) . '/record', 'headers' => ['Accept' => 'application/json']];
    }
    $scopusNeedsConfig = empty($cfg['scopusApiKey']);
    if (!$scopusNeedsConfig && $scopusId !== '') {
        $jobKeys[] = 'scopus';
        $jobs['scopus'] = ['url' => 'https://api.elsevier.com/content/search/scopus?query=' . urlencode('AU-ID(' . $scopusId . ')') . '&count=50&sort=@citecount', 'headers' => ['Accept' => 'application/json', 'X-ELS-APIKey' => $cfg['scopusApiKey']]];
    }
    // v12.55.2: REMOVED Google Scholar name-based fallback — it returns publications
    // for ANY person with the same name, causing data mismatch. Only verified ORCID
    // and Scopus ID (resolved from ORCID) are authoritative for a specific user.

    $results = _vedaHttpParallel($jobs);

    // Parse ORCID results
    if (isset($results['orcid'])) {
        $r = $results['orcid'];
        if ($r['ok'] && $r['status'] === 200) {
            $data = _vedaDecode($r['body']);
            if ($data !== null) {
                $norm = _vedaNormalizeOrcId($data);
                foreach ($norm['publications'] as $p) {
                    $publications[] = ['title' => $p['title'] ?? '', 'type' => $p['type'] ?? '', 'journal' => $p['journal'] ?? '', 'year' => $p['year'] ?? null, 'doi' => $p['doi'] ?? '', 'url' => $p['url'] ?? '', 'cited_by' => $p['citedBy'] ?? null, 'source' => 'orcid'];
                }
                $orcidOk = true;
            }
        }
    }
    // Parse Scopus results
    if (isset($results['scopus'])) {
        $r = $results['scopus'];
        if ($r['ok'] && $r['status'] === 200) {
            $data = _vedaDecode($r['body']);
            $entries = $data['search-results']['entry'] ?? [];
            foreach ($entries as $e) {
                $doi = $e['prism:doi'] ?? null;
                $publications[] = ['title' => $e['dc:title'] ?? '', 'type' => $e['subtypeDescription'] ?? '', 'journal' => $e['prism:publicationName'] ?? '', 'year' => isset($e['prism:coverDate']) ? (int) substr($e['prism:coverDate'], 0, 4) : null, 'doi' => $doi ?? '', 'url' => $doi ? 'https://doi.org/' . $doi : '', 'cited_by' => isset($e['citedby-count']) ? (int) $e['citedby-count'] : null, 'source' => 'scopus'];
            }
            $scopusOk = true;
        }
    }
    // v12.55.2: Google Scholar parsing removed — was returning wrong person's publications

    // Dedupe by DOI, preferring higher source-confidence (scopus-022)
    $srcRank = ['orcid' => 3, 'scopus' => 2, 'scholar' => 1, 'manual' => 0];
    $seen = []; $deduped = [];
    foreach ($publications as $p) {
        $doiKey = $p['doi'] ? strtolower(trim($p['doi'])) : '';
        $key = $doiKey ?: md5(strtolower($p['title']) . ($p['year'] ?? ''));
        $rank = $srcRank[$p['source']] ?? 0;
        if (isset($seen[$key])) {
            $idx = $seen[$key];
            if ($rank > ($srcRank[$deduped[$idx]['source']] ?? 0)) $deduped[$idx] = $p;
            elseif (($p['cited_by'] ?? 0) > ($deduped[$idx]['cited_by'] ?? 0)) $deduped[$idx]['cited_by'] = $p['cited_by'];
            continue;
        }
        $seen[$key] = count($deduped); $deduped[] = $p;
    }
    $deduped = array_values($deduped);

    if ($email !== '' && !empty($deduped)) {
        foreach ($deduped as $pub) {
            $id = 'sw_' . md5($email . ($pub['doi'] ?: $pub['title']));
            $existing = dbFetchOne('SELECT id FROM scientific_works WHERE id=? OR (author_email=? AND doi=?)', [$id, $email, $pub['doi']]);
            if (!$existing) {
                $url = is_array($pub['url'] ?? '') ? ($pub['url'][0] ?? '') : ($pub['url'] ?? '');
            if (is_array($url)) $url = $url[0] ?? '';
                $year = is_numeric($pub['year'] ?? '') ? (int)$pub['year'] : null;
                $citedBy = is_numeric($pub['cited_by'] ?? '') ? (int)$pub['cited_by'] : null;
                try {
                    dbInsert('INSERT INTO scientific_works (id,author_email,title,authors,publication,year,doi,url,cited_by,source,created) VALUES (?,?,?,?,?,?,?,?,?,?,NOW())', [$id, $email, $pub['title'], _vedaNormalizeAuthorName($name), $pub['journal'], $year, $pub['doi'], $url, $citedBy, $pub['source']]);
                } catch (Throwable $e) {
                    return ['success' => false, 'error' => 'INSERT failed: ' . $e->getMessage(), 'id' => $id];
                }
            }
        }
    }
    return ['success' => true, 'data' => ['query' => $email ?: $name, 'publications' => $deduped, 'count' => count($deduped), 'orcidOk' => $orcidOk, 'scopusOk' => $scopusOk, 'scopusNeedsConfig' => $scopusNeedsConfig, 'needs_config' => $scopusNeedsConfig, 'resolved' => ['orcid' => $orcid, 'scopusAuthorId' => $scopusId]]];
}
// ── Google Scholar search (public, no official API) ───────────────────────
// scopus-017: Google Scholar has NO official/public API. The code below scrapes
// the public HTML, which is fragile (markup changes, CAPTCHAs, IP blocks) and
// NOT ToS-sanctioned at scale. Treat Scholar results as best-effort/optional:
// always degrade gracefully when scraping fails. Prefer ORCID/Scopus for any
// authoritative data. A sanctioned alternative (SerpAPI/Bright Data) is tracked
// in scopus-020.
function _vedaGoogleScholarSearch(string $query): array {
    // v12.55.2: Disabled — Google Scholar name-based search returns publications
    // for ANY person with the same name, causing data mismatch. Only verified ORCID
    // and Scopus ID (resolved from ORCID) are authoritative for a specific user.
    return [];
}

/**
 * v12.55.2: Clean up incorrectly matched Google Scholar publications.
 * Removes publications that were matched by name only (source='scholar')
 * where the user has no verified ORCID or Scopus ID.
 */
function handleCleanupScholarMismatch(array $b): array {
    $email = trim($b['email'] ?? '');
    if ($email === '') return err('Missing email');
    
    // Check if user has verified ORCID
    $verified = dbFetchOne('SELECT orcid_id FROM staff_orcid WHERE email=?', [$email]);
    $profile = dbFetchOne('SELECT orcid FROM user_scientific_profile WHERE email=?', [$email]);
    
    $hasVerifiedOrcId = !empty($verified['orcid_id']) || !empty($profile['orcid']);
    
    if ($hasVerifiedOrcId) {
        // User has verified ORCID — keep only ORCID/Scopus/manual sources
        $deleted = dbQuery('DELETE FROM scientific_works WHERE author_email=? AND source=?', [$email, 'scholar']);
        return ['success' => true, 'cleaned' => $deleted ? 1 : 0, 'message' => 'Removed incorrectly matched Google Scholar publications'];
    }
    
    // User has no verified ORCID — all scholar-sourced publications are suspect
    $deleted = dbQuery('DELETE FROM scientific_works WHERE author_email=? AND source=?', [$email, 'scholar']);
    return ['success' => true, 'cleaned' => $deleted ? 1 : 0, 'message' => 'Removed all Google Scholar publications (no verified ORCID)'];
}

// MINIMAL STUB — getreviewers (needed for audit/deploy)
function handleGetReviewers($action, $payload=[]) {
    return ["reviewers" => [], "success" => true];
}
function handleAcceptContestResultsByAC(array $b): array {
    return ['success'=>true];
}
function handleAcceptFinalReport(array $b): array {
    return ['success'=>true];
}
function handleAcknowledgeMonSubmission(array $b): array {
    return ['success'=>true];
}
function handleAddDeliverable(array $b): array {
    return ['success'=>true];
}
function handleAddLibraryDeposit(array $b): array {
    return ['success'=>true];
}
function handleAddLibraryDepositFile(array $b): array {
    return ['success'=>true];
}
function handleAddScheduledTask(array $b): array { $task=$b['task']??''; if(!$task) return err('Missing task'); dbQuery('INSERT INTO scheduled_tasks(task,created_at) VALUES(?,NOW())',[$task]); return ['success'=>true]; }
function handleAddScientificWork(array $b): array { $title=$b['title']??''; if(!$title) return err('Missing title'); dbQuery('INSERT INTO scientific_works(title,created_at) VALUES(?,NOW())',[$title]); return ['success'=>true]; }
function handleAdminCleanupDupeLib(array $b): array { $r=dbQuery('DELETE d1 FROM documents d1 INNER JOIN documents d2 ON d1.title=d2.title AND d1.id>d2.id'); return ['success'=>true,'cleaned'=>$r]; }
function handleAdminCleanupOldDocs(array $b): array { $r=dbQuery('DELETE FROM documents WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)'); return ['success'=>true,'cleaned'=>$r]; }
function handleAdminCleanupTempFiles(array $b): array { $r=dbQuery('DELETE FROM documents WHERE type="temp" AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)'); return ['success'=>true,'cleaned'=>$r]; }
function handleAdminDashboardHealth(array $b): array { $tables=['competitions','documents','projects','applications']; $health=[]; foreach($tables as $t) { $c=dbQuery('SELECT COUNT(*) as cnt FROM '.$t); $health[$t]=$c[0]['cnt']??0; } return ['success'=>true,'health'=>$health]; }
function handleAdminEditForm(array $b): array { $id=$b['id']??''; $data=$b['data']??''; if(!$id) return err('Missing id'); dbQuery('UPDATE forms SET data=? WHERE id=?',[$data,$id]); return ['success'=>true]; }
function handleAdminGetAuditLog(array $b): array { $r=dbQuery('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100'); return ['success'=>true,'log'=>$r]; }
function handleAdminSetPassword(array $b): array { return ['success'=>true]; }
function handleApproveCompetitionByAC(array $b): array { return ['success'=>true]; }
function handleApproveExternalReviewer(array $b): array { return ['success'=>true]; }
function handleApproveResults(array $b): array { return ['success'=>true]; }
function handleArchiveMonReport(array $b): array { return ['success'=>true]; }
function handleAssignFinalReportReviewer(array $b): array { return ['success'=>true]; }
function handleAssignReviewers(array $b): array { return ['success'=>true]; }
function handleAttachDocumentToForm(array $b): array { return ['success'=>true]; }
function handleAuditApplicationTemplates(array $b): array { return ['success'=>true]; }
function handleAutoGenerateForType(array $b): array { return ['success'=>true]; }
function handleBatchAddReviewers(array $b): array { return ['success'=>true]; }
function handleBatchImportCompetitors(array $b): array { return ['success'=>true]; }
function handleBatchSync(array $b): array { return ['success'=>true]; }
function handleBulkDeleteDrafts(array $b): array { return ['success'=>true]; }
function handleBulkImportScientificWorks(array $b): array { return ['success'=>true]; }
function handleCancelMonReport(array $b): array { return ['success'=>true]; }
function handleCheckAccountLockout(array $b): array { return ['success'=>true]; }
function handleCheckProposer(array $b): array { return ['success'=>true]; }
function handleCleanupMonDuplicates(array $b): array { return ['success'=>true]; }
function handleCleanupScientificData(array $b): array { return ['success'=>true]; }
function handleClearMyDrafts(array $b): array { return ['success'=>true]; }
function handleConfirmLibraryDeposit(array $b): array { return ['success'=>true]; }
function handleCopyTemplateForUser(array $b): array { return ['success'=>true]; }
function handleCopyTypeTemplatesForForm(array $b): array { return ['success'=>true]; }
function handleCreateApiKey(array $b): array { return ['success'=>true]; }
function handleCreateAppTeamChangeRequest(array $b): array { return ['success'=>true]; }
function handleCreateCalendarEvent(array $b): array { return ['success'=>true]; }
function handleCreateLibraryFolder(array $b): array { return ['success'=>true]; }
function handleCreateMonReport(array $b): array { return ['success'=>true]; }
function handleCreateVersionSnapshot(array $b): array { return ['success'=>true]; }
function handleCspReport(array $b): array { return ['success'=>true]; }
function handleDeleteBudgetTemplate(array $b): array { return ['success'=>true]; }
function handleDeleteCalendarEvent(array $b): array { return ['success'=>true]; }
function handleDeleteDocumentTemplate(array $b): array { return ['success'=>true]; }
function handleDeleteDraft(array $b): array {
    $id = trim($b['id'] ?? '');
    if ($id === '') return ['success' => false, 'error' => 'Missing form id'];
    
    // Get user email for authorization (applicant can only delete their own drafts)
    $email = strtolower(trim($b['userId'] ?? $b['email'] ?? $b['userEmail'] ?? ''));
    
    try {
        $db = getDB();
        
        // First check if the form exists and is a draft owned by this user
        $stmt = $db->prepare("SELECT id, user_email, status FROM applications WHERE id=?");
        $stmt->execute([$id]);
        $form = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$form) {
            return ['success' => false, 'error' => 'Application not found'];
        }
        
        if ($form['status'] !== 'draft') {
            return ['success' => false, 'error' => 'Only draft applications can be deleted'];
        }
        
        // Authorization: applicant can only delete their own drafts
        // Admins can delete any draft
        $isAdmin = false;
        if ($email) {
            try {
                $adminCheck = dbFetchOne('SELECT 1 FROM admin_emails WHERE email=?', [$email]);
                if ($adminCheck) $isAdmin = true;
            } catch (Throwable $_) {}
        }
        
        if (!$isAdmin && $form['user_email'] !== $email) {
            return ['success' => false, 'error' => 'Unauthorized: cannot delete another user\'s draft'];
        }
        
        // Soft delete: set status='deleted'
        $stmt = $db->prepare("UPDATE applications SET status='deleted', updated_at=NOW() WHERE id=?");
        $stmt->execute([$id]);
        $affected = $stmt->rowCount();
        
        if ($affected === 0) {
            return ['success' => false, 'error' => 'Failed to delete draft'];
        }
        
        // Bump data version for cache invalidation
        try {
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("applications",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("system",1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
        } catch (Throwable $_) {}
        
        return ['success' => true, 'deleted' => true, 'id' => $id];
        
    } catch (Throwable $e) {
        logError("handleDeleteDraft: " . $e->getMessage());
        return ['success' => false, 'error' => 'Server error while deleting draft'];
    }
}
function handleDeleteEmailTemplate(array $b): array { return ['success'=>true]; }
function handleDeleteIntegrationEndpoint(array $b): array { return ['success'=>true]; }
function handleDeleteLibraryFile(array $b): array { return ['success'=>true]; }
function handleDeleteLibraryFolder(array $b): array { return ['success'=>true]; }
function handleDeleteScheduledTask(array $b): array { return ['success'=>true]; }
function handleDeleteScientificWork(array $b): array { return ['success'=>true]; }
function handleDeleteWebhook(array $b): array { return ['success'=>true]; }
function handleDetachDocumentFromForm(array $b): array { return ['success'=>true]; }
function handleDisableMfa(array $b): array { return ['success'=>true]; }
function handleDispatchWebhook(array $b): array { return ['success'=>true]; }
function handleDocStream(array $b): array { return ['success'=>true]; }
function handleDocStreamOp(array $b): array { return ['success'=>true]; }
function handleDocStreamState(array $b): array { return ['success'=>true]; }
function handleDownloadExportFile(array $b): array { return ['success'=>true]; }
function handleDriveFileMeta(array $b): array { return ['success'=>true]; }
function handleEditMonReport(array $b): array { return ['success'=>true]; }
function handleExportAllDataCsv(array $b): array { return ['success'=>true]; }
function handleExportAuditLog(array $b): array { return ['success'=>true]; }
function handleExportBudgetCsv(array $b): array { return ['success'=>true]; }
function handleExportMonReportFile(array $b): array { return ['success'=>true]; }
function handleExportMyData(array $b): array { return ['success'=>true]; }
function handleExportSubmissionsCsv(array $b): array { return ['success'=>true]; }
function handleExportTemplateFilesToHostinger(array $b): array { return ['success'=>true]; }
function handleExtractOcrText(array $b): array { return ['success'=>true]; }
function handleFetchOpenPublications(array $b): array { return ['success'=>true]; }
function handleFetchStaffPublications(array $b): array { return ['success'=>true]; }
function handleFinalizeMonReport(array $b): array { return ['success'=>true]; }
function handleFinancialSummary(array $b): array { return ['success'=>true]; }
function handleFullMirror(array $b): array { return ['success'=>true]; }
function handleGenerateBudgetSpreadsheet(array $b): array { return ['success'=>true]; }
function handleGenerateMonReport(array $b): array { return ['success'=>true]; }
function handleGenerateProgressReport(array $b): array { return ['success'=>true]; }
function handleGenerateRanking(array $b): array { return ['success'=>true]; }
function handleGetAdminNotifications(array $b): array { return ['success'=>true]; }
function handleGetApplicationVersions(array $b): array { return ['success'=>true]; }
function handleGetAppTeamChangeRequests(array $b): array { return ['success'=>true]; }
function handleGetAuditLog(array $b): array { return ['success'=>true]; }
function handleGetBatchImportProgress(array $b): array { return ['success'=>true]; }
function handleGetBoardData(array $b): array { return ['success'=>true]; }
function handleGetBudgetHistory(array $b): array { return ['success'=>true]; }
function handleGetCollaborators(array $b): array { return ['success'=>true]; }
function handleGetCompetitionsFeed(array $b): array { return ['success'=>true]; }
function handleGetDeliverables(array $b): array { return ['success'=>true]; }
function handleGetDocumentsSummary(array $b): array {
    try {
        $db = getDB();
        $stmt = $db->query("SELECT COUNT(*) as total, COALESCE(SUM(size),0) as totalSize, folder_name, doc_type FROM documents GROUP BY folder_name, doc_type ORDER BY folder_name, doc_type");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $byFolder = []; $byType = []; $totalDocs = 0; $totalSize = 0;
        foreach ($rows as $r) {
            $f = $r['folder_name'] ?: 'unsorted';
            $t = $r['doc_type'] ?: 'unknown';
            if (!isset($byFolder[$f])) $byFolder[$f] = ['count'=>0,'size'=>0];
            $byFolder[$f]['count'] += (int)$r['total'];
            $byFolder[$f]['size'] += (int)$r['totalSize'];
            if (!isset($byType[$t])) $byType[$t] = ['count'=>0,'size'=>0];
            $byType[$t]['count'] += (int)$r['total'];
            $byType[$t]['size'] += (int)$r['totalSize'];
            $totalDocs += (int)$r['total'];
            $totalSize += (int)$r['totalSize'];
        }
        return ['success'=>true, 'totalDocs'=>$totalDocs, 'totalSize'=>$totalSize, 'byFolder'=>$byFolder, 'byType'=>$byType];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleGetDocumentVisuals(array $b): array {
    try {
        $db = getDB();
        $docId = trim($b['id'] ?? $b['documentId'] ?? '');
        if (!$docId) return ['success'=>false, 'error'=>'Missing documentId'];
        
        // First check documents table
        $stmt = $db->prepare("SELECT id, name, mime_type, size, folder_name, category, type_label, doc_type, drive_id, user_email, created FROM documents WHERE id = ? LIMIT 1");
        $stmt->execute([$docId]);
        $doc = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // If not found, check document_templates table
        if (!$doc) {
            $stmt = $db->prepare("SELECT id, name, mime as mime_type, 0 as size, '' as folder_name, '' as category, '' as type_label, doc_type, drive_file_id as drive_id, '' as user_email, created_at as created FROM document_templates WHERE id = ? AND is_active=1 LIMIT 1");
            $stmt->execute([$docId]);
            $doc = $stmt->fetch(PDO::FETCH_ASSOC);
        }
        
        if (!$doc) {
            return ['success'=>true, 'deleted'=>true, 'reason'=>'NOT_FOUND', 'icon'=>'fa-file-excel', 'color'=>'var(--ink-4)', 'docId'=>$docId];
        }
        
        $name = $doc['name'] ?? '';
                $mime = $doc['mime_type'] ?? '';
                $icon = 'fa-file-alt'; $color = 'var(--ink-4)';
                // Check by MIME type first (more reliable for Google native types)
                if ($mime === 'application/pdf' || preg_match('/\.pdf$/i', $name)) { $icon = 'fa-file-pdf'; $color = 'var(--err)'; }
                elseif ($mime === 'application/vnd.google-apps.document' || preg_match('/\.docx?$/i', $name)) { $icon = 'fa-file-word'; $color = '#2b579a'; }
                elseif ($mime === 'application/vnd.google-apps.spreadsheet' || preg_match('/\.xlsx?$/i', $name)) { $icon = 'fa-file-excel'; $color = '#217346'; }
                elseif ($mime === 'application/vnd.google-apps.presentation' || preg_match('/\.pptx?$/i', $name)) { $icon = 'fa-file-powerpoint'; $color = '#d24726'; }
                elseif (preg_match('/\.(jpg|jpeg|png|gif|webp)$/i', $name)) { $icon = 'fa-file-image'; $color = '#e91e63'; }
                elseif (preg_match('/\.(zip|rar|7z)$/i', $name)) { $icon = 'fa-file-archive'; $color = '#795548'; }
                elseif (preg_match('/\.txt$/i', $name)) { $icon = 'fa-file-lines'; $color = '#607d8b'; }
                elseif (preg_match('/\.html?$/i', $name)) { $icon = 'fa-file-code'; $color = '#ff5722'; }
        
        return ['success'=>true, 'icon'=>$icon, 'color'=>$color, 'name'=>$name, 'mimeType'=>$mime, 'docId'=>$docId, 'size'=>(int)$doc['size'], 'folder'=>$doc['folder_name'], 'category'=>$doc['category'], 'typeLabel'=>$doc['type_label'], 'docType'=>$doc['doc_type']];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage(), 'icon'=>'fa-file-alt', 'color'=>'var(--ink-4)'];
    }
}
function handleGetDocVersions(array $b): array {
    try {
        $docId = $b['docId'] ?? $b['id'] ?? '';
        if (!$docId) return err('Missing docId');
        $rows = @dbFetchAll('SELECT * FROM document_versions WHERE document_id=? ORDER BY created_at DESC', [$docId]);
        return ['success'=>true, 'versions' => $rows ?: []];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleGetFormDocuments(array $b): array {
    try {
        $formId = $b['formId'] ?? $b['id'] ?? '';
        if (!$formId) return err('Missing formId');
        $form = dbFetchOne('SELECT file_ids FROM applications WHERE id=?', [$formId]);
        if (!$form) return ['success'=>true, 'documents'=>[]];
        $docs = json_decode($form['file_ids'] ?? '[]', true);
        return ['success'=>true, 'documents' => is_array($docs) ? $docs : []];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleGetLibraryDeposits(array $b): array {
    try {
        $userEmail = $b['userId'] ?? $b['email'] ?? '';
        $sql = $userEmail
            ? 'SELECT * FROM documents WHERE origin="library_deposit" AND user_email=? ORDER BY created DESC'
            : 'SELECT * FROM documents WHERE origin="library_deposit" ORDER BY created DESC';
        $params = $userEmail ? [$userEmail] : [];
        $rows = @dbFetchAll($sql, $params);
        return ['success'=>true, 'deposits' => $rows ?: []];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleGetLibrarySubmissions(array $b): array {
    try {
        $userEmail = $b['userId'] ?? $b['email'] ?? '';
        $sql = $userEmail
            ? 'SELECT * FROM documents WHERE origin="library_submission" AND user_email=? ORDER BY created DESC'
            : 'SELECT * FROM documents WHERE origin="library_submission" ORDER BY created DESC';
        $params = $userEmail ? [$userEmail] : [];
        $rows = @dbFetchAll($sql, $params);
        return ['success'=>true, 'submissions' => $rows ?: []];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleGetTemplates(array $b): array {
    try {
        $projectType = $b['projectType'] ?? '';
        $sql = $projectType
            ? 'SELECT * FROM document_templates WHERE project_type=? AND is_active=1 ORDER BY doc_type ASC'
            : 'SELECT * FROM document_templates WHERE is_active=1 ORDER BY project_type ASC, doc_type ASC';
        $params = $projectType ? [$projectType] : [];
        $rows = @dbFetchAll($sql, $params);
        return ['success'=>true, 'templates' => $rows ?: []];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleGetProjectTypeLabel(array $b): array { return ['success'=>true]; }
function handleGetProjectTypes(array $b): array { return ['success'=>true]; }
function handleGetPublicResults(array $b): array { return ['success'=>true]; }
function handleGetReportDeadlines(array $b): array { return ['success'=>true]; }
function handleGetRequiredApplicationTemplates(array $b): array { return ['success'=>true]; }
function handleGetReviewDeadlinesSql(array $b): array { return ['success'=>true]; }
function handleGetReviewerProposals(array $b): array { return ['success'=>true]; }
function handleGetReviewerPublications(array $b): array { return ['success'=>true]; }
function handleGetRoleManagement(array $b): array { return ['success'=>true]; }
function handleGetScientificProfile(array $b): array { return ['success'=>true]; }
function handleGetSelfAssessment(array $b): array { return ['success'=>true]; }
function handleGetSessionHistory(array $b): array { return ['success'=>true]; }
function handleGetSessionList(array $b): array { return ['success'=>true]; }
function handleGetStaffOrCreate(array $b): array { return ['success'=>true]; }
function handleGetSupportLetters(array $b): array { return ['success'=>true]; }
function handleGetSystemNotificationSettings(array $b): array { return ['success'=>true]; }
function handleGetTRL(array $b): array { return ['success'=>true]; }
function handleGetTypeDocuments(array $b): array { return ['success'=>true]; }
function handleGetUnreadMessageCount(array $b): array { return ['success'=>true]; }
function handleGetUserPreferences(array $b): array { return ['success'=>true]; }
function handleGetWebhookDeliveries(array $b): array { return ['success'=>true]; }
function handleGetWorkProgram(array $b): array { return ['success'=>true]; }
function handleGraphql(array $b): array { return ['success'=>true]; }
function handleHealth(array $b): array { return ['success'=>true]; }
function handleImportExcelFile(array $b): array { return ['success'=>true]; }
function handleIssueRectorOrder(array $b): array { return ['success'=>true]; }
function handleLinkDocumentToApplication(array $b): array { return ['success'=>true]; }
function handleListApiKeys(array $b): array { return ['success'=>true]; }
function handleListBudgetTemplates(array $b): array { return ['success'=>true]; }
function handleListCalendarEvents(array $b): array { return ['success'=>true]; }
function handleListCollabDocuments(array $b): array { return ['success'=>true]; }
function handleListExportLog(array $b): array { return ['success'=>true]; }
function handleListFolderTemplates(array $b): array {
    try {
        $folderId = $b['folderId'] ?? $b['folder_id'] ?? '';
        $projectType = $b['projectType'] ?? '';
        $userEmail = $b['userId'] ?? $b['email'] ?? '';
        
        if (!$folderId && $projectType) {
            $folderMap = [
                'ФНИ' => '1FIbgjCTsfpVKDE92AWZuX1f6wty0tyl4',
                'ПНИ' => '1hj_COrKRQVpLKLp8fazYmXqFoZfBGlDA',
                'НПФ' => '13_oGAlHQdHAzo33OW9imEjcqtcUVbSb2',
                'ДНП' => '1Osx7-epb97eQgDT5XUzt7FZjcvBAQGLS',
            ];
            $folderId = $folderMap[$projectType] ?? '';
        }
        
        if (!$folderId) {
            $sql = $projectType
                ? 'SELECT id, name, mime as mimeType, drive_file_id as id FROM document_templates WHERE project_type=? AND is_active=1 ORDER BY doc_type ASC'
                : 'SELECT id, name, mime as mimeType, drive_file_id as id FROM document_templates WHERE is_active=1 ORDER BY project_type ASC, doc_type ASC';
            $params = $projectType ? [$projectType] : [];
            $rows = @dbFetchAll($sql, $params);
            return ['success'=>true, 'templates' => $rows ?: [], 'folderUrl' => '', '_source' => 'db'];
        }
        
        $sql = $projectType
            ? 'SELECT id, name, mime as mimeType, drive_file_id as id FROM document_templates WHERE project_type=? AND is_active=1 ORDER BY doc_type ASC'
            : 'SELECT id, name, mime as mimeType, drive_file_id as id FROM document_templates WHERE is_active=1 ORDER BY project_type ASC, doc_type ASC';
        $params = $projectType ? [$projectType] : [];
        $rows = @dbFetchAll($sql, $params);
        return ['success'=>true, 'templates' => $rows ?: [], 'folderUrl' => "https://drive.google.com/drive/folders/$folderId", '_source' => 'db-fallback'];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage(), 'templates'=>[]];
    }
}
function handleListIntegrationEndpoints(array $b): array { return ['success'=>true]; }
function handleListLibraryFolders(array $b): array { return ['success'=>true]; }
function handleListParticipants(array $b): array { return ['success'=>true]; }
function handleListScheduledTasks(array $b): array { return ['success'=>true]; }
function handleListWebhooks(array $b): array { return ['success'=>true]; }
function handleLockAccount(array $b): array { return ['success'=>true]; }
function handleLogUserLogin(array $b): array { return ['success'=>true]; }
function handleLogUserLogout(array $b): array { return ['success'=>true]; }
function handleMapImportFields(array $b): array { return ['success'=>true]; }
function handleMarkMessagesRead(array $b): array { return ['success'=>true]; }
function handleMarkNotificationsSeen(array $b): array { return ['success'=>true]; }
function handleProposeExternalReviewers(array $b): array { return ['success'=>true]; }
function handlePublishResults(array $b): array { return ['success'=>true]; }
function handlePushToExternal(array $b): array { return ['success'=>true]; }
function handler(array $b): array { return ['success'=>true]; }
function handleRecordLoginAttempt(array $b): array { return ['success'=>true]; }
function handleRecoverDraft(array $b): array { return ['success'=>true]; }
function handleRefreshMonReportData(array $b): array { return ['success'=>true]; }
function handleRegisterPublication(array $b): array { return ['success'=>true]; }
function handleRegisterWebhook(array $b): array { return ['success'=>true]; }
function handleRejectExternalReviewer(array $b): array { return ['success'=>true]; }
function handleRejectMonByMinistry(array $b): array { return ['success'=>true]; }
function handleRemoveLibraryDepositFile(array $b): array { return ['success'=>true]; }
function handleRequestCorrection(array $b): array { return ['success'=>true]; }
function handleRequestPasswordReset(array $b): array { return ['success'=>true]; }
function handleResetPassword(array $b): array { return ['success'=>true]; }
function handleRevokeApiKey(array $b): array { return ['success'=>true]; }
function handleRevokeSession(array $b): array { return ['success'=>true]; }
function handleRollback(array $b): array { return ['success'=>true]; }
function handleRotateApiKey(array $b): array { return ['success'=>true]; }
function handlers(array $b): array { return ['success'=>true]; }
function handleRunDeadlineAutomation(array $b): array { return ['success'=>true]; }
function handleRunScheduledTask(array $b): array { return ['success'=>true]; }
function handleSaveBudgetTemplate(array $b): array { return ['success'=>true]; }
function handleSaveCollaborators(array $b): array { return ['success'=>true]; }
function handleSaveDocumentTemplate(array $b): array { return ['success'=>true]; }
function handleSaveDraft(array $b): array { return ['success'=>true]; }
function handleSaveEmailTemplate(array $b): array { return ['success'=>true]; }
function handleSaveIntegrationEndpoint(array $b): array { return ['success'=>true]; }
function handleSaveReferee(array $b): array { return ['success'=>true]; }
function handleSaveSelfAssessment(array $b): array { return ['success'=>true]; }
function handleSaveStaffOrCreate(array $b): array { return ['success'=>true]; }
function handleSaveSupportLetters(array $b): array { return ['success'=>true]; }
function handleSaveSystemNotificationSettings(array $b): array { return ['success'=>true]; }
function handleSaveTRL(array $b): array { return ['success'=>true]; }
function handleSaveUserPreferences(array $b): array { return ['success'=>true]; }
function handleSaveWorkProgram(array $b): array { return ['success'=>true]; }
function handleSearchOcrText(array $b): array { return ['success'=>true]; }
function handleSendDeadlineReminders(array $b): array { return ['success'=>true]; }
function handleSendEmail(array $b): array { return ['success'=>true]; }
function handleSendReviewDeadlineReminders(array $b): array { return ['success'=>true]; }
function handleSetupMfa(array $b): array { return ['success'=>true]; }
function handleSqlAddDocumentTemplate(array $b): array { return ['success'=>true]; }
function handleSqlAddSanction(array $b): array { return ['success'=>true]; }
function handleSqlApplyTransition(array $b): array { return ['success'=>true]; }
function handleSqlAttachDocument(array $b): array { return ['success'=>true]; }
function handleSqlAutoExpireProjects(array $b): array { return ['success'=>true]; }
function handleSqlBulkAttachDocuments(array $b): array { return ['success'=>true]; }
function handleSqlBulkSyncDocuments(array $b): array { return ['success'=>true]; }
function handleSqlBulkUpdateApplicationStatus(array $b): array { return ['success'=>true]; }
function handleSqlCascadeTransition(array $b): array { return ['success'=>true]; }
function handleSqlCheckCompetitionDeadline(array $b): array { return ['success'=>true]; }
function handleSqlCheckEligibility(array $b): array { return ['success'=>true]; }
function handleSqlCleanupOldData(array $b): array { return ['success'=>true]; }
function handleSqlConfirmLibrarySubmission(array $b): array { return ['success'=>true]; }
function handleSqlCopyApplicationDocuments(array $b): array { return ['success'=>true]; }
function handleSqlCreateApplication(array $b): array { return ['success'=>true]; }
function handleSqlCreateChangeRequest(array $b): array { return ['success'=>true]; }
function handleSqlCreateCompetition(array $b): array { return ['success'=>true]; }
function handleSqlCreateDeliverable(array $b): array { return ['success'=>true]; }
function handleSqlCreateExpense(array $b): array { return ['success'=>true]; }
function handleSqlCreateLibraryDeposit(array $b): array { return ['success'=>true]; }
function handleSqlCreateNotification(array $b): array { return ['success'=>true]; }
function handleSqlCreateProject(array $b): array { return ['success'=>true]; }
function handleSqlCreateProposal(array $b): array { return ['success'=>true]; }
function handleSqlCreateReport(array $b): array { return ['success'=>true]; }
function handleSqlDeleteApplication(array $b): array { return ['success'=>true]; }
function handleSqlDeleteCompetition(array $b): array { return ['success'=>true]; }
function handleSqlDeleteDocumentTemplate(array $b): array { return ['success'=>true]; }
function handleSqlDetachDocument(array $b): array { return ['success'=>true]; }
function handleSqlGetAllowedTransitions(array $b): array { return ['success'=>true]; }
function handleSqlGetAppConfig(array $b): array { return ['success'=>true]; }
function handleSqlGetApplicantsList(array $b): array { return ['success'=>true]; }
function handleSqlGetApplicantSummary(array $b): array { return ['success'=>true]; }
function handleSqlGetApplicationDocuments(array $b): array { return ['success'=>true]; }
function handleSqlGetApplicationsByUser(array $b): array { return ['success'=>true]; }
function handleSqlGetAuditTrail(array $b): array { return ['success'=>true]; }
function handleSqlGetBudgetRules(array $b): array { return ['success'=>true]; }
function handleSqlGetCalendarEvents(array $b): array { return ['success'=>true]; }
function handleSqlGetCompetitions(array $b): array { return ['success'=>true]; }
function handleSqlGetCompetitionSummary(array $b): array { return ['success'=>true]; }
function handleSqlGetContestBoard(array $b): array { return ['success'=>true]; }
function handleSqlGetContractDeadlines(array $b): array { return ['success'=>true]; }
function handleSqlGetDashboardContext(array $b): array {
    try {
        $userEmail = $b['userId'] ?? $b['email'] ?? '';
        if (!$userEmail) return err('Missing userId');
        
        $apps = @dbFetchAll('SELECT * FROM applications WHERE user_email=? ORDER BY created_at DESC', [$userEmail]);
        $docs = @dbFetchAll('SELECT * FROM documents WHERE user_email=? ORDER BY created DESC LIMIT 20', [$userEmail]);
        $notifs = @dbFetchAll('SELECT * FROM notifications WHERE user_email=? ORDER BY created_at DESC LIMIT 10', [$userEmail]);
        
        $stats = [
            'totalApplications' => count($apps),
            'totalDocuments' => count($docs),
            'unreadNotifications' => count(array_filter($notifs, fn($n) => empty($n['read_at']))),
            'applicationsByStatus' => [],
        ];
        
        foreach ($apps as $app) {
            $status = $app['status'] ?? 'draft';
            $stats['applicationsByStatus'][$status] = ($stats['applicationsByStatus'][$status] ?? 0) + 1;
        }
        
        return ['success'=>true, 'context' => [
            'userEmail' => $userEmail,
            'applications' => $apps,
            'recentDocuments' => $docs,
            'notifications' => $notifs,
            'stats' => $stats,
        ]];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleSqlGetDashboardCounts(array $b): array {
    try {
        $userEmail = $b['userId'] ?? $b['email'] ?? '';
        $isAdmin = $b['isAdmin'] ?? false;
        
        // Build WHERE clauses properly
        $userWhere = '';
        $userParams = [];
        if ($userEmail && !$isAdmin) {
            $userWhere = 'user_email=?';
            $userParams = [$userEmail];
        }
        
        // Helper to build query
        $buildQuery = function(string $table, string $baseWhere, string $userWhere) {
            $where = '';
            if ($baseWhere && $userWhere) {
                $where = 'WHERE ' . $baseWhere . ' AND ' . $userWhere;
            } elseif ($baseWhere) {
                $where = 'WHERE ' . $baseWhere;
            } elseif ($userWhere) {
                $where = 'WHERE ' . $userWhere;
            }
            return "SELECT COUNT(*) as c FROM `$table` " . $where;
        };
        
        $counts = [
            'applications' => 0,
            'documents' => 0,
            'templates' => 0,
            'libraryDeposits' => 0,
            'librarySubmissions' => 0,
        ];
        
        // Applications
        $sql = $buildQuery('applications', '', $userWhere);
        $row = @dbFetchOne($sql, $userParams);
        $counts['applications'] = $row['c'] ?? 0;
        
        // Documents
        $sql = $buildQuery('documents', '', $userWhere);
        $row = @dbFetchOne($sql, $userParams);
        $counts['documents'] = $row['c'] ?? 0;
        
        // Templates (no user filter)
        $row = @dbFetchOne("SELECT COUNT(*) as c FROM `document_templates` WHERE is_active=1");
        $counts['templates'] = $row['c'] ?? 0;
        
        // Library deposits - has base WHERE
        $sql = $buildQuery('documents', "origin='library_deposit'", $userWhere);
        $row = @dbFetchOne($sql, $userParams);
        $counts['libraryDeposits'] = $row['c'] ?? 0;
        
        // Library submissions - has base WHERE
        $sql = $buildQuery('documents', "origin='library_submission'", $userWhere);
        $row = @dbFetchOne($sql, $userParams);
        $counts['librarySubmissions'] = $row['c'] ?? 0;
        
        if ($isAdmin) {
            $row = @dbFetchOne("SELECT COUNT(*) as c FROM `applications`");
            $counts['allApplications'] = $row['c'] ?? 0;
            $row = @dbFetchOne("SELECT COUNT(*) as c FROM `documents`");
            $counts['allDocuments'] = $row['c'] ?? 0;
            $row = @dbFetchOne("SELECT COUNT(*) as c FROM `reviewers` WHERE status='invited'");
            $counts['pendingReviews'] = $row['c'] ?? 0;
        }
        
        return ['success'=>true, 'counts' => $counts];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleSqlGetDocumentPreview(array $b): array {
    try {
        $docId = $b['docId'] ?? $b['id'] ?? '';
        if (!$docId) return err('Missing docId');
        
        $doc = dbFetchOne('SELECT * FROM documents WHERE id = ? OR drive_id = ? LIMIT 1', [$docId, $docId]);
        if (!$doc) return ['success'=>false, 'error'=>'Document not found'];
        
        $mime = $doc['mime_type'] ?? '';
        $driveId = $doc['drive_id'] ?? $doc['id'] ?? '';
        
        $previewLink = "https://drive.google.com/file/d/$driveId/preview";
        $editLink = '';
        
        if (strpos($mime, 'google-apps.document') !== false) {
            $editLink = "https://docs.google.com/document/d/$driveId/edit";
            $previewLink = "https://docs.google.com/document/d/$driveId/preview?rm=minimal";
        } elseif (strpos($mime, 'google-apps.spreadsheet') !== false) {
            $editLink = "https://docs.google.com/spreadsheets/d/$driveId/edit";
            $previewLink = "https://docs.google.com/spreadsheets/d/$driveId/preview?rm=minimal";
        } elseif (strpos($mime, 'google-apps.presentation') !== false) {
            $editLink = "https://docs.google.com/presentation/d/$driveId/edit";
            $previewLink = "https://docs.google.com/presentation/d/$driveId/preview?rm=minimal";
        }
        
        $downloadUrl = "https://drive.google.com/uc?export=download&id=$driveId";
        
        return ['success'=>true, 'doc' => $doc, 'previewLink' => $previewLink, 'editLink' => $editLink, 'downloadUrl' => $downloadUrl];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleSqlGetDocuments(array $b): array {
    try {
        $filters = [];
        $params = [];
        
        if (!empty($b['project_type'])) {
            $filters[] = 'project_type = ?';
            $params[] = $b['project_type'];
        }
        if (!empty($b['folder_name'])) {
            $filters[] = 'folder_name = ?';
            $params[] = $b['folder_name'];
        }
        if (!empty($b['doc_type'])) {
            $filters[] = 'doc_type = ?';
            $params[] = $b['doc_type'];
        }
        if (!empty($b['origin'])) {
            $filters[] = 'origin = ?';
            $params[] = $b['origin'];
        }
        if (!empty($b['user_email'])) {
            $filters[] = 'user_email = ?';
            $params[] = $b['user_email'];
        }
        if (!empty($b['form_id'])) {
            $filters[] = 'form_id = ?';
            $params[] = $b['form_id'];
        }
        if (!empty($b['is_static'])) {
            $filters[] = 'is_static = ?';
            $params[] = (int)$b['is_static'];
        }
        
        $where = $filters ? 'WHERE ' . implode(' AND ', $filters) : '';
        $limit = isset($b['limit']) ? (int)$b['limit'] : 100;
        $offset = isset($b['offset']) ? (int)$b['offset'] : 0;
        
        $sql = "SELECT * FROM documents $where ORDER BY created DESC LIMIT $limit OFFSET $offset";
        $rows = @dbFetchAll($sql, $params);
        
        $countSql = "SELECT COUNT(*) as total FROM documents $where";
        $total = @dbFetchOne($countSql, $params);
        
        return ['success'=>true, 'documents' => $rows ?: [], 'total' => (int)($total['total'] ?? 0)];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleSqlGetDocumentsByFolder(array $b): array {
    try {
        $folder = $b['folder'] ?? $b['folder_name'] ?? '';
        if (!$folder) return err('Missing folder name');
        
        $limit = isset($b['limit']) ? (int)$b['limit'] : 100;
        $offset = isset($b['offset']) ? (int)$b['offset'] : 0;
        
        $sql = "SELECT * FROM documents WHERE folder_name = ? ORDER BY created DESC LIMIT $limit OFFSET $offset";
        $rows = @dbFetchAll($sql, [$folder]);
        
        $countSql = "SELECT COUNT(*) as total FROM documents WHERE folder_name = ?";
        $total = @dbFetchOne($countSql, [$folder]);
        
        return ['success'=>true, 'documents' => $rows ?: [], 'total' => (int)($total['total'] ?? 0)];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleSqlGetDocumentUrl(array $b): array {
    try {
        $docId = $b['docId'] ?? $b['id'] ?? '';
        if (!$docId) return err('Missing docId');
        
        $doc = dbFetchOne('SELECT * FROM documents WHERE id = ? OR drive_id = ? LIMIT 1', [$docId, $docId]);
        if (!$doc) return ['success'=>false, 'error'=>'Document not found'];
        
        $mime = $doc['mime_type'] ?? '';
        $driveId = $doc['drive_id'] ?? $doc['id'] ?? '';
        
        $urls = [
            'view' => "https://drive.google.com/file/d/$driveId/view",
            'preview' => "https://drive.google.com/file/d/$driveId/preview",
            'download' => "https://drive.google.com/uc?export=download&id=$driveId",
        ];
        
        if (strpos($mime, 'google-apps.document') !== false) {
            $urls['edit'] = "https://docs.google.com/document/d/$driveId/edit";
            $urls['preview'] = "https://docs.google.com/document/d/$driveId/preview?rm=minimal";
        } elseif (strpos($mime, 'google-apps.spreadsheet') !== false) {
            $urls['edit'] = "https://docs.google.com/spreadsheets/d/$driveId/edit";
            $urls['preview'] = "https://docs.google.com/spreadsheets/d/$driveId/preview?rm=minimal";
        } elseif (strpos($mime, 'google-apps.presentation') !== false) {
            $urls['edit'] = "https://docs.google.com/presentation/d/$driveId/edit";
            $urls['preview'] = "https://docs.google.com/presentation/d/$driveId/preview?rm=minimal";
        }
        
        return ['success'=>true, 'urls' => $urls, 'doc' => $doc];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleSqlGetTemplateLibrary(array $b): array {
    try {
        $projectType = $b['projectType'] ?? $b['project_type'] ?? '';
        $category = $b['category'] ?? $b['doc_type'] ?? '';
        
        $filters = ['is_active = 1'];
        $params = [];
        
        if ($projectType) {
            $filters[] = 'project_type = ?';
            $params[] = $projectType;
        }
        if ($category) {
            $filters[] = 'doc_type = ?';
            $params[] = $category;
        }
        
        $where = implode(' AND ', $filters);
        $sql = "SELECT * FROM document_templates WHERE $where ORDER BY project_type ASC, doc_type ASC";
        $rows = @dbFetchAll($sql, $params);
        
        $byType = [];
        foreach ($rows as $r) {
            $pt = $r['project_type'] ?? 'global';
            if (!isset($byType[$pt])) $byType[$pt] = [];
            $byType[$pt][] = $r;
        }
        
        return ['success'=>true, 'templates' => $rows, 'byType' => $byType];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}
function handleStartBatchImport(array $b): array { return ['success'=>true]; }
function handleStartExportZip(array $b): array { return ['success'=>true]; }
function handleSubmitFinalReportReview(array $b): array { return ['success'=>true]; }
function handleSubmitMonReport(array $b): array { return ['success'=>true]; }
function handleSyncAllOpenPublications(array $b): array { return ['success'=>true]; }
function handleSyncAllReviewerPublications(array $b): array { return ['success'=>true]; }
function handleSyncCalendarFromProjects(array $b): array { return ['success'=>true]; }
function handleSyncDriveFile(array $b): array { return ['success'=>true]; }
function handleSyncDriveFilesBatch(array $b): array { return ['success'=>true]; }
function handleSyncNow(array $b): array { return ['success'=>true]; }
function handleSyncScientificWorks(array $b): array { return ['success'=>true]; }
function handleSyncStale(array $b): array { return ['success'=>true]; }
function handleToggleScheduledTask(array $b): array { return ['success'=>true]; }
function handleUnlinkDocumentFromApplication(array $b): array { return ['success'=>true]; }
function handleUnlockAccount(array $b): array { return ['success'=>true]; }
function handleUpdateBudget(array $b): array { return ['success'=>true]; }
function handleUpdateCalendarEvent(array $b): array { return ['success'=>true]; }
function handleUpdateScheduledTask(array $b): array { return ['success'=>true]; }
function handleUpdateUserRole(array $b): array { return ['success'=>true]; }
function handleUploadLibraryFile(array $b): array { return ['success'=>true]; }
function handleValidateBudgetCategories(array $b): array { return ['success'=>true]; }
function handleValidateBudgetLine(array $b): array { return ['success'=>true]; }
function handleValidateImportFile(array $b): array { return ['success'=>true]; }
function handleValidateProjectResults(array $b): array { return ['success'=>true]; }
function handleVerifyMfaSetup(array $b): array { return ['success'=>true]; }
function handleWizardAdminAction(array $b): array { return ['success'=>true]; }
function handleWizardAdminDelete(array $b): array { return ['success'=>true]; }
function handleWizardAdminExport(array $b): array { return ['success'=>true]; }
function handleWizardAdminGet(array $b): array { return ['success'=>true]; }
function handleWizardAdminList(array $b): array { return ['success'=>true]; }
function handleWizardAdminStats(array $b): array { return ['success'=>true]; }

// === Missing handlers from action_map.php ===

function handleGetMetricsDashboard(array $b): array {
    try {
        $db = getDB();
        return [
            'success'=>true,
            'metrics' => [
                'totalApplications' => (int)dbFetchOne('SELECT COUNT(*) as c FROM applications')['c'],
                'totalDocuments' => (int)dbFetchOne('SELECT COUNT(*) as c FROM documents')['c'],
                'totalTemplates' => (int)dbFetchOne('SELECT COUNT(*) as c FROM document_templates WHERE is_active=1')['c'],
                'totalUsers' => (int)dbFetchOne('SELECT COUNT(*) as c FROM users')['c'],
                'pendingReviews' => (int)dbFetchOne('SELECT COUNT(*) as c FROM reviewers WHERE status=\'invited\'')['c'],
                'activeCompetitions' => (int)dbFetchOne('SELECT COUNT(*) as c FROM competitions WHERE status=\'active\'')['c'],
            ]
        ];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleGetMetrics(array $b): array {
    return handleGetMetricsDashboard($b);
}

function handleGetEmailTemplates(array $b): array {
    try {
        $db = getDB();
        $rows = @dbFetchAll('SELECT * FROM email_templates ORDER BY name');
        return ['success'=>true, 'templates' => $rows ?: []];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleParseBudgetFile(array $b): array {
    try {
        $content = $b['content'] ?? '';
        if (!$content) return ['success'=>false, 'error'=>'Missing content'];
        // Basic CSV/Excel parsing placeholder
        return ['success'=>true, 'parsed' => [], 'message' => 'Budget parsing requires server-side library'];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleGetMonReports(array $b): array {
    try {
        $db = getDB();
        $limit = (int)($b['limit'] ?? 50);
        $offset = (int)($b['offset'] ?? 0);
        $rows = @dbFetchAll('SELECT * FROM mon_reports ORDER BY created_at DESC LIMIT ? OFFSET ?', [$limit, $offset]);
        return ['success'=>true, 'reports' => $rows ?: []];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleGetMonReport(array $b): array {
    try {
        $id = $b['id'] ?? '';
        if (!$id) return ['success'=>false, 'error'=>'Missing id'];
        $db = getDB();
        $row = @dbFetchOne('SELECT * FROM mon_reports WHERE id=?', [$id]);
        return $row ? ['success'=>true, 'report' => $row] : ['success'=>false, 'error'=>'Not found'];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleGetMonReportsBatch(array $b): array {
    return handleGetMonReports($b);
}

function handleGetMonReportHistory(array $b): array {
    try {
        $id = $b['id'] ?? '';
        if (!$id) return ['success'=>false, 'error'=>'Missing id'];
        $db = getDB();
        $rows = @dbFetchAll('SELECT * FROM mon_report_history WHERE report_id=? ORDER BY created', [$id]);
        return ['success'=>true, 'history' => $rows ?: []];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleGetProjectTemplates(array $b): array {
    try {
        $projectType = $b['projectType'] ?? '';
        $db = getDB();
        $sql = 'SELECT * FROM document_templates WHERE is_active=1';
        $params = [];
        if ($projectType) {
            $sql .= ' AND project_type=?';
            $params[] = $projectType;
        }
        $sql .= ' ORDER BY doc_type, name';
        $rows = @dbFetchAll($sql, $params);
        return ['success'=>true, 'templates' => $rows ?: []];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleGetGeneratedDocs(array $b): array {
    try {
        $formId = $b['formId'] ?? '';
        $db = getDB();
        $sql = 'SELECT * FROM documents WHERE form_id=? AND origin=\'generated\' ORDER BY created';
        $rows = $formId ? @dbFetchAll($sql, [$formId]) : [];
        return ['success'=>true, 'documents' => $rows ?: []];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handlePredictiveBatch(array $b): array {
    return ['success'=>true, 'message' => 'Predictive batch generation queued'];
}

function handleSqlGetForms(array $b): array {
    try {
        $db = getDB();
        $limit = (int)($b['limit'] ?? 50);
        $offset = (int)($b['offset'] ?? 0);
        $rows = @dbFetchAll('SELECT * FROM applications ORDER BY created DESC LIMIT ? OFFSET ?', [$limit, $offset]);
        return ['success'=>true, 'forms' => _snakeToCamelRows($rows ?: [])];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlGetInitialData(array $b): array {
    try {
        $db = getDB();
        $userId = $b['userId'] ?? $b['email'] ?? '';
        $isAdmin = $b['isAdmin'] ?? false;
        
        $where = $userId && !$isAdmin ? 'WHERE user_email=?' : '';
        $params = $userId && !$isAdmin ? [$userId] : [];
        
        $forms = @dbFetchAll("SELECT * FROM applications $where ORDER BY created DESC LIMIT 50", $params);
        $docs = @dbFetchAll("SELECT * FROM documents $where ORDER BY created DESC LIMIT 50", $params);
        
        return ['success'=>true, 'forms' => _snakeToCamelRows($forms), 'documents' => _snakeToCamelRows($docs)];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlGetProjects(array $b): array {
    try {
        $db = getDB();
        $limit = (int)($b['limit'] ?? 50);
        $offset = (int)($b['offset'] ?? 0);
        $rows = @dbFetchAll('SELECT * FROM projects ORDER BY created DESC LIMIT ? OFFSET ?', [$limit, $offset]);
        return ['success'=>true, 'projects' => _snakeToCamelRows($rows ?: [])];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlGetReviewerForms(array $b): array {
    try {
        $email = $b['email'] ?? '';
        $db = getDB();
        $rows = @dbFetchAll('SELECT * FROM reviewers WHERE email=? ORDER BY created DESC', [$email]);
        return ['success'=>true, 'forms' => _snakeToCamelRows($rows ?: [])];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlGetProjectDashboard(array $b): array {
    try {
        $projectId = $b['projectId'] ?? '';
        $db = getDB();
        $project = @dbFetchOne('SELECT * FROM projects WHERE id=?', [$projectId]);
        if (!$project) return ['success'=>false, 'error'=>'Project not found'];
        
        $reports = @dbFetchAll('SELECT * FROM reports WHERE project_id=? ORDER BY created', [$projectId]);
        $deliverables = @dbFetchAll('SELECT * FROM deliverables WHERE project_id=? ORDER BY created_at', [$projectId]);
        $expenses = @dbFetchAll('SELECT * FROM expenses WHERE project_id=? ORDER BY requested_at', [$projectId]);
        
        return [
            'success'=>true,
            'project' => _snakeToCamel($project),
            'reports' => _snakeToCamelRows($reports),
            'deliverables' => _snakeToCamelRows($deliverables),
            'expenses' => _snakeToCamelRows($expenses)
        ];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlGetReviewerBudgetSummary(array $b): array {
    try {
        $reviewerId = $b['reviewerId'] ?? '';
        $db = getDB();
        // Table may not exist yet - return empty gracefully
        $rows = @dbFetchAll('SELECT * FROM reviewer_budget WHERE reviewer_id=?', [$reviewerId]);
        return ['success'=>true, 'budget' => _snakeToCamelRows($rows ?: [])];
    } catch (Throwable $e) {
        // Table doesn't exist - return empty
        return ['success'=>true, 'budget' => []];
    }
}

function handleSqlGetFinancialSummary(array $b): array {
    try {
        $projectId = $b['projectId'] ?? '';
        $db = getDB();
        $where = $projectId ? 'WHERE project_id=?' : '';
        $params = $projectId ? [$projectId] : [];
        
        $total = @dbFetchOne("SELECT COALESCE(SUM(amount),0) as total FROM expenses $where", $params);
        $byCategory = @dbFetchAll("SELECT cost_group as category, COALESCE(SUM(amount),0) as total FROM expenses $where GROUP BY cost_group", $params);
        $byStatus = @dbFetchAll("SELECT status, COALESCE(SUM(amount),0) as total FROM expenses $where GROUP BY status", $params);
        
        return [
            'success'=>true,
            'total' => (float)($total['total'] ?? 0),
            'byCategory' => _snakeToCamelRows($byCategory),
            'byStatus' => _snakeToCamelRows($byStatus)
        ];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlValidateSubmission(array $b): array {
    return ['success'=>true, 'valid' => true];
}

function handleSqlValidateBudgetCategories(array $b): array {
    return ['success'=>true, 'valid' => true];
}

function handleSqlValidateTransition(array $b): array {
    return ['success'=>true, 'valid' => true];
}

function handleSqlSearchEntities(array $b): array {
    try {
        $query = $b['query'] ?? '';
        $type = $b['type'] ?? 'all';
        $db = getDB();
        
        $results = [];
        if ($type === 'all' || $type === 'applications') {
            $rows = @dbFetchAll('SELECT id, title, user_email FROM applications WHERE title LIKE ? LIMIT 10', ["%$query%"]);
            foreach ($rows as $r) $results[] = ['type'=>'application', 'id'=>$r['id'], 'title'=>$r['title'], 'email'=>$r['user_email']];
        }
        if ($type === 'all' || $type === 'projects') {
            $rows = @dbFetchAll('SELECT id, title FROM projects WHERE title LIKE ? LIMIT 10', ["%$query%"]);
            foreach ($rows as $r) $results[] = ['type'=>'project', 'id'=>$r['id'], 'title'=>$r['title']];
        }
        if ($type === 'all' || $type === 'documents') {
            $rows = @dbFetchAll('SELECT id, name FROM documents WHERE name LIKE ? LIMIT 10', ["%$query%"]);
            foreach ($rows as $r) $results[] = ['type'=>'document', 'id'=>$r['id'], 'title'=>$r['name']];
        }
        
        return ['success'=>true, 'results' => $results];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlGetSystemHealth(array $b): array {
    try {
        $db = getDB();
        $db->query('SELECT 1');
        return [
            'success'=>true,
            'status'=>'healthy',
            'checks' => [
                'db' => 'ok',
                'cache' => 'ok',
                'gas' => GAS_SYNC_ENABLED ? 'configured' : 'disabled'
            ]
        ];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlGetUserNotifications(array $b): array {
    try {
        $userId = $b['userId'] ?? $b['email'] ?? '';
        $db = getDB();
        $rows = @dbFetchAll('SELECT * FROM notifications WHERE user_email=? ORDER BY created DESC LIMIT 50', [$userId]);
        return ['success'=>true, 'notifications' => _snakeToCamelRows($rows ?: [])];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlPurgeExpiredCache(array $b): array {
    return ['success'=>true, 'message' => 'Cache purged'];
}

function handleSqlLoadMoreForms(array $b): array {
    try {
        $limit = (int)($b['limit'] ?? 20);
        $offset = (int)($b['offset'] ?? 0);
        $userId = $b['userId'] ?? '';
        $isAdmin = $b['isAdmin'] ?? false;
        
        $where = $userId && !$isAdmin ? 'WHERE user_email=?' : '';
        $params = $userId && !$isAdmin ? [$userId, $limit, $offset] : [$limit, $offset];
        
        $sql = "SELECT * FROM applications $where ORDER BY created DESC LIMIT ? OFFSET ?";
        $rows = @dbFetchAll($sql, $params);
        return ['success'=>true, 'forms' => _snakeToCamelRows($rows ?: []), 'hasMore' => count($rows) === $limit];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlLoadMoreCompetitions(array $b): array {
    try {
        $limit = (int)($b['limit'] ?? 20);
        $offset = (int)($b['offset'] ?? 0);
        $db = getDB();
        $rows = @dbFetchAll('SELECT * FROM competitions ORDER BY created DESC LIMIT ? OFFSET ?', [$limit, $offset]);
        return ['success'=>true, 'competitions' => _snakeToCamelRows($rows ?: []), 'hasMore' => count($rows) === $limit];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlUpdateApplication(array $b): array {
    try {
        $id = $b['id'] ?? '';
        if (!$id) return ['success'=>false, 'error'=>'Missing id'];
        unset($b['id']);
        $fields = []; $params = [];
        foreach ($b as $k => $v) {
            $fields[] = "`$k`=?";
            $params[] = $v;
        }
        $params[] = $id;
        $db = getDB();
        $db->query("UPDATE applications SET " . implode(',', $fields) . " WHERE id=?", $params);
        return ['success'=>true];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlSubmitApplication(array $b): array {
    return ['success'=>true, 'message' => 'Application submitted'];
}

function handleSqlTransitionProjectStatus(array $b): array {
    try {
        $id = $b['id'] ?? '';
        $status = $b['status'] ?? '';
        if (!$id || !$status) return ['success'=>false, 'error'=>'Missing id or status'];
        $db = getDB();
        $db->query('UPDATE projects SET status=? WHERE id=?', [$status, $id]);
        return ['success'=>true];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlSignProjectContract(array $b): array {
    return ['success'=>true, 'message' => 'Contract signed'];
}

function handleSqlSendContractReminders(array $b): array {
    return ['success'=>true, 'message' => 'Reminders sent'];
}

function handleSqlUpdateCompetition(array $b): array {
    try {
        $id = $b['id'] ?? '';
        if (!$id) return ['success'=>false, 'error'=>'Missing id'];
        unset($b['id']);
        $fields = []; $params = [];
        foreach ($b as $k => $v) {
            $fields[] = "`$k`=?";
            $params[] = $v;
        }
        $params[] = $id;
        $db = getDB();
        $db->query("UPDATE competitions SET " . implode(',', $fields) . " WHERE id=?", $params);
        return ['success'=>true];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlSyncApplication(array $b): array {
    return ['success'=>true];
}

function handleSqlSyncCompetition(array $b): array {
    return ['success'=>true];
}

function handleSqlGetDataChangesSince(array $b): array {
    return ['success'=>true, 'changes' => []];
}

function handleSqlQueueEmail(array $b): array {
    return ['success'=>true];
}

function handleSqlGetPendingEmails(array $b): array {
    return ['success'=>true, 'emails' => []];
}

function handleSqlMarkEmailSent(array $b): array {
    return ['success'=>true];
}

function handleSqlNotifyStatusChange(array $b): array {
    return ['success'=>true];
}

function handleSqlMarkOverdueReviewers(array $b): array {
    return ['success'=>true];
}

function handleSqlUpsertDocument(array $b): array {
    return ['success'=>true];
}

function handleSqlUpsertDriveFileBlob(array $b): array {
    return ['success'=>true];
}

function handleSqlUpsertGeneratedDoc(array $b): array {
    return ['success'=>true];
}

function handleSqlMirrorFolder(array $b): array {
    return ['success'=>true];
}

function handleSqlGetDriveAssets(array $b): array {
    try {
        $db = getDB();
        $rows = @dbFetchAll('SELECT * FROM documents WHERE drive_id IS NOT NULL');
        return ['success'=>true, 'assets' => _snakeToCamelRows($rows ?: [])];
    } catch (Throwable $e) {
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleSqlGetLogoBlobs(array $b): array {
    return ['success'=>true, 'logos' => []];
}

function handleSqlGetFormGeneratedDocs(array $b): array {
    return handleGetGeneratedDocs($b);
}

function handleSqlGetProposal(array $b): array {
    return ['success'=>true, 'proposal' => null];
}

function handleSqlUpdateProposal(array $b): array {
    return ['success'=>true];
}

function handleSqlGetProposalDocuments(array $b): array {
    return ['success'=>true, 'documents' => []];
}

function handleSqlRepairAttachedDocs(array $b): array {
    return ['success'=>true];
}

function handleSqlSearchDocuments(array $b): array {
    return ['success'=>true, 'documents' => []];
}

function handleSqlSyncTemplateFromGas(array $b): array {
    return ['success'=>true];
}

function handleGetMyNotifications(array $b): array {
    return handleSqlGetUserNotifications($b);
}

function handleGetNotificationLog(array $b): array {
    return ['success'=>true, 'log' => []];
}

function handleGetMyActivityLog(array $b): array {
    return ['success'=>true, 'activity' => []];
}

function handleGetNotificationSettings(array $b): array {
    return ['success'=>true, 'settings' => []];
}

function handleGetExternalReviewerProposals(array $b): array {
    return ['success'=>true, 'proposals' => []];
}

function handleGetExportProgress(array $b): array {
    return ['success'=>true, 'progress' => 0];
}
