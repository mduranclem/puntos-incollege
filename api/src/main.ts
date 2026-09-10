import { crearApp } from './http/app.js';
import { prisma } from './infra/prisma/cliente.js';
import { arrancarTareas } from './tareas.js';

const puerto = Number(process.env.PORT ?? 3001);

const servidor = crearApp().listen(puerto, () => {
  console.log(`API de puntos escuchando en http://localhost:${puerto}`);
});

// Las tareas pueden ir adentro de la API o como proceso aparte (`npm run tareas`).
if (process.env.CRON_HABILITADO === 'true') {
  arrancarTareas();
  console.log('Tareas programadas activas: avisos y vencimiento de temporada.');
}

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    servidor.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
