<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Option-A deploy: Laravel core lives OFF web root at /home/u129919172/laravel/.
// Web root is .../public_html, so relative requires would resolve to nowhere.
// Use ABSOLUTE paths to the core.
$laravelCore = '/home/u129919172/laravel';

if (file_exists($maintenance = $laravelCore . '/storage/framework/maintenance.php')) {
    require $maintenance;
}

require $laravelCore . '/vendor/autoload.php';

$app = require_once $laravelCore . '/bootstrap/app.php';

$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

$response = $kernel->handle(
    $request = Request::capture()
)->send();

$kernel->terminate($request, $response);
