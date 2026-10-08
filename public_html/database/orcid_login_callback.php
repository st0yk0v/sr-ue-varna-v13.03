<?php
/**
 * ORCID Login Callback
 * 
 * Handles the ORCID OAuth callback for login flow.
 * Exchanges the authorization code for an access token,
 * stores the ORCID iD in session, and sends postMessage to parent window.
 */

// Load config for DB and ORCID settings
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/orcid_oauth.php';

$success = false;
$error = '';
$orcid = '';
$name = '';

$code = trim($_GET['code'] ?? '');
$state = trim($_GET['state'] ?? '');
$orcidError = trim($_GET['error'] ?? '');

if (!empty($orcidError)) {
    $error = 'ORCID входът беше отказан или отказан: ' . $orcidError;
} elseif (empty($code)) {
    $error = 'Липсващ оторизационен код от ORCID.';
} else {
    // Verify state for CSRF protection - check session first, then cookie fallback
    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    
    $storedState = $_SESSION['orcid_oauth_state'] ?? '';
    $storedTime = $_SESSION['orcid_oauth_time'] ?? 0;
    
    // Fallback: check cookie if session state is missing (cross-domain redirect issue)
    if (empty($storedState)) {
        foreach ($_COOKIE as $name => $value) {
            if (str_starts_with($name, 'orcid_oauth_state_')) {
                $storedState = $value;
                $storedTime = time(); // approximate, cookie has its own expiry
                break;
            }
        }
    }
    
    if (empty($storedState) || $storedState !== $state) {
        $error = 'Невалиден параметър за защита (CSRF).';
    } elseif (time() - $storedTime > 600) {
        unset($_SESSION['orcid_oauth_state'], $_SESSION['orcid_oauth_time']);
        // Also clear cookies
        foreach ($_COOKIE as $name => $value) {
            if (str_starts_with($name, 'orcid_oauth_state_')) {
                setcookie($name, '', time() - 3600, '/', '', true, true);
            }
        }
        $error = 'Оторизацията изтече. Моля, опитайте отново.';
    } else {
        // Clear state
        unset($_SESSION['orcid_oauth_state'], $_SESSION['orcid_oauth_time']);
        // Also clear cookies
        foreach ($_COOKIE as $name => $value) {
            if (str_starts_with($name, 'orcid_oauth_state_')) {
                setcookie($name, '', time() - 3600, '/', '', true, true);
            }
        }
        
        // Exchange code for token
        $result = handleOrcIDCallback(['code' => $code, 'state' => $state]);
        
        if ($result['success']) {
            $success = true;
            $orcid = $result['orcid'] ?? '';
            $name = $result['name'] ?? '';
        } else {
            $error = $result['error'] ?? 'Грешка при обкодиране на токена.';
        }
    }
}

// Send postMessage to parent window
?>
<!DOCTYPE html>
<html lang="bg">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ORCID вход</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
        .msg { text-align: center; padding: 2rem; background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 360px; }
        .msg i { font-size: 2.5rem; margin-bottom: 1rem; display: block; }
        .msg.success i { color: #a6ce39; }
        .msg.error i { color: #c62828; }
        .msg p { color: #555; line-height: 1.5; margin: 0; }
        .spinner { width: 36px; height: 36px; border: 3px solid #e0e0e0; border-top-color: #a6ce39; border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 1rem; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="msg <?php echo $success ? 'success' : 'error'; ?>">
        <?php if ($success): ?>
            <i class="fab fa-orcid"></i>
            <p>Успешна ORCID връзка! Влизане...</p>
        <?php else: ?>
            <i class="fas fa-exclamation-circle"></i>
            <p><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></p>
        <?php endif; ?>
    </div>
    <script>
        (function() {
            var data = {
                type: 'orcid_callback',
                success: <?php echo $success ? 'true' : 'false'; ?>,
                <?php if ($success): ?>
                orcid: '<?php echo addslashes($orcid); ?>',
                name: '<?php echo addslashes($name); ?>'
                <?php else: ?>
                error: '<?php echo addslashes($error); ?>'
                <?php endif; ?>
            };
            if (window.opener) {
                window.opener.postMessage(data, '*');
            } else if (window.parent && window.parent !== window) {
                window.parent.postMessage(data, '*');
            }
            // Auto-close after a delay
            setTimeout(function() { window.close(); }, 2000);
        })();
    </script>
</body>
</html>