const { setupKeyboardControl, setupImageCapture, setupNavData } = require('./drone');
const { setupWebSocketServer, getLastSensorData, isEsp32Connected } = require('./websocket-server');

console.log('===========================================');
console.log('   DRONE DE SURVEILLANCE AGRICOLE         ');
console.log('   Université Gustave Eiffel - 2024       ');
console.log('===========================================\n');

// Démarrage du serveur WebSocket (réception données ESP32)
setupWebSocketServer();

// FIX 3 : on informe l'utilisateur que le système attend la connexion de l'ESP32
console.log('[SYSTÈME] En attente de connexion ESP32 sur le port 4500...');
console.log('[SYSTÈME] (L\'ESP32 peut se connecter à tout moment, avant ou après le décollage)\n');

setTimeout(() => {
  setupImageCapture();
  setupNavData();
  setupKeyboardControl();

  // Affichage périodique des données capteurs reçues de l'ESP32
  setInterval(() => {
    // FIX 3 : affichage adapté selon l'état de connexion de l'ESP32
    if (!isEsp32Connected()) {
      console.log('\n[CAPTEURS] En attente de connexion ESP32...');
      return;
    }

    const sensorData = getLastSensorData();

    if (!sensorData.timestamp) {
      console.log('\n[CAPTEURS] ESP32 connecté — en attente des premières données...');
      return;
    }

    console.log('\n========== RÉSUMÉ CAPTEURS ==========');

    // FIX 1 : on distingue les données valides des données en attente
    if (sensorData.dht_valid) {
      console.log(`[T°]  Température : ${sensorData.temperature}°C`);
      console.log(`[HR]  Humidité    : ${sensorData.humidity}%`);
    } else {
      console.log('[T°]  Température : (en attente DHT22...)');
      console.log('[HR]  Humidité    : (en attente DHT22...)');
    }

    if (sensorData.gps_valid) {
      console.log(`[GPS] Lat         : ${sensorData.latitude}`);
      console.log(`[GPS] Lon         : ${sensorData.longitude}`);
      console.log(`[GPS] Alt         : ${sensorData.altitude}m`);
    } else {
      console.log('[GPS] Position    : (en attente fix GPS...)');
    }

    console.log(`[MAJ] Dernière MàJ: ${sensorData.timestamp}`);
    console.log('=====================================\n');
  }, 10000); // Affichage toutes les 10 secondes

  console.log('\n[SYSTÈME] Tout est prêt !');
  console.log('[SYSTÈME] Connectez le drone en WiFi puis appuyez sur L pour décoller.\n');
}, 2000);
