<?php
/**
 * UEV-ERP SQL Service Layer v1
 * v12.26.0 — Wraps ALL stored procedures from schema_migration_v4_procedures.sql
 * into clean callable functions. Reads data loading & business logic from MySQL
 * instead of GAS/Sheets. Every function returns arrays consumable by api.php handlers.
 *
 * Dependencies: config.php (getDB(), dbFetchAll(), dbFetchOne(), etc.)
 */

// ── Response helpers ──────────────────────────────────────────────
// v12.30.0: Unified success/error response builders to reduce boilerplate
// across 50+ functions. Every function now returns via these helpers.
function sqlOk(array $data = [], int $total = 0, array $extra = []): array {
    return array_merge(['success' => true, 'data' => $data, 'total' => $total, '_source' => 'sql'], $extra);
}
function sqlFail(\Throwable $e): array {
    $msg = (defined('APP_DEBUG') && APP_DEBUG) ? $e->getMessage() : 'Грешка при изпълнение на заявка.';
    logError("sql_service: " . $e->getMessage());
    return ['success' => false, 'error' => $msg, '_source' => 'sql'];
}
function sqlOkSimple(array $result): array {
    return ['success' => true, 'data' => $result, '_source' => 'sql'];
}

// ──────────────────────────────────────────────────────────────────────────────
//  PART 1: DATA LOADING FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 1.01 Get forms/applications with full role-based filtering.
 * v12.28.1-perf: Added per-request static cache keyed by call signature.
 * When the same params are requested twice within one HTTP request
 * (e.g., data stream + initial load), returns cached result without
 * calling the stored procedure again.
 */
function sqlGetForms(string $userEmail = '', string $role = 'admin',
                     string $competitionId = '', string $statusFilter = '',
                     string $projectType = '', int $offset = 0, int $limit = 100,
                     bool $includeDeleted = false): array {
    // Per-request static cache
    static $_cache = [];
    $ck = md5(serialize(func_get_args()));
    if (isset($_cache[$ck])) {
        return $_cache[$ck];
    }
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_forms_data(?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $userEmail ?: null,
            $role,
            $competitionId ?: null,
            $statusFilter ?: null,
            $projectType ?: null,
            $offset,
            $limit,
            $includeDeleted ? 1 : 0
        ]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $countRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        $result = [
            'success' => true,
            'data' => $data,
            'total' => (int)($countRow['total_count'] ?? 0),
            'offset' => $offset,
            'limit' => $limit,
            '_source' => 'sql'
        ];
        $_cache[$ck] = $result;
        return $result;
    } catch (Throwable $e) {
        logError("sqlGetForms: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 1.01b Get forms list — lean optimized version for list views.
 * v12.30.0-perf: Uses get_forms_list procedure (static SQL, no dynamic CONCAT).
 * Falls back to get_forms_data if the lean procedure is not installed.
 */
function sqlGetFormsList(string $userEmail = '', string $role = 'admin',
                          string $competitionId = '', string $statusFilter = '',
                          string $projectType = '', int $offset = 0, int $limit = 100): array {
    static $_cache = [];
    $ck = 'fl:' . md5(serialize(func_get_args()));
    if (isset($_cache[$ck])) return $_cache[$ck];

    // v12.30.0-cache: Cross-request file cache for millisecond applicant loads.
    // For applicant role with no filters, cache the result for 60s per user.
    // The cache is invalidated when data_version.applications changes.
    $cacheKey = 'forms_list:' . $role . ':' . ($userEmail ?: 'all') . ':' . $offset . ':' . $limit;
    if ($role === 'applicant' && empty($competitionId) && empty($statusFilter) && empty($projectType)) {
        $cached = _cacheGet($cacheKey);
        if ($cached !== null) {
            $_cache[$ck] = $cached;
            return $cached;
        }
    }

    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_forms_list(?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $userEmail ?: null, $role,
            $competitionId ?: null, $statusFilter ?: null,
            $projectType ?: null, $offset, $limit
        ]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $countRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        $result = [
            'success' => true,
            'data' => $data,
            'total' => (int)($countRow['total_count'] ?? 0),
            'offset' => $offset,
            'limit' => $limit,
            '_source' => 'sql'
        ];
        $_cache[$ck] = $result;

        // Store in cross-request cache for applicant role
        if ($role === 'applicant' && empty($competitionId) && empty($statusFilter) && empty($projectType)) {
            _cacheSet($cacheKey, $result, 60);
        }

        return $result;
    } catch (Throwable $e) {
        // Fallback to full procedure if lean one doesn't exist
        return sqlGetForms($userEmail, $role, $competitionId, $statusFilter, $projectType, $offset, $limit, false);
    }
}

/**
 * 1.01c Ultra-light applicant forms query — single table, no joins.
 * v12.30.0-cache: For "Моите проектни предложения" — returns only applicant's own forms.
 * Uses get_my_forms procedure which is a simple indexed SELECT with no JOINs.
 * v15.0.0-perf: Tries get_my_forms_v2 first (covering index, direct status comparison,
 * separate COUNT query). Falls back to original get_my_forms if v2 not installed.
 * v15.0.0-perf: Extended cache TTL from 60s to 120s for applicant list views.
 */
function sqlGetMyForms(string $userEmail, int $offset = 0, int $limit = 100): array {
    static $_cache = [];
    $ck = 'myf:' . $userEmail . ':' . $offset . ':' . $limit;
    if (isset($_cache[$ck])) return $_cache[$ck];

    // v15.0.0-perf: Extended cache from 60→120s — forms change infrequently for list views.
    // Cross-request cache with data_version invalidation for instant millisecond loads.
    $cacheKey = 'my_forms:' . $userEmail . ':' . $offset . ':' . $limit;
    $cached = _cacheGet($cacheKey);
    $cacheTTL = 120; // v15.0.0-perf: 60→120s — reduced DB load for frequently polled list
    if ($cached !== null) { $_cache[$ck] = $cached; return $cached; }

    // v12.31.5-perf: Direct SQL fallback — works even when stored procedures are
    // not installed on the server. Uses explicit column list for speed.
    $cols = 'id,user_email,user_name,competition,project_type,title,area,status,submitted,created,return_comment,row_version,npf_tier';
    $directSql = "SELECT $cols FROM applications WHERE user_email=? AND status NOT IN ('deleted','archived') ORDER BY created DESC LIMIT ? OFFSET ?";
    $countSql = "SELECT COUNT(*) as total FROM applications WHERE user_email=? AND status NOT IN ('deleted','archived')";

    try {
        $db = getDB();
        // v15.0.0-perf: Try v2 procedure first (covering index, avoids NOT IN)
        try {
            $stmt = $db->prepare('CALL get_my_forms_v2(?, ?, ?)');
            $stmt->execute([$userEmail, $offset, $limit]);
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            // v15.0.0-perf: Fetch second result set (COUNT query) when available
            $total = count($data);
            try {
                $stmt->nextRowset();
                $countRow = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($countRow && isset($countRow['total_count'])) {
                    $total = (int)$countRow['total_count'];
                }
            } catch (\Throwable $e) {
                // COUNT not available, use data count as fallback
                $total = count($data);
            }
            $stmt->closeCursor();
        } catch (\Throwable $e) {
            // v12.31.5-perf: Stored procedure not available — use direct SQL
            $data = dbFetchAll($directSql, [$userEmail, $limit, $offset]);
            $totalRow = dbFetchOne($countSql, [$userEmail]);
            $total = (int)($totalRow['total'] ?? count($data));
        }
        $result = [
            'success' => true,
            'data' => $data,
            'total' => $total,
            'offset' => $offset,
            'limit' => $limit,
            '_source' => 'sql'
        ];
        $_cache[$ck] = $result;
        // v15.0.0-perf: Extended cache TTL + use same TTL for file cache
        _cacheSet($cacheKey, $result, $cacheTTL);
        return $result;
    } catch (Throwable $e) {
        logError("sqlGetMyForms: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * v12.30.0-cache: Simple file-based key-value cache.
 * Stores serialized data in a PHP temp file with TTL.
 * In production, consider APCu or Redis for better performance.
 */
/**
 * v15.0.0-perf: Enhanced file cache with configurable TTL read from metadata.
 * Stores TTL in the meta file so _cacheGet uses the same TTL that _cacheSet
 * was called with. Defaults to 120s for backward compatibility.
 */
function _cacheGet(string $key): mixed {
    $cacheDir = sys_get_temp_dir() . '/uev_erp_cache';
    $f = $cacheDir . '/' . md5($key) . '.cache';
    if (!file_exists($f)) return null;
    // Check TTL: file mtime + TTL from metadata (default 120s fallback)
    $metaFile = $cacheDir . '/meta_' . md5($key) . '.json';
    $ttl = 120; // v15.0.0-perf: default 120s (was hardcoded 60s)
    if (file_exists($metaFile)) {
        $meta = json_decode(file_get_contents($metaFile), true);
        if ($meta && isset($meta['ttl'])) {
            $ttl = (int)$meta['ttl'];
        }
        // Check data_version invalidation — if applications version changed, invalidate
        if ($meta && isset($meta['dv'])) {
            try {
                $dv = dbFetchOne("SELECT version FROM data_version WHERE table_name = 'applications'");
                $currentDv = (int)($dv['version'] ?? 0);
                if ($currentDv !== (int)$meta['dv']) { @unlink($f); @unlink($metaFile); return null; }
            } catch (\Throwable $_) {}
        }
    }
    if (time() - filemtime($f) > $ttl) { @unlink($f); @unlink($metaFile); return null; }
    $data = @file_get_contents($f);
    return $data ? unserialize($data) : null;
}

/**
 * v15.0.0-perf: Now stores TTL in metadata for _cacheGet to use.
 */
function _cacheSet(string $key, mixed $data, int $ttl = 120): void {
    $cacheDir = sys_get_temp_dir() . '/uev_erp_cache';
    if (!is_dir($cacheDir)) @mkdir($cacheDir, 0777, true);
    $f = $cacheDir . '/' . md5($key) . '.cache';
    @file_put_contents($f, serialize($data));
    // Store TTL + data_version for invalidation
    try {
        $dv = dbFetchOne("SELECT version FROM data_version WHERE table_name = 'applications'");
        $meta = ['dv' => (int)($dv['version'] ?? 0), 'ttl' => $ttl];
        file_put_contents($cacheDir . '/meta_' . md5($key) . '.json', json_encode($meta));
    } catch (\Throwable $_) {}
}

/**
 * 1.02 Get competitions with application stats.
 * Replaces GS.JS getCompetitions() ~250 lines.
 */
function sqlGetCompetitions(bool $activeOnly = false, string $statusFilter = '',
                            int $year = 0, bool $includeArchived = false,
                            int $offset = 0, int $limit = 50): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_competitions_data(?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $activeOnly ? 1 : 0,
            $statusFilter ?: null,
            $year > 0 ? $year : null,
            $includeArchived ? 1 : 0,
            $offset,
            $limit
        ]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $countRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'data' => $data,
            'total' => (int)($countRow['total_count'] ?? 0),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetCompetitions: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 1.03 Get initial data bundle (forms + competitions + config + types + statuses).
 * v12.28.1-perf: Added per-request static cache. Called on every page load
 * and during initial prefetch — caching saves a full DB round-trip when
 * called multiple times with the same params.
 */
function sqlGetInitialData(string $userEmail = '', string $role = 'admin',
                           bool $lean = false): array {
    static $_cache = [];
    $ck = md5(serialize(func_get_args()));
    if (isset($_cache[$ck])) {
        return $_cache[$ck];
    }
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_initial_data(?, ?, ?)');
        $stmt->execute([$userEmail ?: null, $role, $lean ? 1 : 0]);

        // Result set 1: Forms
        $forms = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();

        // v12.48.0-dbfix: Defense against a broken/mis-scoped get_initial_data
        // procedure (observed in prod: it ignored user_email for applicants and
        // returned ALL users' forms, so an applicant's boot prefetch flashed
        // everyone's drafts and diverged from the correctly-scoped getforms).
        // If the caller is a non-admin and the procedure returned rows that are
        // NOT theirs, fall back to a direct, correctly-scoped SQL read.
        if ($role !== 'admin' && $userEmail !== '' && !empty($forms)) {
            $mine = 0;
            foreach ($forms as $fr) {
                if (($fr['user_email'] ?? ($fr['userEmail'] ?? '')) === $userEmail) $mine++;
            }
            if ($mine === 0) {
                try {
                    $forms = dbFetchAll(
                        "SELECT * FROM applications WHERE user_email=? AND status NOT IN ('deleted','archived') ORDER BY created DESC LIMIT 500",
                        [$userEmail]
                    );
                } catch (Throwable $e2) {
                    logError('sqlGetInitialData scope-fallback: ' . $e2->getMessage());
                }
            }
        }
        // Result set 2: Competitions
        $competitions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        // Result set 3: System config
        $configRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $systemConfig = [];
        foreach ($configRows as $row) {
            $systemConfig[$row['config_key']] = $row['config_value'];
        }
        $stmt->nextRowset();
        // Result set 4: Project types with schemas
        $projectTypes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($projectTypes as &$pt) {
            $pt['self_assessment_schemas'] = json_decode($pt['self_assessment_schemas'] ?? '[]', true) ?: [];
            $pt['expense_limits'] = json_decode($pt['expense_limits'] ?? '[]', true) ?: [];
        }
        unset($pt);
        $stmt->nextRowset();
        // Result set 5: Application statuses
        $statuses = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        // Result set 6: Data version
        $versionRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        // Result set 7: Dashboard counts
        $counts = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();

        $result = [
            'success' => true,
            'forms' => $forms,
            'competitions' => $competitions,
            'systemConfig' => $systemConfig,
            'projectTypes' => $projectTypes,
            'applicationStatuses' => $statuses,
            'dataVersion' => $versionRow,
            'dashboardCounts' => $counts ?? [],
            '_source' => 'sql'
        ];
        $_cache[$ck] = $result;
        return $result;
    } catch (Throwable $e) {
        logError("sqlGetInitialData: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 1.04 Get documents with filters.
 * Replaces GS.JS listDocuments() / listMyDocuments().
 */
function sqlGetDocuments(string $userEmail = '', string $role = 'admin',
                         string $formId = '', string $origin = '',
                         string $category = '', string $projectType = '',
                         string $search = '', bool $myDocumentsOnly = false,
                         int $offset = 0, int $limit = 200): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_documents_data(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $userEmail ?: null,
            $role,
            $formId ?: null,
            $origin ?: null,
            $category ?: null,
            $projectType ?: null,
            $search ?: null,
            $myDocumentsOnly ? 1 : 0,
            $offset,
            $limit
        ]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $countRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'data' => $data,
            'total' => (int)($countRow['total_count'] ?? 0),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetDocuments: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 1.05 Get projects with budget/report aggregation.
 * Replaces GS.JS getProjects().
 */
function sqlGetProjects(string $leaderEmail = '', string $statusFilter = '',
                        string $competitionId = '', int $offset = 0, int $limit = 50): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_projects_data(?, ?, ?, ?, ?)');
        $stmt->execute([
            $leaderEmail ?: null,
            $statusFilter ?: null,
            $competitionId ?: null,
            $offset,
            $limit
        ]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $countRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'data' => $data,
            'total' => (int)($countRow['total_count'] ?? 0),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetProjects: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 1.06 Get reviewer forms — full snapshot for a specific reviewer.
 * Replaces GS.JS getReviewerForms().
 */
function sqlGetReviewerForms(string $reviewerEmail, string $competitionId = '',
                             string $statusFilter = '', int $offset = 0, int $limit = 50): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_reviewer_forms_data(?, ?, ?, ?, ?)');
        $stmt->execute([
            $reviewerEmail,
            $competitionId ?: null,
            $statusFilter ?: null,
            $offset,
            $limit
        ]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $countRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'data' => $data,
            'total' => (int)($countRow['total_count'] ?? 0),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetReviewerForms: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 1.07 Load more forms (pagination helper).
 * Replaces GS.JS loadMoreForms().
 */
function sqlLoadMoreForms(string $userEmail, string $role, int $offset, int $limit): array {
    return sqlGetForms($userEmail, $role, '', '', '', $offset, $limit);
}

/**
 * 1.08 Load more competitions (pagination helper).
 * Replaces GS.JS loadMoreCompetitions().
 */
function sqlLoadMoreCompetitions(int $offset, int $limit): array {
    return sqlGetCompetitions(false, '', 0, false, $offset, $limit);
}


// ──────────────────────────────────────────────────────────────────────────────
//  PART 2: BUSINESS VALIDATION FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 2.01 Validate submission — all 18 checks from GS.JS _validateSubmission_.
 * Returns array of check results with overall_valid flag.
 */
function sqlValidateSubmission(string $formId, string $projectType,
                                string $competitionId): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL validate_submission(?, ?, ?)');
        $stmt->execute([$formId, $projectType, $competitionId]);
        $checks = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();

        $overallValid = true;
        $errors = [];
        foreach ($checks as $check) {
            if (empty($check['passed'])) {
                $overallValid = false;
                if (!empty($check['message'])) {
                    $errors[] = $check['message'];
                }
            }
        }

        return [
            'success' => true,
            'valid' => $overallValid,
            'checks' => $checks,
            'errors' => $errors,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlValidateSubmission: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 2.02 Validate budget categories against expense_limit_rules.
 * Replaces GS.JS _validateBudgetCategories_().
 */
function sqlValidateBudgetCategories(string $projectType, string $budgetJson,
                                      float $totalBudgetEur = 0): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL validate_budget_categories(?, ?, ?)');
        $stmt->execute([$projectType, $budgetJson, $totalBudgetEur]);
        $violations = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'rules' => $violations,
            'count' => count($violations),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlValidateBudgetCategories: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 2.03 Check eligibility — sanctions, CKK, cross-competition limits.
 * Replaces GS.JS checkEligibility().
 */
function sqlCheckEligibility(string $userEmail, string $competitionId,
                              string $projectType): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL check_eligibility(?, ?, ?)');
        $stmt->execute([$userEmail, $competitionId, $projectType]);
        $checks = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();

        $overallEligible = true;
        $errors = [];
        foreach ($checks as $check) {
            if (empty($check['passed'])) {
                $overallEligible = false;
                if (!empty($check['message'])) {
                    $errors[] = $check['message'];
                }
            }
        }

        return [
            'success' => true,
            'eligible' => $overallEligible,
            'checks' => $checks,
            'errors' => $errors,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlCheckEligibility: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 2.04 Validate a specific status transition.
 * Replaces GS.JS _validateStatusTransition_().
 */
function sqlValidateStatusTransition(string $entityType, string $fromStatus,
                                      string $toStatus, string $userRole): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL validate_status_transition(?, ?, ?, ?)');
        $stmt->execute([$entityType, $fromStatus, $toStatus, $userRole]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'valid' => !empty($result['valid']),
            'fromStatus' => $fromStatus,
            'toStatus' => $toStatus,
            'targetLabel' => $result['target_label'] ?? $toStatus,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlValidateStatusTransition: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 2.05 Get all allowed transitions from a status.
 * Replaces GS.JS ALLOWED_STATUS_TRANSITIONS lookup.
 */
function sqlGetAllowedTransitions(string $entityType, string $fromStatus,
                                   string $userRole): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_allowed_transitions(?, ?, ?)');
        $stmt->execute([$entityType, $fromStatus, $userRole]);
        $transitions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'transitions' => $transitions,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetAllowedTransitions: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 2.06 Check competition deadline status.
 * Replaces GS.JS _checkCompetitionDeadline_().
 */
function sqlCheckCompetitionDeadline(string $competitionId): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL check_competition_deadline(?)');
        $stmt->execute([$competitionId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'competition' => $result,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlCheckCompetitionDeadline: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}


// ──────────────────────────────────────────────────────────────────────────────
//  PART 3: STATUS TRANSITION ENGINE
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 3.01 Apply a single status transition with validation + audit.
 * Replaces GS.JS updateStatus() core logic.
 */
function sqlApplyStatusTransition(string $entityType, string $entityId,
                                   string $toStatus, string $userEmail,
                                   string $userRole, string $notes = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL apply_status_transition(?, ?, ?, ?, ?, ?)');
        $stmt->execute([$entityType, $entityId, $toStatus, $userEmail, $userRole, $notes]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache($entityType === 'application' ? 'applications' :
                        ($entityType === 'competition' ? 'competitions' : 'projects'));
        // v3.39.2-sqlsync: bump data_version so the version poller detects the
        // status change immediately and other tabs/clients refresh consistently.
        if ($entityType === 'application') {
            _bumpApplicationsVersion();
        } else {
            try {
                dbQuery('INSERT INTO data_version (table_name, version, updated_at)
                         VALUES (?,1,NOW()) ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()',
                         [$entityType === 'competition' ? 'competitions' : 'projects']);
            } catch (Throwable $_) {}
        }
        return array_merge(['success' => true, '_source' => 'sql'], $result ?: []);
    } catch (Throwable $e) {
        logError("sqlApplyStatusTransition: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 3.02 Cascade status transition through intermediate states.
 * Replaces GS.JS forward-cascade pipeline.
 */
function sqlCascadeStatusTransition(string $entityType, string $entityId,
                                     string $targetStatus, string $userEmail,
                                     string $userRole): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL cascade_status_transition(?, ?, ?, ?, ?)');
        $stmt->execute([$entityType, $entityId, $targetStatus, $userEmail, $userRole]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'id' => $result['id'] ?? $entityId,
            'finalStatus' => $result['final_status'] ?? $targetStatus,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlCascadeStatusTransition: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}


// ──────────────────────────────────────────────────────────────────────────────
//  PART 4: DASHBOARD & AGGREGATION FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 4.01 Get dashboard context — role-aware aggregation.
 * Replaces GS.JS getDashboardContext().
 */
function sqlGetDashboardContext(string $userEmail, string $role): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_dashboard_context(?, ?)');
        $stmt->execute([$userEmail, $role]);

        // Result set 1: Lane counts
        $laneCounts = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        // Result set 2: Active competitions count
        $activeCompetitions = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        // Result set 3: Pending reviews
        $pendingReviews = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        // Result set 4: Unread notifications
        $unreadNotifications = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        // Result set 5: Active projects
        $activeProjects = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        // Result set 6: Recent applications
        $recentApps = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        // Result set 7: Upcoming deadlines
        $upcomingDeadlines = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();

        return [
            'success' => true,
            'laneCounts' => $laneCounts,
            'activeCompetitions' => (int)($activeCompetitions['active_competitions'] ?? 0),
            'pendingReviews' => (int)($pendingReviews['pending_reviews'] ?? 0),
            'unreadNotifications' => (int)($unreadNotifications['unread_notifications'] ?? 0),
            'activeProjects' => (int)($activeProjects['active_projects'] ?? 0),
            'recentApplications' => $recentApps,
            'upcomingDeadlines' => $upcomingDeadlines,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetDashboardContext: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 4.02 Get contest board — public competition listing with user stats.
 * Replaces GS.JS getContestBoard().
 */
function sqlGetContestBoard(string $userEmail = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_contest_board(?)');
        $stmt->execute([$userEmail ?: '']);

        $competitions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $myApplications = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $myProjects = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();

        return [
            'success' => true,
            'competitions' => $competitions,
            'myApplications' => $myApplications,
            'myProjects' => $myProjects,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetContestBoard: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 4.03 Get competition summary with rankings and reviewer stats.
 * Replaces GS.JS getCompetitionSummary().
 */
function sqlGetCompetitionSummary(string $competitionId): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_competition_summary(?)');
        $stmt->execute([$competitionId]);

        $details = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $rankings = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $reviewers = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();

        return [
            'success' => true,
            'details' => $details,
            'rankings' => $rankings,
            'reviewers' => $reviewers,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetCompetitionSummary: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 4.04 Get project dashboard — full project view with all sub-entities.
 * Replaces GS.JS getProjectDashboard().
 */
function sqlGetProjectDashboard(string $projectId): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_project_dashboard(?)');
        $stmt->execute([$projectId]);

        $project = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $budget = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $deliverables = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $reports = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $expenses = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $changeRequests = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();

        return [
            'success' => true,
            'project' => $project,
            'budgetSummary' => $budget,
            'deliverables' => $deliverables,
            'reports' => $reports,
            'expenses' => $expenses,
            'changeRequests' => $changeRequests,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetProjectDashboard: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 4.05 Get reviewer budget summary per competition.
 * Replaces GS.JS getReviewerBudgetSummary().
 */
function sqlGetReviewerBudgetSummary(string $competitionId): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_reviewer_budget_summary(?)');
        $stmt->execute([$competitionId]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();

        $total = 0;
        foreach ($data as $row) {
            if ($row['email'] === null) { // ROLLUP row
                $total = (float)($row['total_fee_eur'] ?? 0);
            }
        }

        return [
            'success' => true,
            'reviewers' => $data,
            'totalFeeEur' => $total,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetReviewerBudgetSummary: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 4.06 Get financial summary across all projects.
 * Replaces GS.JS getFinancialSummary().
 */
function sqlGetFinancialSummary(int $year = 0): array {
    try {
        if ($year <= 0) $year = (int)date('Y');
        $db = getDB();
        $stmt = $db->prepare('CALL get_financial_summary(?)');
        $stmt->execute([$year]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();

        if ($result && !empty($result['per_type_breakdown'])) {
            $result['perTypeBreakdown'] = json_decode($result['per_type_breakdown'], true) ?: [];
            unset($result['per_type_breakdown']);
        }

        return [
            'success' => true,
            'summary' => $result ?? [],
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetFinancialSummary: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}


// ──────────────────────────────────────────────────────────────────────────────
//  PART 5: NOTIFICATIONS, SEARCH & UTILITY FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 5.01 Get user notifications with role-aware filtering.
 * Replaces GS.JS notification queries.
 */
function sqlGetUserNotifications(string $userEmail, string $role,
                                  bool $unreadOnly = false,
                                  int $offset = 0, int $limit = 50): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_user_notifications(?, ?, ?, ?, ?)');
        $stmt->execute([$userEmail, $role, $unreadOnly ? 1 : 0, $offset, $limit]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $countRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'data' => $data,
            'total' => (int)($countRow['total_count'] ?? 0),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetUserNotifications: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 5.02 Search across all entity types.
 * Replaces GS.JS full-text search.
 */
function sqlSearchEntities(string $query, string $userEmail = '',
                            string $role = 'admin', int $limit = 30): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL search_entities(?, ?, ?, ?)');
        $stmt->execute([$query, $userEmail ?: null, $role, $limit]);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'results' => $results,
            'count' => count($results),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlSearchEntities: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 5.03 Get system health metrics.
 * Replaces GS.JS getSystemHealth() / getMetricsDashboard().
 */
function sqlGetSystemHealth(): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_system_health()');
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'health' => $result ?? [],
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetSystemHealth: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 5.04 Get audit trail with filters.
 */
function sqlGetAuditTrail(string $actor = '', string $entityType = '',
                           string $entityId = '', string $actionFilter = '',
                           int $offset = 0, int $limit = 100): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_audit_trail(?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $actor ?: null,
            $entityType ?: null,
            $entityId ?: null,
            $actionFilter ?: null,
            $offset,
            $limit
        ]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $countRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'data' => $data,
            'total' => (int)($countRow['total_count'] ?? 0),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetAuditTrail: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 5.05 Get calendar events merging all deadline types.
 * Replaces GS.JS getCalendarEvents().
 */
function sqlGetCalendarEvents(string $userEmail = '', string $role = 'admin',
                               string $startDate = '', string $endDate = '',
                               int $limit = 100): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_calendar_events(?, ?, ?, ?, ?)');
        $stmt->execute([
            $userEmail ?: null,
            $role,
            $startDate ?: null,
            $endDate ?: null,
            $limit
        ]);
        $events = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'events' => $events,
            'count' => count($events),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetCalendarEvents: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}


// ──────────────────────────────────────────────────────────────────────────────
//  PART 6: LEGACY PROCEDURES (existing from schema v3)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 6.01 Get dashboard counts (existing procedure).
 */
function sqlGetDashboardCounts(): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_dashboard_counts()');
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'counts' => $result ?? [],
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetDashboardCounts: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 6.02 Purge expired cache entries (existing procedure).
 */
function sqlPurgeExpiredCache(): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL purge_expired_cache()');
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('gas_cache');
        clearQueryCache('sessions');
        return [
            'success' => true,
            'deletedRows' => (int)($result['total_deleted_rows'] ?? 0),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlPurgeExpiredCache: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}


// ══════════════════════════════════════════════════════════════════════════════
//  PART 7: CRUD OPERATIONS (v5 — schema_migration_v5_complete.sql)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 7.01 Create a new application.
 * Replaces GS.JS createForm() core logic.
 */
function sqlCreateApplication(string $id, string $userEmail, string $userName,
                                string $competition, string $projectType,
                                string $title, string $area, string $description,
                                int $durationMonths, string $professionalField = '',
                                string $acronym = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL create_application(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $userEmail, $userName, $competition, $projectType,
                        $title, $area, $description, $durationMonths,
                        $professionalField ?: null, $acronym ?: null]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('applications');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlCreateApplication: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.02 Update application fields.
 * Replaces GS.JS updateForm().
 */
function sqlUpdateApplication(string $id, string $userEmail, string $fieldsJson): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL update_application(?, ?, ?)');
        $stmt->execute([$id, $userEmail, $fieldsJson]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('applications');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlUpdateApplication: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.03 Delete application (soft or hard delete).
 * Replaces GS.JS deleteFormDraft_().
 */
function sqlDeleteApplication(string $id, string $userEmail): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL delete_application(?, ?)');
        $stmt->execute([$id, $userEmail]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('applications');
        $res = $result ?: ['deleteType' => 'deleted'];
        $res['success'] = true;
        $res['_source'] = 'sql';
        return $res;
    } catch (Throwable $e) {
        logError("sqlDeleteApplication: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.03b Submit application — full validation pipeline.
 * Replaces GS.JS submitForm() core logic.
 * Validates: status, fields, competition deadline, budget, documents,
 * team size, project type rules (TRL, self-assessment).
 */
function sqlSubmitApplication(string $applicationId, string $userEmail,
                               string $userRole = 'applicant',
                               string $otpCode = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL submit_application(?, ?, ?, ?)');
        $stmt->execute([$applicationId, $userEmail, $userRole, $otpCode ?: null]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('applications');
        return [
            'success' => true,
            'data' => $result ?: [],
            'id' => $applicationId,
            'newStatus' => ($result['new_status'] ?? 'submitted'),
            'message' => ($result['message'] ?? 'Заявлението е подадено успешно.'),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlSubmitApplication: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.04 Create a new competition.
 * Replaces GS.JS createCompetition().
 */
function sqlCreateCompetition(string $id, string $name, string $deadline = '',
                               string $description = '', string $callType = '',
                               int $year = 0, string $openDate = '',
                               string $createdBy = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL create_competition(?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $id, $name,
            $deadline ?: null,
            $description ?: null,
            $callType ?: null,
            $year > 0 ? $year : date('Y'),
            $openDate ?: null,
            $createdBy ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('competitions');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlCreateCompetition: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.05 Update competition fields.
 */
function sqlUpdateCompetition(string $id, string $fieldsJson, string $updatedBy = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL update_competition(?, ?, ?)');
        $stmt->execute([$id, $fieldsJson, $updatedBy ?: null]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('competitions');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlUpdateCompetition: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.06 Delete/archive competition.
 */
function sqlDeleteCompetition(string $id, string $deletedBy = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL delete_competition(?, ?)');
        $stmt->execute([$id, $deletedBy ?: null]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('competitions');
        clearQueryCache('applications');
        $res = $result ?: [];
        $res['success'] = true;
        $res['_source'] = 'sql';
        return $res;
    } catch (Throwable $e) {
        logError("sqlDeleteCompetition: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.07 Create project from approved application.
 * Replaces GS.JS createProject().
 */
function sqlCreateProject(string $id, string $applicationId, string $startDate,
                           string $endDate, string $createdBy = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL create_project_from_application(?, ?, ?, ?, ?)');
        $stmt->execute([$id, $applicationId, $startDate ?: null, $endDate ?: null, $createdBy ?: null]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('projects');
        clearQueryCache('applications');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlCreateProject: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.08 Create a report.
 */
function sqlCreateReport(string $id, string $projectId, string $reportType,
                          string $title = '', string $period = '',
                          string $periodStart = '', string $periodEnd = '',
                          string $deadline = '', string $createdBy = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL create_report(?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $id, $projectId, $reportType, $title ?: null, $period ?: null,
            $periodStart ?: null, $periodEnd ?: null, $deadline ?: null,
            $createdBy ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('reports');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlCreateReport: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.09 Create an expense request.
 */
function sqlCreateExpense(string $id, string $projectId, string $budgetLine = '',
                           string $description = '', float $amount = 0,
                           string $date = '', string $costGroup = '',
                           int $year = 0, string $requestedBy = '',
                           string $notes = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL create_expense(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $id, $projectId, $budgetLine ?: null, $description ?: null, $amount,
            $date ?: null, $costGroup ?: null, $year > 0 ? $year : (int)date('Y'),
            $requestedBy ?: null, $notes ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('expenses');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlCreateExpense: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.10 Create a change request.
 */
function sqlCreateChangeRequest(string $id, string $projectId, string $changeType,
                                 string $requestedBy, string $description = '',
                                 string $oldData = '', string $newData = '',
                                 string $notes = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL create_change_request(?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $id, $projectId, $changeType, $requestedBy, $description ?: null,
            $oldData ?: null, $newData ?: null, $notes ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('change_requests');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlCreateChangeRequest: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.11 Create a deliverable.
 */
function sqlCreateDeliverable(string $id, string $projectId, string $type,
                               string $title = '', string $description = '',
                               string $dueDate = '', string $createdBy = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL create_deliverable(?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $id, $projectId, $type, $title ?: null, $description ?: null,
            $dueDate ?: null, $createdBy ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('deliverables');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlCreateDeliverable: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.12 Create a library deposit.
 */
function sqlCreateLibraryDeposit(string $id, string $projectId, string $publicationType,
                                  string $title = '', string $authors = '',
                                  string $publishedAt = '', string $createdBy = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL create_library_deposit(?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $id, $projectId, $publicationType, $title ?: null, $authors ?: null,
            $publishedAt ?: null, $createdBy ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('library_deposits');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlCreateLibraryDeposit: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 7.13 Create a notification.
 */
function sqlCreateNotification(string $userEmail, string $type, string $title = '',
                                string $body = '', string $relatedType = '',
                                string $relatedId = '', string $actionUrl = '',
                                string $actionLabel = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL create_notification(?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $userEmail, $type, $title ?: null, $body ?: null,
            $relatedType ?: null, $relatedId ?: null,
            $actionUrl ?: null, $actionLabel ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'notificationId' => (int)($result['notification_id'] ?? 0), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlCreateNotification: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}


// ══════════════════════════════════════════════════════════════════════════════
//  PART 8: SYNC & DATA MIGRATION FUNCTIONS (v5)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 8.01 Sync/upsert an application from GAS.
 */
function sqlSyncApplication(array $appData): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL sync_application(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $appData['id'] ?? '', $appData['userEmail'] ?? $appData['user_email'] ?? '',
            $appData['userName'] ?? $appData['user_name'] ?? '',
            $appData['competition'] ?? '', $appData['projectCode'] ?? $appData['project_code'] ?? '',
            $appData['title'] ?? null, $appData['titleEn'] ?? $appData['title_en'] ?? null,
            $appData['area'] ?? '', $appData['description'] ?? null,
            $appData['descriptionEn'] ?? $appData['description_en'] ?? null,
            $appData['status'] ?? 'draft', $appData['submitted'] ?? null,
            $appData['returnComment'] ?? $appData['return_comment'] ?? null,
            $appData['fileIds'] ?? $appData['file_ids'] ?? null,
            $appData['attachedDocs'] ?? $appData['attached_docs'] ?? null,
            $appData['history'] ?? null, $appData['created'] ?? null,
            $appData['signature'] ?? null, $appData['signatureAdmin'] ?? $appData['signature_admin'] ?? null,
            $appData['teamMembers'] ?? $appData['team_members'] ?? null,
            $appData['reviewers'] ?? null, $appData['evaluation'] ?? null,
            $appData['contractId'] ?? $appData['contract_id'] ?? null,
            $appData['budget'] ?? null,
            (int)($appData['durationMonths'] ?? $appData['duration_months'] ?? 12),
            $appData['objectives'] ?? null, $appData['expectedResults'] ?? $appData['expected_results'] ?? null,
            $appData['indicators'] ?? null, $appData['eligibilityChecklist'] ?? $appData['eligibility_checklist'] ?? null,
            $appData['score'] ?? null, $appData['rank'] ?? null,
            $appData['workProgram'] ?? $appData['work_program'] ?? null,
            $appData['professionalField'] ?? $appData['professional_field'] ?? null,
            $appData['acronym'] ?? null, (int)($appData['selfAssessmentScore'] ?? $appData['self_assessment_score'] ?? 0),
            $appData['npfTier'] ?? $appData['npf_tier'] ?? null,
            $appData['projectType'] ?? $appData['project_type'] ?? null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('applications');
        $res = $result ?: [];
        $res['success'] = true;
        $res['_source'] = 'sql';
        return $res;
    } catch (Throwable $e) {
        logError("sqlSyncApplication: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 8.02 Sync/upsert a competition from GAS.
 */
function sqlSyncCompetition(array $compData): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL sync_competition(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $compData['id'] ?? '', $compData['name'] ?? '',
            $compData['deadline'] ?? null, $compData['status'] ?? 'draft',
            $compData['created'] ?? null, $compData['description'] ?? null,
            $compData['folderId'] ?? $compData['folder_id'] ?? null,
            $compData['callType'] ?? $compData['call_type'] ?? null,
            (int)($compData['year'] ?? 0),
            isset($compData['directions']) ? (is_string($compData['directions']) ? $compData['directions'] : json_encode($compData['directions'])) : null,
            isset($compData['evaluationCriteria']) ? (is_string($compData['evaluationCriteria']) ? $compData['evaluationCriteria'] : json_encode($compData['evaluationCriteria'])) : null,
            isset($compData['budgetByDirection']) ? (is_string($compData['budgetByDirection']) ? $compData['budgetByDirection'] : json_encode($compData['budgetByDirection'])) : null,
            $compData['openDate'] ?? $compData['open_date'] ?? null,
            isset($compData['templates']) ? (is_string($compData['templates']) ? $compData['templates'] : json_encode($compData['templates'])) : null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('competitions');
        $res = $result ?: [];
        $res['success'] = true;
        $res['_source'] = 'sql';
        return $res;
    } catch (Throwable $e) {
        logError("sqlSyncCompetition: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 8.03 Get data changes since a given version (incremental sync).
 */
function sqlGetDataChangesSince(int $version, array $tables = []): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_data_changes_since(?, ?)');
        $stmt->execute([$version, !empty($tables) ? implode(',', $tables) : null]);
        $changes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'changes' => $changes, 'count' => count($changes), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetDataChangesSince: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}


// ══════════════════════════════════════════════════════════════════════════════
//  PART 9: EMAIL & NOTIFICATION FUNCTIONS (v5)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 9.01 Queue an email for sending.
 */
function sqlQueueEmail(string $recipientEmail, string $recipientName,
                        string $subject, string $bodyHtml = '', string $bodyText = '',
                        string $emailType = 'notification', int $priority = 0,
                        string $scheduledAt = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL queue_email(?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $recipientEmail, $recipientName ?: null, $subject,
            $bodyHtml ?: null, $bodyText ?: null, $emailType, $priority,
            $scheduledAt ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'emailId' => (int)($result['email_id'] ?? 0), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlQueueEmail: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 9.02 Get pending emails from the queue.
 */
function sqlGetPendingEmails(int $limit = 20): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_pending_emails(?)');
        $stmt->execute([$limit]);
        $emails = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'emails' => $emails, 'count' => count($emails), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetPendingEmails: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 9.03 Mark email as sent/failed.
 */
function sqlMarkEmailSent(int $emailId, string $status, string $error = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL mark_email_sent(?, ?, ?)');
        $stmt->execute([$emailId, $status, $error ?: null]);
        $stmt->closeCursor();
        return ['success' => true, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlMarkEmailSent: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 9.04 Notify user of status change (creates notification + queues email).
 */
function sqlNotifyStatusChange(string $userEmail, string $entityType, string $entityId,
                                string $newStatus, string $oldStatus): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL notify_status_change(?, ?, ?, ?, ?)');
        $stmt->execute([$userEmail, $entityType, $entityId, $newStatus, $oldStatus]);
        $stmt->closeCursor();
        clearQueryCache('notifications');
        return ['success' => true, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlNotifyStatusChange: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}


// ══════════════════════════════════════════════════════════════════════════════
//  PART 10: SYSTEM MAINTENANCE FUNCTIONS (v5)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 10.01 Auto-expire projects past their end date.
 */
function sqlAutoExpireProjects(): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL auto_expire_projects()');
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('projects');
        return ['success' => true, 'expiredCount' => (int)($result['projects_expired'] ?? 0), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlAutoExpireProjects: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 10.02 Mark overdue reviewers.
 */
function sqlMarkOverdueReviewers(): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL mark_overdue_reviewers()');
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('reviewers');
        return ['success' => true, 'overdueCount' => (int)($result['reviewers_marked_overdue'] ?? 0), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlMarkOverdueReviewers: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 10.03 Cleanup old data with retention period.
 */
function sqlCleanupOldData(int $retentionDays = 365): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL cleanup_old_data(?)');
        $stmt->execute([$retentionDays]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'deletedRows' => (int)($result['total_deleted_rows'] ?? 0), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlCleanupOldData: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}


// ══════════════════════════════════════════════════════════════════════════════
//  PART 11: DRIVE ASSET MIRRORING FUNCTIONS (v6 — schema_migration_v6_drive_mirror.sql)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 11.01 Upsert a document in the mirror (from GAS sync).
 */
function sqlUpsertDocument(string $id, string $name, string $mimeType = '',
                            int $size = 0, string $folderName = '',
                            string $parentFolderId = '', string $category = '',
                            string $docType = '', string $description = '',
                            string $driveId = '', string $webViewLink = '',
                            string $downloadUrl = '', string $editLink = '',
                            string $previewLink = '', string $thumbnailLink = '',
                            string $iconLink = '', string $origin = 'uploaded',
                            string $formId = '', string $projectType = '',
                            string $userEmail = '', string $driveCreated = '',
                            string $driveModified = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL upsert_document(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $id, $name, $mimeType ?: null, $size, $folderName ?: null,
            $parentFolderId ?: null, $category ?: null, $docType ?: null,
            $description ?: null, $driveId ?: null, $webViewLink ?: null,
            $downloadUrl ?: null, $editLink ?: null, $previewLink ?: null,
            $thumbnailLink ?: null, $iconLink ?: null, $origin ?: null,
            $formId ?: null, $projectType ?: null, $userEmail ?: null,
            $driveCreated ?: null, $driveModified ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('documents');
        $res = $result ?: ['operation' => 'upserted'];
        $res['success'] = true;
        $res['_source'] = 'sql';
        return $res;
    } catch (Throwable $e) {
        logError("sqlUpsertDocument: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 11.02 Upsert a file blob (mirrored content).
 */
function sqlUpsertDriveFileBlob(string $driveFileId, string $name,
                                 string $mimeType = '', int $sizeBytes = 0,
                                 string $contentBase64 = '', string $contentText = '',
                                 string $md5Hash = '', string $category = '',
                                 string $projectType = '', string $docType = '',
                                 string $parentFolderId = '', string $webViewLink = '',
                                 string $downloadUrl = '', string $editLink = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL upsert_drive_file_blob(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $driveFileId, $name, $mimeType ?: null, $sizeBytes,
            $contentBase64 ?: null, $contentText ?: null, $md5Hash ?: null,
            $category ?: null, $projectType ?: null, $docType ?: null,
            $parentFolderId ?: null, $webViewLink ?: null,
            $downloadUrl ?: null, $editLink ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('drive_file_blobs');
        $res = $result ?: ['operation' => 'synced'];
        $res['success'] = true;
        $res['_source'] = 'sql';
        return $res;
    } catch (Throwable $e) {
        logError("sqlUpsertDriveFileBlob: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 11.03 Upsert a generated document cache entry.
 */
function sqlUpsertGeneratedDoc(string $id, string $formId, string $projectType,
                                string $docType, string $fileName, string $mimeType = '',
                                string $driveFileId = '', int $sizeBytes = 0,
                                string $origin = 'generated', string $generationMethod = '',
                                string $templateSourceId = '', string $templateSourceName = '',
                                bool $hasSignature = false, string $embedUrl = '',
                                string $editUrl = '', string $downloadUrl = '',
                                string $previewUrl = '', string $userEmail = '',
                                bool $isApplicantCopy = false): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL upsert_generated_doc(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $id, $formId, $projectType, $docType, $fileName,
            $mimeType ?: null, $driveFileId ?: null, $sizeBytes,
            $origin, $generationMethod ?: null,
            $templateSourceId ?: null, $templateSourceName ?: null,
            $hasSignature ? 1 : 0, $embedUrl ?: null, $editUrl ?: null,
            $downloadUrl ?: null, $previewUrl ?: null,
            $userEmail ?: null, $isApplicantCopy ? 1 : 0
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('generated_doc_cache');
        $res = $result ?: ['operation' => 'cached'];
        $res['success'] = true;
        $res['_source'] = 'sql';
        return $res;
    } catch (Throwable $e) {
        logError("sqlUpsertGeneratedDoc: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 11.04 Get documents by folder type — instant-load from mirror.
 */
function sqlGetDocumentsByFolder(string $folderType = '', string $projectType = '',
                                  string $category = '', string $origin = '',
                                  string $userEmail = '', string $search = '',
                                  int $offset = 0, int $limit = 100): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_documents_by_folder(?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $folderType ?: null, $projectType ?: null, $category ?: null,
            $origin ?: null, $userEmail ?: null, $search ?: null,
            $offset, $limit
        ]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $countRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'data' => $data,
            'total' => (int)($countRow['total_count'] ?? 0),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetDocumentsByFolder: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 11.05 Get all mirrored Drive assets (admin panel).
 */
function sqlGetDriveAssets(bool $includeBlobs = false, int $offset = 0, int $limit = 200): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_drive_assets(?,?,?)');
        $stmt->execute([$includeBlobs ? 1 : 0, $offset, $limit]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $countRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->nextRowset();
        $counts = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'data' => $data,
            'total' => (int)($countRow['total_count'] ?? 0),
            'counts' => $counts ?: [],
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetDriveAssets: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 11.06 Get mirrored logo blobs for email/app branding.
 */
function sqlGetLogoBlobs(): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_logo_blobs()');
        $stmt->execute();
        $logos = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'logos' => $logos, 'count' => count($logos), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetLogoBlobs: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 11.07 Get generated docs for a specific form.
 */
function sqlGetFormGeneratedDocs(string $formId, bool $includeInactive = false): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_form_generated_docs(?,?)');
        $stmt->execute([$formId, $includeInactive ? 1 : 0]);
        $docs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'documents' => $docs, 'count' => count($docs), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetFormGeneratedDocs: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 11.08 Mirror a folder definition.
 */
function sqlMirrorFolder(string $folderId, string $name, string $parentFolderId = '',
                          string $folderType = 'generic', string $projectType = '',
                          int $fileCount = 0, int $totalSizeBytes = 0,
                          string $syncToken = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL mirror_folder(?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $folderId, $name, $parentFolderId ?: null, $folderType,
            $projectType ?: null, $fileCount, $totalSizeBytes,
            $syncToken ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        $res = $result ?: ['operation' => 'registered'];
        $res['success'] = true;
        $res['_source'] = 'sql';
        return $res;
    } catch (Throwable $e) {
        logError("sqlMirrorFolder: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 11.09 Bulk sync documents — marker for batch completion.
 */
function sqlBulkSyncDocuments(array $documents, string $folderId = ''): array {
    try {
        $synced = 0; $errors = [];
        foreach ($documents as $doc) {
            $r = sqlUpsertDocument(
                $doc['id'] ?? '', $doc['name'] ?? '',
                $doc['mimeType'] ?? $doc['mime_type'] ?? '', (int)($doc['size'] ?? 0),
                $doc['folderName'] ?? $doc['folder_name'] ?? '',
                $doc['parentFolderId'] ?? $doc['parent_folder_id'] ?? '',
                $doc['category'] ?? '', $doc['docType'] ?? $doc['doc_type'] ?? '',
                $doc['description'] ?? '',
                $doc['driveId'] ?? $doc['drive_id'] ?? $doc['id'] ?? '',
                $doc['webViewLink'] ?? $doc['web_view_link'] ?? '',
                $doc['downloadUrl'] ?? $doc['download_url'] ?? '',
                $doc['editLink'] ?? $doc['edit_link'] ?? '',
                $doc['previewLink'] ?? $doc['preview_link'] ?? '',
                $doc['thumbnailLink'] ?? $doc['thumbnail_link'] ?? '',
                $doc['iconLink'] ?? $doc['icon_link'] ?? '',
                $doc['origin'] ?? 'uploaded',
                $doc['formId'] ?? $doc['form_id'] ?? '',
                $doc['projectType'] ?? $doc['project_type'] ?? '',
                $doc['userEmail'] ?? $doc['user_email'] ?? '',
                $doc['driveCreated'] ?? $doc['drive_created'] ?? '',
                $doc['driveModified'] ?? $doc['drive_modified'] ?? ''
            );
            if ($r['success']) $synced++; else $errors[] = $doc['id'] ?? '?';
        }
        return [
            'success' => true,
            'synced' => $synced,
            'errors' => $errors,
            'total' => count($documents),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlBulkSyncDocuments: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Part 14 — v8 docSQL: Instant document operations (sub-100ms)
//  These bypass GAS/Drive API and work entirely within MySQL.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Attach a document to an application (instant — no Drive API).
 * Calls attach_document_to_application stored procedure.
 * Returns the updated attached_docs JSON.
 */
function sqlAttachDocumentToApplication(string $documentId, string $formId, string $userEmail = ''): array {
    try {
        $db = getDB();
        // Use the new v8 stored procedure
        try {
            $stmt = $db->prepare('CALL attach_document_to_application(?, ?, ?)');
            $stmt->execute([$documentId, $formId, $userEmail]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $stmt->closeCursor();
            _bumpApplicationsVersion(); // v3.39.2-sqlsync: instant cache invalidation
            return ['success' => true, 'attached_docs' => ($row['attached_docs'] ?? '[]'), '_source' => 'sql'];
        } catch (PDOException $e) {
            // Fallback: if the v8 procedure doesn't exist yet, do a JSON update directly
            $existing = dbFetchOne("SELECT attached_docs FROM applications WHERE id=?", [$formId]);
            $docs = json_decode($existing['attached_docs'] ?? '[]', true) ?: [];
            // Check if already attached
            $found = false;
            foreach ($docs as $d) {
                if (($d['id'] ?? '') === $documentId) { $found = true; break; }
            }
            if (!$found) {
                // Fetch doc info
                $doc = dbFetchOne("SELECT id, name, mime_type, size, drive_id, web_view_link, download_url, preview_link, category, origin FROM documents WHERE id=?", [$documentId]);
                if ($doc) {
                    $doc['attached_at'] = date('c');
                    $doc['origin'] = $doc['origin'] ?: 'attached';
                    $docs[] = $doc;
                }
                dbQuery("UPDATE applications SET attached_docs=?, updated_at=NOW() WHERE id=?", [json_encode($docs), $formId]);
            }
            _bumpApplicationsVersion(); // v3.39.2-sqlsync: instant cache invalidation
            return ['success' => true, 'attached_docs' => json_encode($docs), '_source' => 'sql_fallback'];
        }
    } catch (Throwable $e) {
        logError("sqlAttachDocumentToApplication: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * v3.39.2-sqlsync: Bump the `applications` row in data_version so the frontend
 * version poller detects document attach/detach changes immediately (next ~5s
 * poll) and other tabs / stale caches refresh consistently.
 */
function _bumpApplicationsVersion(): void {
    try {
        dbQuery('INSERT INTO data_version (table_name, version, updated_at)
                 VALUES ("applications",1,NOW())
                 ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
    } catch (Throwable $_) { /* non-critical */ }
}

/**
 * Detach a document from an application (instant — no Drive API).
 */
function sqlDetachDocumentFromApplication(string $documentId, string $formId): array {
    try {
        $db = getDB();
        try {
            $stmt = $db->prepare('CALL detach_document_from_application(?, ?)');
            $stmt->execute([$documentId, $formId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $stmt->closeCursor();
            _bumpApplicationsVersion(); // v3.39.2-sqlsync: instant cache invalidation
            return ['success' => true, 'attached_docs' => ($row['attached_docs'] ?? '[]'), '_source' => 'sql'];
        } catch (PDOException $e) {
            // Fallback: direct JSON update
            $existing = dbFetchOne("SELECT attached_docs FROM applications WHERE id=?", [$formId]);
            $docs = json_decode($existing['attached_docs'] ?? '[]', true) ?: [];
            $docs = array_values(array_filter($docs, fn($d) => ($d['id'] ?? '') !== $documentId));
            dbQuery("UPDATE applications SET attached_docs=?, updated_at=NOW() WHERE id=?", [json_encode($docs), $formId]);
            _bumpApplicationsVersion(); // v3.39.2-sqlsync: instant cache invalidation
            return ['success' => true, 'attached_docs' => json_encode($docs), '_source' => 'sql_fallback'];
        }
    } catch (Throwable $e) {
        logError("sqlDetachDocumentFromApplication: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * v3.39.2-sqlsync: Return the number of entries currently in a form's
 * attached_docs JSON array (used by the repair handler to report pruning).
 */
function sqlGetApplicationDocCount(string $formId): int {
    try {
        $app = dbFetchOne("SELECT attached_docs FROM applications WHERE id=?", [$formId]);
        $docs = json_decode($app['attached_docs'] ?? '[]', true) ?: [];
        return is_array($docs) ? count($docs) : 0;
    } catch (Throwable $_) {
        return 0;
    }
}

/**
 * v3.39.2-sqlsync: Self-heal `applications.attached_docs`.
 * Prunes references whose id looks like a LOCAL document (uploaded `up_`,
 * generated `doc_`, copied `copied_`, or a 25+ char Drive id) but is no longer
 * present in the `documents` table — these are dangling and would otherwise
 * accumulate forever. Drive-synthetic library/template ids (e.g. `fnisections35`)
 * are intentionally KEPT because they live only in Drive and are never in the
 * documents table. Returns the cleaned doc array.
 */
function sqlRepairApplicationDocs(string $formId): array {
    try {
        $app = dbFetchOne("SELECT attached_docs FROM applications WHERE id=?", [$formId]);
        $docs = json_decode($app['attached_docs'] ?? '[]', true) ?: [];
        if (!is_array($docs) || empty($docs)) return $docs;
        $localIds = [];
        foreach ($docs as $d) {
            $id = (string)($d['id'] ?? '');
            if ($id === '') continue;
            $isLocal = preg_match('/^(up_|doc_|copied_|s_)/', $id)
                || preg_match('/^[a-zA-Z0-9_\-]{25,}$/', $id);
            if ($isLocal) $localIds[] = $id;
        }
        if (empty($localIds)) return $docs; // nothing to validate
        $placeholders = implode(',', array_fill(0, count($localIds), '?'));
        $existing = dbFetchAll("SELECT id FROM documents WHERE id IN ($placeholders)", $localIds);
        $existingIds = array_flip(array_column($existing, 'id'));
        $cleaned = [];
        $pruned = 0;
        foreach ($docs as $d) {
            $id = (string)($d['id'] ?? '');
            $isLocal = preg_match('/^(up_|doc_|copied_|s_)/', $id)
                || preg_match('/^[a-zA-Z0-9_\-]{25,}$/', $id);
            if ($isLocal && !isset($existingIds[$id])) { $pruned++; continue; }
            $cleaned[] = $d;
        }
        if ($pruned > 0) {
            dbQuery("UPDATE applications SET attached_docs=?, updated_at=NOW() WHERE id=?",
                [json_encode($cleaned, JSON_UNESCAPED_UNICODE), $formId]);
            _bumpApplicationsVersion();
            logError("sqlRepairApplicationDocs: pruned $pruned dangling doc ref(s) on form $formId");
        }
        return $cleaned;
    } catch (Throwable $e) {
        logError("sqlRepairApplicationDocs: " . $e->getMessage());
        return $docs ?? [];
    }
}

/**
 * Get all documents for an application (instant — from SQL, no Drive API).
 */
function sqlGetApplicationDocuments(string $formId, bool $includeBlobs = false): array {
    try {
        $db = getDB();
        try {
            $stmt = $db->prepare('CALL get_application_documents(?, ?)');
            $stmt->execute([$formId, $includeBlobs ? 1 : 0]);
            $docs = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $stmt->closeCursor();
            return ['success' => true, 'documents' => $docs, '_source' => 'sql'];
        } catch (PDOException $e) {
            // Fallback: read from attached_docs JSON + documents table
            $app = dbFetchOne("SELECT attached_docs FROM applications WHERE id=?", [$formId]);
            $docIds = [];
            $docs = json_decode($app['attached_docs'] ?? '[]', true) ?: [];
            foreach ($docs as $d) {
                if (!empty($d['id'])) $docIds[] = $d['id'];
            }
            if (empty($docIds)) return ['success' => true, 'documents' => [], '_source' => 'sql_fallback'];
            $placeholders = implode(',', array_fill(0, count($docIds), '?'));
            $fullDocs = dbFetchAll("SELECT d.*, CASE WHEN b.content_base64 IS NOT NULL THEN 1 ELSE 0 END AS has_blob
                FROM documents d LEFT JOIN drive_file_blobs b ON b.drive_file_id = d.drive_id
                WHERE d.id IN ($placeholders) ORDER BY d.created DESC", $docIds);
            return ['success' => true, 'documents' => $fullDocs, '_source' => 'sql_fallback'];
        }
    } catch (Throwable $e) {
        logError("sqlGetApplicationDocuments: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * Bulk attach multiple documents to an application.
 */
function sqlBulkAttachDocuments(string $formId, array $documentIds): array {
    try {
        $db = getDB();
        try {
            $stmt = $db->prepare('CALL bulk_attach_documents(?, ?)');
            $stmt->execute([$formId, json_encode($documentIds)]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $stmt->closeCursor();
            return ['success' => true, 'attached_docs' => ($row['attached_docs'] ?? '[]'), '_source' => 'sql'];
        } catch (PDOException $e) {
            // Sequential fallback
            $result = ['success' => true, 'attached_docs' => '[]'];
            foreach ($documentIds as $docId) {
                $result = sqlAttachDocumentToApplication($docId, $formId);
                if (!$result['success']) return $result;
            }
            return $result;
        }
    } catch (Throwable $e) {
        logError("sqlBulkAttachDocuments: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * Copy documents from one application to another.
 */
function sqlCopyApplicationDocuments(string $sourceFormId, string $targetFormId): array {
    try {
        $db = getDB();
        try {
            $stmt = $db->prepare('CALL copy_application_documents(?, ?)');
            $stmt->execute([$sourceFormId, $targetFormId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $stmt->closeCursor();
            return ['success' => true, 'attached_docs' => ($row['attached_docs'] ?? '[]'), '_source' => 'sql'];
        } catch (PDOException $e) {
            // Fallback: copy JSON array
            $source = dbFetchOne("SELECT attached_docs FROM applications WHERE id=?", [$sourceFormId]);
            $target = dbFetchOne("SELECT attached_docs FROM applications WHERE id=?", [$targetFormId]);
            $sourceDocs = json_decode($source['attached_docs'] ?? '[]', true) ?: [];
            $targetDocs = json_decode($target['attached_docs'] ?? '[]', true) ?: [];
            $merged = array_merge($targetDocs, $sourceDocs);
            dbQuery("UPDATE applications SET attached_docs=?, updated_at=NOW() WHERE id=?", [json_encode($merged), $targetFormId]);
            return ['success' => true, 'attached_docs' => json_encode($merged), '_source' => 'sql_fallback'];
        }
    } catch (Throwable $e) {
        logError("sqlCopyApplicationDocuments: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * Search documents with full-text and filters (instant — no Drive API).
 */
function sqlSearchDocuments(string $query = '', string $category = '', string $projectType = '',
                            string $origin = '', string $userEmail = '', int $offset = 0, int $limit = 50): array {
    try {
        $db = getDB();
        try {
            $stmt = $db->prepare('CALL search_documents(?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$query, $category, $projectType, $origin, $userEmail, $offset, $limit]);
            $docs = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $stmt->nextRowset();
            $countRow = $stmt->fetch(PDO::FETCH_ASSOC);
            $stmt->closeCursor();
            return ['success' => true, 'documents' => $docs, 'total' => (int)($countRow['total'] ?? 0), '_source' => 'sql'];
        } catch (PDOException $e) {
            // Fallback: simple SQL search
            $where = []; $params = [];
            if ($query) { $where[] = '(name LIKE ? OR description LIKE ?)'; $params[] = "%$query%"; $params[] = "%$query%"; }
            if ($category) { $where[] = 'category=?'; $params[] = $category; }
            if ($projectType) { $where[] = 'project_type=?'; $params[] = $projectType; }
            if ($origin) { $where[] = 'origin=?'; $params[] = $origin; }
            if ($userEmail) { $where[] = 'user_email=?'; $params[] = $userEmail; }
            $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';
            $total = dbFetchOne("SELECT COUNT(*) as cnt FROM documents $whereClause", $params);
            $docs = dbFetchAll("SELECT d.*, CASE WHEN b.content_base64 IS NOT NULL THEN 1 ELSE 0 END AS has_blob
                FROM documents d LEFT JOIN drive_file_blobs b ON b.drive_file_id = d.drive_id
                $whereClause ORDER BY d.updated_at DESC LIMIT ? OFFSET ?",
                array_merge($params, [$limit, $offset]));
            return ['success' => true, 'documents' => $docs, 'total' => (int)($total['cnt'] ?? 0), '_source' => 'sql_fallback'];
        }
    } catch (Throwable $e) {
        logError("sqlSearchDocuments: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * Get best document URL (instant — no Drive API).
 */
function sqlGetDocumentUrl(string $documentId): array {
    try {
        $db = getDB();
        try {
            $stmt = $db->prepare('CALL get_document_url(?)');
            $stmt->execute([$documentId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $stmt->closeCursor();
            return $row ? ['success' => true, 'document' => $row, '_source' => 'sql'] : ['success' => false, 'error' => 'Document not found'];
        } catch (PDOException $e) {
            $doc = dbFetchOne("SELECT id, name, mime_type, drive_id, web_view_link, download_url, preview_link, thumbnail_link, icon_link FROM documents WHERE id=?", [$documentId]);
            if (!$doc) return ['success' => false, 'error' => 'Document not found'];
            $doc['best_url'] = $doc['web_view_link'] ?: $doc['preview_link'] ?: $doc['download_url'] ?: '';
            $doc['url_type'] = $doc['web_view_link'] ? 'webview' : ($doc['preview_link'] ? 'preview' : ($doc['download_url'] ? 'download' : 'unknown'));
            return ['success' => true, 'document' => $doc, '_source' => 'sql_fallback'];
        }
    } catch (Throwable $e) {
        logError("sqlGetDocumentUrl: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}


// ══════════════════════════════════════════════════════════════════════════════
//  Part 15 — v11: Remaining High-Value Operations
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 15.01 Bulk update application status — admin only.
 * Replaces GAS bulkUpdateApplicationStatus().
 */
function sqlBulkUpdateApplicationStatus(string $formIds, string $newStatus, string $userEmail): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL bulk_update_application_status(?, ?, ?)');
        $stmt->execute([$formIds, $newStatus, $userEmail]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('applications');
        return [
            'success' => true,
            'data' => $result ?: [],
            'updatedCount' => (int)($result['updated_count'] ?? 0),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlBulkUpdateApplicationStatus: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 15.02 Add a sanction record.
 * Replaces GAS addSanction().
 */
function sqlAddSanction(string $userEmail, string $userName, string $projectId = '',
                         string $projectTitle = '', string $direction = '',
                         string $projectCode = '', string $sanctionType = 'unsatisfactory_execution',
                         string $notes = '', string $recordedBy = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL add_sanction(?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $userEmail, $userName, $projectId ?: null, $projectTitle ?: null,
            $direction ?: null, $projectCode ?: null, $sanctionType,
            $notes ?: null, $recordedBy ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('sanctions');
        return [
            'success' => true,
            'sanctionId' => $result['sanction_id'] ?? '',
            'endDate' => $result['end_date'] ?? '',
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlAddSanction: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 15.03 Transition project status with validation.
 * Replaces GAS transitionProjectStatus().
 */
function sqlTransitionProjectStatus(string $projectId, string $newStatus,
                                     string $userEmail, string $userRole = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL transition_project_status(?, ?, ?, ?)');
        $stmt->execute([$projectId, $newStatus, $userEmail, $userRole ?: 'admin']);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('projects');
        return [
            'success' => true,
            'data' => $result ?: [],
            'previousStatus' => $result['previous_status'] ?? '',
            'newStatus' => $result['new_status'] ?? $newStatus,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlTransitionProjectStatus: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 15.04 Sign project contract.
 * Replaces GAS signProjectContract().
 */
function sqlSignProjectContract(string $applicationId, string $userEmail,
                                 string $signedDate = '', string $signatureType = 'attached',
                                 string $signatureFileId = '', string $signatureFileName = '',
                                 string $contractId = '', string $lateWaiverRef = '',
                                 string $notes = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL sign_project_contract(?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $applicationId, $userEmail,
            $signedDate ?: null, $signatureType,
            $signatureFileId ?: null, $signatureFileName ?: null,
            $contractId ?: null, $lateWaiverRef ?: null, $notes ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('applications');
        return [
            'success' => true,
            'data' => $result ?: [],
            'newStatus' => 'contract_signed',
            'contractId' => $result['contract_id'] ?? $contractId,
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlSignProjectContract: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 15.05 Confirm library submission for a deliverable.
 * Replaces GAS confirmLibrarySubmission().
 */
function sqlConfirmLibrarySubmission(string $deliverableId, bool $copiesProvided,
                                      bool $electronicCopyProvided, string $confirmedBy): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL confirm_library_submission(?, ?, ?, ?)');
        $stmt->execute([$deliverableId, $copiesProvided ? 1 : 0, $electronicCopyProvided ? 1 : 0, $confirmedBy ?: null]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('deliverables');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlConfirmLibrarySubmission: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 15.06 Get contract deadlines for reminders.
 * Replaces GAS getContractDeadlines().
 */
function sqlGetContractDeadlines(string $userEmail = '', bool $isAdmin = false): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_contract_deadlines(?, ?)');
        $stmt->execute([$userEmail ?: null, $isAdmin ? 1 : 0]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return [
            'success' => true,
            'deadlines' => $data,
            'total' => count($data),
            '_source' => 'sql'
        ];
    } catch (Throwable $e) {
        logError("sqlGetContractDeadlines: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 15.07 Update a deliverable's fields.
 * Replaces GAS updateDeliverable().
 */
function sqlUpdateDeliverable(string $id, string $status = '', string $completedDate = '',
                               string $evidenceFileId = '', string $url = '',
                               string $title = '', string $description = '',
                               string $user = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL update_deliverable(?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $id, $status, $completedDate ?: null, $evidenceFileId ?: null,
            $url ?: null, $title ?: null, $description ?: null, $user ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('deliverables');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlUpdateDeliverable: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * 15.08 Replace a reviewer on a form.
 * Replaces GAS replaceReviewer().
 */
function sqlReplaceReviewer(string $formId, string $oldEmail, string $newEmail,
                             string $newName = '', string $reason = '',
                             string $user = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL replace_reviewer(?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $formId, $oldEmail, $newEmail,
            $newName ?: null, $reason ?: null, $user ?: null
        ]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('reviewers');
        return ['success' => true, 'data' => $result ?: [], '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlReplaceReviewer: " . $e->getMessage());
        // The replace_reviewer stored procedure is not shipped in this repo, so
        // on any server missing it the CALL above throws. Fall back to direct
        // SQL (same pattern as _sqlGetTemplateLibraryFallback) rather than
        // letting the caller degrade to handleStub(), which would report
        // success while changing nothing.
        return _sqlReplaceReviewerFallback($formId, $oldEmail, $newEmail, $newName, $reason, $user);
    }
}

/**
 * Fallback for sqlReplaceReviewer — direct SQL, no stored procedure.
 *
 * Swaps one reviewer for another on a single form inside a transaction so a
 * partial swap can never be committed. Returns success=false with a stable
 * reason when the old assignment is absent or the new reviewer already holds
 * the slot; callers must NOT treat those as success.
 */
function _sqlReplaceReviewerFallback(string $formId, string $oldEmail, string $newEmail,
                                      string $newName = '', string $reason = '',
                                      string $user = ''): array {
    $formId   = trim($formId);
    $oldEmail = strtolower(trim($oldEmail));
    $newEmail = strtolower(trim($newEmail));
    if ($formId === '')   return ['success' => false, 'error' => 'Missing formId',  'reason' => 'missing_form',      '_source' => 'sql'];
    if ($oldEmail === '') return ['success' => false, 'error' => 'Missing oldEmail','reason' => 'missing_old_email', '_source' => 'sql'];
    if ($newEmail === '') return ['success' => false, 'error' => 'Missing newEmail','reason' => 'missing_new_email', '_source' => 'sql'];
    if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
        return ['success' => false, 'error' => 'Invalid newEmail: ' . $newEmail, 'reason' => 'invalid_new_email', '_source' => 'sql'];
    }
    if ($oldEmail === $newEmail) {
        return ['success' => false, 'error' => 'oldEmail and newEmail are identical', 'reason' => 'no_change', '_source' => 'sql'];
    }

    $db = getDB();
    $ownTx = false;
    try {
        $existing = dbFetchOne(
            'SELECT id, competition, status FROM reviewers WHERE form_id=? AND LOWER(email)=? LIMIT 1',
            [$formId, $oldEmail]
        );
        if (!$existing) {
            return ['success' => false, 'error' => 'Reviewer not assigned to this form: ' . $oldEmail,
                    'reason' => 'old_not_assigned', '_source' => 'sql'];
        }
        $dupe = dbFetchOne(
            'SELECT id FROM reviewers WHERE form_id=? AND LOWER(email)=? LIMIT 1',
            [$formId, $newEmail]
        );
        if ($dupe) {
            return ['success' => false, 'error' => 'Replacement reviewer already assigned: ' . $newEmail,
                    'reason' => 'new_already_assigned', '_source' => 'sql'];
        }

        if (!$db->inTransaction()) { $db->beginTransaction(); $ownTx = true; }

        dbQuery(
            "UPDATE reviewers SET status='replaced' WHERE id=?",
            [$existing['id']]
        );
        $newId = 'rev_' . bin2hex(random_bytes(8));
        dbQuery(
            "INSERT INTO reviewers (id, email, name, competition, form_id, status, reviewer_fee, created)
             VALUES (?, ?, ?, ?, ?, 'pending', 0.00, NOW())",
            [$newId, $newEmail, ($newName !== '' ? $newName : $newEmail),
             $existing['competition'] ?? '', $formId]
        );

        if ($ownTx) { $db->commit(); $ownTx = false; }

        clearQueryCache('reviewers');
        if (function_exists('auditLog')) {
            auditLog('replace_reviewer', $user, 'form', $formId,
                     ['old' => $oldEmail, 'new' => $newEmail, 'reason' => $reason]);
        }
        return ['success' => true, 'replaced' => $oldEmail, 'newReviewerId' => $newId,
                'newEmail' => $newEmail, '_source' => 'sql-fallback'];
    } catch (Throwable $e) {
        if ($ownTx && $db->inTransaction()) { try { $db->rollBack(); } catch (Throwable $_) {} }
        logError('_sqlReplaceReviewerFallback: ' . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), 'reason' => 'db_error', '_source' => 'sql'];
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  v17: DOCUMENT TEMPLATES LIBRARY — SQL Service Functions
// ══════════════════════════════════════════════════════════════════════════════

/**
 * v17: Get template library with rich filtering.
 * Returns all document_templates with optional filters by project_type, doc_type,
 * resolution status, search term, and pagination.
 */
function sqlGetTemplateLibrary(string $projectType = '', string $docType = '',
                                string $role = '', string $resolutionStatus = '',
                                bool $activeOnly = true, string $search = '',
                                int $offset = 0, int $limit = 100): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_template_library(?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $projectType ?: null, $docType ?: null, $role ?: null,
            $resolutionStatus ?: null, $activeOnly ? 1 : 0,
            $search ?: null, $offset, $limit
        ]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();

        // Get total count from second result set
        $total = 0;
        if ($stmt->nextRowset()) {
            $countRow = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $total = (int)($countRow[0]['total_count'] ?? 0);
        }

        return ['success' => true, 'templates' => $rows, 'total' => $total, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetTemplateLibrary: " . $e->getMessage());
        // Fallback: direct query
        return _sqlGetTemplateLibraryFallback($projectType, $docType, $activeOnly, $search, $offset, $limit);
    }
}

/**
 * Fallback for sqlGetTemplateLibrary — direct query without stored procedure.
 */
function _sqlGetTemplateLibraryFallback(string $projectType = '', string $docType = '',
                                         bool $activeOnly = true, string $search = '',
                                         int $offset = 0, int $limit = 100): array {
    try {
        $where = ['1=1'];
        $params = [];
        if ($projectType) { $where[] = 'dt.project_type=?'; $params[] = $projectType; }
        if ($docType) { $where[] = 'dt.doc_type=?'; $params[] = $docType; }
        if ($activeOnly) { $where[] = 'dt.is_active=1'; }
        if ($search) { $where[] = '(dt.name LIKE ? OR dt.label LIKE ?)'; $params[] = "%$search%"; $params[] = "%$search%"; }

        $whereSql = implode(' AND ', $where);
        $rows = dbFetchAll(
            "SELECT SQL_CALC_FOUND_ROWS dt.*, pt.name_bg AS project_type_name,
                    rdt.doc_key, rdt.name AS required_name, rdt.output_pdf, rdt.embed_signature, rdt.is_budget, rdt.sort_order AS required_sort_order
             FROM document_templates dt
             LEFT JOIN project_types pt ON dt.project_type = pt.code
             LEFT JOIN required_document_templates rdt ON dt.doc_type = rdt.doc_key AND dt.project_type = rdt.project_type_code
             WHERE $whereSql
             ORDER BY dt.project_type, rdt.sort_order, dt.doc_type
             LIMIT ? OFFSET ?",
            array_merge($params, [$limit, $offset])
        );
        $total = dbFetchOne("SELECT FOUND_ROWS() AS cnt")['cnt'] ?? 0;
        return ['success' => true, 'templates' => $rows, 'total' => (int)$total, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("_sqlGetTemplateLibraryFallback: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * v17: Add/update a document template (UPSERT).
 * If id exists, updates; otherwise inserts.
 */
function sqlAddDocumentTemplate(string $id, string $name, string $projectType = '',
                                  string $docType = '', string $mime = '',
                                  string $driveFileId = '', string $label = '',
                                  string $description = '', bool $isActive = true): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL add_document_template(?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $name, $projectType, $docType, $mime, $driveFileId, $label, $description, $isActive ? 1 : 0]);
        clearQueryCache('document_templates');
        return ['success' => true, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlAddDocumentTemplate: " . $e->getMessage());
        // Fallback: direct UPSERT
        try {
            $existing = dbFetchOne('SELECT id FROM document_templates WHERE id=?', [$id]);
            if ($existing) {
                dbQuery("UPDATE document_templates SET name=?, project_type=?, doc_type=?, mime=?, drive_file_id=?, label=?, description=?, is_active=? WHERE id=?",
                        [$name, $projectType, $docType, $mime, $driveFileId, $label, $description, $isActive ? 1 : 0, $id]);
            } else {
                dbQuery("INSERT INTO document_templates (id, name, project_type, doc_type, mime, drive_file_id, label, description, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())",
                        [$id, $name, $projectType, $docType, $mime, $driveFileId, $label, $description, $isActive ? 1 : 0]);
            }
            clearQueryCache('document_templates');
            return ['success' => true, '_source' => 'sql'];
        } catch (Throwable $e2) {
            logError("sqlAddDocumentTemplate fallback: " . $e2->getMessage());
            return ['success' => false, 'error' => $e2->getMessage(), '_source' => 'sql'];
        }
    }
}

/**
 * v17: Delete a document template (soft delete — sets is_active=0).
 */
function sqlDeleteDocumentTemplate(string $id): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL delete_document_template(?)');
        $stmt->execute([$id]);
        clearQueryCache('document_templates');
        return ['success' => true, 'deletedId' => $id, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlDeleteDocumentTemplate: " . $e->getMessage());
        // Fallback
        try {
            dbQuery("UPDATE document_templates SET is_active=0 WHERE id=?", [$id]);
            clearQueryCache('document_templates');
            return ['success' => true, 'deletedId' => $id, '_source' => 'sql'];
        } catch (Throwable $e2) {
            return ['success' => false, 'error' => $e2->getMessage(), '_source' => 'sql'];
        }
    }
}

/**
 * v17: Sync template from GAS export — UPSERT by drive_file_id or doc_type+project_type.
 */
function sqlSyncTemplateFromGas(string $name, string $projectType = '', string $docType = '',
                                  string $mime = '', string $driveFileId = '',
                                  string $label = '', string $description = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL sync_template_from_gas(?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$name, $projectType, $docType, $mime, $driveFileId, $label, $description]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        clearQueryCache('document_templates');
        return ['success' => true, 'templateId' => $result['template_id'] ?? '', '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlSyncTemplateFromGas: " . $e->getMessage());
        // Fallback: simple insert or update
        try {
            $existing = dbFetchOne('SELECT id FROM document_templates WHERE drive_file_id=? AND ?!=\'\'', [$driveFileId, $driveFileId]);
            if ($existing) {
                dbQuery("UPDATE document_templates SET name=?, project_type=?, doc_type=?, mime=?, label=?, description=?, is_active=1 WHERE drive_file_id=?",
                        [$name, $projectType, $docType, $mime, $label, $description, $driveFileId]);
                $id = $existing['id'];
            } else {
                $id = 'tpl_' . ($projectType ? $projectType . '_' : '') . ($docType ?: 'sync') . '_' . time();
                dbQuery("INSERT INTO document_templates (id, name, project_type, doc_type, mime, drive_file_id, label, description, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,1,NOW())",
                        [$id, $name, $projectType, $docType, $mime, $driveFileId, $label, $description]);
            }
            clearQueryCache('document_templates');
            return ['success' => true, 'templateId' => $id, '_source' => 'sql'];
        } catch (Throwable $e2) {
            return ['success' => false, 'error' => $e2->getMessage(), '_source' => 'sql'];
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  v17: APPLICATIONS BY APPLICANT — SQL Service Functions
// ══════════════════════════════════════════════════════════════════════════════

/**
 * v17: Get all applications for a user across all competitions.
 * Enriched with competition metadata, status labels, and reviewer counts.
 */
function sqlGetApplicationsByUser(string $email, string $status = '',
                                  string $projectType = '', string $competition = '',
                                  int $year = 0, string $search = '',
                                  int $offset = 0, int $limit = 100,
                                  string $leaderName = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_applications_by_user(?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$email, $status ?: null, $projectType ?: null,
                        $competition ?: null, $year > 0 ? $year : null,
                        $search ?: null, $offset, $limit, $leaderName ?: null]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();

        $total = 0;
        if ($stmt->nextRowset()) {
            $countRow = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $total = (int)($countRow[0]['total_count'] ?? 0);
        }

        return ['success' => true, 'applications' => $rows, 'total' => $total, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetApplicationsByUser: " . $e->getMessage());
        // Fallback: direct query using view
        return _sqlGetApplicationsByUserFallback($email, $status, $projectType, $competition, $year, $search, $offset, $limit, $leaderName);
    }
}

/**
 * Fallback for sqlGetApplicationsByUser.
 */
function _sqlGetApplicationsByUserFallback(string $email, string $status = '',
                                            string $projectType = '', string $competition = '',
                                            int $year = 0, string $search = '',
                                            int $offset = 0, int $limit = 100,
                                            string $leaderName = ''): array {
    try {
        $where = ['v.applicant_email=?'];
        $params = [$email];
        if ($status) { $where[] = 'v.status=?'; $params[] = $status; }
        if ($projectType) { $where[] = 'v.project_type=?'; $params[] = $projectType; }
        if ($competition) { $where[] = 'v.competition_id=?'; $params[] = $competition; }
        if ($year > 0) { $where[] = 'v.competition_year=?'; $params[] = $year; }
        if ($leaderName) { $where[] = 'v.leader_name=?'; $params[] = $leaderName; }
        if ($search) { $where[] = '(v.title LIKE ? OR v.acronym LIKE ? OR v.project_code LIKE ?)'; $params[] = "%$search%"; $params[] = "%$search%"; $params[] = "%$search%"; }

        $whereSql = implode(' AND ', $where);
        $rows = dbFetchAll(
            "SELECT SQL_CALC_FOUND_ROWS v.*
             FROM view_applications_by_applicant v
             WHERE $whereSql
             ORDER BY v.last_activity_at DESC
             LIMIT ? OFFSET ?",
            array_merge($params, [$limit, $offset])
        );
        $total = dbFetchOne("SELECT FOUND_ROWS() AS cnt")['cnt'] ?? 0;
        return ['success' => true, 'applications' => $rows, 'total' => (int)$total, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("_sqlGetApplicationsByUserFallback: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * v17: Get dashboard summary for a single applicant.
 */
function sqlGetApplicantSummary(string $email): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_applicant_summary(?)');
        $stmt->execute([$email]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        if (!$row) {
            return ['success' => true, 'summary' => [
                'applicant_email' => $email,
                'total_applications' => 0, 'draft_count' => 0, 'submitted_count' => 0,
                'approved_count' => 0, 'active_count' => 0, 'rejected_count' => 0,
                'unsubmitted_count' => 0, 'unread_notifications' => 0,
            ], '_source' => 'sql'];
        }
        return ['success' => true, 'summary' => $row, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetApplicantSummary: " . $e->getMessage());
        // Fallback: direct query
        try {
            $row = dbFetchOne(
                "SELECT a.user_email AS applicant_email, a.user_name AS applicant_name,
                        COUNT(*) AS total_applications,
                        SUM(CASE WHEN a.status='draft' THEN 1 ELSE 0 END) AS draft_count,
                        SUM(CASE WHEN a.status='submitted' THEN 1 ELSE 0 END) AS submitted_count,
                        SUM(CASE WHEN a.status IN ('ranked','proposed_for_funding','approved_for_funding','approved_by_ac') THEN 1 ELSE 0 END) AS approved_count,
                        SUM(CASE WHEN a.status IN ('contracted','active') THEN 1 ELSE 0 END) AS active_count,
                        SUM(CASE WHEN a.status IN ('rejected','declined') THEN 1 ELSE 0 END) AS rejected_count,
                        MAX(a.submitted) AS last_submission_date,
                        MAX(a.score) AS highest_score,
                        (SELECT COUNT(*) FROM notifications n WHERE n.user_email=? AND n.is_read=0) AS unread_notifications
                 FROM applications a WHERE a.user_email=?
                 GROUP BY a.user_email, a.user_name",
                [$email, $email]
            );
            if (!$row) {
                return ['success' => true, 'summary' => [
                    'applicant_email' => $email, 'total_applications' => 0,
                    'draft_count' => 0, 'submitted_count' => 0, 'approved_count' => 0,
                    'active_count' => 0, 'rejected_count' => 0, 'unread_notifications' => 0,
                ], '_source' => 'sql'];
            }
            return ['success' => true, 'summary' => $row, '_source' => 'sql'];
        } catch (Throwable $e2) {
            return ['success' => false, 'error' => $e2->getMessage(), '_source' => 'sql'];
        }
    }
}

/**
 * v17: Admin — list all unique applicants with summary stats.
 */
function sqlGetApplicantsList(string $search = '', int $year = 0,
                               int $offset = 0, int $limit = 100): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_applicants_list(?, ?, ?, ?)');
        $stmt->execute([$search ?: null, $year > 0 ? $year : null, $offset, $limit]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();

        $total = 0;
        if ($stmt->nextRowset()) {
            $countRow = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $total = (int)($countRow[0]['total_count'] ?? 0);
        }

        return ['success' => true, 'applicants' => $rows, 'total' => $total, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetApplicantsList: " . $e->getMessage());
        // Fallback: direct query
        try {
            $where = ['1=1']; $params = [];
            if ($search) { $where[] = '(a.user_email LIKE ? OR a.user_name LIKE ?)'; $params[] = "%$search%"; $params[] = "%$search%"; }
            if ($year > 0) { $where[] = 'c.year=?'; $params[] = $year; }

            $whereSql = implode(' AND ', $where);
            $rows = dbFetchAll(
                "SELECT SQL_CALC_FOUND_ROWS a.user_email AS applicant_email, a.user_name AS applicant_name,
                        COUNT(*) AS total_applications,
                        SUM(CASE WHEN a.status='submitted' THEN 1 ELSE 0 END) AS submitted_count,
                        SUM(CASE WHEN a.status='draft' THEN 1 ELSE 0 END) AS draft_count,
                        MAX(a.submitted) AS last_submission,
                        MAX(a.score) AS highest_score,
                        GROUP_CONCAT(DISTINCT a.project_type ORDER BY a.project_type SEPARATOR ', ') AS project_types
                 FROM applications a
                 LEFT JOIN competitions c ON a.competition=c.id
                 WHERE $whereSql
                 GROUP BY a.user_email, a.user_name
                 ORDER BY last_submission DESC
                 LIMIT ? OFFSET ?",
                array_merge($params, [$limit, $offset])
            );
            $total = dbFetchOne("SELECT FOUND_ROWS() AS cnt")['cnt'] ?? 0;
            return ['success' => true, 'applicants' => $rows, 'total' => (int)$total, '_source' => 'sql'];
        } catch (Throwable $e2) {
            return ['success' => false, 'error' => $e2->getMessage(), '_source' => 'sql'];
        }
    }
}

/* ─── D10: Document version history (local mirror of revisions) ───
 * The `document_versions` table is created idempotently by
 * database/schema_document_versions.sql. Helpers are table-existence-guarded
 * so a deploy without the table degrades gracefully (no fatal). */

function sqlRecordDocVersion(string $docId, string $driveId = '', string $name = '', string $userEmail = '', string $note = ''): bool {
    try {
        $db = getDB();
        // Guard: only write if the table exists.
        $chk = $db->query("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'document_versions' LIMIT 1")->fetchColumn();
        if (!$chk) return false;
        $db->prepare('INSERT INTO document_versions (doc_id, drive_id, name, user_email, note, created) VALUES (?,?,?,?,?,NOW())')
            ->execute([$docId, $driveId ?: null, $name ?: null, $userEmail ?: null, $note ?: null]);
        return true;
    } catch (Throwable $e) {
        logError('sqlRecordDocVersion: ' . $e->getMessage());
        return false;
    }
}

function sqlGetDocVersions(string $docId, string $driveId = ''): array {
    try {
        $db = getDB();
        $chk = $db->query("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'document_versions' LIMIT 1")->fetchColumn();
        $rows = [];
        if ($chk) {
            $sql = 'SELECT id, doc_id, drive_id, name, user_email, note, created FROM document_versions WHERE doc_id = ?';
            $params = [$docId];
            if ($driveId) { $sql .= ' OR drive_id = ?'; $params[] = $driveId; }
            $sql .= ' ORDER BY created DESC LIMIT 50';
            $rows = $db->prepare($sql)->execute($params)->fetchAll(PDO::FETCH_ASSOC) ?: [];
        }
        // If no stored history yet, synthesize a single "current" version from the
        // documents row so the UI always has something to show.
        if (empty($rows)) {
            $doc = dbFetchOne('SELECT id, drive_id, name, user_email, modified FROM documents WHERE id = ?' . ($driveId ? ' OR drive_id = ?' : ''), $driveId ? [$docId, $driveId] : [$docId]);
            if ($doc) {
                $rows = [[
                    'id' => 'current',
                    'doc_id' => $doc['id'] ?? $docId,
                    'drive_id' => $doc['drive_id'] ?? $driveId,
                    'name' => $doc['name'] ?? '',
                    'user_email' => $doc['user_email'] ?? '',
                    'note' => 'Текуща версия',
                    'created' => $doc['modified'] ?? null
                ]];
            }
        }
        return ['success' => true, 'versions' => $rows, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError('sqlGetDocVersions: ' . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), 'versions' => [], '_source' => 'sql'];
    }
}

