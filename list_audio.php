<?php
// list_audio.php
header('Content-Type: application/json');

// Scan audio folder, remove '.' and '..', and filter for mp3s
$files = array_filter(scandir('audio/'), function($f) {
    return strtolower(pathinfo($f, PATHINFO_EXTENSION)) === 'mp3';
});

// Return as a clean list (array_values resets keys)
echo json_encode(array_values($files));
?>