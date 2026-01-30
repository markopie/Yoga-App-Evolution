<?php
// list_images.php
header('Content-Type: application/json');

$dir = "https://arrowroad.com.au/yoga/images/";
$files = [];

if (is_dir($dir)) {
    if ($dh = opendir($dir)) {
        while (($file = readdir($dh)) !== false) {
            // Filter for valid image types
            if (preg_match('/\.(jpg|jpeg|png|webp|gif)$/i', $file)) {
                $files[] = $file;
            }
        }
        closedir($dh);
    }
}

sort($files); // Sort alphabetically
echo json_encode($files);
?>