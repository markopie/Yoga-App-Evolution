<?php
// save_sequences.php
// Receives JSON data and saves it to 'sequences_override.json'

header('Content-Type: application/json');

// 1. Get the raw POST data
$input = file_get_contents('php://input');
$data = json_decode($input, true);

// 2. Basic Validation
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON data']);
    exit;
}

// 3. Save to file
// We save to a DIFFERENT file so we never break the original 'sequences.json'
$file = 'sequences_override.json';
$success = file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));

if ($success === false) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Failed to write file']);
} else {
    echo json_encode(['status' => 'success', 'file' => $file]);
}
?>