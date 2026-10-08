<?php
/**
 * UEV-ERP v18 Complete Bridge — SQL Service Layer Extensions
 * ══════════════════════════════════════════════════════════════════════════════
 * Requires: schema_migration_v18_complete.sql applied to the database.
 * Include this file AFTER sql_service.php in api.php to register new handlers.
 *
 * Adds stored procedure wrappers for:
 *   - Collaborators, Work Programs, TRL, Support Letters, Self-Assessments
 *   - Library Folders CRUD, Board Data, Competition Feed
 *   - Application Versions, Documents Summary, Library Submissions
 *   - Publication Registration
 *
 * Each function follows the same pattern as sql_service.php (try/catch/PDO).
 */

// ──────────────────────────────────────────────────────────────────────────────
//  PART A: COLLABORATOR & TEAM DATA (v18 — schema_migration_v18_complete.sql)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * A.01 Save collaborator — upsert a team member.
 * Maps to: GS.JS saveCollaborator().
 */
function sqlSaveCollaborator(string $id, string $proposalId, string $email, string $name,
                              string $position = '', string $faculty = '', string $specialty = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL save_collaborator(?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $proposalId, $email, $name, $position ?: null, $faculty ?: null, $specialty ?: null]);
        $stmt->closeCursor();
        clearQueryCache('collaborators');
        return ['success' => true, 'id' => $id, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlSaveCollaborator: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * A.02 Get collaborators for a proposal.
 * Maps to: GS.JS getCollaborators().
 */
function sqlGetCollaborators(string $proposalId): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM collaborators WHERE proposal_id = ? ORDER BY created_at ASC');
        $stmt->execute([$proposalId]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'data' => $data, 'total' => count($data), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetCollaborators: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PART B: WORK PROGRAM (v18)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * B.01 Save work program activity.
 * Maps to: GS.JS saveWorkProgram().
 */
function sqlSaveWorkProgram(string $id, string $proposalId, int $activityOrder,
                             string $description, string $method = '', string $expectedResult = '',
                             int $startMonth = 1, int $durationMonths = 12): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL save_work_program(?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $proposalId, $activityOrder, $description, $method ?: null,
                        $expectedResult ?: null, $startMonth, $durationMonths]);
        $stmt->closeCursor();
        clearQueryCache('work_programs');
        return ['success' => true, 'id' => $id, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlSaveWorkProgram: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * B.02 Get work program for a proposal.
 * Maps to: GS.JS getWorkProgram().
 */
function sqlGetWorkProgram(string $proposalId): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM work_programs WHERE proposal_id = ? ORDER BY activity_order ASC');
        $stmt->execute([$proposalId]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'data' => $data, 'total' => count($data), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetWorkProgram: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PART C: TRL (Technology Readiness Level) (v18)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * C.01 Save TRL record.
 * Maps to: GS.JS saveTRL().
 */
function sqlSaveTRL(string $id, string $proposalId, int $trlLevel, string $description = '',
                     string $currentEvidence = '', int $targetTrl = 9): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL save_trl_record(?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $proposalId, $trlLevel, $description ?: null, $currentEvidence ?: null, $targetTrl]);
        $stmt->closeCursor();
        clearQueryCache('trl_records');
        return ['success' => true, 'id' => $id, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlSaveTRL: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * C.02 Get TRL records for a proposal.
 * Maps to: GS.JS getTRL().
 */
function sqlGetTRL(string $proposalId): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM trl_records WHERE proposal_id = ? ORDER BY trl_level ASC');
        $stmt->execute([$proposalId]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'data' => $data, 'total' => count($data), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetTRL: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PART D: SUPPORT LETTERS (v18)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * D.01 Save support letter.
 * Maps to: GS.JS saveSupportLetters().
 */
function sqlSaveSupportLetter(string $id, string $proposalId, string $authorName,
                               string $authorPosition = '', string $authorAffiliation = '',
                               string $authorEmail = '', string $content = '', string $fileId = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL save_support_letter(?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $proposalId, $authorName, $authorPosition ?: null,
                        $authorAffiliation ?: null, $authorEmail ?: null, $content ?: null, $fileId ?: null]);
        $stmt->closeCursor();
        clearQueryCache('support_letters');
        return ['success' => true, 'id' => $id, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlSaveSupportLetter: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * D.02 Get support letters for a proposal.
 * Maps to: GS.JS getSupportLetters().
 */
function sqlGetSupportLetters(string $proposalId): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM support_letters WHERE proposal_id = ? ORDER BY created_at ASC');
        $stmt->execute([$proposalId]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'data' => $data, 'total' => count($data), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetSupportLetters: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PART E: SELF-ASSESSMENT (v18)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * E.01 Save self-assessment score.
 * Maps to: GS.JS saveSelfAssessment().
 */
function sqlSaveSelfAssessment(string $id, string $proposalId, int $score,
                                string $criteria = '', string $notes = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('INSERT INTO self_assessments (id, proposal_id, score, criteria, notes, created_at)
                              VALUES (?, ?, ?, ?, ?, NOW())
                              ON DUPLICATE KEY UPDATE score = VALUES(score), notes = VALUES(notes)');
        $stmt->execute([$id, $proposalId, $score, $criteria ?: null, $notes ?: null]);
        $stmt->closeCursor();
        clearQueryCache('self_assessments');
        return ['success' => true, 'id' => $id, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlSaveSelfAssessment: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * E.02 Get self-assessment for a proposal.
 * Maps to: GS.JS getSelfAssessment().
 */
function sqlGetSelfAssessment(string $proposalId): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT * FROM self_assessments WHERE proposal_id = ? ORDER BY created_at DESC LIMIT 1');
        $stmt->execute([$proposalId]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'data' => $data, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetSelfAssessment: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PART F: LIBRARY FOLDERS (v18)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * F.01 Get library folders (tree structure).
 * Maps to: GS.JS listLibraryFolders().
 */
function sqlGetLibraryFolders(string $parentId = ''): array {
    try {
        // v12.47.9-libfold: the original v18 design called a stored procedure
        // `get_library_folders`, but that procedure was never deployed to the
        // live DB. Query the `library_folders` table directly instead — it has
        // the same shape (id, name, parent_id, description, sort_order, ...).
        $sql = $parentId
            ? "SELECT * FROM library_folders WHERE parent_id = ? ORDER BY sort_order ASC, name ASC"
            : "SELECT * FROM library_folders WHERE parent_id IS NULL OR parent_id = '' ORDER BY sort_order ASC, name ASC";
        $data = dbFetchAll($sql, $parentId ? [$parentId] : []);
        return ['success' => true, 'data' => $data, 'total' => count($data), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetLibraryFolders: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * F.02 Create library folder.
 */
function sqlCreateLibraryFolder(string $id, string $name, string $parentId = '',
                                 string $description = '', int $sortOrder = 0): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('INSERT INTO library_folders (id, name, parent_id, description, sort_order, created_at)
                              VALUES (?, ?, ?, ?, ?, NOW())');
        $stmt->execute([$id, $name, $parentId ?: null, $description ?: null, $sortOrder]);
        $stmt->closeCursor();
        clearQueryCache('library_folders');
        return ['success' => true, 'id' => $id, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlCreateLibraryFolder: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PART G: BOARD / COMPETITION FEED (v18)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * G.01 Get board data for user (contest board light).
 * Maps to: GS.JS getBoardData().
 */
function sqlGetBoardData(string $userEmail): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_board_data(?)');
        $stmt->execute([$userEmail]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'data' => $data, 'total' => count($data), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetBoardData: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * G.02 Get competitions feed (upcoming deadlines).
 * Maps to: GS.JS getCompetitionsFeed().
 */
function sqlGetCompetitionsFeed(): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_competitions_feed()');
        $stmt->execute();
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'data' => $data, 'total' => count($data), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetCompetitionsFeed: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PART H: APPLICATION VERSIONS (v18)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * H.01 Get application version history.
 * Maps to: GS.JS getApplicationVersions().
 */
function sqlGetApplicationVersions(string $applicationId): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_application_versions(?)');
        $stmt->execute([$applicationId]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'data' => $data, 'total' => count($data), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetApplicationVersions: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PART I: DOCUMENTS SUMMARY (v18)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * I.01 Get document library summary (count + last modified).
 * Maps to: GS.JS getDocumentsSummary().
 */
function sqlGetDocumentsSummary(): array {
    try {
        $db = getDB();
        // v12.49.45-docsummary: compute directly from the `documents` table instead of
        // relying on the `get_documents_summary` stored procedure (which is absent on
        // some deployments — CALL failed with "PROCEDURE ... does not exist"). Group real
        // documents by project_type so the dashboard widget shows accurate per-type
        // counts (ФНИ / ПНИ / ДНП / НПФ / …) instead of an empty/missing breakdown.
        $totalRow = dbFetchOne('SELECT COUNT(*) AS c FROM documents');
        $total = (int)($totalRow['c'] ?? 0);
        $typeRows = dbFetchAll("SELECT COALESCE(NULLIF(project_type,''),'Без тип') AS pt, COUNT(*) AS c FROM documents GROUP BY pt");
        $byProjectType = [];
        foreach ($typeRows as $r) {
            $byProjectType[$r['pt']] = (int)$r['c'];
        }
        $last = dbFetchOne('SELECT MAX(created) AS c, MAX(modified) AS m FROM documents') ?: [];
        return [
            'success' => true,
            'data' => [
                'total_documents' => $total,
                'by_project_type' => $byProjectType,
                'last_created' => $last['c'] ?? null,
                'last_modified' => $last['m'] ?? null,
            ],
            '_source' => 'sql-direct',
        ];
    } catch (Throwable $e) {
        logError("sqlGetDocumentsSummary: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PART J: LIBRARY SUBMISSIONS (v18)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * J.01 Get library submissions (deposits) filtered by project/status.
 * Maps to: GS.JS getLibrarySubmissions().
 */
function sqlGetLibrarySubmissions(string $projectId = '', string $status = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL get_library_submissions(?, ?)');
        $stmt->execute([$projectId ?: null, $status ?: null]);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return ['success' => true, 'data' => $data, 'total' => count($data), '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlGetLibrarySubmissions: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * J.02 Register a publication (library deposit).
 * Maps to: GS.JS registerPublication().
 */
function sqlRegisterPublication(string $id, string $projectId, string $publicationType,
                                 string $title, string $authors = '', string $publishedAt = '',
                                 string $createdBy = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('CALL register_publication(?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$id, $projectId, $publicationType, $title, $authors ?: null,
                        $publishedAt ?: null, $createdBy ?: null]);
        $stmt->closeCursor();
        clearQueryCache('library_deposits');
        return ['success' => true, 'id' => $id, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlRegisterPublication: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  PART K: APPLICATION DOCUMENTS BRIDGE (v18)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * K.01 Link a document to an application.
 * Maps to: GS.JS attachDocumentToForm().
 */
function sqlLinkDocumentToApplication(string $id, string $applicationId, string $documentId,
                                       string $documentType = '', string $origin = 'attached',
                                       string $addedBy = ''): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('INSERT INTO application_documents (id, application_id, document_id, document_type, origin, added_by, added_at)
                              VALUES (?, ?, ?, ?, ?, ?, NOW())');
        $stmt->execute([$id, $applicationId, $documentId, $documentType ?: null, $origin, $addedBy ?: null]);
        $stmt->closeCursor();
        clearQueryCache('application_documents');
        return ['success' => true, 'id' => $id, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlLinkDocumentToApplication: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}

/**
 * K.02 Unlink a document from an application.
 */
function sqlUnlinkDocumentFromApplication(string $documentId, string $applicationId): array {
    try {
        $db = getDB();
        $stmt = $db->prepare('DELETE FROM application_documents WHERE document_id = ? AND application_id = ?');
        $stmt->execute([$documentId, $applicationId]);
        $stmt->closeCursor();
        clearQueryCache('application_documents');
        return ['success' => true, '_source' => 'sql'];
    } catch (Throwable $e) {
        logError("sqlUnlinkDocumentFromApplication: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage(), '_source' => 'sql'];
    }
}
