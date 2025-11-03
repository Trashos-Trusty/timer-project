<?php
// API Timer - Version corrigée et simplifiée
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

// Configurer le timezone français
date_default_timezone_set('Europe/Paris');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Gérer les requêtes preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Configuration de la base de données
$DB_CONFIG = [
    'host' => 'xxxxx',
    'username' => 'xx',
    'password' => 'xxxxx',
    'database' => 'xxxx'
];

$JWT_SECRET = 'xxxxx';

// Fonction de connexion à la base
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
        
        // Configurer MySQL pour le timezone français
        $pdo->exec("SET time_zone = 'Europe/Paris'");
        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Erreur de connexion base de données: ' . $e->getMessage()]);
        exit();
    }
}

// Fonction pour valider le JWT
function validateToken($token) {
    global $JWT_SECRET;
    $parts = explode('.', $token);
    if (count($parts) !== 3) return false;
    
    $payload = json_decode(base64_decode($parts[1]), true);
    if (!$payload || !isset($payload['freelance_id'])) return false;
    
    if (isset($payload['exp']) && $payload['exp'] < time()) return false;
    
    return $payload['freelance_id'];
}

// Fonction pour créer un JWT
function createToken($freelanceId) {
    global $JWT_SECRET;
    $header = base64_encode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
    $payload = base64_encode(json_encode([
        'freelance_id' => $freelanceId,
        'exp' => time() + (24 * 60 * 60)
    ]));
    
    $signature = base64_encode(hash_hmac('sha256', "$header.$payload", $JWT_SECRET, true));
    return "$header.$payload.$signature";
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Debug pour voir les requêtes reçues
error_log("DEBUG REQUETE - Action: $action, Method: $method");

// Route de login
if ($action === 'login' && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['username']) || !isset($input['password'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Username et password requis']);
        exit();
    }
    
    $pdo = getConnection();
    
    // Authentication with bcrypt support (and legacy SHA-256 fallback)
    $stmt = $pdo->prepare('SELECT id, username, email, name, password_hash FROM freelances WHERE username = ? AND status = "active" LIMIT 1');
    $stmt->execute([$input['username']]);
    $freelance = $stmt->fetch();

    if (!$freelance) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Identifiants invalides']);
        exit();
    }

    $storedHash = $freelance['password_hash'] ?? '';
    $passwordValid = false;

    // Detect bcrypt ($2a$, $2y$, $2b$)
    $isBcrypt = is_string($storedHash) && preg_match('/^\$2[aby]\$/', $storedHash) === 1;

    if ($isBcrypt) {
        // Verify against bcrypt hash
        $passwordValid = password_verify($input['password'], $storedHash);
    } else {
        // Legacy fallback: compare SHA-256
        $passwordValid = hash('sha256', $input['password']) === $storedHash;

        // Optional migration to bcrypt when legacy matches
        if ($passwordValid) {
            try {
                $newHash = password_hash($input['password'], PASSWORD_BCRYPT);
                if ($newHash) {
                    $upd = $pdo->prepare('UPDATE freelances SET password_hash = ? WHERE id = ?');
                    $upd->execute([$newHash, $freelance['id']]);
                    $storedHash = $newHash;
                }
            } catch (Exception $e) {
                // Ignore migration errors silently
            }
        }
    }

    if (!$passwordValid) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Identifiants invalides']);
        exit();
    }
    
    $token = createToken($freelance['id']);
    
    echo json_encode([
        'success' => true,
        'token' => $token,
        'freelance_id' => $freelance['id'],
        'freelance_name' => $freelance['name'],
        'expires_at' => date('c', time() + (24 * 60 * 60))
    ]);
    exit();
}

// Health check
if ($action === 'health' && $method === 'GET') {
    echo json_encode([
        'status' => 'ok',
        'version' => '1.0.0',
        'timestamp' => date('c')
    ]);
    exit();
}

// Vérification du token pour les routes protégées
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$token = '';
if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
    $token = $matches[1];
}

$freelanceId = $token ? validateToken($token) : false;

if (!$freelanceId && !in_array($action, ['health', 'login'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Token manquant ou invalide']);
    exit();
}

// Charger les projets (GET) - VERSION COMPLETE
if ($action === 'projects' && $method === 'GET') {
    if (!$freelanceId) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'FreelanceId manquant']);
        exit();
    }
    
    try {
        $pdo = getConnection();
        
        // Charger les projets du freelance
        $stmt = $pdo->prepare("SELECT * FROM projects WHERE freelance_id = ? ORDER BY created_at DESC");
        $stmt->execute([$freelanceId]);
        $projects = $stmt->fetchAll();
        
        $formattedProjects = [];
        
        foreach ($projects as $project) {
            // Récupérer le nom du client
            $clientName = '';
            $clientCompany = '';
            if (!empty($project['client_id'])) {
                $clientStmt = $pdo->prepare('SELECT name, company FROM clients WHERE id = ?');
                $clientStmt->execute([$project['client_id']]);
                $client = $clientStmt->fetch();
                if ($client) {
                    $clientName = $client['name'] ?? '';
                    $clientCompany = $client['company'] ?? '';
                }
            }
            
            // Récupérer les sessions de travail avec les VRAIS noms de colonnes
            $logsStmt = $pdo->prepare('SELECT * FROM project_logs WHERE project_id = ? ORDER BY sync_timestamp ASC');
            $logsStmt->execute([$project['id']]);
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
                    'date' => !empty($log['session_date']) ? $log['session_date'] : ($log['session_start'] ? date('Y-m-d', strtotime($log['session_start'])) : date('Y-m-d'))
                ];
            }
            
            $currentTime = isset($project['current_time']) ? intval($project['current_time']) : $usedTime;
            $status = isset($project['status']) ? $project['status'] : 'active';

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
                'sessionStartTime' => null
            ];
        }
        
        echo json_encode([
            'success' => true,
            'data' => $formattedProjects
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Erreur chargement: ' . $e->getMessage()
        ]);
    }
    exit();
}

// SAUVEGARDE PROJET - STRUCTURE CORRECTE
if ($action === 'projects' && $method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $projectData = json_decode($rawInput, true);
    
    if (!$projectData || !isset($projectData['name'])) {
        echo json_encode(['success' => false, 'message' => 'Nom du projet manquant']);
        exit();
    }
    
    try {
        $pdo = getConnection();

        // S'assurer que les colonnes nécessaires existent pour la persistance du timer
        $requiredColumns = [
            'current_time' => "ALTER TABLE `projects` ADD COLUMN `current_time` INT DEFAULT 0 AFTER `total_time_allocated`",
            'status' => "ALTER TABLE `projects` ADD COLUMN `status` VARCHAR(50) DEFAULT 'active' AFTER `hourly_rate`"
        ];

        $columnsStmt = $pdo->query("SHOW COLUMNS FROM projects");
        $existingColumns = $columnsStmt->fetchAll(PDO::FETCH_COLUMN);

        foreach ($requiredColumns as $column => $alterSql) {
            if (!in_array($column, $existingColumns)) {
                try {
                    $pdo->exec($alterSql);
                } catch (Exception $e) {
                    if (strpos($e->getMessage(), 'Duplicate column') === false) {
                        throw $e;
                    }
                }
            }
        }

        // ÉTAPE 1: Créer ou récupérer un client avec DEBUG
        $clientName = $projectData['clientName'] ?? $projectData['client'] ?? 'Client par défaut';
        
        // Debug: afficher les données reçues
        error_log("DEBUG CLIENT - Données reçues: " . json_encode($projectData));
        error_log("DEBUG CLIENT - Nom client extrait: " . $clientName);
        error_log("DEBUG CLIENT - Freelance ID: " . $freelanceId);
        
        // Chercher un client existant
        $stmt = $pdo->prepare('SELECT id FROM clients WHERE freelance_id = ? AND name = ?');
        $stmt->execute([$freelanceId, $clientName]);
        $client = $stmt->fetch();
        error_log("DEBUG CLIENT - Client existant trouvé: " . ($client ? "OUI (ID: " . $client['id'] . ")" : "NON"));
        
        if (!$client) {
            // Créer un nouveau client
            $clientSlug = strtolower(str_replace(' ', '_', $clientName));
            error_log("DEBUG CLIENT - Création nouveau client: " . $clientName . " (slug: " . $clientSlug . ")");
            
            $stmt = $pdo->prepare('INSERT INTO clients (freelance_id, client_id, name, company) VALUES (?, ?, ?, ?)');
            $stmt->execute([
                $freelanceId,
                $clientSlug,
                $clientName,
                $projectData['company'] ?? ''
            ]);
            $clientId = $pdo->lastInsertId();
            error_log("DEBUG CLIENT - Client créé avec ID: " . $clientId);
        } else {
            $clientId = $client['id'];
            error_log("DEBUG CLIENT - Utilisation client existant ID: " . $clientId);
        }
        
        // Vérification finale
        if (!$clientId) {
            throw new Exception("ERREUR: client_id est toujours null après création/récupération");
        }
        
        // ÉTAPE 2: Vérifier si le projet existe déjà
        $stmt = $pdo->prepare('SELECT id FROM projects WHERE project_uuid = ? AND freelance_id = ?');
        $stmt->execute([$projectData['id'], $freelanceId]);
        $existingProject = $stmt->fetch();
        
        $currentTime = isset($projectData['currentTime']) ? intval($projectData['currentTime']) : 0;
        $status = $projectData['status'] ?? 'active';

        if ($existingProject) {
            // UPDATE du projet existant
            $stmt = $pdo->prepare('UPDATE projects SET
                client_id = ?,
                name = ?,
                description = ?,
                total_time_allocated = ?,
                hourly_rate = ?,
                current_time = ?,
                status = ?,
                last_activity = NOW(),
                updated_at = NOW()
                WHERE id = ? AND freelance_id = ?');

            $stmt->execute([
                $clientId,
                $projectData['name'],
                $projectData['description'] ?? '',
                $projectData['totalTime'] ?? 0,
                $projectData['hourlyRate'] ?? 0,
                $currentTime,
                $status,
                $existingProject['id'],
                $freelanceId
            ]);
            $projectId = $existingProject['id'];
        } else {
            // INSERT nouveau projet
            $stmt = $pdo->prepare('INSERT INTO projects (
                freelance_id,
                client_id,
                project_uuid,
                name,
                description,
                project_type,
                total_time_allocated,
                hourly_rate,
                current_time,
                status,
                start_date,
                end_date,
                last_activity,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())');

            $stmt->execute([
                $freelanceId,
                $clientId,
                $projectData['id'],
                $projectData['name'],
                $projectData['description'] ?? '',
                'timer',
                $projectData['totalTime'] ?? 0,
                $projectData['hourlyRate'] ?? 0,
                $currentTime,
                $status,
                null,
                null,
                $currentTime > 0 ? date('Y-m-d H:i:s') : null
            ]);
            $projectId = $pdo->lastInsertId();
        }
        
        // ÉTAPE 3: Sauvegarder les sessions de travail
        if (isset($projectData['workSessions']) && is_array($projectData['workSessions'])) {
            // Supprimer les anciens logs pour ce projet
            $stmt = $pdo->prepare('DELETE FROM project_logs WHERE project_id = ?');
            $stmt->execute([$projectId]);
            
            // Insérer les nouvelles sessions
            foreach ($projectData['workSessions'] as $session) {
                if (isset($session['duration']) && $session['duration'] > 0) {
                    // Préserver la date originale de la session pour éviter les problèmes de timezone
                    $sessionDate = null;
                    if (!empty($session['date'])) {
                        $sessionDate = $session['date']; // Préserver la date originale
                    } else if (!empty($session['startTime'])) {
                        // Si pas de date, la calculer depuis startTime
                        $sessionDate = date('Y-m-d', strtotime($session['startTime']));
                    } else {
                        $sessionDate = date('Y-m-d'); // Fallback
                    }
                    
                    // Vérifier d'abord si la colonne session_date existe
                    $checkStmt = $pdo->query("SHOW COLUMNS FROM project_logs LIKE 'session_date'");
                    $hasSessionDateColumn = $checkStmt->rowCount() > 0;
                    
                    if ($hasSessionDateColumn) {
                        // Utiliser la requête avec session_date
                        $stmt = $pdo->prepare('INSERT INTO project_logs (
                            project_id, 
                            session_start, 
                            session_end, 
                            duration_seconds, 
                            description, 
                            task_type,
                            is_billable,
                            session_date,
                            sync_timestamp
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())');
                    } else {
                        // Fallback sans session_date
                        $stmt = $pdo->prepare('INSERT INTO project_logs (
                            project_id, 
                            session_start, 
                            session_end, 
                            duration_seconds, 
                            description, 
                            task_type,
                            is_billable,
                            sync_timestamp
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())');
                    }
                    
                    // Convertir les timestamps JavaScript en format MySQL
                    $startTime = null;
                    $endTime = null;
                    
                    if (!empty($session['startTime'])) {
                        $startTime = date('Y-m-d H:i:s', strtotime($session['startTime']));
                    }
                    
                    if (!empty($session['endTime'])) {
                        $endTime = date('Y-m-d H:i:s', strtotime($session['endTime']));
                    }
                    
                    error_log("DEBUG SESSION - Insertion: projectId=$projectId, startTime=$startTime, endTime=$endTime, duration=" . ($session['duration'] ?? 0) . ", subject=" . ($session['subject'] ?? '') . ", sessionDate=$sessionDate");
                    
                    try {
                        if ($hasSessionDateColumn) {
                            $stmt->execute([
                                $projectId,
                                $startTime,
                                $endTime,
                                $session['duration'] ?? 0,
                                $session['subject'] ?? '',
                                'maintenance',  // task_type par défaut
                                1,              // is_billable = true par défaut
                                $sessionDate    // Stocker la date originale
                            ]);
                            error_log("DEBUG SESSION - Insertion avec session_date réussie: " . ($session['subject'] ?? '') . " -> " . $sessionDate);
                        } else {
                            $stmt->execute([
                                $projectId,
                                $startTime,
                                $endTime,
                                $session['duration'] ?? 0,
                                $session['subject'] ?? '',
                                'maintenance',  // task_type par défaut
                                1               // is_billable = true par défaut
                            ]);
                            error_log("DEBUG SESSION - Insertion sans session_date réussie: " . ($session['subject'] ?? ''));
                        }
                    } catch (Exception $e) {
                        error_log("ERREUR SESSION - Échec insertion: " . $e->getMessage());
                        error_log("ERREUR SESSION - hasSessionDateColumn: " . ($hasSessionDateColumn ? 'true' : 'false'));
                        
                        // Dernier fallback
                        try {
                            $stmtFallback = $pdo->prepare('INSERT INTO project_logs (
                                project_id, 
                                session_start, 
                                session_end, 
                                duration_seconds, 
                                description, 
                                task_type,
                                is_billable,
                                sync_timestamp
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())');
                            
                            $stmtFallback->execute([
                                $projectId,
                                $startTime,
                                $endTime,
                                $session['duration'] ?? 0,
                                $session['subject'] ?? '',
                                'maintenance',
                                1
                            ]);
                            error_log("DEBUG SESSION - Fallback final réussi");
                        } catch (Exception $e2) {
                            error_log("ERREUR SESSION - Échec fallback: " . $e2->getMessage());
                        }
                    }
                }
            }
        }

        echo json_encode([
            'success' => true,
            'message' => 'Projet sauvegardé avec succès',
            'project_id' => $projectId,
            'currentTime' => $currentTime,
            'status' => $status
        ]);
        
    } catch (Exception $e) {
        echo json_encode([
            'success' => false,
            'message' => 'ERREUR SQL: ' . $e->getMessage(),
            'code' => $e->getCode(),
            'sql_state' => $e->getCode()
        ]);
    }
    exit();
}

// Supprimer un projet (DELETE)
if ($action === 'projects' && $method === 'DELETE') {
    error_log("DEBUG DELETE - Route DELETE atteinte");
    $rawInput = file_get_contents('php://input');
    error_log("DEBUG DELETE - Raw input: " . $rawInput);
    $projectData = json_decode($rawInput, true);
    error_log("DEBUG DELETE - Project data: " . json_encode($projectData));
    
    if (!$projectData || !isset($projectData['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID du projet manquant']);
        exit();
    }
    
    try {
        $pdo = getConnection();
        
        // Supprimer le projet
        $stmt = $pdo->prepare('DELETE FROM projects WHERE freelance_id = ? AND (project_uuid = ? OR name = ?)');
        $stmt->execute([$freelanceId, $projectData['id'], $projectData['id']]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode(['success' => true, 'message' => 'Projet supprimé']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Projet non trouvé']);
        }
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Erreur suppression: ' . $e->getMessage()]);
    }
    exit();
}

// Route non trouvée
http_response_code(404);
echo json_encode(['success' => false, 'message' => 'Route non trouvée']);
?> 
