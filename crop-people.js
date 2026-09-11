const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const SRC  = 'C:/Users/Avraham/Downloads/464222994_8589035554495987_8636963262538490239_n.jpg';
const DEST = path.join(__dirname, 'images');

if (!fs.existsSync(DEST)) fs.mkdirSync(DEST);

async function run() {
  const meta = await sharp(SRC).metadata();
  const W = meta.width;
  const H = meta.height;
  console.log(`Source: ${W} x ${H}`);

  // Man: left ~22% of width, full height minus header
  const manLeft   = 0;
  const manWidth  = Math.round(W * 0.235);
  const manTop    = Math.round(H * 0.105);
  const manHeight = H - manTop;

  // Woman: right ~22% of width, same vertical crop
  const womanWidth = Math.round(W * 0.235);
  const womanLeft  = W - womanWidth;
  const womanTop   = manTop;
  const womanHeight = H - womanTop;

  await sharp(SRC)
    .extract({ left: manLeft, top: manTop, width: manWidth, height: manHeight })
    .png()
    .toFile(path.join(DEST, 'man.png'));
  console.log(`✓ man.png  (${manWidth}×${manHeight})`);

  await sharp(SRC)
    .extract({ left: womanLeft, top: womanTop, width: womanWidth, height: womanHeight })
    .png()
    .toFile(path.join(DEST, 'woman.png'));
  console.log(`✓ woman.png  (${womanWidth}×${womanHeight})`);
  console.log('Done.');
}

run().catch(console.error);
