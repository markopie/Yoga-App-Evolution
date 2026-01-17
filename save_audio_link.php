<?php
// save_audio_link.php
header('Content-Type: application/json');

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['plate_id']) || !isset($data['filename'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid data']);
    exit;
}

$file = 'audio_overrides.json';
$current = file_exists($file) ? json_decode(file_get_contents($file), true) : [];
if (!is_array($current)) $current = [];

// Save mapping: "141" -> "my_existing_file.mp3"
$current[$data['plate_id']] = $data['filename'];

if (file_put_contents($file, json_encode($current, JSON_PRETTY_PRINT))) {
    echo json_encode(['status' => 'success']);
} else {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Write failed']);
}
?>