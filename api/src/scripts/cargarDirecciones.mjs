/**
 * Carga las direcciones reales de los locales a través de la API.
 *
 * Va por archivo y no por línea de comandos a propósito: la consola de Windows
 * rompe los acentos antes de que curl los vea, y "Deán Funes" terminaba guardado
 * como "De?n Funes". Node lee este archivo como UTF-8 y los manda bien.
 *
 *   node src/scripts/cargarDirecciones.mjs
 */
const API = process.env.API ?? 'http://localhost:3001/api';
const USUARIO = process.env.GERENTE_USUARIO ?? 'admin';
const PIN = process.env.GERENTE_PIN ?? '1234';

const DIRECCIONES = {
  'Rosario Sur': { direccion: 'Deán Funes 1258', horarios: 'De 10 a 16 hs' },
  'Rosario Fisherton': { direccion: 'Eva Perón 7790', horarios: 'De 10 a 16 hs' },
  'Rosario Norte': { direccion: 'Alberdi 608', horarios: 'De 10 a 16 hs' },
  'Santa Fe Capital': { direccion: 'Bv. Pellegrini 2920', horarios: 'De 14 a 18 hs' },
  'San Nicolás': { direccion: 'Nación 406', horarios: 'De 10 a 16 hs' },
  // Rosario Fábrica queda sin dirección: todavía no la tenemos.
};

const ingreso = await fetch(`${API}/auth/ingresar`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ usuario: USUARIO, pin: PIN }),
});
const { token } = await ingreso.json();
if (!token) {
  console.error('No se pudo entrar como gerente. Revisá GERENTE_USUARIO y GERENTE_PIN.');
  process.exit(1);
}

const cabeceras = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
const { locales } = await fetch(`${API}/admin/locales`, { headers: cabeceras }).then((r) => r.json());

for (const [nombre, datos] of Object.entries(DIRECCIONES)) {
  const local = locales.find((l) => l.nombre === nombre);
  if (!local) {
    console.error(`  ✗ no existe el local "${nombre}"`);
    continue;
  }
  const r = await fetch(`${API}/admin/locales/${local.id}`, {
    method: 'PATCH',
    headers: cabeceras,
    body: JSON.stringify(datos),
  });
  console.log(`  ${r.ok ? '✓' : '✗'} ${nombre.padEnd(20)} ${datos.direccion}`);
}

const publicos = await fetch(`${API}/publico/locales`).then((r) => r.json());
console.log('\nLo que ve el cliente:');
for (const l of publicos.locales) {
  console.log(`  ${l.nombre.padEnd(20)} ${l.direccion ?? '(sin dirección cargada)'}`);
}
