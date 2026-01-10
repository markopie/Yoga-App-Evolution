<?php
// save_description.php
// Stores Markdown description overrides keyed by asana_no into descriptions_override.json (same folder).
// Expected POST body JSON: { "asana_no": "1", "md": "..." }

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(["status"=>"error","message"=>"POST required"]);
  exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(["status"=>"error","message"=>"Invalid JSON"]);
  exit;
}

$asana_no = isset($data['asana_no']) ? trim((string)$data['asana_no']) : '';
$md = isset($data['md']) ? (string)$data['md'] : '';

if ($asana_no === '') {
  http_response_code(400);
  echo json_encode(["status"=>"error","message"=>"asana_no required"]);
  exit;
}

// Limit size to avoid accidental huge writes
if (strlen($md) > 200000) {
  http_response_code(413);
  echo json_encode(["status"=>"error","message"=>"Description too large"]);
  exit;
}

$path = __DIR__ . DIRECTORY_SEPARATOR . 'descriptions_override.json';

// Ensure file exists
if (!file_exists($path)) {
  file_put_contents($path, "{}");
}

$fp = fopen($path, 'c+');
if (!$fp) {
  http_response_code(500);
  echo json_encode(["status"=>"error","message"=>"Cannot open override file"]);
  exit;
}

if (!flock($fp, LOCK_EX)) {
  fclose($fp);
  http_response_code(500);
  echo json_encode(["status"=>"error","message"=>"Cannot lock override file"]);
  exit;
}

// Read existing
rewind($fp);
$existing = stream_get_contents($fp);
$existing_data = json_decode($existing, true);
if (!is_array($existing_data)) $existing_data = [];

$updated_at = date('c'); // ISO 8601 in server timezone (usually UTC; fine for audit)

// Write/update
$existing_data[$asana_no] = [
  "md" => $md,
  "updated_at" => $updated_at
];

// Atomic-ish rewrite
rewind($fp);
ftruncate($fp, 0);
fwrite($fp, json_encode($existing_data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

echo json_encode(["status"=>"success","asana_no"=>$asana_no,"updated_at"=>$updated_at]);
?>
