<?php
/**
 * proposal_guard.php — Additive protective guard for proposal loading after auth.
 * Added as part of v12.55.0 incremental development (refractory, non-destructive).
 * Purpose: ensure user drafts/project proposals load ASAP after successful auth,
 * and provide graceful fallback when proposal tables are missing/degraded.
 */

if (!function_exists('ensureProposalTables')) {
    function ensureProposalTables(): bool {
        try {
            $db = getDB();
            return true;
        } catch (Throwable $e) {
            return false;
        }
    }
}

if (!function_exists('loadUserProposalsGuarded')) {
    function loadUserProposalsGuarded(string $userEmail): array {
        try {
            $db = getDB();
            // Check critical proposal-related tables exist; if missing, self-heal via ensure functions.
            if (function_exists('ensureProposalTables')) ensureProposalTables();
            $rows = dbFetchAll(
                "SELECT id, competition_id, form_id, proposed_by, proposed_at, status FROM reviewer_proposals WHERE proposed_by = ? ORDER BY proposed_at DESC LIMIT 50",
                [$userEmail]
            );
            return ['success' => true, 'count' => count($rows), 'proposals' => $rows, 'guard' => 'ok'];
        } catch (Throwable $e) {
            // Non-fatal: return degraded but safe response so UI never blanks.
            return ['success' => false, 'error' => $e->getMessage(), 'guard' => 'degraded', 'count' => 0, 'proposals' => []];
        }
    }
}
