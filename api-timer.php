<?php
// API Timer - Integre a soreva_full + CoreAuthService
// Secrets : config centralisée ou variables d'environnement (Tranche 1 sécurité)
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

date_default_timezone_set('Europe/Paris');

// --------------------------------------------------------------------------
// CoreAuthService : authentification centralisee (meme JWT que Dashboard/Facture)
// --------------------------------------------------------------------------
require_once __DIR__ . '/../trusty_core/CoreAuthService.php';
use TrustyCore\CoreAuthService;
use TrustyCore\ClientIpResolver;
use TrustyCore\SecurityHeaders;

$trustyCoreDir = dirname(__DIR__) . '/trusty_core';
if (is_file($trustyCoreDir . '/ClientIpResolver.php')) {
    require_once $trustyCoreDir . '/ClientIpResolver.php';
}
if (is_file($trustyCoreDir . '/SecurityHeaders.php')) {
    require_once $trustyCoreDir . '/SecurityHeaders.php';
}

// --------------------------------------------------------------------------
// Secrets : config centralisée ou env — aucun secret en dur dans le code
// --------------------------------------------------------------------------
$TIMER_SECRETS = [];
$loaderPath = '/var/www/_secrets/soreva/load.php';
if (!is_file($loaderPath)) {
    $loaderPath = getenv('SOREVA_LOADER_PATH') ?: '';
}
if ($loaderPath !== '' && is_file($loaderPath)) {
    require_once $loaderPath;
    $TIMER_SECRETS = soreva_load_secrets(__DIR__ . '/api');
} else {
    $TIMER_SECRETS = [
        'db' => [
            'host' => getenv('DB_HOST') ?: getenv('SOREVA_DB_HOST') ?: '127.0.0.1',
            'port' => (int) (getenv('DB_PORT') ?: getenv('SOREVA_DB_PORT') ?: '3306'),
            'name' => getenv('DB_DATABASE') ?: getenv('DB_NAME') ?: getenv('SOREVA_DB_NAME') ?: 'soreva_full',
            'user' => getenv('DB_USERNAME') ?: getenv('DB_USER') ?: getenv('SOREVA_DB_USER') ?: '',
            'pass' => getenv('DB_PASSWORD') ?: getenv('SOREVA_DB_PASS') ?: '',
        ],
        'jwt_secret' => getenv('JWT_SECRET') ?: getenv('SOREVA_JWT_SECRET') ?: '',
        'app' => [
            'open_beta' => filter_var(getenv('SOREVA_OPEN_BETA'), FILTER_VALIDATE_BOOLEAN),
            'trust_forwarded_ip' => filter_var(getenv('SOREVA_TRUST_FORWARDED_IP'), FILTER_VALIDATE_BOOLEAN),
        ],
    ];
}

$db = $TIMER_SECRETS['db'] ?? [];
$TIMER_OPEN_BETA = !empty($TIMER_SECRETS['app']['open_beta']) || filter_var(getenv('SOREVA_OPEN_BETA'), FILTER_VALIDATE_BOOLEAN);
$timerTrustForwardedIpOverride = getenv('SOREVA_TRUST_FORWARDED_IP');
$TIMER_TRUST_FORWARDED_IP = (bool) ($TIMER_SECRETS['app']['trust_forwarded_ip'] ?? false);
if ($timerTrustForwardedIpOverride !== false && $timerTrustForwardedIpOverride !== '') {
    $TIMER_TRUST_FORWARDED_IP = filter_var($timerTrustForwardedIpOverride, FILTER_VALIDATE_BOOLEAN);
}

// Une seule config DB : utilisée par CoreAuthService et par getConnection()
$DB_CONFIG = [
    'host' => $db['host'] ?? '127.0.0.1',
    'username' => $db['user'] ?? '',
    'password' => $db['pass'] ?? '',
    'database' => $db['name'] ?? 'soreva_full',
];
$jwtSecret = $TIMER_SECRETS['jwt_secret'] ?? '';

/** Durée de vie des tokens Timer (heures). Court pour limiter l'usage JWT comme "session" navigateur ; le client doit rafraîchir avant expiration. */
const TIMER_TOKEN_EXPIRY_HOURS = 2;

/** Après expiration du JWT, refresh accepte encore le Bearer pendant 24h (signature inchangée). */
const TIMER_REFRESH_EXPIRED_LEEWAY_SECONDS = 24 * 3600;

function timer_json(array $data, int $status = 200): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function timer_fail(string $message, int $status = 400, array $extra = []): void
{
    timer_json(array_merge(['success' => false, 'message' => $message], $extra), $status);
}

function timer_log(string $msg): void
{
    if (getenv('TIMER_DEBUG') === '1') {
        error_log($msg);
    }
}

function timer_rate_limit_dir(): string
{
    $override = getenv('TIMER_RATE_LIMIT_DIR');
    if (is_string($override) && trim($override) !== '') {
        return rtrim($override, '/\\');
    }

    return __DIR__ . '/storage/rate_limit';
}

function timer_client_ip(): string
{
    global $TIMER_TRUST_FORWARDED_IP;

    return ClientIpResolver::resolve($_SERVER, (bool) $TIMER_TRUST_FORWARDED_IP);
}

function timer_rate_limit_subject(string $subject, ?string $identity = null): string
{
    if ($subject === 'identity_or_ip' && $identity !== null && $identity !== '') {
        return 'identity:' . $identity;
    }

    return 'ip:' . timer_client_ip();
}

function timer_check_rate_limit(string $subjectKey, string $bucket, int $maxAttempts, int $windowSeconds): ?int
{
    $storageDir = timer_rate_limit_dir();
    if (!is_dir($storageDir)) {
        @mkdir($storageDir, 0755, true);
        @file_put_contents($storageDir . '/.htaccess', "Require all denied\n");
    }

    $key = md5($subjectKey . ':' . $bucket);
    $file = $storageDir . '/' . $key . '.json';
    $now = time();
    $data = [];

    if (file_exists($file)) {
        $content = @file_get_contents($file);
        if ($content !== false) {
            $data = json_decode($content, true) ?? [];
        }
    }

    $attempts = array_values(array_filter($data['attempts'] ?? [], static function ($timestamp) use ($now, $windowSeconds) {
        return ($now - (int) $timestamp) < $windowSeconds;
    }));

    if (count($attempts) >= $maxAttempts) {
        $oldest = (int) min($attempts);
        return max(1, $windowSeconds - ($now - $oldest));
    }

    $attempts[] = $now;
    $data['attempts'] = $attempts;
    $data['last_attempt'] = $now;

    @file_put_contents($file, json_encode($data), LOCK_EX);

    return null;
}

function timer_enforce_rate_limit(string $bucket, int $maxAttempts, int $windowSeconds, string $subject = 'ip', ?string $identity = null): void
{
    $retryAfter = timer_check_rate_limit(
        timer_rate_limit_subject($subject, $identity),
        $bucket,
        $maxAttempts,
        $windowSeconds
    );

    if ($retryAfter === null) {
        return;
    }

    header('Retry-After: ' . $retryAfter);
    timer_fail('Trop de requêtes. Veuillez réessayer plus tard.', 429, ['retry_after' => $retryAfter]);
}

function getBearerToken(): string
{
    $sources = [
        $_SERVER['HTTP_AUTHORIZATION'] ?? '',
        $_SERVER['Authorization'] ?? '',
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '',
    ];
    foreach ($sources as $raw) {
        if ($raw !== '' && preg_match('/Bearer\s+(.+)$/i', $raw, $matches)) {
            return trim($matches[1]);
        }
    }
    return '';
}

function jwt_expires_at(string $token): ?string
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }
    $payload = $parts[1];
    $payload = str_replace(['-', '_'], ['+', '/'], $payload);
    $decoded = base64_decode($payload, true);
    if ($decoded === false) {
        return null;
    }
    $data = json_decode($decoded, true);
    if (!is_array($data) || !isset($data['exp']) || !is_numeric($data['exp'])) {
        return null;
    }
    return date('c', (int) $data['exp']);
}

if ($jwtSecret === '') {
    timer_fail('Erreur serveur', 500);
}

CoreAuthService::configure(
    $DB_CONFIG['host'],
    $DB_CONFIG['database'],
    $DB_CONFIG['username'],
    $DB_CONFIG['password'],
    $jwtSecret
);

/**
 * Vérifie si l'organisation a accès au module TIMER.
 * En mode open beta, l'accès est toujours autorisé.
 */
function timer_has_module_access(?string $orgId): bool
{
    global $TIMER_OPEN_BETA;
    if ($orgId === null || $orgId === '') {
        return false;
    }
    if ($TIMER_OPEN_BETA) {
        return true;
    }
    return CoreAuthService::checkEntitlement($orgId, 'TIMER');
}

// --------------------------------------------------------------------------
// CORS : origines autorisees (pas de wildcard). Origin vide/absent autorise
// (clients natifs, Timer desktop Electron, Postman, serveur-a-serveur).
// --------------------------------------------------------------------------
$TIMER_CORS_ORIGINS = [
    'https://dashboard.soreva.app',
    'https://project.soreva.app',
    'https://facture.soreva.app',
    'https://timer.soreva.app',
];
$extraOrigins = $TIMER_SECRETS['timer_cors_origins'] ?? null;
if (is_array($extraOrigins)) {
    $TIMER_CORS_ORIGINS = array_values(array_unique(array_merge($TIMER_CORS_ORIGINS, $extraOrigins)));
}
$envOrigins = getenv('TIMER_CORS_ORIGINS');
if ($envOrigins !== false && $envOrigins !== '') {
    $parsed = array_map('trim', explode(',', $envOrigins));
    $TIMER_CORS_ORIGINS = array_values(array_unique(array_merge($TIMER_CORS_ORIGINS, $parsed)));
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$origin = trim($origin);
header('Vary: Origin');
// Ne rejeter que si Origin est present et non autorise (clients sans Origin OK)
if ($origin !== '') {
    if (!in_array($origin, $TIMER_CORS_ORIGINS, true)) {
        timer_fail('Accès non autorisé', 403);
    }
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// --------------------------------------------------------------------------
// En-têtes de sécurité (X-Content-Type-Options, Referrer-Policy)
// --------------------------------------------------------------------------
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

// --------------------------------------------------------------------------
// Connexion PDO locale (pour les requetes metier Timer)
// --------------------------------------------------------------------------
function getConnection() {
    global $DB_CONFIG;
    try {
        $pdo = new PDO(
            "mysql:host={$DB_CONFIG['host']};dbname={$DB_CONFIG['database']};charset=utf8mb4",
            $DB_CONFIG['username'],
            $DB_CONFIG['password'],
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ]
        );

        $mysqlTimeZone = 'Europe/Paris';
        $fallbackOffset = '+01:00';
        try {
            $result = $pdo->query("SELECT CONVERT_TZ('2000-01-01 00:00:00', 'UTC', " . $pdo->quote($mysqlTimeZone) . ')');
            if ($result !== false && $result->fetchColumn() !== false) {
                $pdo->exec('SET time_zone = ' . $pdo->quote($mysqlTimeZone));
            } else {
                $pdo->exec("SET time_zone = '$fallbackOffset'");
            }
        } catch (PDOException $tzException) {
            try { $pdo->exec("SET time_zone = '$fallbackOffset'"); } catch (PDOException $e) {}
        }

        return $pdo;
    } catch (PDOException $e) {
        timer_log('Database connection error: ' . $e->getMessage());
        timer_fail('Erreur de connexion base de données', 500);
    }
}

// --------------------------------------------------------------------------
// Helpers : extraction token + resolution du profil timer_freelances
// --------------------------------------------------------------------------

/**
 * Valide le JWT via CoreAuthService et retourne le payload ['sub', 'org_id', ...] ou null.
 */
function extractCorePayload(string $token): ?array {
    return CoreAuthService::validateToken($token);
}

/**
 * Resout le profil timer_freelances pour un core_user_id + org_id.
 * Cree le profil automatiquement s'il n'existe pas encore.
 */
function resolveFreelanceProfile(PDO $pdo, string $coreUserId, string $orgId): ?array {
    $stmt = $pdo->prepare(
        'SELECT id, name, email, status FROM timer_freelances WHERE core_user_id = ? AND org_id = ? LIMIT 1'
    );
    $stmt->execute([$coreUserId, $orgId]);
    $freelance = $stmt->fetch();

    if ($freelance) {
        return $freelance;
    }

    // Auto-creation du profil a partir de core_users
    $coreUser = CoreAuthService::getUser($coreUserId);
    if (!$coreUser) {
        return null;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO timer_freelances (org_id, core_user_id, email, name, status) VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $orgId,
        $coreUserId,
        $coreUser['email'] ?? '',
        $coreUser['email'] ?? 'Utilisateur',
        'active'
    ]);

    return [
        'id' => $pdo->lastInsertId(),
        'name' => $coreUser['email'] ?? 'Utilisateur',
        'email' => $coreUser['email'] ?? '',
        'status' => 'active'
    ];
}

// --------------------------------------------------------------------------
// Routeur
// --------------------------------------------------------------------------
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

$token = getBearerToken();

// Variables globales de session (peuplees apres validation du token)
$coreUserId = null;
$orgId = null;
$freelanceId = null;

if ($token) {
    $payload = extractCorePayload($token);
    if ($payload) {
        $coreUserId = $payload['sub'] ?? null;
        $orgId = $payload['org_id'] ?? null;
    }
}

// ======================= ROUTE : LOGIN =======================
if ($action === 'login' && $method === 'POST') {
    timer_enforce_rate_limit('POST login', 5, 900, 'ip');

    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    if ($rawInput !== '' && (json_last_error() !== JSON_ERROR_NONE || $input === null)) {
        timer_fail('JSON invalide', 400);
    }

    // Accepter email ou username (retrocompatibilite)
    $email = $input['email'] ?? $input['username'] ?? null;
    $password = $input['password'] ?? null;

    if (!$email || !$password) {
        timer_fail('Email et mot de passe requis', 400);
    }

    // Authentification via CoreAuthService
    $authResult = CoreAuthService::authenticate($email, $password);
    if (!$authResult) {
        timer_fail('Identifiants invalides', 401);
    }

    $coreUserId = $authResult['core_user_id'];
    $orgId = $authResult['org_id'];

    // Verifier l'entitlement TIMER pour cette organisation
    if (!timer_has_module_access($orgId)) {
        timer_fail('Accès au module Timer non autorisé pour cette organisation', 403);
    }

    // Resoudre ou creer le profil timer_freelances
    $pdo = getConnection();
    $freelance = resolveFreelanceProfile($pdo, $coreUserId, $orgId);
    if (!$freelance) {
        timer_fail('Impossible de créer le profil Timer', 500);
    }

    // Token court (TIMER_TOKEN_EXPIRY_HOURS), pas de JWT 24h comme session ; le client doit appeler refresh avant expiration
    $coreToken = CoreAuthService::createToken($coreUserId, $orgId, TIMER_TOKEN_EXPIRY_HOURS);

    timer_json([
        'success' => true,
        'token' => $coreToken,
        'freelance_id' => $freelance['id'],
        'freelance_name' => $freelance['name'],
        'core_user_id' => $coreUserId,
        'org_id' => $orgId,
        'expires_at' => jwt_expires_at($coreToken) ?? date('c', time() + (TIMER_TOKEN_EXPIRY_HOURS * 3600))
    ], 200);
}

// ======================= ROUTE : VERIFY =======================
if ($action === 'verify' && $method === 'GET') {
    timer_enforce_rate_limit('GET verify', 300, 3600, 'identity_or_ip', $coreUserId);

    if (!$coreUserId || !$orgId) {
        timer_fail('Token manquant ou invalide', 401);
    }
    if (!timer_has_module_access($orgId)) {
        timer_fail('Accès au module Timer non autorisé pour cette organisation', 403);
    }

    $pdo = getConnection();
    $freelance = resolveFreelanceProfile($pdo, $coreUserId, $orgId);

    $expiresAt = jwt_expires_at($token);

    timer_json([
        'success' => true,
        'freelance_id' => $freelance ? $freelance['id'] : null,
        'core_user_id' => $coreUserId,
        'org_id' => $orgId,
        'expires_at' => $expiresAt
    ], 200);
}

// ======================= ROUTE : REFRESH =======================
if ($action === 'refresh' && $method === 'POST') {
    // JWT strictement expiré : validateToken échoue plus haut ; ici on ré-ouvre l'identité pour refresh uniquement
    if ((!$coreUserId || !$orgId) && $token) {
        $payloadRefresh = CoreAuthService::validateTokenAllowExpired($token, TIMER_REFRESH_EXPIRED_LEEWAY_SECONDS);
        if ($payloadRefresh) {
            $coreUserId = $payloadRefresh['sub'] ?? null;
            $orgId = $payloadRefresh['org_id'] ?? null;
        }
    }

    timer_enforce_rate_limit('POST refresh', 120, 3600, 'identity_or_ip', $coreUserId);

    if (!$coreUserId || !$orgId) {
        timer_fail('Token manquant ou invalide', 401);
    }
    if (!timer_has_module_access($orgId)) {
        timer_fail('Accès au module Timer non autorisé pour cette organisation', 403);
    }

    $newToken = CoreAuthService::createToken($coreUserId, $orgId, TIMER_TOKEN_EXPIRY_HOURS);

    $pdo = getConnection();
    $freelance = resolveFreelanceProfile($pdo, $coreUserId, $orgId);

    timer_json([
        'success' => true,
        'token' => $newToken,
        'freelance_id' => $freelance ? $freelance['id'] : null,
        'core_user_id' => $coreUserId,
        'org_id' => $orgId,
        'expires_at' => jwt_expires_at($newToken) ?? date('c', time() + (TIMER_TOKEN_EXPIRY_HOURS * 3600))
    ], 200);
}

// ======================= ROUTE : HEALTH =======================
if ($action === 'health' && $method === 'GET') {
    timer_json([
        'status' => 'ok',
        'version' => '2.0.0',
        'auth' => 'CoreAuthService',
        'database' => 'soreva_full',
        'timestamp' => date('c')
    ], 200);
}

// ======================= GUARD : routes protegees =======================
if (!$coreUserId || !$orgId) {
    if (!in_array($action, ['health', 'login'])) {
        timer_fail('Token manquant ou invalide', 401);
    }
}
if ($coreUserId && $orgId && !in_array($action, ['health', 'login'])) {
    if (!timer_has_module_access($orgId)) {
        timer_fail('Accès au module Timer non autorisé pour cette organisation', 403);
    }
}

// Resoudre le freelance pour toutes les routes protegees
$pdo = getConnection();
$freelanceProfile = resolveFreelanceProfile($pdo, $coreUserId, $orgId);
if (!$freelanceProfile) {
    timer_fail('Profil Timer introuvable', 500);
}
$freelanceId = $freelanceProfile['id'];

// ======================= ROUTE : GET CLIENTS =======================
// Même source que Facture et Project Tracker (facture_clients) pour afficher les mêmes clients.
if ($action === 'clients' && $method === 'GET') {
    timer_enforce_rate_limit('GET clients', 300, 3600, 'identity_or_ip', $coreUserId);

    try {
        $stmt = $pdo->prepare(
            'SELECT id, name, company FROM facture_clients WHERE org_id = ? ORDER BY name ASC'
        );
        $stmt->execute([$orgId]);
        $rows = $stmt->fetchAll();
        $list = array_map(function ($r) {
            return [
                'id' => (int) $r['id'],
                'name' => $r['name'] ?? '',
                'company' => $r['company'] ?? ''
            ];
        }, $rows);
        timer_json(['success' => true, 'data' => $list]);
    } catch (Exception $e) {
        timer_log('Erreur chargement clients: ' . $e->getMessage());
        timer_fail('Erreur chargement clients', 500);
    }
}

// ======================= ROUTE : GET PROJECTS =======================
if ($action === 'projects' && $method === 'GET') {
    timer_enforce_rate_limit('GET projects', 600, 3600, 'identity_or_ip', $coreUserId);

    try {
        $stmt = $pdo->prepare(
            'SELECT * FROM timer_projects WHERE freelance_id = ? AND org_id = ? ORDER BY created_at DESC'
        );
        $stmt->execute([$freelanceId, $orgId]);
        $projects = $stmt->fetchAll();

        $formattedProjects = [];

        foreach ($projects as $project) {
            $clientName = '';
            $clientCompany = '';
            if (!empty($project['facture_client_id'])) {
                $clientStmt = $pdo->prepare('SELECT name, company FROM facture_clients WHERE id = ? AND org_id = ? LIMIT 1');
                $clientStmt->execute([$project['facture_client_id'], $orgId]);
                $client = $clientStmt->fetch();
                if ($client) {
                    $clientName = $client['name'] ?? '';
                    $clientCompany = $client['company'] ?? '';
                }
            }
            if ($clientName === '' && !empty($project['client_id'])) {
                $clientStmt = $pdo->prepare('SELECT name, company FROM timer_clients WHERE id = ? AND org_id = ? LIMIT 1');
                $clientStmt->execute([$project['client_id'], $orgId]);
                $client = $clientStmt->fetch();
                if ($client) {
                    $clientName = $client['name'] ?? '';
                    $clientCompany = $client['company'] ?? '';
                }
            }

            $logsStmt = $pdo->prepare(
                'SELECT * FROM timer_project_logs WHERE project_id = ? AND org_id = ? ORDER BY sync_timestamp ASC'
            );
            $logsStmt->execute([$project['id'], $orgId]);
            $logs = $logsStmt->fetchAll();

            $workSessions = [];
            $usedTime = 0;

            foreach ($logs as $log) {
                $duration = intval($log['duration_seconds'] ?? 0);
                $usedTime += $duration;

                $workSessions[] = [
                    'id' => 'session-' . $log['id'],
                    'subject' => $log['description'] ?? '',
                    'startTime' => $log['session_start'],
                    'endTime' => $log['session_end'],
                    'duration' => $duration,
                    'date' => !empty($log['session_date'])
                        ? $log['session_date']
                        : ($log['session_start'] ? date('Y-m-d', strtotime($log['session_start'])) : date('Y-m-d'))
                ];
            }

            // current_time en base = temps déjà utilisé (secondes)
            $currentTimeFromDb = $project['current_time'] ?? null;
            if ($currentTimeFromDb === null) {
                foreach (array_keys($project) as $k) {
                    if (strtolower($k) === 'current_time') {
                        $currentTimeFromDb = $project[$k];
                        break;
                    }
                }
            }
            $currentTime = intval($currentTimeFromDb ?? $usedTime);
            $status = $project['status'] ?? 'active';

            $formattedProjects[] = [
                'id' => $project['project_uuid'] ?? $project['id'],
                'name' => $project['name'],
                'description' => $project['description'] ?? '',
                'clientName' => $clientName,
                'company' => $clientCompany,
                'totalTime' => intval($project['total_time_allocated'] ?? 0),
                'usedTime' => $usedTime,
                'currentTime' => $currentTime,
                'status' => $status,
                'lastSaved' => $project['last_activity'] ?? $project['created_at'],
                'workSessions' => $workSessions,
                'subjectHistory' => [],
                'currentSubject' => '',
                'sessionStartTime' => null,
                // Partage portail client (maintenance /m/{token})
                'clientToken' => $project['client_token'] ?? null,
                'portalUrl' => !empty($project['client_token'])
                    ? (timer_client_portal_base() . '/m/' . $project['client_token'])
                    : null,
                // Rattachement explicite à un projet Project-tracker
                'ptProjectId' => isset($project['pt_project_id']) ? (int) $project['pt_project_id'] : null
            ];
        }

        timer_json(['success' => true, 'data' => $formattedProjects]);
    } catch (Exception $e) {
        timer_log('Erreur chargement projets: ' . $e->getMessage());
        timer_fail('Erreur chargement', 500);
    }
}

// ======================= ROUTE : SAVE PROJECT (POST) =======================
if (in_array($action, ['projects', 'save-project']) && $method === 'POST') {
    timer_enforce_rate_limit('POST projects', 600, 3600, 'identity_or_ip', $coreUserId);

    $rawInput = file_get_contents('php://input');
    $projectData = json_decode($rawInput, true);
    if ($rawInput !== '' && (json_last_error() !== JSON_ERROR_NONE || $projectData === null)) {
        timer_fail('JSON invalide', 400);
    }

    if (!$projectData || !isset($projectData['name'])) {
        timer_fail('Nom du projet manquant', 400);
    }

    try {
        // ETAPE 1 : Client partagé (facture_clients, même que Facture et Project Tracker)
        $clientName = $projectData['clientName'] ?? $projectData['client'] ?? 'Client par défaut';
        $clientIdFromFront = isset($projectData['clientId']) ? (int) $projectData['clientId'] : 0;
        $factureClientId = null;

        if ($clientIdFromFront > 0) {
            $stmt = $pdo->prepare('SELECT id FROM facture_clients WHERE id = ? AND org_id = ? LIMIT 1');
            $stmt->execute([$clientIdFromFront, $orgId]);
            if ($stmt->fetch()) {
                $factureClientId = $clientIdFromFront;
            }
        }
        if ($factureClientId === null && $clientName !== '') {
            $stmt = $pdo->prepare('SELECT id FROM facture_clients WHERE org_id = ? AND name = ? LIMIT 1');
            $stmt->execute([$orgId, $clientName]);
            $row = $stmt->fetch();
            if ($row) {
                $factureClientId = (int) $row['id'];
            } else {
                $stmt = $pdo->prepare(
                    'INSERT INTO facture_clients (org_id, name, company, email, phone, address) VALUES (?, ?, ?, NULL, NULL, NULL)'
                );
                $stmt->execute([$orgId, $clientName, $projectData['company'] ?? '']);
                $factureClientId = (int) $pdo->lastInsertId();
            }
        }

        // ETAPE 2 : Creer ou mettre a jour le projet
        $projectUuid = $projectData['id'] ?? null;
        if (empty($projectUuid)) {
            $projectUuid = 'proj_' . bin2hex(random_bytes(16));
            $projectData['id'] = $projectUuid;
        }

        $stmt = $pdo->prepare('SELECT id FROM timer_projects WHERE project_uuid = ? AND freelance_id = ? AND org_id = ?');
        $stmt->execute([$projectUuid, $freelanceId, $orgId]);
        $existingProject = $stmt->fetch();

        $currentTime = isset($projectData['currentTime']) ? intval($projectData['currentTime']) : 0;
        $status = $projectData['status'] ?? 'active';

        if ($existingProject) {
            $stmt = $pdo->prepare(
                'UPDATE timer_projects SET
                    facture_client_id = ?,
                    client_id = NULL,
                    name = ?,
                    description = ?,
                    total_time_allocated = ?,
                    hourly_rate = ?,
                    `current_time` = ?,
                    status = ?,
                    last_activity = NOW(),
                    updated_at = NOW()
                WHERE id = ? AND freelance_id = ? AND org_id = ?'
            );
            $stmt->execute([
                $factureClientId,
                $projectData['name'],
                $projectData['description'] ?? '',
                $projectData['totalTime'] ?? 0,
                $projectData['hourlyRate'] ?? 0,
                $currentTime,
                $status,
                $existingProject['id'],
                $freelanceId,
                $orgId
            ]);
            $projectId = $existingProject['id'];
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO timer_projects (
                    org_id, core_user_id, freelance_id, facture_client_id, client_id, project_uuid,
                    name, description, project_type, total_time_allocated,
                    `current_time`, status, hourly_rate, start_date, end_date,
                    last_activity, created_at, updated_at
                ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())'
            );
            $stmt->execute([
                $orgId,
                $coreUserId,
                $freelanceId,
                $factureClientId,
                $projectUuid,
                $projectData['name'],
                $projectData['description'] ?? '',
                'timer',
                $projectData['totalTime'] ?? 0,
                $currentTime,
                $status,
                $projectData['hourlyRate'] ?? 0,
                null,
                null,
                $currentTime > 0 ? date('Y-m-d H:i:s') : null
            ]);
            $projectId = $pdo->lastInsertId();
        }

        // ETAPE 3 : Sauvegarder les sessions de travail
        if (isset($projectData['workSessions']) && is_array($projectData['workSessions'])) {
            $stmt = $pdo->prepare('DELETE FROM timer_project_logs WHERE project_id = ? AND org_id = ?');
            $stmt->execute([$projectId, $orgId]);

            $insertStmt = $pdo->prepare(
                'INSERT INTO timer_project_logs (
                    org_id, core_user_id, project_id,
                    session_start, session_end, session_date,
                    duration_seconds, description, task_type, is_billable, sync_timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())'
            );

            foreach ($projectData['workSessions'] as $session) {
                if (isset($session['duration']) && $session['duration'] > 0) {
                    $sessionDate = null;
                    if (!empty($session['date'])) {
                        $sessionDate = $session['date'];
                    } elseif (!empty($session['startTime'])) {
                        $sessionDate = date('Y-m-d', strtotime($session['startTime']));
                    } else {
                        $sessionDate = date('Y-m-d');
                    }

                    $startTime = !empty($session['startTime']) ? date('Y-m-d H:i:s', strtotime($session['startTime'])) : null;
                    $endTime = !empty($session['endTime']) ? date('Y-m-d H:i:s', strtotime($session['endTime'])) : null;

                    $insertStmt->execute([
                        $orgId,
                        $coreUserId,
                        $projectId,
                        $startTime,
                        $endTime,
                        $sessionDate,
                        $session['duration'] ?? 0,
                        $session['subject'] ?? '',
                        'maintenance',
                        1
                    ]);
                }
            }
        }

        $savedProject = [
            'project_id' => $projectId,
            'project_uuid' => $projectUuid,
            'currentTime' => $currentTime,
            'status' => $status,
            'name' => $projectData['name'],
            'description' => $projectData['description'] ?? '',
            'freelance_id' => $freelanceId
        ];

        timer_json([
            'success' => true,
            'message' => 'Projet sauvegardé avec succès',
            'project_id' => $projectId,
            'project_uuid' => $projectUuid,
            'currentTime' => $currentTime,
            'status' => $status,
            'data' => ['project' => $savedProject]
        ]);
    } catch (Exception $e) {
        timer_log('ERREUR SQL sauvegarde projet: ' . $e->getMessage());
        timer_fail('Erreur lors de la sauvegarde du projet', 500);
    }
}

// ======================= ROUTE : DELETE PROJECT =======================
if ($action === 'projects' && $method === 'DELETE') {
    timer_enforce_rate_limit('DELETE projects', 60, 3600, 'identity_or_ip', $coreUserId);

    $rawInput = file_get_contents('php://input');
    $projectData = json_decode($rawInput, true);
    if ($rawInput !== '' && (json_last_error() !== JSON_ERROR_NONE || $projectData === null)) {
        timer_fail('JSON invalide', 400);
    }

    if (!$projectData || !isset($projectData['id'])) {
        timer_fail('ID du projet manquant', 400);
    }

    $id = $projectData['id'];
    $idString = is_scalar($id) ? (string) $id : '';
    $isNumeric = is_numeric($id) && (is_int($id) || ctype_digit($idString));

    // On accepte tout identifiant scalaire non vide : la route GET expose
    // `project_uuid ?? id`, donc le client peut renvoyer aussi bien un UUID
    // (`proj_...`), une clé primaire numérique, ou un identifiant hérité de
    // TrustyTimer (UUID numérique/legacy). On ne devine plus la colonne à partir
    // du format : on cherche sur les deux colonnes à la fois.
    if ($idString === '') {
        timer_fail('ID du projet invalide', 400);
    }

    try {
        // Recherche sur project_uuid OU id pour couvrir tous les formats
        // d'identifiant, quel que soit celui exposé par la route GET.
        if ($isNumeric) {
            $stmt = $pdo->prepare(
                'DELETE FROM timer_projects
                 WHERE freelance_id = ? AND org_id = ? AND (project_uuid = ? OR id = ?)'
            );
            $stmt->execute([$freelanceId, $orgId, $idString, (int) $id]);
        } else {
            $stmt = $pdo->prepare(
                'DELETE FROM timer_projects
                 WHERE freelance_id = ? AND org_id = ? AND project_uuid = ?'
            );
            $stmt->execute([$freelanceId, $orgId, $idString]);
        }

        if ($stmt->rowCount() > 0) {
            timer_json(['success' => true, 'message' => 'Projet supprimé']);
        } else {
            timer_fail('Projet non trouvé', 404);
        }
    } catch (Exception $e) {
        timer_log('Erreur suppression projet: ' . $e->getMessage());
        timer_fail('Erreur suppression', 500);
    }
}

// ======================= HELPERS : MAINTENANCE =======================
/**
 * Base URL du portail client (Project Tracker : /c/{token}).
 * Surcharge possible via SOREVA_CLIENT_PORTAL_BASE ou secrets['client_portal_base'].
 */
function timer_client_portal_base(): string
{
    global $TIMER_SECRETS;
    $base = getenv('SOREVA_CLIENT_PORTAL_BASE');
    if (($base === false || $base === '') && isset($TIMER_SECRETS['client_portal_base'])) {
        $base = $TIMER_SECRETS['client_portal_base'];
    }
    if ($base === false || $base === '') {
        $base = 'https://project.soreva.app';
    }
    return rtrim((string) $base, '/');
}

// ======================= ROUTE : ENSURE SHARE TOKEN (POST) =======================
// Garantit qu'un projet timer possède un jeton de partage (portail client /m/{token}).
// Modèle unifié : la "maintenance" = le temps restant d'un projet timer.
if ($action === 'ensure-share-token' && $method === 'POST') {
    timer_enforce_rate_limit('POST ensure-share-token', 120, 3600, 'identity_or_ip', $coreUserId);

    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);
    if ($rawInput !== '' && (json_last_error() !== JSON_ERROR_NONE || $data === null)) {
        timer_fail('JSON invalide', 400);
    }

    $rawId = $data['id'] ?? null;
    $idString = is_scalar($rawId) ? (string) $rawId : '';
    if ($idString === '') {
        timer_fail('Identifiant projet manquant', 400);
    }
    $isNumeric = is_numeric($rawId) && ctype_digit($idString);

    try {
        // Retrouver le projet (match robuste : project_uuid OU id)
        if ($isNumeric) {
            $stmt = $pdo->prepare(
                'SELECT id, client_token FROM timer_projects
                  WHERE freelance_id = ? AND org_id = ? AND (project_uuid = ? OR id = ?) LIMIT 1'
            );
            $stmt->execute([$freelanceId, $orgId, $idString, (int) $rawId]);
        } else {
            $stmt = $pdo->prepare(
                'SELECT id, client_token FROM timer_projects
                  WHERE freelance_id = ? AND org_id = ? AND project_uuid = ? LIMIT 1'
            );
            $stmt->execute([$freelanceId, $orgId, $idString]);
        }
        $project = $stmt->fetch();
        if (!$project) {
            timer_fail('Projet non trouvé', 404);
        }

        $token = $project['client_token'] ?? null;
        if (empty($token)) {
            $token = bin2hex(random_bytes(32));
            $stmt = $pdo->prepare(
                'UPDATE timer_projects SET client_token = ?, updated_at = NOW()
                  WHERE id = ? AND freelance_id = ? AND org_id = ?'
            );
            $stmt->execute([$token, $project['id'], $freelanceId, $orgId]);
        }

        timer_json([
            'success' => true,
            'clientToken' => $token,
            'portalUrl' => timer_client_portal_base() . '/m/' . $token,
        ]);
    } catch (Exception $e) {
        timer_log('Erreur ensure-share-token: ' . $e->getMessage());
        timer_fail('Erreur génération du lien', 500);
    }
}

// ======================= ROUTE : LISTE PROJETS PROJECT-TRACKER =======================
// Uniquement les projets PT du CLIENT de l'enveloppe timer (?projectId=<id|uuid>).
// A la création d'une maintenance on choisit un client ; on ne propose donc que
// les projets déjà créés pour ce client (sinon liste vide).
if ($action === 'pt-projects' && $method === 'GET') {
    timer_enforce_rate_limit('GET pt-projects', 300, 3600, 'identity_or_ip', $coreUserId);

    $rawId = $_GET['projectId'] ?? '';
    $idString = is_scalar($rawId) ? (string) $rawId : '';
    if ($idString === '') {
        timer_fail('Identifiant projet manquant', 400);
    }
    $isNumeric = is_numeric($rawId) && ctype_digit($idString);

    try {
        // Résoudre l'enveloppe timer et son client partagé
        if ($isNumeric) {
            $stmt = $pdo->prepare(
                'SELECT facture_client_id FROM timer_projects
                  WHERE freelance_id = ? AND org_id = ? AND (project_uuid = ? OR id = ?) LIMIT 1'
            );
            $stmt->execute([$freelanceId, $orgId, $idString, (int) $rawId]);
        } else {
            $stmt = $pdo->prepare(
                'SELECT facture_client_id FROM timer_projects
                  WHERE freelance_id = ? AND org_id = ? AND project_uuid = ? LIMIT 1'
            );
            $stmt->execute([$freelanceId, $orgId, $idString]);
        }
        $env = $stmt->fetch();
        $factureClientId = $env ? (int) ($env['facture_client_id'] ?? 0) : 0;

        // Pas de client rattaché → aucun projet à proposer
        if ($factureClientId <= 0) {
            timer_json(['success' => true, 'data' => []]);
        }

        $stmt = $pdo->prepare('SELECT name, email FROM facture_clients WHERE id = ? AND org_id = ? LIMIT 1');
        $stmt->execute([$factureClientId, $orgId]);
        $client = $stmt->fetch();
        if (!$client) {
            timer_json(['success' => true, 'data' => []]);
        }
        $clientName = trim((string) ($client['name'] ?? ''));
        $clientEmail = trim((string) ($client['email'] ?? ''));

        // Aucun identifiant client exploitable → rien à proposer
        if ($clientName === '' && $clientEmail === '') {
            timer_json(['success' => true, 'data' => []]);
        }

        // Projets PT du même client uniquement : match email (prioritaire) ou nom,
        // insensible à la casse et aux espaces. Jamais tous les projets.
        $stmt = $pdo->prepare(
            'SELECT id, name, client_name FROM pt_projects
              WHERE org_id = ?
                AND (
                    (TRIM(client_email) <> \'\' AND LOWER(TRIM(client_email)) = LOWER(?))
                    OR (TRIM(client_name) <> \'\' AND LOWER(TRIM(client_name)) = LOWER(?))
                )
              ORDER BY name ASC'
        );
        $stmt->execute([$orgId, $clientEmail, $clientName]);
        $rows = $stmt->fetchAll();

        $list = array_map(static function ($r) {
            return [
                'id' => (int) $r['id'],
                'name' => $r['name'] ?? '',
                'clientName' => $r['client_name'] ?? '',
            ];
        }, $rows);

        timer_json(['success' => true, 'data' => $list]);
    } catch (Exception $e) {
        timer_log('Erreur chargement projets PT: ' . $e->getMessage());
        timer_fail('Erreur chargement des projets Soreva', 500);
    }
}

// ======================= ROUTE : RATTACHER À UN PROJET PT (POST) =======================
// Lie (ou délie si ptProjectId null/0) une enveloppe timer à un projet Project-tracker.
if ($action === 'link-pt-project' && $method === 'POST') {
    timer_enforce_rate_limit('POST link-pt-project', 120, 3600, 'identity_or_ip', $coreUserId);

    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);
    if ($rawInput !== '' && (json_last_error() !== JSON_ERROR_NONE || $data === null)) {
        timer_fail('JSON invalide', 400);
    }

    $rawId = $data['id'] ?? null;
    $idString = is_scalar($rawId) ? (string) $rawId : '';
    if ($idString === '') {
        timer_fail('Identifiant projet manquant', 400);
    }
    $isNumeric = is_numeric($rawId) && ctype_digit($idString);

    // ptProjectId null/0 = délier
    $ptProjectId = isset($data['ptProjectId']) && $data['ptProjectId'] !== null
        ? (int) $data['ptProjectId']
        : 0;

    try {
        // Retrouver l'enveloppe timer (match robuste : project_uuid OU id)
        if ($isNumeric) {
            $stmt = $pdo->prepare(
                'SELECT id FROM timer_projects
                  WHERE freelance_id = ? AND org_id = ? AND (project_uuid = ? OR id = ?) LIMIT 1'
            );
            $stmt->execute([$freelanceId, $orgId, $idString, (int) $rawId]);
        } else {
            $stmt = $pdo->prepare(
                'SELECT id FROM timer_projects
                  WHERE freelance_id = ? AND org_id = ? AND project_uuid = ? LIMIT 1'
            );
            $stmt->execute([$freelanceId, $orgId, $idString]);
        }
        $project = $stmt->fetch();
        if (!$project) {
            timer_fail('Projet non trouvé', 404);
        }

        // Si rattachement demandé, le projet PT doit appartenir à la même org
        if ($ptProjectId > 0) {
            $stmt = $pdo->prepare('SELECT id FROM pt_projects WHERE id = ? AND org_id = ? LIMIT 1');
            $stmt->execute([$ptProjectId, $orgId]);
            if (!$stmt->fetch()) {
                timer_fail('Projet Soreva introuvable', 404);
            }
        }

        $stmt = $pdo->prepare(
            'UPDATE timer_projects SET pt_project_id = ?, updated_at = NOW()
              WHERE id = ? AND freelance_id = ? AND org_id = ?'
        );
        $stmt->execute([$ptProjectId > 0 ? $ptProjectId : null, $project['id'], $freelanceId, $orgId]);

        timer_json(['success' => true, 'ptProjectId' => $ptProjectId > 0 ? $ptProjectId : null]);
    } catch (Exception $e) {
        timer_log('Erreur rattachement projet PT: ' . $e->getMessage());
        timer_fail('Erreur de rattachement', 500);
    }
}

// Route non trouvée
timer_fail('Route non trouvée', 404);
