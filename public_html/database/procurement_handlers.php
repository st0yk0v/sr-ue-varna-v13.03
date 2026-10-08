<?php
/**
 * UEV-ERP Procurement Module Handlers v12.54.50
 * Pazardzhik Municipality Public Procurement (ЗОП, Ch.XXVI, Art.186+Art.20,al.3,t.2)
 *
 * All handlers return ['success'=>bool, 'data'=>..., 'error'=>...] format.
 * PDO prepared statements throughout. Try/catch on every DB operation.
 */

// ── Positions

// ── Helpers ────────────────────────────────────────────────────
if (!function_exists('_snakeToCamel')) {
    function _snakeToCamel($data) {
        if (is_array($data) && !isset($data[0])) {
            // Associative array — convert keys
            $out = [];
            foreach ($data as $k => $v) {
                $nk = lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $k))));
                if ($nk === 'i_d') $nk = 'id';
                $out[$nk] = $v;
            }
            return $out;
        }
        return $data;
    }
}
if (!function_exists('_snakeToCamelRows')) {
    function _snakeToCamelRows(array $rows): array {
        return array_map('_snakeToCamel', $rows);
    }
}

// ── Positions ──────────────────────────────────────────────

function handleGetProcurementPositions(array $b): array {
    try {
        $db = getDB();
        $stmt = $db->query("SELECT * FROM `procurement_positions` ORDER BY `position_number`");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return ['success'=>true, 'data'=>_snakeToCamelRows($rows)];
    } catch (Throwable $e) {
        logError("handleGetProcurementPositions: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleGetProcurementPosition(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT * FROM `procurement_positions` WHERE `id`=?");
        $stmt->execute([$id]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);
        return $r ? ['success'=>true,'data'=>_snakeToCamel($r)] : ['success'=>false,'error'=>'Not found'];
    } catch (Throwable $e) {
        logError("handleGetProcurementPosition: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleCreateProcurementPosition(array $b): array {
    try {
        $db = getDB();
        $stmt = $db->prepare("INSERT INTO `procurement_positions` (`position_number`,`village_name`,`sport_type`,`status`,`budget_eur`,`contract_value_eur`,`start_date`,`deadline_date`) VALUES (?,?,?,?,?,?,?,?)");
        $stmt->execute([
            (int)($b['position_number'] ?? 0),
            $b['village_name'] ?? '',
            $b['sport_type'] ?? '',
            $b['status'] ?? 'planned',
            (float)($b['budget_eur'] ?? 0),
            (float)($b['contract_value_eur'] ?? 0),
            $b['start_date'] ?? null,
            $b['deadline_date'] ?? null
        ]);
        return ['success'=>true, 'data'=>['id'=>$db->lastInsertId()]];
    } catch (Throwable $e) {
        logError("handleCreateProcurementPosition: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleUpdateProcurementPosition(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $fields = []; $vals = [];
        $map = ['position_number'=>'i','village_name'=>'s','sport_type'=>'s','status'=>'s','budget_eur'=>'d','contract_value_eur'=>'d','start_date'=>'s','deadline_date'=>'s'];
        foreach ($map as $col => $type) {
            if (isset($b[$col]) && $b[$col] !== '') {
                $fields[] = "`$col`=?";
                $vals[] = match($type) {
                    'i' => (int)$b[$col],
                    'd' => (float)$b[$col],
                    default => $b[$col]
                };
            }
        }
        if (!$fields) return ['success'=>false, 'error'=>'No fields to update'];
        $vals[] = $id;
        $sql = "UPDATE `procurement_positions` SET " . implode(',', $fields) . " WHERE `id`=?";
        $stmt = $db->prepare($sql);
        $stmt->execute($vals);
        return ['success'=>true, 'data'=>['id'=>$id, 'affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleUpdateProcurementPosition: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

// ── Documents ──────────────────────────────────────────────

function handleGetProcurementDocuments(array $b): array {
    $posId = (int)($b['position_id'] ?? 0);
    try {
        $db = getDB();
        if ($posId) {
            $stmt = $db->prepare("SELECT * FROM `procurement_documents` WHERE `position_id`=? ORDER BY `id`");
            $stmt->execute([$posId]);
        } else {
            $stmt = $db->query("SELECT * FROM `procurement_documents` ORDER BY `id`");
        }
        return ['success'=>true, 'data'=>_snakeToCamelRows($stmt->fetchAll(PDO::FETCH_ASSOC))];
    } catch (Throwable $e) {
        logError("handleGetProcurementDocuments: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleCreateProcurementDocument(array $b): array {
    try {
        $db = getDB();
        $stmt = $db->prepare("INSERT INTO `procurement_documents` (`position_id`,`project_part`,`document_type`,`file_path`,`paper_copies`,`electronic_copies`,`cad4_path`,`status`) VALUES (?,?,?,?,?,?,?,?)");
        $stmt->execute([
            (int)($b['position_id'] ?? 0),
            $b['project_part'] ?? '',
            $b['document_type'] ?? '',
            $b['file_path'] ?? null,
            (int)($b['paper_copies'] ?? 0),
            (int)($b['electronic_copies'] ?? 0),
            $b['cad4_path'] ?? null,
            $b['status'] ?? 'pending'
        ]);
        return ['success'=>true, 'data'=>['id'=>$db->lastInsertId()]];
    } catch (Throwable $e) {
        logError("handleCreateProcurementDocument: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

// ── Contract ───────────────────────────────────────────────

function handleGetProcurementContract(array $b): array {
    $posId = (int)($b['position_id'] ?? 0);
    if (!$posId) return ['success'=>false, 'error'=>'Missing position_id'];
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT * FROM `procurement_contract` WHERE `position_id`=?");
        $stmt->execute([$posId]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);
        return $r ? ['success'=>true,'data'=>_snakeToCamel($r)] : ['success'=>false,'error'=>'Contract not found'];
    } catch (Throwable $e) {
        logError("handleGetProcurementContract: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleCreateProcurementContract(array $b): array {
    try {
        $db = getDB();
        $stmt = $db->prepare("INSERT INTO `procurement_contract` (`position_id`,`contract_value_eur`,`vat_eur`,`total_eur`,`penalty_rate`,`penalty_days`,`penalty_amount`,`insurance_valid`,`insurance_provider`,`insurance_expiry`,`is_conditional`) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
        $stmt->execute([
            (int)($b['position_id'] ?? 0),
            (float)($b['contract_value_eur'] ?? 0),
            (float)($b['vat_eur'] ?? 0),
            (float)($b['total_eur'] ?? 0),
            (float)($b['penalty_rate'] ?? 0.0025),
            (int)($b['penalty_days'] ?? 0),
            (float)($b['penalty_amount'] ?? 0),
            (bool)($b['insurance_valid'] ?? false),
            $b['insurance_provider'] ?? null,
            $b['insurance_expiry'] ?? null,
            (bool)($b['is_conditional'] ?? false)
        ]);
        return ['success'=>true, 'data'=>['id'=>$db->lastInsertId()]];
    } catch (Throwable $e) {
        logError("handleCreateProcurementContract: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

// ── Supervision ────────────────────────────────────────────

function handleGetProcurementSupervision(array $b): array {
    $posId = (int)($b['position_id'] ?? 0);
    try {
        $db = getDB();
        if ($posId) {
            $stmt = $db->prepare("SELECT * FROM `procurement_supervision` WHERE `position_id`=? ORDER BY `supervision_date` DESC");
            $stmt->execute([$posId]);
        } else {
            $stmt = $db->query("SELECT * FROM `procurement_supervision` ORDER BY `id`");
        }
        return ['success'=>true, 'data'=>_snakeToCamelRows($stmt->fetchAll(PDO::FETCH_ASSOC))];
    } catch (Throwable $e) {
        logError("handleGetProcurementSupervision: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleCreateProcurementSupervision(array $b): array {
    try {
        $db = getDB();
        $stmt = $db->prepare("INSERT INTO `procurement_supervision` (`position_id`,`supervision_date`,`site_visit_notes`,`acts_signed`,`protocol_number`,`status`) VALUES (?,?,?,?,?,?)");
        $stmt->execute([
            (int)($b['position_id'] ?? 0),
            $b['supervision_date'] ?? null,
            $b['site_visit_notes'] ?? null,
            (bool)($b['acts_signed'] ?? false),
            $b['protocol_number'] ?? null,
            $b['status'] ?? 'pending'
        ]);
        return ['success'=>true, 'data'=>['id'=>$db->lastInsertId()]];
    } catch (Throwable $e) {
        logError("handleCreateProcurementSupervision: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

// ── Payments ───────────────────────────────────────────────

function handleGetProcurementPayments(array $b): array {
    $posId = (int)($b['position_id'] ?? 0);
    try {
        $db = getDB();
        if ($posId) {
            $stmt = $db->prepare("SELECT * FROM `procurement_payments` WHERE `position_id`=? ORDER BY `id`");
            $stmt->execute([$posId]);
        } else {
            $stmt = $db->query("SELECT * FROM `procurement_payments` ORDER BY `id`");
        }
        return ['success'=>true, 'data'=>_snakeToCamelRows($stmt->fetchAll(PDO::FETCH_ASSOC))];
    } catch (Throwable $e) {
        logError("handleGetProcurementPayments: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleCreateProcurementPayment(array $b): array {
    try {
        $db = getDB();
        $stmt = $db->prepare("INSERT INTO `procurement_payments` (`position_id`,`activity_type`,`amount_eur`,`paid`,`payment_date`,`invoice_number`,`acceptance_protocol`,`status`) VALUES (?,?,?,?,?,?,?,?)");
        $stmt->execute([
            (int)($b['position_id'] ?? 0),
            $b['activity_type'] ?? '',
            (float)($b['amount_eur'] ?? 0),
            (bool)($b['paid'] ?? false),
            $b['payment_date'] ?? null,
            $b['invoice_number'] ?? null,
            $b['acceptance_protocol'] ?? null,
            $b['status'] ?? 'pending'
        ]);
        return ['success'=>true, 'data'=>['id'=>$db->lastInsertId()]];
    } catch (Throwable $e) {
        logError("handleCreateProcurementPayment: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

// ── Compliance ─────────────────────────────────────────────

function handleGetProcurementCompliance(array $b): array {
    $posId = (int)($b['position_id'] ?? 0);
    try {
        $db = getDB();
        if ($posId) {
            $stmt = $db->prepare("SELECT * FROM `procurement_compliance` WHERE `position_id`=? ORDER BY `id`");
            $stmt->execute([$posId]);
        } else {
            $stmt = $db->query("SELECT * FROM `procurement_compliance` ORDER BY `id`");
        }
        return ['success'=>true, 'data'=>_snakeToCamelRows($stmt->fetchAll(PDO::FETCH_ASSOC))];
    } catch (Throwable $e) {
        logError("handleGetProcurementCompliance: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleUpdateProcurementCompliance(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $fields = []; $vals = [];
        if (isset($b['compliance_status'])) { $fields[]='`compliance_status`=?'; $vals[]=$b['compliance_status']; }
        if (isset($b['checked_by'])) { $fields[]='`checked_by`=?'; $vals[]=$b['checked_by']; }
        if (isset($b['checked_date'])) { $fields[]='`checked_date`=?'; $vals[]=$b['checked_date']; }
        if (isset($b['notes'])) { $fields[]='`notes`=?'; $vals[]=$b['notes']; }
        if (!$fields) return ['success'=>false, 'error'=>'No fields to update'];
        $vals[] = $id;
        $sql = "UPDATE `procurement_compliance` SET " . implode(',', $fields) . " WHERE `id`=?";
        $stmt = $db->prepare($sql);
        $stmt->execute($vals);
        return ['success'=>true, 'data'=>['id'=>$id, 'affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleUpdateProcurementCompliance: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

// ── Subcontractors ─────────────────────────────────────────

function handleGetProcurementSubcontractors(array $b): array {
    $posId = (int)($b['position_id'] ?? 0);
    try {
        $db = getDB();
        if ($posId) {
            $stmt = $db->prepare("SELECT * FROM `procurement_subcontractors` WHERE `position_id`=? ORDER BY `id`");
            $stmt->execute([$posId]);
        } else {
            $stmt = $db->query("SELECT * FROM `procurement_subcontractors` ORDER BY `id`");
        }
        return ['success'=>true, 'data'=>_snakeToCamelRows($stmt->fetchAll(PDO::FETCH_ASSOC))];
    } catch (Throwable $e) {
        logError("handleGetProcurementSubcontractors: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleCreateProcurementSubcontractor(array $b): array {
    try {
        $db = getDB();
        $stmt = $db->prepare("INSERT INTO `procurement_subcontractors` (`position_id`,`subcontractor_name`,`specialization`,`insurance_valid`,`role`) VALUES (?,?,?,?,?)");
        $stmt->execute([
            (int)($b['position_id'] ?? 0),
            $b['subcontractor_name'] ?? '',
            $b['specialization'] ?? '',
            (bool)($b['insurance_valid'] ?? false),
            $b['role'] ?? ''
        ]);
        return ['success'=>true, 'data'=>['id'=>$db->lastInsertId()]];
    } catch (Throwable $e) {
        logError("handleCreateProcurementSubcontractor: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

// ── Schedule ───────────────────────────────────────────────

function handleGetProcurementSchedule(array $b): array {
    $posId = (int)($b['position_id'] ?? 0);
    try {
        $db = getDB();
        if ($posId) {
            $stmt = $db->prepare("SELECT * FROM `procurement_schedule` WHERE `position_id`=? ORDER BY `start_date`");
            $stmt->execute([$posId]);
        } else {
            $stmt = $db->query("SELECT * FROM `procurement_schedule` ORDER BY `id`");
        }
        return ['success'=>true, 'data'=>_snakeToCamelRows($stmt->fetchAll(PDO::FETCH_ASSOC))];
    } catch (Throwable $e) {
        logError("handleGetProcurementSchedule: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleCreateProcurementSchedule(array $b): array {
    try {
        $db = getDB();
        $stmt = $db->prepare("INSERT INTO `procurement_schedule` (`position_id`,`task_name`,`start_date`,`end_date`,`status`,`assigned_to`) VALUES (?,?,?,?,?,?)");
        $stmt->execute([
            (int)($b['position_id'] ?? 0),
            $b['task_name'] ?? '',
            $b['start_date'] ?? null,
            $b['end_date'] ?? null,
            $b['status'] ?? 'planned',
            $b['assigned_to'] ?? null
        ]);
        return ['success'=>true, 'data'=>['id'=>$db->lastInsertId()]];
    } catch (Throwable $e) {
        logError("handleCreateProcurementSchedule: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

// ── Dashboard & Penalties ──────────────────────────────────

function handleGetProcurementDashboard(array $b): array {
    try {
        $db = getDB();
        $stats = [];

        // Positions summary
        $stmt = $db->query("SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress, SUM(CASE WHEN status='planned' THEN 1 ELSE 0 END) as planned, SUM(`budget_eur`) as total_budget, SUM(`contract_value_eur`) as total_contract FROM `procurement_positions`");
        $posSummary = $stmt->fetch(PDO::FETCH_ASSOC);

        // Overdue positions
        $stmt = $db->query("SELECT COUNT(*) as overdue FROM `procurement_positions` WHERE `deadline_date` < CURDATE() AND status NOT IN ('completed','cancelled')");
        $overdue = $stmt->fetch(PDO::FETCH_ASSOC);

        // Penalty summary
        $stmt = $db->query("SELECT SUM(`penalty_amount`) as total_penalties FROM `procurement_contract` WHERE `penalty_amount` > 0");
        $penalties = $stmt->fetch(PDO::FETCH_ASSOC);

        // Documents pending
        $stmt = $db->query("SELECT COUNT(*) as pending_docs FROM `procurement_documents` WHERE `status`='pending'");
        $pendingDocs = $stmt->fetch(PDO::FETCH_ASSOC);

        $stats = [
            'positions_total' => (int)($posSummary['total'] ?? 0),
            'positions_completed' => (int)($posSummary['completed'] ?? 0),
            'positions_in_progress' => (int)($posSummary['in_progress'] ?? 0),
            'positions_planned' => (int)($posSummary['planned'] ?? 0),
            'total_budget_eur' => (float)($posSummary['total_budget'] ?? 0),
            'total_contract_eur' => (float)($posSummary['total_contract'] ?? 0),
            'overdue_positions' => (int)($overdue['overdue'] ?? 0),
            'total_penalties_eur' => (float)($penalties['total_penalties'] ?? 0),
            'pending_documents' => (int)($pendingDocs['pending_docs'] ?? 0)
        ];
        return ['success'=>true, 'data'=>$stats];
    } catch (Throwable $e) {
        logError("handleGetProcurementDashboard: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleGetProcurementPenalties(array $b): array {
    try {
        $db = getDB();
        $stmt = $db->query("SELECT p.`position_number`, p.`village_name`, p.`deadline_date`, c.`penalty_rate`, c.`penalty_days`, c.`penalty_amount`, c.`contract_value_eur` FROM `procurement_positions` p JOIN `procurement_contract` c ON p.`id`=c.`position_id` WHERE p.`deadline_date` < CURDATE() AND p.`status` NOT IN ('completed','cancelled') AND c.`penalty_amount` > 0 ORDER BY p.`position_number`");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return ['success'=>true, 'data'=>_snakeToCamelRows($rows)];
    } catch (Throwable $e) {
        logError("handleGetProcurementPenalties: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

// ── DELETE Operations ──────────────────────────────────────────────

function handleDeleteProcurementPosition(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $stmt = $db->prepare("DELETE FROM `procurement_positions` WHERE `id`=?");
        $stmt->execute([$id]);
        return ['success'=>$stmt->rowCount()>0, 'data'=>['affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleDeleteProcurementPosition: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleDeleteProcurementDocument(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $stmt = $db->prepare("DELETE FROM `procurement_documents` WHERE `id`=?");
        $stmt->execute([$id]);
        return ['success'=>$stmt->rowCount()>0, 'data'=>['affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleDeleteProcurementDocument: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleUpdateProcurementDocument(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $fields = []; $vals = [];
        $map = ['project_part'=>'s','document_type'=>'s','file_path'=>'s','cad4_path'=>'s','status'=>'s','paper_copies'=>'i','electronic_copies'=>'i'];
        foreach ($map as $col => $type) {
            if (isset($b[$col]) && $b[$col] !== '') {
                $fields[] = "`$col`=?";
                $vals[] = match($type) {
                    'i' => (int)$b[$col],
                    default => $b[$col]
                };
            }
        }
        if (!$fields) return ['success'=>false, 'error'=>'No fields to update'];
        $vals[] = $id;
        $sql = "UPDATE `procurement_documents` SET " . implode(',', $fields) . " WHERE `id`=?";
        $stmt = $db->prepare($sql);
        $stmt->execute($vals);
        return ['success'=>true, 'data'=>['id'=>$id, 'affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleUpdateProcurementDocument: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleDeleteProcurementContract(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $stmt = $db->prepare("DELETE FROM `procurement_contract` WHERE `id`=?");
        $stmt->execute([$id]);
        return ['success'=>$stmt->rowCount()>0, 'data'=>['affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleDeleteProcurementContract: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleUpdateProcurementContract(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $fields = []; $vals = [];
        if (isset($b['contract_value_eur'])) { $fields[]='`contract_value_eur`=?'; $vals[]=(float)$b['contract_value_eur']; }
        if (isset($b['vat_eur'])) { $fields[]='`vat_eur`=?'; $vals[]=(float)$b['vat_eur']; }
        if (isset($b['total_eur'])) { $fields[]='`total_eur`=?'; $vals[]=(float)$b['total_eur']; }
        if (isset($b['penalty_rate'])) { $fields[]='`penalty_rate`=?'; $vals[]=(float)$b['penalty_rate']; }
        if (isset($b['penalty_days'])) { $fields[]='`penalty_days`=?'; $vals[]=(int)$b['penalty_days']; }
        if (isset($b['penalty_amount'])) { $fields[]='`penalty_amount`=?'; $vals[]=(float)$b['penalty_amount']; }
        if (isset($b['insurance_valid'])) { $fields[]='`insurance_valid`=?'; $vals[]=(bool)$b['insurance_valid']; }
        if (isset($b['insurance_provider'])) { $fields[]='`insurance_provider`=?'; $vals[]=$b['insurance_provider']; }
        if (isset($b['insurance_expiry'])) { $fields[]='`insurance_expiry`=?'; $vals[]=$b['insurance_expiry']; }
        if (isset($b['is_conditional'])) { $fields[]='`is_conditional`=?'; $vals[]=(bool)$b['is_conditional']; }
        if (!$fields) return ['success'=>false, 'error'=>'No fields to update'];
        $vals[] = $id;
        $sql = "UPDATE `procurement_contract` SET " . implode(',', $fields) . " WHERE `id`=?";
        $stmt = $db->prepare($sql);
        $stmt->execute($vals);
        return ['success'=>true, 'data'=>['id'=>$id, 'affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleUpdateProcurementContract: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleDeleteProcurementSupervision(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $stmt = $db->prepare("DELETE FROM `procurement_supervision` WHERE `id`=?");
        $stmt->execute([$id]);
        return ['success'=>$stmt->rowCount()>0, 'data'=>['affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleDeleteProcurementSupervision: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleUpdateProcurementSupervision(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $fields = []; $vals = [];
        if (isset($b['supervision_date'])) { $fields[]='`supervision_date`=?'; $vals[]=$b['supervision_date']; }
        if (isset($b['site_visit_notes'])) { $fields[]='`site_visit_notes`=?'; $vals[]=$b['site_visit_notes']; }
        if (isset($b['acts_signed'])) { $fields[]='`acts_signed`=?'; $vals[]=(bool)$b['acts_signed']; }
        if (isset($b['protocol_number'])) { $fields[]='`protocol_number`=?'; $vals[]=$b['protocol_number']; }
        if (isset($b['status'])) { $fields[]='`status`=?'; $vals[]=$b['status']; }
        if (!$fields) return ['success'=>false, 'error'=>'No fields to update'];
        $vals[] = $id;
        $sql = "UPDATE `procurement_supervision` SET " . implode(',', $fields) . " WHERE `id`=?";
        $stmt = $db->prepare($sql);
        $stmt->execute($vals);
        return ['success'=>true, 'data'=>['id'=>$id, 'affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleUpdateProcurementSupervision: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleDeleteProcurementPayment(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $stmt = $db->prepare("DELETE FROM `procurement_payments` WHERE `id`=?");
        $stmt->execute([$id]);
        return ['success'=>$stmt->rowCount()>0, 'data'=>['affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleDeleteProcurementPayment: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleUpdateProcurementPayment(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $fields = []; $vals = [];
        if (isset($b['activity_type'])) { $fields[]='`activity_type`=?'; $vals[]=$b['activity_type']; }
        if (isset($b['amount_eur'])) { $fields[]='`amount_eur`=?'; $vals[]=(float)$b['amount_eur']; }
        if (isset($b['paid'])) { $fields[]='`paid`=?'; $vals[]=(bool)$b['paid']; }
        if (isset($b['payment_date'])) { $fields[]='`payment_date`=?'; $vals[]=$b['payment_date']; }
        if (isset($b['invoice_number'])) { $fields[]='`invoice_number`=?'; $vals[]=$b['invoice_number']; }
        if (isset($b['acceptance_protocol'])) { $fields[]='`acceptance_protocol`=?'; $vals[]=$b['acceptance_protocol']; }
        if (isset($b['status'])) { $fields[]='`status`=?'; $vals[]=$b['status']; }
        if (!$fields) return ['success'=>false, 'error'=>'No fields to update'];
        $vals[] = $id;
        $sql = "UPDATE `procurement_payments` SET " . implode(',', $fields) . " WHERE `id`=?";
        $stmt = $db->prepare($sql);
        $stmt->execute($vals);
        return ['success'=>true, 'data'=>['id'=>$id, 'affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleUpdateProcurementPayment: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleDeleteProcurementSubcontractor(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $stmt = $db->prepare("DELETE FROM `procurement_subcontractors` WHERE `id`=?");
        $stmt->execute([$id]);
        return ['success'=>$stmt->rowCount()>0, 'data'=>['affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleDeleteProcurementSubcontractor: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleUpdateProcurementSubcontractor(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $fields = []; $vals = [];
        if (isset($b['subcontractor_name'])) { $fields[]='`subcontractor_name`=?'; $vals[]=$b['subcontractor_name']; }
        if (isset($b['specialization'])) { $fields[]='`specialization`=?'; $vals[]=$b['specialization']; }
        if (isset($b['insurance_valid'])) { $fields[]='`insurance_valid`=?'; $vals[]=(bool)$b['insurance_valid']; }
        if (isset($b['role'])) { $fields[]='`role`=?'; $vals[]=$b['role']; }
        if (!$fields) return ['success'=>false, 'error'=>'No fields to update'];
        $vals[] = $id;
        $sql = "UPDATE `procurement_subcontractors` SET " . implode(',', $fields) . " WHERE `id`=?";
        $stmt = $db->prepare($sql);
        $stmt->execute($vals);
        return ['success'=>true, 'data'=>['id'=>$id, 'affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleUpdateProcurementSubcontractor: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleDeleteProcurementSchedule(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $stmt = $db->prepare("DELETE FROM `procurement_schedule` WHERE `id`=?");
        $stmt->execute([$id]);
        return ['success'=>$stmt->rowCount()>0, 'data'=>['affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleDeleteProcurementSchedule: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

function handleUpdateProcurementSchedule(array $b): array {
    $id = (int)($b['id'] ?? 0);
    if (!$id) return ['success'=>false, 'error'=>'Missing id'];
    try {
        $db = getDB();
        $fields = []; $vals = [];
        if (isset($b['task_name'])) { $fields[]='`task_name`=?'; $vals[]=$b['task_name']; }
        if (isset($b['start_date'])) { $fields[]='`start_date`=?'; $vals[]=$b['start_date']; }
        if (isset($b['end_date'])) { $fields[]='`end_date`=?'; $vals[]=$b['end_date']; }
        if (isset($b['status'])) { $fields[]='`status`=?'; $vals[]=$b['status']; }
        if (isset($b['assigned_to'])) { $fields[]='`assigned_to`=?'; $vals[]=$b['assigned_to']; }
        if (!$fields) return ['success'=>false, 'error'=>'No fields to update'];
        $vals[] = $id;
        $sql = "UPDATE `procurement_schedule` SET " . implode(',', $fields) . " WHERE `id`=?";
        $stmt = $db->prepare($sql);
        $stmt->execute($vals);
        return ['success'=>true, 'data'=>['id'=>$id, 'affected'=>$stmt->rowCount()]];
    } catch (Throwable $e) {
        logError("handleUpdateProcurementSchedule: " . $e->getMessage());
        return ['success'=>false, 'error'=>$e->getMessage()];
    }
}

// ── Helper: Pagination & Filtering ──────────────────────────────────
// Applies LIMIT/OFFSET and optional WHERE filters to a query.
// Usage: _applyPagination($sql, $params, $b) where $b may contain
//   'page' (1-based), 'perPage' (default 50), 'search' (LIKE %), 'filter_field', 'filter_value'.

if (!function_exists('_applyProcurementFilters')) {
    function _applyProcurementFilters(string $baseTable, array $b, ?array $extraConditions = null): array {
        $conditions = [];
        $params = [];

        // Search across common text fields
        if (!empty($b['search'])) {
            $search = '%' . $b['search'] . '%';
            $conditions[] = "(`village_name` LIKE ? OR `sport_type` LIKE ? OR `project_part` LIKE ?)";
            $params = array_merge($params, [$search, $search, $search]);
        }

        // Status filter
        if (!empty($b['status'])) {
            $conditions[] = "`status` = ?";
            $params[] = $b['status'];
        }

        // Position filter
        if (!empty($b['position_id'])) {
            $conditions[] = "`position_id` = ?";
            $params[] = (int)$b['position_id'];
        }

        // Date range filters
        if (!empty($b['date_from'])) {
            $conditions[] = "`start_date` >= ?";
            $params[] = $b['date_from'];
        }
        if (!empty($b['date_to'])) {
            $conditions[] = "`deadline_date` <= ?";
            $params[] = $b['date_to'];
        }

        if (!empty($extraConditions)) {
            foreach ($extraConditions as $cond) {
                $conditions[] = $cond[0];
                $params = array_merge($params, $cond[1]);
            }
        }

        $where = $conditions ? ' WHERE ' . implode(' AND ', $conditions) : '';
        return ['where' => $where, 'params' => $params];
    }
}

if (!function_exists('_paginate')) {
    function _paginate(array $rows, array $b): array {
        $total = count($rows);
        $page = max(1, (int)($b['page'] ?? 1));
        $perPage = min(200, max(1, (int)($b['perPage'] ?? 50)));
        $offset = ($page - 1) * $perPage;
        $paged = array_slice($rows, $offset, $perPage);
        $totalPages = max(1, (int)ceil($total / $perPage));
        return [
            'data' => $paged,
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'totalPages' => $totalPages,
                'hasNext' => $page < $totalPages,
                'hasPrev' => $page > 1
            ]
        ];
    }
}
