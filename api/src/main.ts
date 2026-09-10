import { crearApp } from './http/app.js';
import { prisma } from './infra/prisma/cliente.js';

const puerto = Number(process.env.PORT ?? 3001);

const servidor = crearApp().listen(puerto, () => {
  console.log(`API de puntos escuchando en http://localhost:${puerto}`);
});

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    servidor.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
