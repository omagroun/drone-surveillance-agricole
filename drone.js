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
