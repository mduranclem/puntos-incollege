/**
 * Datos iniciales: locales, temporada, configuración y usuarios.
 *
 * No se cargan clientes: los clientes reales entran por el mostrador.
 * Los valores de negocio son datos, no constantes del código (D-009): se pueden
 * cambiar después desde el panel sin tocar nada.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../infra/prisma/cliente.js';
import { parsearImporte } from '../dominio/dinero.js';

const LOCALES = [
  { codigo: 'ROS-SUR', nombre: 'Rosario Sur', codigoAreaPorDefecto: '341' },
  { codigo: 'ROS-FIS', nombre: 'Rosario Fisherton', codigoAreaPorDefecto: '341' },
  { codigo: 'ROS-NOR', nombre: 'Rosario Norte', codigoAreaPorDefecto: '341' },
  { codigo: 'ROS-FAB', nombre: 'Rosario Fábrica', codigoAreaPorDefecto: '341' },
  { codigo: 'SFE-CAP', nombre: 'Santa Fe Capital', codigoAreaPorDefecto: '342' },
  { codigo: 'SNI-CEN', nombre: 'San Nicolás', codigoAreaPorDefecto: '336' },
];

export async function sembrar() {
  for (const local of LOCALES) {
    await prisma.local.upsert({
      where: { codigo: local.codigo },
      update: { nombre: local.nombre, codigoAreaPorDefecto: local.codigoAreaPorDefecto },
      create: local,
    });
  }
  console.log(`Locales: ${LOCALES.length}`);

  const anio = new Date().getFullYear();
  const temporada = await prisma.temporada.upsert({
    where: { nombre: `Temporada ${anio}` },
    update: {},
    create: {
      nombre: `Temporada ${anio}`,
      inicioEn: new Date(Date.UTC(anio, 0, 1)),
      // Fecha de cierre editable desde el panel.
      cierreEn: new Date(Date.UTC(anio, 11, 31, 23, 59, 59)),
    },
  });
  console.log(`Temporada: ${temporada.nombre} (cierra ${temporada.cierreEn.toISOString().slice(0, 10)})`);

  const yaHayConfig = await prisma.configuracion.findFirst();
  if (!yaHayConfig) {
    await prisma.configuracion.create({
      data: {
        valorPuntoCentavos: parsearImporte('1000'), // 1 punto = $1.000
        topeCanjeBps: 1000, // 10% del total de la compra
        diasAvisoVencimiento: 30,
        temporadaId: temporada.id,
        tasas: {
          create: [
            { lineaDeNegocio: 'UNIFORMES', centavosPorPunto: parsearImporte('10000') },
            { lineaDeNegocio: 'ROPA_LISA', centavosPorPunto: parsearImporte('10000') },
            // Egresados queda cargada pero la línea todavía no participa (D-003).
            { lineaDeNegocio: 'EGRESADOS', centavosPorPunto: parsearImporte('10000') },
          ],
        },
      },
    });
    console.log('Configuración inicial: $10.000 = 1 punto · punto = $1.000 · tope 10%');
  }

  const pinAdmin = process.env.SEED_PIN_ADMIN ?? '1234';
  const pinVendedor = process.env.SEED_PIN_VENDEDOR ?? '1111';
  const primerLocal = await prisma.local.findUniqueOrThrow({ where: { codigo: 'ROS-SUR' } });

  await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: {},
    create: {
      usuario: 'admin',
      nombre: 'Administración',
      pinHash: await bcrypt.hash(pinAdmin, 10),
      rol: 'ADMINISTRADOR',
      localId: primerLocal.id,
    },
  });

  // Un usuario de mostrador por local.
  for (const local of LOCALES) {
    const fila = await prisma.local.findUniqueOrThrow({ where: { codigo: local.codigo } });
    const usuario = `mostrador-${local.codigo.toLowerCase()}`;
    await prisma.usuario.upsert({
      where: { usuario },
      update: {},
      create: {
        usuario,
        nombre: `Mostrador ${local.nombre}`,
        pinHash: await bcrypt.hash(pinVendedor, 10),
        rol: 'VENDEDOR',
        localId: fila.id,
      },
    });
  }

  console.log(
    `Usuarios: admin (PIN ${pinAdmin}) y mostrador-<local> (PIN ${pinVendedor}).\n` +
      'CAMBIAR LOS PIN ANTES DE USAR EN PRODUCCIÓN.',
  );
}

// Ejecución directa: `npm run seed`.
if (process.argv[1]?.includes('sembrar')) {
  sembrar()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
