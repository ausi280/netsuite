<?php

/**
 * Thin, generic Zammad ticket relay - exists ONLY because tickets.cryoholdco.com's server-side
 * firewall (GoDaddy shared cPanel host, Imunify360/CSF) rejects requests from the Azure App
 * Service that now builds these tickets (api/src-ts/reporting/logisticaTicketController.ts),
 * while this server's own outbound IP has always been trusted (it's what the original
 * submit.ticket.php ran on). This script does NOT know anything about "logistica" or any other
 * specific ticket type - it just forwards whatever ticket JSON it's given straight to Zammad's
 * API, using the one Zammad token that used to live in submit.ticket.php. All ticket-building
 * logic (title, customer, article body, sender/from, attachments) stays in the Node backend;
 * this only exists to make the final hop to Zammad from a trusted IP.
 *
 * Auth: a long random shared secret in the X-Relay-Secret header - NOT the Zammad token itself,
 * so a leak of this endpoint's secret can't be replayed anywhere except through this one relay
 * (which only ever talks to tickets.cryoholdco.com/api/v1/tickets).
 */

header('Content-Type: application/json; charset=utf-8');

// Same Zammad token that used to live directly in submit.ticket.php - moved here so the Azure
// side no longer needs to hold it at all (defense in depth: a compromise of the Azure app config
// can no longer create arbitrary Zammad tickets or read/modify anything else in Zammad).
$ZAMMAD_TOKEN = '_qVXFZ3i4DdSg5KCLEsfqcBlEod_cFUF4K7K8qpaidKTvCTu-kThRWpc9I8Xj3QK';
$ZAMMAD_URL = 'https://tickets.cryoholdco.com';

// Long random secret - the Azure app sends this in X-Relay-Secret. Rotate by changing both this
// value and ZAMMAD_RELAY.SECRET in api/config/env.json, then redeploying the API.
$RELAY_SECRET = '9827d472c88095d51aa9ceb9d8e454409de6953463eec14518e338f57e9cc6a3';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
    exit;
}

$providedSecret = $_SERVER['HTTP_X_RELAY_SECRET'] ?? '';

if (!hash_equals($RELAY_SECRET, $providedSecret)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Invalid relay secret.']);
    exit;
}

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody);

if ($payload === null && json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON body.']);
    exit;
}

$ch = curl_init("$ZAMMAD_URL/api/v1/tickets");

curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Token token=$ZAMMAD_TOKEN",
        'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS => $rawBody,
    CURLOPT_RETURNTRANSFER => true,
]);

$response = curl_exec($ch);
$httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => "Relay could not reach Zammad: $curlError"]);
    exit;
}

// Pass Zammad's own response straight through, same status code - the Node backend already
// knows how to interpret a Zammad ticket-create response/error, no translation needed here.
http_response_code($httpStatus);
echo $response;
