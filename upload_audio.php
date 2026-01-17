<?php
// upload_audio.php
// Handles file upload AND updates audio_overrides.json
header('Content-Type: application/json');

$targetDir = "audio/";
$mapFile = "audio_overrides.json";

// 1. Check for file upload
if (!isset($_FILES['audio_file']) || !isset($_POST['plate_id'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Missing file or ID']);
    exit;
}

$file = $_FILES['audio_file'];
$plateId = trim($_POST['plate_id']);
$fileName = basename($file['name']);
$targetPath = $targetDir . $fileName;

// 2. Move the file to the audio folder
if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Failed to save file to server']);
    exit;
}

// 3. Update the Mapping JSON
$currentMap = file_exists($mapFile) ? json_decode(file_get_contents($mapFile), true) : [];
if (!is_array($currentMap)) $currentMap = [];

// Save mapping: "U_II" -> "my_file.mp3"
$currentMap[$plateId] = $fileName;

if (file_put_contents($mapFile, json_encode($currentMap, JSON_PRETTY_PRINT))) {
    echo json_encode(['status' => 'success', 'filename' => $fileName]);
} else {
    echo json_encode(['status' => 'warning', 'message' => 'File saved but mapping failed']);
}
?>