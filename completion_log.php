<?php
// completion_log.php
// GET  ?action=get  -> returns JSON array
// POST ?action=add  -> appends {title, ts, iso?}

header('Content-Type: application/json; charset=utf-8');

$action = $_GET['action'] ?? 'get';
$file_path = __DIR__ . '/completion_history.json';

function load_history($file_path) {
  if (!file_exists($file_path)) return [];
  $raw = file_get_contents($file_path);
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function write_history($file_path, $data) {
  $tmp = $file_path . '.tmp';
  if (file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT)) === false) return false;
  return rename($tmp, $file_path);
}

if ($action === 'get') {
  echo json_encode(load_history($file_path));
  exit;
}

if ($action === 'add') {
  $json_input = file_get_contents('php://input');
  $payload = json_decode($json_input, true);
  if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
    exit;
  }

  $title = isset($payload['title']) ? trim((string)$payload['title']) : '';
  $ts = isset($payload['ts']) ? (int)$payload['ts'] : 0;
  $iso = isset($payload['iso']) ? (string)$payload['iso'] : null;

  if ($title === '' || $ts <= 0) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Missing title or ts']);
    exit;
  }

  $seconds = (int)floor($ts / 1000);
  $local = date('d/m/Y, h:i a', $seconds);

  $lock_path = $file_path . '.lock';
  $lock = fopen($lock_path, 'c');
  if ($lock) { flock($lock, LOCK_EX); }

  $hist = load_history($file_path);
  $hist[] = ['title' => $title, 'ts' => $ts, 'iso' => $iso, 'local' => $local];

  $ok = write_history($file_path, $hist);

  if ($lock) { flock($lock, LOCK_UN); fclose($lock); }

  if ($ok) {
    echo json_encode(['status' => 'success']);
  } else {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Permission denied. Check file permissions.']);
  }
  exit;
}

http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Unknown action']);
