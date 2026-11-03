<?php
/**
 * HealthPilot — optional AI endpoint for PHP hosting (Hostinger shared/cloud).
 * Mirrors api/coach.js (the Vercel version). POST JSON { mode: chat|parse|photo }.
 *
 * Key: put it in api/config.php (see config.example.php). That file is
 * blocked from the web by api/.htaccess and is never committed to git.
 * Without a key this returns 503 and the app uses its offline engine.
 */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function reply($code, $data) { http_response_code($code); echo json_encode($data); exit; }

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') reply(204, []);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, ['error' => 'Method not allowed']);

if (is_file(__DIR__ . '/config.php')) require __DIR__ . '/config.php';
$apiKey = defined('OPENROUTER_API_KEY') ? OPENROUTER_API_KEY : (getenv('OPENROUTER_API_KEY') ?: '');
$model  = defined('HEALTHPILOT_MODEL') ? HEALTHPILOT_MODEL : 'openai/gpt-4o-mini';
if (!$apiKey) reply(503, ['error' => 'AI is not configured on this server']);
if (!function_exists('curl_init')) reply(503, ['error' => 'PHP cURL extension is not enabled']);

/* Rate limit: 20 requests/min per IP, file-based (no DB needed). */
$ip = $_SERVER['REMOTE_ADDR'] ?? 'anon';
$rlFile = sys_get_temp_dir() . '/hp_rl_' . md5($ip);
$now = time();
$rl = is_file($rlFile) ? json_decode((string) @file_get_contents($rlFile), true) : null;
if (!$rl || $now - $rl['start'] > 60) $rl = ['start' => $now, 'count' => 0];
$rl['count']++;
@file_put_contents($rlFile, json_encode($rl), LOCK_EX);
if ($rl['count'] > 20) reply(429, ['error' => 'Too many requests — try again in a minute']);

$raw = file_get_contents('php://input');
if (strlen($raw) > 2000000) reply(413, ['error' => 'Request too large']);
$body = json_decode($raw, true);
if (!is_array($body)) reply(400, ['error' => 'Invalid JSON']);

const ITEM_SCHEMA = 'Return ONLY JSON: {"items":[{"name":string,"serving":string,"qty":number,"kcal":number,"p":number,"c":number,"f":number,"fib":number}]}
- kcal/p/c/f/fib are for ONE serving (grams for macros); qty = number of servings eaten.
- Use typical Indian home-cooked recipes and portion sizes (katori ≈ 150 g, roti ≈ 40 g) unless told otherwise.
- Include visible oil/ghee in the dish values. Be realistic, not optimistic.';

const COACH_SYSTEM = 'You are HealthPilot Coach, a friendly, evidence-based nutrition and fitness coach for Indian users.
- Use the user\'s data in CONTEXT (targets, today\'s log, weekly averages). Quote their real numbers.
- Recommend everyday Indian foods with portions and approximate kcal/protein.
- Be concise: ≤ 120 words, short bullets when listing. Plain text, no markdown headers.
- No crash diets, no supplements beyond basics (whey, vitamin D/B12 if relevant), no diagnosis.
- For medical conditions (diabetes, thyroid, pregnancy, PCOS, kidney disease, eating disorders) advise consulting a doctor/dietitian.';

function openrouter($messages, $json, $maxTokens) {
  global $apiKey, $model;
  $payload = ['model' => $model, 'messages' => $messages, 'temperature' => 0.3, 'max_tokens' => $maxTokens];
  if ($json) $payload['response_format'] = ['type' => 'json_object'];
  $ch = curl_init('https://openrouter.ai/api/v1/chat/completions');
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 45,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey, 'X-Title: HealthPilot'],
    CURLOPT_POSTFIELDS => json_encode($payload),
  ]);
  $res = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($res === false || $status >= 400) throw new Exception('Upstream ' . $status);
  $data = json_decode($res, true);
  return $data['choices'][0]['message']['content'] ?? '';
}

function num($v, $max) { return min($max, max(0, is_numeric($v) ? (float) $v : 0)); }

function clean_items($raw) {
  $raw = trim(preg_replace('/^```(?:json)?|```$/', '', trim($raw)));
  $parsed = json_decode($raw, true);
  if (!is_array($parsed) || !isset($parsed['items']) || !is_array($parsed['items'])) return [];
  $out = [];
  foreach (array_slice($parsed['items'], 0, 15) as $it) {
    if (!is_array($it)) continue;
    $out[] = [
      'name' => mb_substr((string) ($it['name'] ?? 'Food'), 0, 60),
      'serving' => mb_substr((string) ($it['serving'] ?? '1 serving'), 0, 40),
      'qty' => num($it['qty'] ?? 1, 20) ?: 1,
      'kcal' => round(num($it['kcal'] ?? 0, 3000)),
      'p' => num($it['p'] ?? 0, 300), 'c' => num($it['c'] ?? 0, 500),
      'f' => num($it['f'] ?? 0, 300), 'fib' => num($it['fib'] ?? 0, 100),
    ];
  }
  return $out;
}

try {
  $mode = $body['mode'] ?? '';
  if ($mode === 'chat') {
    $history = [];
    foreach (array_slice(is_array($body['messages'] ?? null) ? $body['messages'] : [], -8) as $m) {
      if (!is_array($m) || !in_array($m['role'] ?? '', ['user', 'assistant'], true)) continue;
      $history[] = ['role' => $m['role'], 'content' => mb_substr((string) ($m['content'] ?? ''), 0, 1500)];
    }
    if (!$history) reply(400, ['error' => 'messages required']);
    $context = mb_substr(json_encode($body['context'] ?? new stdClass()), 0, 4000);
    $text = openrouter(array_merge([['role' => 'system', 'content' => COACH_SYSTEM . "\n\nCONTEXT: " . $context]], $history), false, 700);
    reply(200, ['reply' => trim($text)]);
  }
  if ($mode === 'parse') {
    $text = trim(mb_substr((string) ($body['text'] ?? ''), 0, 500));
    if ($text === '') reply(400, ['error' => 'text required']);
    $out = openrouter([
      ['role' => 'system', 'content' => 'Estimate nutrition for foods the user describes. ' . ITEM_SCHEMA],
      ['role' => 'user', 'content' => $text],
    ], true, 700);
    reply(200, ['items' => clean_items($out)]);
  }
  if ($mode === 'photo') {
    $image = (string) ($body['image'] ?? '');
    if (!preg_match('#^data:image/(jpeg|png|webp);base64,#', $image) || strlen($image) > 1500000) {
      reply(400, ['error' => 'Send a JPEG/PNG/WebP under ~1 MB']);
    }
    $hint = mb_substr((string) ($body['hint'] ?? ''), 0, 200);
    $out = openrouter([
      ['role' => 'system', 'content' => 'Identify every food and drink in the photo and estimate portions. If nothing edible is visible return {"items":[]}. ' . ITEM_SCHEMA],
      ['role' => 'user', 'content' => [
        ['type' => 'text', 'text' => $hint !== '' ? 'User note: ' . $hint : 'What is on this plate?'],
        ['type' => 'image_url', 'image_url' => ['url' => $image]],
      ]],
    ], true, 900);
    reply(200, ['items' => clean_items($out)]);
  }
  reply(400, ['error' => 'Unknown mode']);
} catch (Exception $e) {
  reply(502, ['error' => 'AI request failed']);
}
