<?php
// save_image_override.php
header('Content-Type: application/json');

$jsonFile = 'image_overrides.json';

// Get the raw POST data
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!isset($data['plate_id']) || !isset($data['filename'])) {
    echo json_encode(['status' => 'error', 'message' => 'Missing ID or Filename']);
    exit;
}

$plateId = trim($data['plate_id']);
$filename = trim($data['filename']);

// Load existing overrides
$currentData = [];
if (file_exists($jsonFile)) {
    $currentData = json_decode(file_get_contents($jsonFile), true) ?: [];
}

// Update the mapping
$currentData[$plateId] = $filename;

// Save back to file
if (file_put_contents($jsonFile, json_encode($currentData, JSON_PRETTY_PRINT))) {
    echo json_encode(['status' => 'success']);
} else {
    echo json_encode(['status' => 'error', 'message' => 'Failed to write to file']);
}
?>