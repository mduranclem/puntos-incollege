/**
 * Genera los íconos PNG de la app del cliente, sin dependencias.
 *
 * Es una estrella dorada sobre el marino de InCollege: la estrella es el punto,
 * que es de lo que se trata el programa. Se dibuja por geometría, no con una
 * fuente, así se ve igual en cualquier máquina.
 *
 *   node scripts/generarIconos.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const MARINO = [15, 45, 82]; // #0f2d52
const DORADO = [224, 163, 37]; // #e0a325

// --- PNG mínimo -------------------------------------------------------------

const tablaCrc = (() => {
  const tabla = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c;
  }
  return tabla;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = tablaCrc[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** pixeles: Uint8Array RGBA de lado*lado*4 */
function armarPng(lado, pixeles) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  // 10, 11, 12 quedan en 0: deflate, filtro adaptativo, sin entrelazado

  // Cada fila lleva adelante su byte de filtro (0 = sin filtro).
  const crudo = Buffer.alloc(lado * (lado * 4 + 1));
  for (let y = 0; y < lado; y++) {
    const destino = y * (lado * 4 + 1);
    crudo[destino] = 0;
    pixeles.copy
      ? pixeles.copy(crudo, destino + 1, y * lado * 4, (y + 1) * lado * 4)
      : Buffer.from(pixeles.subarray(y * lado * 4, (y + 1) * lado * 4)).copy(crudo, destino + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(crudo, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Dibujo -----------------------------------------------------------------

/** Vértices de una estrella de cinco puntas centrada en (cx, cy). */
function puntosDeEstrella(cx, cy, radioExterno, radioInterno) {
  const puntos = [];
  for (let i = 0; i < 10; i++) {
    const radio = i % 2 === 0 ? radioExterno : radioInterno;
    const angulo = (Math.PI / 5) * i - Math.PI / 2;
    puntos.push([cx + radio * Math.cos(angulo), cy + radio * Math.sin(angulo)]);
  }
  return puntos;
}

function dentroDelPoligono(x, y, puntos) {
  let dentro = false;
  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
    const [xi, yi] = puntos[i];
    const [xj, yj] = puntos[j];
    const cruza = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/**
 * `maskable` llena todo el cuadrado, porque Android le recorta los bordes y
 * quiere el dibujo dentro del 80% central. El otro lleva esquinas redondeadas.
 */
function dibujar(lado, maskable) {
  const pixeles = Buffer.alloc(lado * lado * 4);
  const radioEsquina = maskable ? 0 : lado * 0.22;
  const escala = maskable ? 0.3 : 0.38;
  const estrella = puntosDeEstrella(lado / 2, lado / 2, lado * escala, lado * escala * 0.42);

  // Muestreo de 3x3 por pixel para que los bordes no queden dentados.
  const muestras = [0.17, 0.5, 0.83];

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let fondo = 0;
      let figura = 0;
      for (const dy of muestras) {
        for (const dx of muestras) {
          const px = x + dx;
          const py = y + dy;
          if (dentroDelCuadradoRedondeado(px, py, lado, radioEsquina)) fondo++;
          if (dentroDelPoligono(px, py, estrella)) figura++;
        }
      }
      const total = muestras.length * muestras.length;
      const aFondo = fondo / total;
      const aFigura = (figura / total) * aFondo;

      const i = (y * lado + x) * 4;
      const mezcla = (canal) =>
        Math.round(MARINO[canal] * (1 - aFigura) + DORADO[canal] * aFigura);
      pixeles[i] = mezcla(0);
      pixeles[i + 1] = mezcla(1);
      pixeles[i + 2] = mezcla(2);
      pixeles[i + 3] = Math.round(255 * aFondo);
    }
  }
  return pixeles;
}

function dentroDelCuadradoRedondeado(x, y, lado, radio) {
  if (radio <= 0) return x >= 0 && y >= 0 && x <= lado && y <= lado;
  const cx = Math.min(Math.max(x, radio), lado - radio);
  const cy = Math.min(Math.max(y, radio), lado - radio);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radio * radio;
}

// --- Salida -----------------------------------------------------------------

const salidas = [
  ['public/icono-192.png', 192, false],
  ['public/icono-512.png', 512, false],
  ['public/icono-maskable-512.png', 512, true],
  ['public/apple-touch-icon.png', 180, false],
];

for (const [ruta, lado, maskable] of salidas) {
  const completa = resolve(process.cwd(), ruta);
  mkdirSync(dirname(completa), { recursive: true });
  writeFileSync(completa, armarPng(lado, dibujar(lado, maskable)));
  console.log(`${ruta} · ${lado}x${lado}${maskable ? ' (maskable)' : ''}`);
}
