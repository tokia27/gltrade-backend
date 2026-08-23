<?php
header('Content-Type: application/json');

require_once 'db.php'; 

$telegram_token = "8967602708:AAG8f8XM2QZc9b-TCSmXWDzd8OvLstd8nMk";
$chat_id = "8724913064";

$data = json_decode(file_get_contents('php://input'), true);

if (!$data) {
    echo json_encode(['success' => false, 'message' => 'მონაცემები არასწორია']);
    exit;
}

$user_id = $data['user_id'] ?? null;
$items = $data['items'] ?? [];
$total = $data['total'] ?? 0;
$order_id_code = 'ORD-' . strtoupper(uniqid());
$items_json = json_encode($items, JSON_UNESCAPED_UNICODE);

try {
    $stmt = $pdo->prepare("INSERT INTO orders (user_id, order_id_code, items_json, total_price) VALUES (?, ?, ?, ?)");
    $stmt->execute([$user_id, $order_id_code, $items_json, $total]);

    $user_name = "სტუმარი";
    $user_address = "მისამართი არ არის მითითებული";
    
    if ($user_id) {
        $user_stmt = $pdo->prepare("SELECT username, address FROM users WHERE id = ?");
        $user_stmt->execute([$user_id]);
        $user = $user_stmt->fetch();
        if ($user) {
            $user_name = $user['username'];
            $user_address = $user['address'];
        }
    }

    $message = "🔔 *ახალი შეკვეთა საიტიდან!*\n\n";
    $message .= "🆔 *კოდი:* " . $order_id_code . "\n";
    $message .= "👤 *მომხმარებელი:* " . $user_name . "\n";
     $message .= "👤 *მობილური:* " . $user_phone_number . "\n";
    $message .= "📍 *მისამართი:* " . $user_address . "\n\n";
    $message .= "📦 *პროდუქტები:*\n";
    
    foreach ($items as $item) {
        $qty = isset($item['quantity']) ? $item['quantity'] : 1; 
        $message .= "• " . $item['name'] . " - " . $qty . " ცალი\n";
    }
    
    $message .= "\n💰 *სულ გადასახდელი:* " . number_format($total, 2) . " ₾";

    $telegram_url = "https://api.telegram.org/bot" . $telegram_token . "/sendMessage";
    $post_fields = [
        'chat_id' => $chat_id,
        'text' => $message,
        'parse_mode' => 'Markdown'
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $telegram_url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $post_fields);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $result = curl_exec($ch);
    curl_close($ch);

    echo json_encode(['success' => true, 'order_id' => $order_id_code]);

} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'ბაზის შეცდომა: ' . $e->getMessage()]);
}
?>