<?php
// Link corto de un presupuesto o comprobante: muestra la vista previa en WhatsApp y abre el PDF.
$id = preg_replace('/[^a-z0-9]/', '', $_GET['id'] ?? '');
$base = 'https://iledqhvyuvgwpgedmjtj.supabase.co/storage/v1/object/public/documentos/d/';
$pdf = $base . $id . '.pdf';
$img = $base . $id . '.jpg';
$title = 'Áridos Petreos';
$desc = 'Tocá para ver el PDF.';
$ctx = stream_context_create(['http' => ['timeout' => 3]]);
$json = @file_get_contents($base . $id . '.json', false, $ctx);
if ($json) {
  $data = json_decode($json, true);
  if (!empty($data['t'])) $title = $data['t'];
  if (!empty($data['d'])) $desc = $data['d'];
}
$e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<title><?= $e($title) ?></title>
<meta property="og:type" content="website">
<meta property="og:title" content="<?= $e($title) ?>">
<meta property="og:description" content="<?= $e($desc) ?>">
<meta property="og:image" content="<?= $e($img) ?>">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=<?= $e($pdf) ?>">
</head><body style="font-family:Helvetica,Arial,sans-serif;text-align:center;padding:40px">
<p><a href="<?= $e($pdf) ?>">Abrir el PDF</a></p>
<script>location.replace(<?= json_encode($pdf) ?>);</script>
</body></html>
