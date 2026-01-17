<?php
// upload_image.php
header('Content-Type: application/json');

$uploadDir = 'images/';
$jsonFile = 'image_overrides.json';

// 1. Basic Validation
if (!isset($_FILES['image_file']) || !isset($_POST['plate_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'No file or ID provided']);
    exit;
}

$file = $_FILES['image_file'];
$plateId = trim($_POST['plate_id']);

if ($file['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['status' => 'error', 'message' => 'Upload error code: ' . $file['error']]);
    exit;
}

// 2. Validate File Type (Security)
$allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!in_array($mime, $allowedTypes)) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid file type. Only JPG, PNG, WEBP allowed.']);
    exit;
}

// 3. Generate Clean Filename
// We prefix with "custom_" to avoid overwriting your main library accidentally
$extension = pathinfo($file['name'], PATHINFO_EXTENSION);
$cleanName = 'custom_' . preg_replace('/[^a-zA-Z0-9_\-]/', '', pathinfo($file['name'], PATHINFO_FILENAME)) . '.' . $extension;
$targetPath = $uploadDir . $cleanName;

// 4. Move File
if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    echo json_encode(['status' => 'error', 'message' => 'Failed to move uploaded file. Check folder permissions.']);
    exit;
}

// 5. Update the Override JSON automatically
$currentData = [];
if (file_exists($jsonFile)) {
    $currentData = json_decode(file_get_contents($jsonFile), true) ?: [];
}

$currentData[$plateId] = $cleanName; // Map ID to new filename (relative path is handled by JS)

file_put_contents($jsonFile, json_encode($currentData, JSON_PRETTY_PRINT));

// 6. Return Success
echo json_encode([
    'status' => 'success', 
    'filename' => $cleanName,
    'url' => $targetPath
]);
?>