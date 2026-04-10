const WebSocket = require('ws');

const server = new WebSocket.Server({ port: 4500 });

let lastSensorData = {
  temperature: null,
  humidity: null,
  latitude: null,
  longitude: null,
  altitude: null,
  dht_valid: false,
  gps_valid: false,
  timestamp: null
};

// FIX 3 : suivi de la connexion ESP32 pour afficher "En attente..."
let esp32Connected = false;

function setupWebSocketServer() {
  server.on('connection', (ws) => {
    esp32Connected = true;
    console.log('[WS] ESP32 connecté !');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        // FIX 1 : on récupère les flags de validité envoyés par l'ESP32
        const dhtValid = data.dht_valid !== undefined ? data.dht_valid : true;
        const gpsValid = data.gps_valid !== undefined ? data.gps_valid : true;

        lastSensorData = {
          ...lastSensorData,
          ...data,
          dht_valid: dhtValid,
          gps_valid: gpsValid,
          timestamp: new Date().toLocaleTimeString()
        };

        console.log('========== DONNÉES ESP32 ==========');

        // FIX 1 : on signale clairement les champs non encore fiables
        if (dhtValid) {
          console.log(`[CAPTEUR] Température  : ${lastSensorData.temperature}°C`);
          console.log(`[CAPTEUR] Humidité     : ${lastSensorData.humidity}%`);
        } else {
          console.log('[CAPTEUR] Température  : (en attente DHT22...)');
          console.log('[CAPTEUR] Humidité     : (en attente DHT22...)');
        }

        if (gpsValid) {
          console.log(`[GPS]     Latitude     : ${lastSensorData.latitude}`);
          console.log(`[GPS]     Longitude    : ${lastSensorData.longitude}`);
          console.log(`[GPS]     Altitude     : ${lastSensorData.altitude}m`);
        } else {
          console.log('[GPS]     Position     : (en attente fix GPS...)');
        }

        console.log(`[INFO]    Heure        : ${lastSensorData.timestamp}`);
        console.log('====================================');

      } catch (err) {
        console.log('[WS] Erreur parsing JSON : ' + err.message);
      }
    });

    ws.on('close', () => {
      esp32Connected = false;
      console.log('[WS] ESP32 déconnecté');
    });

    ws.on('error', (err) => {
      console.log('[WS] Erreur WebSocket : ' + err.message);
    });
  });

  server.on('error', (err) => {
    console.error('[WS] Erreur serveur : ' + err.message);
  });

  console.log('[WS] Serveur WebSocket démarré sur le port 4500');
}

function getLastSensorData() {
  return lastSensorData;
}

// FIX 3 : expose l'état de connexion ESP32 pour index.js
function isEsp32Connected() {
  return esp32Connected;
}

module.exports = { setupWebSocketServer, getLastSensorData, isEsp32Connected };
