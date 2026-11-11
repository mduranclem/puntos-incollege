/**
 * Carga la lista de precios colegial de InCollege (D-049).
 *
 *     npm run precios --workspace=api
 *
 * **Es idempotente y no borra nada.** Busca cada prenda por `codigo`; si no la
 * encuentra, por nombre normalizado —así reconoce las cinco de muestra que ya
 * estaban cargadas, aunque se escribieran con una coma de más—; y recién si no
 * existe, la crea. Los artículos viejos se actualizan en su lugar porque puede
 * haber ventas apuntando a ellos: borrarlos dejaría el registro diario sin poder
 * reconstruir qué se vendió (D-004).
 *
 * Correrlo dos veces deja la base igual que correrlo una.
 *
 * **Con `--si-falta` no hace nada si la lista ya se cargó alguna vez.** Así lo
 * corre el contenedor al arrancar: la primera vez carga el catálogo, y de ahí en
 * adelante se calla. Esto último no es un detalle — si corriera siempre,
 * cada despliegue pisaría los precios que la gerencia hubiera cambiado desde el
 * panel, que es justo lo que D-049 quiere evitar. Un precio editado a mano gana
 * sobre el que está escrito acá, siempre.
 *
 * Para recargar la lista a propósito —porque cambió de verdad— se corre sin el
 * flag, a mano, sabiendo que pisa lo editado.
 *
 * **La línea de negocio va escrita por prenda y no deducida del nombre.** Hoy
 * las dos tasas valen lo mismo ($10.000 = 1 punto), así que la distinción no
 * cambia ningún punto; el día que se separen, sí. Un `if (nombre.includes
 * ('bordado'))` escondido en un script no es lugar para que viva algo que
 * decide cuántos puntos suma un cliente. Acá se lee de un vistazo y se corrige.
 */
import { prisma } from '../infra/prisma/cliente.js';
import { parsearImporte } from '../dominio/dinero.js';
import { TALLES, type LineaDeNegocio } from '../dominio/tipos.js';

type Prenda = {
  codigo: string;
  categoria: string;
  nombre: string;
  linea: LineaDeNegocio;
  /**
   * Un solo precio: la lista real dice "Todos los talles · Todos los locales"
   * (D-057). Se escribe igual en los cuatro talles, así el modelo por talle
   * sigue en pie y la gerencia puede diferenciarlos desde el panel el día que
   * vuelvan a valer distinto.
   */
  precio: string;
};

/**
 * Lista real de InCollege, columna **PRECIOS PROMO · sólo efectivo o
 * transferencia** (D-057). Es la que corresponde: el programa acredita puntos
 * sólo por efectivo, y es el precio que paga quien participa.
 *
 * Las otras tres columnas de la lista impresa —QR/débito/1 pago, 3 pagos y
 * 6 pagos— son este precio por 1,14, 1,23 y 1,35. No son listas distintas: son
 * un recargo por medio de pago, y todavía no está en el sistema.
 */
const LISTA: Prenda[] = [
  { codigo: 'remera-lisa', categoria: 'Remeras', nombre: 'Remera lisa', linea: 'ROPA_LISA', precio: '10000' },
  { codigo: 'remera-bordada', categoria: 'Remeras', nombre: 'Remera bordada', linea: 'UNIFORMES', precio: '14000' },
  { codigo: 'remera-estampada', categoria: 'Remeras', nombre: 'Remera estampada', linea: 'ROPA_LISA', precio: '12000' },

  // La chomba lisa no se vende: en la lista impresa su casillero dice "—".
  { codigo: 'chomba-bordada', categoria: 'Chombas', nombre: 'Chomba bordada', linea: 'UNIFORMES', precio: '25000' },
  { codigo: 'chomba-estampada', categoria: 'Chombas', nombre: 'Chomba estampada', linea: 'ROPA_LISA', precio: '23000' },

  { codigo: 'jogging-liso', categoria: 'Joggings', nombre: 'Jogging frisa / rústico liso', linea: 'ROPA_LISA', precio: '25000' },
  { codigo: 'jogging-bordado', categoria: 'Joggings', nombre: 'Jogging frisa / rústico bordado', linea: 'UNIFORMES', precio: '28000' },
  { codigo: 'jogging-estampado', categoria: 'Joggings', nombre: 'Jogging frisa / rústico estampado', linea: 'ROPA_LISA', precio: '26000' },

  { codigo: 'short-rustico-liso', categoria: 'Shorts', nombre: 'Short rústico liso', linea: 'ROPA_LISA', precio: '12000' },
  { codigo: 'short-rustico-bordado', categoria: 'Shorts', nombre: 'Short rústico bordado', linea: 'UNIFORMES', precio: '15000' },
  { codigo: 'short-rustico-estampado', categoria: 'Shorts', nombre: 'Short rústico estampado', linea: 'ROPA_LISA', precio: '13000' },

  { codigo: 'buzo-basico-frisa-liso', categoria: 'Buzos', nombre: 'Buzo básico de frisa liso', linea: 'ROPA_LISA', precio: '25000' },
  { codigo: 'buzo-basico-frisa-bordado', categoria: 'Buzos', nombre: 'Buzo básico de frisa bordado', linea: 'UNIFORMES', precio: '28000' },
  { codigo: 'buzo-basico-frisa-estampado', categoria: 'Buzos', nombre: 'Buzo básico de frisa estampado', linea: 'ROPA_LISA', precio: '26000' },
  { codigo: 'buzo-canguro-liso', categoria: 'Buzos', nombre: 'Buzo canguro liso', linea: 'ROPA_LISA', precio: '27000' },
  { codigo: 'buzo-canguro-bordado', categoria: 'Buzos', nombre: 'Buzo canguro bordado', linea: 'UNIFORMES', precio: '30000' },
  { codigo: 'buzo-canguro-estampado', categoria: 'Buzos', nombre: 'Buzo canguro estampado', linea: 'ROPA_LISA', precio: '28000' },

  { codigo: 'campera-basica-lisa', categoria: 'Camperas', nombre: 'Campera básica frisa / rústico lisa', linea: 'ROPA_LISA', precio: '33000' },
  { codigo: 'campera-basica-bordada', categoria: 'Camperas', nombre: 'Campera básica frisa / rústico bordada', linea: 'UNIFORMES', precio: '36000' },
  { codigo: 'campera-basica-estampada', categoria: 'Camperas', nombre: 'Campera básica frisa / rústico estampada', linea: 'ROPA_LISA', precio: '34000' },

  { codigo: 'pantalon-cargo-liso', categoria: 'Pantalones', nombre: 'Pantalón cargo liso', linea: 'ROPA_LISA', precio: '35000' },
  { codigo: 'pantalon-cargo-bordado', categoria: 'Pantalones', nombre: 'Pantalón cargo bordado', linea: 'UNIFORMES', precio: '40000' },
  { codigo: 'pantalon-cargo-estampado', categoria: 'Pantalones', nombre: 'Pantalón cargo estampado', linea: 'ROPA_LISA', precio: '38000' },

  { codigo: 'buzo-nuevo-siglo-oblatas', categoria: 'Especiales',
    nombre: 'Buzo con tejidos y bordados Nuevo Siglo y Oblatas', linea: 'UNIFORMES', precio: '39000' },
  { codigo: 'mochila-nuevo-siglo', categoria: 'Especiales', nombre: 'Mochila Nuevo Siglo', linea: 'UNIFORMES', precio: '30000' },
];

/** Sin acentos, sin puntuación y en minúsculas, para reconocer lo ya cargado. */
const plano = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Las cinco de muestra se cargaron con otro nombre que el de la lista real.
 * Sin esto se crearían duplicadas y el mostrador mostraría dos "Campera
 * canguro".
 */
const ALIAS: Record<string, string> = {
  'buzo cuello redondo con frisa bordado': 'buzo-cuello-red-frisa-bordado',
  'campera canguro con frisa bordada': 'campera-canguro-frisa-bordado',
};

async function main() {
  const existentes = await prisma.articulo.findMany();

  // `codigo` lo pone sólo este script: si hay alguno, la lista ya se cargó.
  if (process.argv.includes('--si-falta') && existentes.some((a) => a.codigo)) {
    console.log('La lista de precios ya estaba cargada; no se toca.');
    return;
  }

  const porCodigo = new Map(existentes.filter((a) => a.codigo).map((a) => [a.codigo!, a]));
  const porNombre = new Map(existentes.map((a) => [plano(a.nombre), a]));

  let creados = 0;
  let actualizados = 0;
  let preciosEscritos = 0;

  for (const [i, prenda] of LISTA.entries()) {
    const yaEsta =
      porCodigo.get(prenda.codigo) ??
      porNombre.get(plano(prenda.nombre)) ??
      // El alias va al revés: del nombre viejo al código de la lista nueva.
      existentes.find((a) => ALIAS[plano(a.nombre)] === prenda.codigo);

    const datos = {
      codigo: prenda.codigo,
      nombre: prenda.nombre,
      categoria: prenda.categoria,
      lineaDeNegocio: prenda.linea,
      // El talle base es el precio "de entrada" del artículo: es lo que ve
      // quien todavía no eligió talle.
      precioCentavos: parsearImporte(prenda.precio),
      orden: i,
    };

    const articulo = yaEsta
      ? await prisma.articulo.update({ where: { id: yaEsta.id }, data: datos })
      : await prisma.articulo.create({ data: datos });
    yaEsta ? actualizados++ : creados++;

    // El mismo precio en los cuatro talles: la lista dice "Todos los talles".
    for (const talle of TALLES) {
      await prisma.precioPorTalle.upsert({
        where: { articuloId_talle: { articuloId: articulo.id, talle } },
        create: { articuloId: articulo.id, talle, precioCentavos: parsearImporte(prenda.precio) },
        update: { precioCentavos: parsearImporte(prenda.precio) },
      });
      preciosEscritos++;
    }
  }

  // Lo que no está en la lista no se borra: se saca de la vista. Puede haber
  // ventas que lo referencien, y el registro diario tiene que poder leerlas.
  const codigos = LISTA.map((p) => p.codigo);
  const fuera = await prisma.articulo.updateMany({
    where: { codigo: { notIn: codigos }, activo: true },
    data: { activo: false, visibleEnApp: false },
  });

  /**
   * Y los que quedan activos sin un solo precio por talle.
   *
   * `codigo NOT IN (...)` no los alcanza: en SQL `NULL NOT IN (…)` no es
   * verdadero, así que los artículos sin código —los del seed de muestra— se
   * salvaban de la desactivación. Quedaban como botones del mostrador que, al
   * tocarlos, cortan el cobro porque no tienen precio para ese talle (D-049).
   *
   * No se mira la lista acá sino la condición de fondo, que vale siempre: un
   * artículo sin precio no se puede vender, así que no puede estar activo. Un
   * artículo que haya creado la gerencia desde el panel, con sus precios
   * puestos, no lo toca.
   */
  const sinPrecio = await prisma.articulo.findMany({
    where: { activo: true, precios: { none: {} } },
    select: { id: true, nombre: true },
  });
  if (sinPrecio.length > 0) {
    await prisma.articulo.updateMany({
      where: { id: { in: sinPrecio.map((a) => a.id) } },
      data: { activo: false, visibleEnApp: false },
    });
  }

  console.log(`Lista de precios: ${creados} creados, ${actualizados} actualizados.`);
  console.log(`Precios por talle escritos: ${preciosEscritos}.`);
  if (fuera.count > 0) {
    console.log(`Artículos fuera de la lista, desactivados (no borrados): ${fuera.count}.`);
  }
  for (const a of sinPrecio) {
    console.log(`Desactivado por no tener ningún precio por talle: ${a.nombre}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
