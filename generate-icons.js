const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const src  = 'C:/Users/Avraham/Downloads/299480223_396343229275064_3461568006020182228_n.png';
const dest = path.join(__dirname, 'icons');

if (!fs.existsSync(dest)) fs.mkdirSync(dest);

const sizes = [16, 32, 48, 128];

Promise.all(
  sizes.map(s =>
    sharp(src)
      .resize(s, s, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(dest, `icon${s}.png`))
      .then(() => console.log(`✓ icon${s}.png`))
  )
).then(() => console.log('All icons generated.'))
 .catch(e => console.error(e));
