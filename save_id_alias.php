<?php
// save_id_alias.php
header('Content-Type: application/json');
$jsonFile = 'id_aliases.json';

$input = json_decode(file_get_contents('php://input'), true);
if (!isset($input['old_id']) || !isset($input['new_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Missing IDs']);
    exit;
}

$old = trim($input['old_id']);
$new = trim($input['new_id']);

$data = [];
if (file_exists($jsonFile)) {
    $data = json_decode(file_get_contents($jsonFile), true) ?: [];
}

// Save the mapping
$data[$old] = $new;

if (file_put_contents($jsonFile, json_encode($data, JSON_PRETTY_PRINT))) {
    echo json_encode(['status' => 'success', 'mapped' => "$old -> $new"]);
} else {
    echo json_encode(['status' => 'error']);
}
?>