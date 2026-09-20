/**
 * Datos iniciales: locales, temporada, configuración y usuarios.
 *
 * No se cargan clientes: los clientes reales entran por el mostrador.
 * Los valores de negocio son datos, no constantes del código (D-009): se pueden
 * cambiar después desde el panel sin tocar nada.
 */
import bcrypt from 'bcryptjs';
import { motivoContrasenaInvalida } from '../dominio/contrasenas.js';
import { prisma } from '../infra/prisma/cliente.js';
import { parsearImporte } from '../dominio/dinero.js';
import { fechaArgentina, finDelDiaArgentina } from '../dominio/fechas.js';

/**
 * Los seis locales con sus direcciones reales. Se pueden editar desde el panel:
 * esto es sólo el punto de partida de una instalación nueva.
 *
 * Rosario Fábrica funciona en la misma dirección que el local de Zona Sur.
 */
const LOCALES = [
  {
    codigo: 'ROS-SUR',
    nombre: 'Rosario Sur',
    codigoAreaPorDefecto: '341',
    direccion: 'Deán Funes 1258',
    horarios: 'De 10 a 16 hs',
  },
  {
    codigo: 'ROS-FIS',
    nombre: 'Rosario Fisherton',
    codigoAreaPorDefecto: '341',
    direccion: 'Eva Perón 7790',
    horarios: 'De 10 a 16 hs',
  },
  {
    codigo: 'ROS-NOR',
    nombre: 'Rosario Norte',
    codigoAreaPorDefecto: '341',
    direccion: 'Alberdi 608',
    horarios: 'De 10 a 16 hs',
  },
  {
    // Funciona en el mismo lugar que el local de Zona Sur.
    codigo: 'ROS-FAB',
    nombre: 'Rosario Fábrica',
    codigoAreaPorDefecto: '341',
    direccion: 'Deán Funes 1258',
    horarios: 'De 10 a 16 hs',
  },
  {
    codigo: 'SFE-CAP',
    nombre: 'Santa Fe Capital',
    codigoAreaPorDefecto: '342',
    direccion: 'Bv. Pellegrini 2920',
    horarios: 'De 14 a 18 hs',
  },
  {
    codigo: 'SNI-CEN',
    nombre: 'San Nicolás',
    codigoAreaPorDefecto: '336',
    direccion: 'Nación 406',
    horarios: 'De 10 a 16 hs',
  },
];

export async function sembrar() {
  for (const local of LOCALES) {
    await prisma.local.upsert({
      where: { codigo: local.codigo },
      update: {
        nombre: local.nombre,
        codigoAreaPorDefecto: local.codigoAreaPorDefecto,
        direccion: local.direccion,
        horarios: local.horarios,
      },
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
      inicioEn: new Date(`${anio}-01-01T00:00:00-03:00`),
      // Fecha de cierre editable desde el panel. Fin del día argentino (D-020).
      cierreEn: finDelDiaArgentina(`${anio}-12-31`),
    },
  });
  console.log(`Temporada: ${temporada.nombre} (cierra ${fechaArgentina(temporada.cierreEn)})`);

  const yaHayConfig = await prisma.configuracion.findFirst();
  if (!yaHayConfig) {
    await prisma.configuracion.create({
      data: {
        valorPuntoCentavos: parsearImporte('1000'), // 1 punto = $1.000
        // Sin tope: se puede pagar la prenda entera con puntos (D-025).
        topeCanjeBps: 10_000,
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
    console.log('Configuración inicial: $10.000 = 1 punto · punto = $1.000 · sin tope de canje');
  }

  // Precios reales de lista. La administración los edita u oculta desde el panel.
  // No se inventan promociones: las carga la empresa.
  const PRECIOS = [
    { titulo: 'Remera lisa', pesos: '9900', linea: 'ROPA_LISA' as const },
    { titulo: 'Remera estampada', pesos: '12650', linea: 'ROPA_LISA' as const },
    { titulo: 'Chomba bordada', pesos: '26950', linea: 'UNIFORMES' as const },
    { titulo: 'Buzo cuello redondo con frisa, bordado', pesos: '29700', linea: 'UNIFORMES' as const },
    { titulo: 'Campera canguro con frisa, bordada', pesos: '41800', linea: 'UNIFORMES' as const },
  ];
  if ((await prisma.articulo.count()) === 0) {
    for (const [i, p] of PRECIOS.entries()) {
      await prisma.articulo.create({
        data: {
          nombre: p.titulo,
          precioCentavos: parsearImporte(p.pesos),
          lineaDeNegocio: p.linea,
          orden: i,
        },
      });
    }
    console.log(`Artículos en el catálogo: ${PRECIOS.length}`);
  }

  /**
   * Las contraseñas del seed no tienen valor por defecto fuera de desarrollo
   * (D-029). Un sistema que maneja plata no puede quedar en producción con
   * "1234" porque alguien se olvidó de cambiarlo: acá directamente no arranca.
   *
   * Además quedan marcadas para cambio obligatorio (D-034): estas contraseñas
   * viven en las variables de entorno del servidor y suelen quedar escritas en
   * el registro del despliegue, así que las sabe cualquiera que tenga acceso al
   * panel de infraestructura.
   */
  const enDesarrollo = process.env.NODE_ENV !== 'production';
  const claveAdmin = process.env.SEED_CONTRASENA_ADMIN ?? (enDesarrollo ? 'desarrollo-admin' : '');
  const claveVendedor =
    process.env.SEED_CONTRASENA_VENDEDOR ?? (enDesarrollo ? 'desarrollo-mostrador' : '');
  for (const [nombre, valor] of [
    ['SEED_CONTRASENA_ADMIN', claveAdmin],
    ['SEED_CONTRASENA_VENDEDOR', claveVendedor],
  ] as const) {
    const motivo = motivoContrasenaInvalida(valor);
    if (motivo) {
      throw new Error(
        `${nombre}: ${motivo || 'falta'} ` +
          'En producción el seed no crea usuarios con contraseñas por defecto.',
      );
    }
  }

  const primerLocal = await prisma.local.findUniqueOrThrow({ where: { codigo: 'ROS-SUR' } });

  await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: {},
    create: {
      usuario: 'admin',
      nombre: 'Gerencia',
      contrasenaHash: await bcrypt.hash(claveAdmin, 10),
      debeCambiarContrasena: true,
      rol: 'GERENTE',
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
        contrasenaHash: await bcrypt.hash(claveVendedor, 10),
        debeCambiarContrasena: true,
        rol: 'VENDEDOR',
        localId: fila.id,
      },
    });
  }

  console.log(
    enDesarrollo
      ? `Usuarios: admin (${claveAdmin}) y mostrador-<local> (${claveVendedor}). ` +
          'Son contraseñas de desarrollo, y el sistema va a pedir cambiarlas al entrar.'
      : 'Usuarios creados con SEED_CONTRASENA_ADMIN y SEED_CONTRASENA_VENDEDOR. ' +
          'Cada uno tiene que poner una contraseña propia la primera vez que entre.',
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
