<?php
/**
 * Migration script to add timer columns to the `projects` table.
 *
 * This script is intended to be run manually from the CLI:
 *   APP_ENV=production DB_HOST=... DB_NAME=... DB_USER=... DB_PASS=... php 2024-06-07_add_project_timer_columns.php
 *
 * Behaviour:
 * - Checks ALTER privilege before attempting schema changes.
 * - Adds `current_time` (INT DEFAULT 0) and `status` (VARCHAR(50) DEFAULT 'active') if missing.
 * - In production, failures are logged and the script exits gracefully without throwing.
 * - In non-production environments, failures bubble up to make debugging explicit.
 */

$env = getenv('APP_ENV') ?: 'production';
$dbHost = getenv('DB_HOST') ?: 'localhost';
$dbName = getenv('DB_NAME') ?: '';
$dbUser = getenv('DB_USER') ?: '';
$dbPass = getenv('DB_PASS') ?: '';

if ($dbName === '') {
    fwrite(STDERR, "DB_NAME must be provided via environment variable.\n");
    exit(1);
}

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $dbHost, $dbName),
        $dbUser,
        $dbPass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
} catch (PDOException $e) {
    fwrite(STDERR, "Unable to connect to database: {$e->getMessage()}\n");
    exit(1);
}

function hasAlterPrivilege(PDO $pdo): bool
{
    try {
        $grants = $pdo->query('SHOW GRANTS FOR CURRENT_USER');
        foreach ($grants->fetchAll(PDO::FETCH_COLUMN) as $grant) {
            if (stripos($grant, 'ALL PRIVILEGES') !== false || stripos($grant, 'ALTER') !== false) {
                return true;
            }
        }
    } catch (Throwable $e) {
        fwrite(STDERR, "Unable to inspect privileges: {$e->getMessage()}\n");
    }

    return false;
}

$columnsStmt = $pdo->query('SHOW COLUMNS FROM projects');
$existingColumns = $columnsStmt->fetchAll(PDO::FETCH_COLUMN);

$alterStatements = [];
if (!in_array('current_time', $existingColumns, true)) {
    $alterStatements['current_time'] = "ALTER TABLE `projects` ADD COLUMN `current_time` INT DEFAULT 0 AFTER `total_time_allocated`";
}

if (!in_array('status', $existingColumns, true)) {
    $alterStatements['status'] = "ALTER TABLE `projects` ADD COLUMN `status` VARCHAR(50) DEFAULT 'active' AFTER `hourly_rate`";
}

if (empty($alterStatements)) {
    fwrite(STDOUT, "No migration needed: columns already present.\n");
    exit(0);
}

if (!hasAlterPrivilege($pdo)) {
    fwrite(STDERR, "Current user lacks ALTER privilege. Please run with a privileged account.\n");
    if ($env === 'production') {
        exit(0);
    }
    exit(1);
}

foreach ($alterStatements as $column => $sql) {
    try {
        $pdo->exec($sql);
        fwrite(STDOUT, "Column {$column} added successfully.\n");
    } catch (Throwable $e) {
        $message = "Failed to add {$column}: {$e->getMessage()}";
        fwrite(STDERR, $message . "\n");
        if ($env === 'production') {
            // In production we log and continue to avoid blocking deployments.
            continue;
        }
        throw $e;
    }
}

fwrite(STDOUT, "Migration completed.\n");
