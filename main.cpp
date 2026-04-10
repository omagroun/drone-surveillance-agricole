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

// FIX 1 : SensorData transporte maintenant les flags valid
// Avant, les 0.0 de démarrage étaient envoyés sans distinction au PC
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
      packet.dht_valid   = dhtData.valid;   // FIX 1 : on transporte le flag
      xSemaphoreGive(dhtMutex);
    }

    if (xSemaphoreTake(gpsMutex, portMAX_DELAY)) {
      packet.latitude  = gpsData.latitude;
      packet.longitude = gpsData.longitude;
      packet.altitude  = gpsData.altitude;
      packet.gps_valid = gpsData.valid;     // FIX 1 : on transporte le flag
      xSemaphoreGive(gpsMutex);
    }

    // FIX 1 : on n'envoie que si au moins une source est valide
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
// NOTE : Task_WebSocket a une priorité 2 (supérieure aux tâches capteurs priorité 1).
// Elle se bloque sur portMAX_DELAY quand la queue est vide — comportement voulu,
// elle ne consomme aucune CPU pendant l'attente grâce au blocage FreeRTOS.
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

      // FIX 1 : le JSON inclut les flags de validité
      // Le PC peut ainsi ignorer ou signaler les champs non fiables
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
