<?php
require_once 'db.php';

try {
    $query = "SELECT o.order_id_code, o.total_price, o.items_json, o.created_at, u.username, u.address 
              FROM orders o 
              LEFT JOIN users u ON o.user_id = u.id 
              ORDER BY o.id DESC";
              
    $stmt = $pdo->prepare($query);
    $stmt->execute();
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    die("ბაზის შეცდომა: " . $e->getMessage());
}
?>
<!DOCTYPE html>
<html lang="ka">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="10">
    <title>ადმინისტრატორის პანელი - OfficeMarket</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f1f5f9;
            padding: 30px;
            color: #0f172a;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        h1 {
            border-bottom: 2px solid #cbd5e1;
            padding-bottom: 10px;
            margin-bottom: 25px;
        }
        .order-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            border: 1px solid #e2e8f0;
        }
        .order-header {
            display: flex;
            justify-content: space-between;
            font-weight: bold;
            color: #1e293b;
            border-bottom: 1px solid #f1f5f9;
            padding-bottom: 10px;
            margin-bottom: 15px;
        }
        .order-id {
            color: #3b82f6;
        }
        .order-date {
            color: #64748b;
            font-size: 14px;
        }
        .user-details {
            background: #f8fafc;
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 15px;
            font-size: 14px;
            border-left: 4px solid #3b82f6;
        }
        .items-list {
            list-style: none;
            padding-left: 0;
            margin-bottom: 15px;
        }
        .items-list li {
            padding: 6px 0;
            border-bottom: 1px dashed #f1f5f9;
            display: flex;
            justify-content: space-between;
        }
        .total-section {
            text-align: right;
            font-size: 18px;
            font-weight: bold;
            color: #10b981;
        }
    </style>
</head>
<body>

    <div class="container">
        <h1>📦 OfficeMarket - შემოსული შეკვეთები</h1>

        <?php if (!empty($orders)): ?>
            <?php foreach ($orders as $order): ?>
                <div class="order-card">
                    <div class="order-header">
                        <span class="order-id">შეკვეთა: <?php echo htmlspecialchars($order['order_id_code']); ?></span>
                        <span class="order-date">თარიღი: <?php echo htmlspecialchars($order['created_at']); ?></span>
                    </div>
                    
                    <div class="user-details">
                        <strong>👤 კლიენტი:</strong> <?php echo htmlspecialchars($order['username'] ?? 'სტუმარი'); ?><br>
                        <strong>📍 მისამართი:</strong> <?php echo htmlspecialchars($order['address'] ?? 'მიუთითებელია'); ?>
                    </div>

                    <ul class="items-list">
                        <?php 
                        $items = json_decode($order['items_json'], true) ?? [];
                        foreach ($items as $item): 
                            $qty = isset($item['quantity']) ? $item['quantity'] : 1;
                        ?>
                            <li>
                                <span>🛒 <?php echo htmlspecialchars($item['name']); ?> (${qty} ცალი)</span>
                                <span style="font-weight:600;"><?php echo number_format($item['price'] * $qty, 2); ?> ₾</span>
                            </li>
                        <?php endforeach; ?>
                    </ul>
                    
                    <div class="total-section">სულ გადასახდელი: <?php echo number_format($order['total_price'], 2); ?> ₾</div>
                </div>
            <?php endforeach; ?>
        <?php else: ?>
            <p>შეკვეთები ჯერ არ არის შემოსული (ბაზა ცარიელია).</p>
        <?php endif; ?>

    </div>

    <script>
        const currentOrdersCount = <?php echo count($orders); ?>;
        const lastCount = localStorage.getItem('ordersCount');

        if (lastCount !== null && currentOrdersCount > parseInt(lastCount)) {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
            
            oscillator.start();
            setTimeout(() => oscillator.stop(), 500);
        }
        
        localStorage.setItem('ordersCount', currentOrdersCount);
    </script>
</body>
</html>