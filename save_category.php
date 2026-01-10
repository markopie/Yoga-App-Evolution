<?php
// save_category.php
// Stores per-asana category overrides in category_overrides.json
// Expected JSON body: { "asana_no": "204", "category": "10_Restorative_Pranayama" }

header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
  http_response_code(400);
  echo json_encode(["status"=>"error","message"=>"Invalid JSON"]);
  exit;
}

$asana_no = isset($data["asana_no"]) ? trim((string)$data["asana_no"]) : "";
$category = isset($data["category"]) ? trim((string)$data["category"]) : "";

if ($asana_no === "") {
  http_response_code(400);
  echo json_encode(["status"=>"error","message"=>"Missing asana_no"]);
  exit;
}

// Allow blank category (meaning: clear override)
$allowed = [
  "",
  "01_Standing_and_Basic",
  "02_Seated_and_Lotus_Variations",
  "03_Forward_Bends",
  "04_Inversions_Sirsasana_Sarvangasana",
  "05_Abdominal_and_Supine",
  "06_Twists",
  "07_Arm_Balances",
  "08_Advanced_Leg_behind_Head",
  "09_Backbends",
  "10_Restorative_Pranayama"
];

if (!in_array($category, $allowed, true)) {
  http_response_code(400);
  echo json_encode(["status"=>"error","message"=>"Invalid category"]);
  exit;
}

$path = __DIR__ . DIRECTORY_SEPARATOR . "category_overrides.json";
if (!file_exists($path)) {
  // initialize
  file_put_contents($path, "{}");
}

$fp = fopen($path, "c+");
if (!$fp) {
  http_response_code(500);
  echo json_encode(["status"=>"error","message"=>"Unable to open category_overrides.json"]);
  exit;
}

if (!flock($fp, LOCK_EX)) {
  http_response_code(500);
  echo json_encode(["status"=>"error","message"=>"Unable to lock file"]);
  fclose($fp);
  exit;
}

$contents = stream_get_contents($fp);
$existing = json_decode($contents ?: "{}", true);
if (!is_array($existing)) $existing = [];

date_default_timezone_set('Australia/Melbourne');
$updated_at = date('c');

if ($category === "") {
  // clear override
  if (isset($existing[$asana_no])) unset($existing[$asana_no]);
} else {
  $existing[$asana_no] = [
    "category" => $category,
    "updated_at" => $updated_at
  ];
}

// rewrite file
ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

echo json_encode(["status"=>"success","updated_at"=>$updated_at]);
