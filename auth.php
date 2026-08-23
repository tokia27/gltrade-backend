<?php
session_start();
require_once 'db.php';

header('Content-Type: application/json');

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    $data = $_POST;
}

if (!$data) {
    echo json_encode(['status' => 'error', 'message' => 'მონაცემები ცარიელია']);
    exit;
}

$action = $data['action'] ?? '';

if ($action === 'register') {
    $username = isset($data['username']) ? trim($data['username']) : '';
    $email = isset($data['email']) ? trim($data['email']) : '';
    $address = isset($data['address']) ? trim($data['address']) : '';
    $password = $data['password'] ?? '';

    if (empty($username) || empty($email) || empty($address) || empty($password)) {
        echo json_encode(['status' => 'error', 'message' => 'ყველა ველი სავალდებულოა']);
        exit;
    }

    $hashed_password = password_hash($password, PASSWORD_BCRYPT);

    try {
        $stmt = $pdo->prepare("INSERT INTO users (username, email, address, password) VALUES (?, ?, ?, ?)");
        $stmt->execute([$username, $email, $address, $hashed_password]);
        
        echo json_encode(['success' => true, 'status' => 'success', 'message' => 'რეგისტრაცია წარმატებით დასრულდა!']);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'მომხმარებელი ამ სახელით ან მეილით უკვე არსებობს']);
    }
    exit;
}

if ($action === 'login') {
    $username = isset($data['username']) ? trim($data['username']) : '';
    $password = $data['password'] ?? '';

    if (empty($username) || empty($password)) {
        echo json_encode(['status' => 'error', 'message' => 'გთხოვთ შეავსოთ ყველა ველი!']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user && password_verify($password, $user['password'])) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        
        echo json_encode([
            'status' => 'success', 
            'message' => 'სისტემაში შეხვედით!', 
            'username' => $user['username'],
            'user_id' => $user['id']
        ]);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'არასწორი სახელი ან პაროლი']);
    }
    exit;
}

if ($action === 'logout') {
    session_destroy();
    echo json_encode(['status' => 'success']);
    exit;
}

echo json_encode(['status' => 'error', 'message' => 'არასწორი მოქმედება']);
?>