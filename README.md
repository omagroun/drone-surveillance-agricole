# 🚁 Drone de Surveillance Agricole

![Node.js](https://img.shields.io/badge/Node.js-LTS-green?logo=node.js)
![ESP32](https://img.shields.io/badge/ESP32-FreeRTOS-blue?logo=espressif)
![AR.Drone](https://img.shields.io/badge/Parrot-AR.Drone%202.0-orange)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

**Auteur :** MAGROUN Omar  
**Formation :** Master 2 — Systèmes Communicants en Environnement Complexe  
**Institution :** Université Gustave Eiffel × Télécom SudParis  
**Année :** 2024 / 2025

---

## 📋 Table des matières

1. [Description du projet](#description-du-projet)
2. [Architecture du système](#architecture-du-système)
3. [Matériel utilisé](#matériel-utilisé)
4. [Code ESP32 — FreeRTOS](#code-esp32--freertos)
5. [Code Node.js — Serveur de contrôle](#code-nodejs--serveur-de-contrôle)
6. [Installation et configuration](#installation-et-configuration)
7. [Lancer le projet](#lancer-le-projet)
8. [Résultats et tests](#résultats-et-tests)
9. [Structure du projet](#structure-du-projet)
10. [Perspectives](#perspectives)

---

## Description du projet

Ce projet développe un **système de surveillance agricole** basé sur un drone **Parrot AR.Drone 2.0**, contrôlé depuis un PC via Node.js, et enrichi d'un module embarqué **ESP32** collectant des données environnementales et GPS en temps réel.

### Objectifs

- Contrôler un drone agricole depuis un ordinateur (sans application dédiée)
- Capturer et sauvegarder des images en temps réel toutes les 3 secondes
- Collecter des données de **température**, **humidité** et **localisation GPS**
- Transmettre toutes ces données au PC via **WebSocket sur WiFi**

---

## Architecture du système

### Réseau WiFi — Architecture en point d'accès unique

Le drone Parrot AR.Drone 2.0 fonctionne comme un **point d'accès WiFi (AP)**. Le PC et l'ESP32 se connectent tous les deux à ce réseau, formant un réseau local à trois appareils sans infrastructure supplémentaire.

```
         Parrot AR.Drone 2.0
         crée le réseau WiFi :
         ardrone_xxxxxx (192.168.1.x)
                  │
        ┌─────────┴──────────┐
        │                    │
        ▼                    ▼
┌───────────────┐    ┌───────────────────┐
│  PC (Windows) │    │  ESP32 (FreeRTOS) │
│               │    │                   │
│  IP: 192.168  │    │  IP: 192.168.1.x  │
│  .1.2 (ex.)   │    │                   │
│               │    │  Se connecte au   │
│  Node.js App  │    │  réseau du drone  │
│  - Contrôle   │    │  et envoie ses    │
│    clavier    │◄───│  données au PC    │
│  - Images PNG │    │  via WebSocket    │
│  - WebSocket  │    │  port 4500        │
│    serveur    │    │                   │
└───────┬───────┘    └───────────────────┘
        │
        │ UDP/TCP — même réseau WiFi
        ▼
  (commandes vol, flux vidéo, télémétrie)
```

**En résumé :** Les trois appareils partagent le même réseau créé par le drone. Le PC communique avec le drone via UDP/TCP, et reçoit simultanément les données de l'ESP32 via WebSocket — le tout sur la même interface WiFi.

| Appareil | Rôle réseau | IP typique |
|----------|-------------|-----------|
| AR.Drone 2.0 | Point d'accès WiFi (AP) | 192.168.1.1 |
| PC | Client WiFi + serveur WebSocket | 192.168.1.2 |
| ESP32 | Client WiFi + client WebSocket | 192.168.1.3 |

### Flux de communication

| Canal | Protocole | Port | Sens |
|-------|-----------|------|------|
| Commandes de vol | UDP | 5556 | PC → Drone |
| Télémétrie (altitude, batterie) | UDP | 5554 | Drone → PC |
| Flux vidéo PNG | TCP | 5555 | Drone → PC |
| Données capteurs (T°, GPS...) | WebSocket | 4500 | ESP32 → PC |

---

## Matériel utilisé

### Drone

| Composant | Détail |
|-----------|--------|
| Modèle | Parrot AR.Drone 2.0 |
| Moteurs | 4 × brushless, 35 000 tr/min, 15W |
| Batterie | LiPo 3S, 11.1V, 1000 mAh |
| Caméra frontale | 640×480 px, CMOS, 93° |
| Caméra verticale | 176×144 px, haute vitesse |
| CPU embarqué | ARM9 468 MHz, DDR 128 Mo |
| OS embarqué | Linux |
| WiFi | 802.11 b/g (2.4 GHz) |
| Temps de vol | ~12 minutes |

### Module embarqué

| Composant | Détail |
|-----------|--------|
| Microcontrôleur | Adafruit HUZZAH32 – Feather ESP32 (dual-core 240 MHz) |
| Capteur T°/Humidité | DHT22 (précision : ±0.5°C, ±2% HR) |
| Module GPS | GNSS 5 Click — u-blox ZOE-M8Q (GPS, GLONASS, Galileo) |
| Communication | WiFi 802.11 b/g/n, Bluetooth intégré |
| Alimentation | Alimenté directement par le port USB du drone |

---

## Code ESP32 — FreeRTOS

### Pourquoi FreeRTOS ?

La première version du code Arduino utilisait une boucle `loop()` classique, ce qui créait des conflits entre les différentes tâches (lecture GPS, lecture DHT22, envoi WebSocket). Ces opérations ne pouvaient pas s'exécuter correctement en parallèle.

**FreeRTOS** (Free Real-Time Operating System) résout ce problème en permettant d'exécuter plusieurs tâches **vraiment simultanément**, chacune avec sa propre priorité et sa propre pile mémoire.

### Architecture FreeRTOS — 4 tâches parallèles

```
┌────────────────────────────────────────────────────────────────┐
│                      ESP32 — FreeRTOS                          │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  Task_DHT    │  │  Task_GPS    │  │    Task_Send       │   │
│  │  Priorité 1  │  │  Priorité 1  │  │    Priorité 1      │   │
│  │              │  │              │  │                    │   │
│  │ Lit DHT22    │  │ Lit NMEA     │  │ Toutes les 7s :    │   │
│  │ toutes les   │  │ depuis UART  │  │ assemble T°, HR,   │   │
│  │ 7 secondes   │  │ toutes les   │  │ GPS → envoie dans  │   │
│  │ → met à jour │  │ 100 ms       │  │ la Queue           │   │
│  │ struct DHT   │  │ → met à jour │  │                    │   │
│  │              │  │ struct GPS   │  └────────┬───────────┘   │
│  └──────┬───────┘  └──────┬───────┘           │               │
│         │                 │                   │               │
│         ▼                 ▼                   ▼               │
│  ┌─────────────┐   ┌─────────────┐   ┌──────────────┐        │
│  │ dhtData     │   │  gpsData    │   │    Queue     │        │
│  │ (mutex)     │   │  (mutex)    │   │ (10 messages)│        │
│  └─────────────┘   └─────────────┘   └──────┬───────┘        │
│                                             │                 │
│                                    ┌────────┘                 │
│                                    ▼                          │
│                           ┌─────────────────┐                 │
│                           │  Task_WebSocket  │                 │
│                           │  Priorité 2      │                 │
│                           │                  │                 │
│                           │ Reçoit depuis    │                 │
│                           │ Queue → envoie   │                 │
│                           │ JSON au PC       │                 │
│                           └─────────────────┘                 │
└────────────────────────────────────────────────────────────────┘
```

### Principe de conception — Une tâche = une responsabilité

| Tâche | Responsabilité unique |
|-------|-----------------------|
| `Task_DHT` | Lire le capteur DHT22, stocker T° et humidité |
| `Task_GPS` | Lire les trames NMEA, stocker latitude/longitude/altitude |
| `Task_Send` | Assembler les données des deux capteurs et les envoyer dans la Queue |
| `Task_WebSocket` | Recevoir depuis la Queue et envoyer au PC via WebSocket |

`Task_DHT` et `Task_GPS` écrivent chacune dans leur propre struct partagée, protégée par un **mutex**. `Task_Send` lit les deux structs toutes les 7 secondes, assemble le paquet complet, et l'envoie dans la Queue.

### Code complet — ESP32 FreeRTOS

```cpp
#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <DHT.h>
#include <TinyGPS++.h>

// ========== CONFIG ==========
const char* ssid     = "ardrone_xxxxxx";  // SSID du réseau WiFi créé par le drone
const char* password = "";                // Pas de mot de passe sur le réseau AR.Drone
const char* ws_host  = "192.168.1.2";    // IP du PC sur le réseau du drone (vérifier avec ipconfig)
const int   ws_port  = 4500;

// ========== DHT22 ==========
#define DHTPIN 21
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// ========== GPS ==========
TinyGPSPlus gps;
HardwareSerial GPSSerial(1);

// ========== WEBSOCKET ==========
using namespace websockets;
WebsocketsClient wsClient;

// ========== STRUCTURES DE DONNÉES ==========
struct DHTData {
  float temperature;
  float humidity;
  bool  valid;       // true = données réelles, false = pas encore lues
};

struct GPSData {
  float latitude;
  float longitude;
  float altitude;
  bool  valid;       // true = fix GPS obtenu, false = pas encore de signal
};

// SensorData transporte les flags de validité pour éviter d'envoyer
// des 0.0 non significatifs au PC avant la première lecture réelle
struct SensorData {
  float temperature;
  float humidity;
  float latitude;
  float longitude;
  float altitude;
  bool  dht_valid;   // false = DHT22 pas encore lu, données non fiables
  bool  gps_valid;   // false = pas encore de fix GPS, données non fiables
};

// Handles FreeRTOS
QueueHandle_t     dataQueue;
SemaphoreHandle_t dhtMutex;
SemaphoreHandle_t gpsMutex;

// Données partagées (initialisées avec valid = false)
DHTData dhtData = {0.0, 0.0, false};
GPSData gpsData = {0.0, 0.0, 0.0, false};

// ========== TÂCHE DHT ==========
void Task_DHT(void* pvParameters) {
  dht.begin();
  while (true) {
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (!isnan(t) && !isnan(h)) {
      if (xSemaphoreTake(dhtMutex, portMAX_DELAY)) {
        dhtData.temperature = t;
        dhtData.humidity    = h;
        dhtData.valid       = true;
        xSemaphoreGive(dhtMutex);
      }
    } else {
      Serial.println("[DHT] Erreur lecture capteur");
    }
    vTaskDelay(pdMS_TO_TICKS(7000));
  }
}

// ========== TÂCHE GPS ==========
void Task_GPS(void* pvParameters) {
  GPSSerial.begin(9600, SERIAL_8N1, 16, 17); // RX=16, TX=17
  while (true) {
    while (GPSSerial.available()) {
      gps.encode(GPSSerial.read());
    }
    if (gps.location.isValid()) {
      if (xSemaphoreTake(gpsMutex, portMAX_DELAY)) {
        gpsData.latitude  = gps.location.lat();
        gpsData.longitude = gps.location.lng();
        gpsData.altitude  = gps.altitude.meters();
        gpsData.valid     = true;
        xSemaphoreGive(gpsMutex);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
}

// ========== TÂCHE SEND ==========
void Task_Send(void* pvParameters) {
  while (true) {
    SensorData packet = {0};

    if (xSemaphoreTake(dhtMutex, portMAX_DELAY)) {
      packet.temperature = dhtData.temperature;
      packet.humidity    = dhtData.humidity;
      packet.dht_valid   = dhtData.valid;
      xSemaphoreGive(dhtMutex);
    }

    if (xSemaphoreTake(gpsMutex, portMAX_DELAY)) {
      packet.latitude  = gpsData.latitude;
      packet.longitude = gpsData.longitude;
      packet.altitude  = gpsData.altitude;
      packet.gps_valid = gpsData.valid;
      xSemaphoreGive(gpsMutex);
    }

    // On n'envoie que si au moins une source est valide
    // Évite d'inonder le PC avec des paquets de 0.0 au démarrage
    if (packet.dht_valid || packet.gps_valid) {
      xQueueSend(dataQueue, &packet, portMAX_DELAY);
    } else {
      Serial.println("[SEND] Données non encore disponibles — paquet ignoré");
    }

    vTaskDelay(pdMS_TO_TICKS(7000));
  }
}

// ========== TÂCHE WEBSOCKET ==========
// NOTE : priorité 2 (supérieure aux tâches capteurs priorité 1).
// Se bloque sur portMAX_DELAY quand la queue est vide — comportement voulu,
// aucune CPU consommée pendant l'attente grâce au blocage FreeRTOS.
void Task_WebSocket(void* pvParameters) {
  // Connexion WiFi
  WiFi.begin(ssid, password);
  Serial.print("[WiFi] Connexion");
  while (WiFi.status() != WL_CONNECTED) {
    vTaskDelay(pdMS_TO_TICKS(500));
    Serial.print(".");
  }
  Serial.println("\n[WiFi] Connecté ! IP : " + WiFi.localIP().toString());

  // Connexion WebSocket
  while (!wsClient.connect(ws_host, ws_port, "/")) {
    Serial.println("[WS] Tentative de reconnexion...");
    vTaskDelay(pdMS_TO_TICKS(2000));
  }
  Serial.println("[WS] Connecté au serveur PC !");

  SensorData packet;
  while (true) {
    if (xQueueReceive(dataQueue, &packet, portMAX_DELAY)) {
      // Reconnexion automatique si nécessaire
      if (!wsClient.available()) {
        Serial.println("[WS] Reconnexion...");
        wsClient.connect(ws_host, ws_port, "/");
        vTaskDelay(pdMS_TO_TICKS(1000));
        continue;
      }

      // Le JSON inclut les flags de validité pour que le PC
      // puisse distinguer les données réelles des données manquantes
      char json[256];
      snprintf(json, sizeof(json),
        "{\"temperature\":%.1f,\"humidity\":%.1f,\"latitude\":%.6f,\"longitude\":%.6f,\"altitude\":%.1f,\"dht_valid\":%s,\"gps_valid\":%s}",
        packet.temperature, packet.humidity,
        packet.latitude, packet.longitude, packet.altitude,
        packet.dht_valid ? "true" : "false",
        packet.gps_valid ? "true" : "false"
      );

      wsClient.send(json);
      Serial.println("[WS] Données envoyées : " + String(json));
    }
  }
}

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);

  // Création des primitives FreeRTOS
  dataQueue = xQueueCreate(10, sizeof(SensorData));
  dhtMutex  = xSemaphoreCreateMutex();
  gpsMutex  = xSemaphoreCreateMutex();

  // Vérification que les primitives FreeRTOS ont bien été créées
  if (dataQueue == NULL || dhtMutex == NULL || gpsMutex == NULL) {
    Serial.println("[ERREUR] Echec création primitives FreeRTOS — mémoire insuffisante");
    while (true) { vTaskDelay(pdMS_TO_TICKS(1000)); } // Blocage volontaire
  }

  // Création des tâches
  xTaskCreate(Task_DHT,       "Task_DHT",       4096, NULL, 1, NULL);
  xTaskCreate(Task_GPS,       "Task_GPS",       4096, NULL, 1, NULL);
  xTaskCreate(Task_Send,      "Task_Send",      4096, NULL, 1, NULL);
  xTaskCreate(Task_WebSocket, "Task_WebSocket", 8192, NULL, 2, NULL);
}

void loop() {
  // FreeRTOS gère tout — loop vide
}
```

### Câblage ESP32

| Composant | Broche ESP32 |
|-----------|-------------|
| DHT22 — Signal | GPIO 21 |
| DHT22 — VCC | 3.3V |
| DHT22 — GND | GND |
| GNSS 5 Click — RX | GPIO 16 |
| GNSS 5 Click — TX | GPIO 17 |
| GNSS 5 Click — VCC | 3.3V |
| GNSS 5 Click — GND | GND |

---

## Code Node.js — Serveur de contrôle

### Pourquoi Node.js ?

Après avoir testé ROS, le SDK officiel Parrot et PyParrot (incompatible avec l'AR.Drone), **Node.js + bibliothèque `ar-drone`** s'est révélé la solution la plus simple et efficace :
- Installation en une commande (`npm install`)
- Gestion native des connexions réseau UDP/TCP
- Serveur WebSocket intégré pour recevoir les données ESP32

### `index.js` — Point d'entrée

```javascript
const { setupKeyboardControl, setupImageCapture, setupNavData } = require('./drone');
const { setupWebSocketServer, getLastSensorData, isEsp32Connected } = require('./websocket-server');

console.log('===========================================');
console.log('   DRONE DE SURVEILLANCE AGRICOLE         ');
console.log('   Université Gustave Eiffel - 2024       ');
console.log('===========================================\n');

// Démarrage du serveur WebSocket (réception données ESP32)
setupWebSocketServer();

console.log('[SYSTÈME] En attente de connexion ESP32 sur le port 4500...');
console.log('[SYSTÈME] (L\'ESP32 peut se connecter à tout moment, avant ou après le décollage)\n');

setTimeout(() => {
  setupImageCapture();
  setupNavData();
  setupKeyboardControl();

  // Affichage périodique des données capteurs reçues de l'ESP32
  setInterval(() => {
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
```

### `drone.js` — Contrôle du drone et capture d'images

```javascript
const arDrone = require('ar-drone');
const keypress = require('keypress');
const fs = require('fs');
const path = require('path');

const client = arDrone.createClient();
const imageDir = path.join(__dirname, 'images');

if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}

function setupKeyboardControl() {
  keypress(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const keyTimers = {};
  const HOLD_TIMEOUT = 150; // ms — si aucun keypress dans 150ms, la touche est relâchée
  const movementKeys = ['z', 's', 'q', 'd'];

  console.log('=================================');
  console.log('   CONTRÔLE DU DRONE AR.DRONE   ');
  console.log('=================================');
  console.log('L      → Décollage');
  console.log('M      → Atterrissage');
  console.log('Z      → Avancer  (maintenir)');
  console.log('S      → Reculer  (maintenir)');
  console.log('Q      → Gauche   (maintenir)');
  console.log('D      → Droite   (maintenir)');
  console.log('C      → Calibration IMU (au sol uniquement)');
  console.log('E      → Stabiliser');
  console.log('Ctrl+C → Quitter');
  console.log('=================================');

  process.stdin.on('keypress', (ch, key) => {
    if (!key) return;

    if (key.ctrl && key.name === 'c') {
      client.stop();
      client.land();
      process.exit();
    }

    // Touches de mouvement — détection de maintien via timeout
    if (movementKeys.includes(key.name)) {
      // Première pression : envoyer la commande
      if (!keyTimers[key.name]) {
        switch (key.name) {
          case 'z': client.front(0.5); console.log('[DRONE] Avancer'); break;
          case 's': client.back(0.5);  console.log('[DRONE] Reculer'); break;
          case 'q': client.left(0.5);  console.log('[DRONE] Gauche');  break;
          case 'd': client.right(0.5); console.log('[DRONE] Droite');  break;
        }
      }

      // Réinitialiser le timer à chaque répétition de touche
      clearTimeout(keyTimers[key.name]);
      keyTimers[key.name] = setTimeout(() => {
        keyTimers[key.name] = null;
        client.stop();
        console.log('[DRONE] Arrêt mouvement');
      }, HOLD_TIMEOUT);

      return;
    }

    // Autres touches
    switch (key.name) {
      case 'l':
        client.takeoff();
        console.log('[DRONE] Décollage');
        break;

      case 'c':
        client.calibrate(0);
        console.log('[DRONE] Calibration IMU — à effectuer au sol uniquement !');
        break;

      case 'm':
        client.stop();
        client.land();
        console.log('[DRONE] Atterrissage');
        break;

      case 'e':
        client.stop();
        console.log('[DRONE] Stabilisation');
        break;

      default:
        console.log('[DRONE] Touche non reconnue : ' + key.name);
    }
  });
}

function setupImageCapture() {
  const pngStream = client.getPngStream();
  let lastPng = null;
  let imageCount = 0;

  pngStream
    .on('error', (err) => {
      console.log('[IMAGE] Erreur flux vidéo : ' + err);
    })
    .on('data', (pngBuffer) => {
      lastPng = pngBuffer;
    });

  setInterval(() => {
    if (!lastPng) return;
    const filename = path.join(imageDir, `image_${imageCount++}.png`);
    fs.writeFile(filename, lastPng, (err) => {
      if (err) {
        console.log('[IMAGE] Erreur sauvegarde : ' + err);
      } else {
        console.log('[IMAGE] Image sauvegardée : ' + filename);
      }
    });
  }, 3000);
}

function setupNavData() {
  client.on('navdata', (data) => {
    if (data.demo) {
      console.log(`[NAV] Altitude: ${data.demo.altitudeMeters}m | Batterie: ${data.demo.batteryPercentage}%`);
    }
  });
}

module.exports = { client, setupKeyboardControl, setupImageCapture, setupNavData };
```

**Touches de contrôle :**

| Touche | Action |
|--------|--------|
| `L` | Décollage |
| `M` | Atterrissage |
| `Z` | Avancer (maintenir) |
| `S` | Reculer (maintenir) |
| `Q` | Gauche (maintenir) |
| `D` | Droite (maintenir) |
| `C` | Calibration IMU (**au sol uniquement**) |
| `E` | Stabiliser (hover) |
| `Ctrl+C` | Quitter proprement |

### `websocket-server.js` — Réception des données ESP32

```javascript
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

let esp32Connected = false;

function setupWebSocketServer() {
  server.on('connection', (ws) => {
    esp32Connected = true;
    console.log('[WS] ESP32 connecté !');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

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

function isEsp32Connected() {
  return esp32Connected;
}

module.exports = { setupWebSocketServer, getLastSensorData, isEsp32Connected };
```

**Exemple de sortie console :**
```
========== DONNÉES ESP32 ==========
[CAPTEUR] Température  : 22.5°C
[CAPTEUR] Humidité     : 65.0%
[GPS]     Latitude     : 48.8566
[GPS]     Longitude    : 2.3522
[GPS]     Altitude     : 35.0m
[INFO]    Heure        : 14:32:10
====================================
```

---

## Installation et configuration

### Prérequis

- **Node.js** LTS — [nodejs.org](https://nodejs.org)
- **Git** — [git-scm.com](https://git-scm.com)
- **Arduino IDE** avec support ESP32 (Espressif)

### Installation Node.js

```bash
# Cloner le repo
git clone https://github.com/omagroun/drone-surveillance-agricole.git
cd drone-agricole

# Installer les dépendances
npm install
```

### Dépendances Node.js

| Package | Version | Rôle |
|---------|---------|------|
| `ar-drone` | ^2.0.0 | Contrôle du Parrot AR.Drone via WiFi |
| `ws` | ^8.0.0 | Serveur WebSocket (réception données ESP32) |
| `keypress` | ^0.2.1 | Capture des touches clavier |

### Dépendances Arduino (ESP32)

À installer via le Gestionnaire de bibliothèques Arduino :

- `ArduinoWebsockets` (Gil Maimon)
- `DHT sensor library` (Adafruit)
- `TinyGPS++` (Mikal Hart)
- Support carte : `esp32` par Espressif Systems

---

## Lancer le projet

### Étape 1 — ESP32

1. Ouvrir le code `esp32/main.cpp` dans Arduino IDE
2. Modifier les identifiants WiFi et l'IP du serveur :
   ```cpp
   const char* ssid     = "ardrone_xxxxxx";  // SSID du drone (visible sur l'étiquette)
   const char* password = "";                // Pas de mot de passe
   const char* ws_host  = "192.168.1.2";    // IP du PC (vérifier avec ipconfig)
   ```
3. Flasher l'ESP32

### Étape 2 — Connexion de tous les appareils au réseau du drone

- Allumer le Parrot AR.Drone 2.0 — il crée automatiquement le réseau `ardrone_xxxxxx`
- Connecter le **PC** à ce réseau WiFi (sans mot de passe)
- L'**ESP32** doit aussi être configuré avec le SSID `ardrone_xxxxxx` pour rejoindre le même réseau
- Vérifier l'IP du PC sur ce réseau (`ipconfig` dans CMD) et la renseigner dans le code ESP32 comme `ws_host`

> Les trois appareils sont ainsi sur le même réseau local créé par le drone.

### Étape 3 — Lancer le serveur Node.js

```bash
node index.js
# ou
npm start
```

### Étape 4 — Voler !

```
L → Décollage
C → Calibration IMU (au sol, avant de décoller)
Z/S/Q/D → Déplacements
E → Stabilisation
M → Atterrissage
```

Les images sont sauvegardées automatiquement dans `images/image_0.png`, `image_1.png`, etc.

---

## Résultats et tests

### Portée WiFi mesurée

Tests réalisés avec le Parrot AR.Drone 2.0 dans deux environnements :

| Distance (m) | Sans obstacle (dBm) | Avec obstacles (dBm) |
|:---:|:---:|:---:|
| 0 | -31 | -35 |
| 50 | -57 | -77 |
| 100 | -69 | -91 |
| 150 | -79 | -101 |

**Conclusion :** La connexion reste stable jusqu'à environ 100–120m sans obstacle. En présence d'obstacles, la portée effective chute à ~50m avant d'atteindre le seuil critique de -90 dBm.

### Perte de signal calculée

- **Sans obstacle :** −0.2 à −0.6 dBm/m
- **Avec obstacles :** −0.2 à −1.2 dBm/m

### Captures d'images

Les images sont capturées depuis la caméra frontale (640×480 px) et sauvegardées au format PNG toutes les 3 secondes. Plus de 300 images ont été capturées lors des tests.

---

## Structure du projet

```
drone-agricole/
│
├── main.cpp                 ← Code FreeRTOS pour l'ESP32
│                             
│
├── images/                   ← Images capturées (gitignorées)
│
├── index.js                  ← Point d'entrée Node.js
├── drone.js                  ← Contrôle AR.Drone + capture PNG
├── websocket-server.js       ← Serveur WebSocket (données ESP32)
│
├── .gitignore
├── package.json
├── LICENSE
└── README.md
```

---

## Perspectives

- Conception d'une carte **PCB personnalisée** regroupant ESP32 + DHT22 + GNSS pour réduire l'encombrement sur le drone
- Passage à un drone plus récent supportant une API plus complète
- Ajout d'un **tableau de bord web** pour visualiser les données GPS en temps réel sur une carte (Leaflet.js)
- Export des données capteurs en **CSV horodaté** pour analyse post-vol

---

## Licence

Ce projet est distribué sous licence **MIT**. Voir le fichier `LICENSE` pour plus de détails.

---

## Références

- Parrot AR.Drone SDK — [developer.parrot.com](https://developer.parrot.com)
- Bibliothèque `ar-drone` — Node.js
- FreeRTOS — [freertos.org](https://www.freertos.org)
- Espressif ESP32 — [docs.espressif.com](https://docs.espressif.com)
- TinyGPS++ — Mikal Hart
- Boukhamla A., *Réseaux mobiles*, Université Kasdi Merbah, 2017

---

*Projet réalisé à l'Institut Télécom SudParis, Massy-Palaiseau — Université Gustave Eiffel*
