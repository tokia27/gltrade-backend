<?php
$host = 'localhost';
$db_user = 'root';
$db_pass = '';
$db_name = 'distrib_db';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db_name;charset=utf8", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("ბაზასთან კავშირი ვერ დამყარდა: " . $e->getMessage());
}
?>