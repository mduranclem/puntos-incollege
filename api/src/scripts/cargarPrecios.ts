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
import { TALLES, TALLE_BASE, type LineaDeNegocio } from '../dominio/tipos.js';

type Prenda = {
  codigo: string;
  categoria: string;
  nombre: string;
  linea: LineaDeNegocio;
  precios: Record<string, string>;
};

/** Lista "InCollege Colegial", precios de contado en efectivo. */
const LISTA: Prenda[] = [
  { codigo: 'chomba-bordada', categoria: 'Chombas', nombre: 'Chomba bordada', linea: 'UNIFORMES',
    precios: { '4-10': '26950', '12-16': '28050', 'S-XL': '29150', ESP: '31350' } },
  { codigo: 'chomba-lisa', categoria: 'Chombas', nombre: 'Chomba lisa', linea: 'ROPA_LISA',
    precios: { '4-10': '21450', '12-16': '22550', 'S-XL': '23650', ESP: '25850' } },

  { codigo: 'remera-bordada', categoria: 'Remeras', nombre: 'Remera bordada', linea: 'UNIFORMES',
    precios: { '4-10': '15400', '12-16': '16500', 'S-XL': '17600', ESP: '19800' } },
  { codigo: 'remera-estampada', categoria: 'Remeras', nombre: 'Remera estampada', linea: 'ROPA_LISA',
    precios: { '4-10': '12650', '12-16': '13750', 'S-XL': '14850', ESP: '17050' } },
  { codigo: 'remera-lisa', categoria: 'Remeras', nombre: 'Remera lisa', linea: 'ROPA_LISA',
    precios: { '4-10': '9900', '12-16': '11000', 'S-XL': '12100', ESP: '14300' } },

  { codigo: 'pantalon-largo-frisa-bordado', categoria: 'Pantalones y shorts',
    nombre: 'Pantalón largo con frisa bordado', linea: 'UNIFORMES',
    precios: { '4-10': '29700', '12-16': '31900', 'S-XL': '34100', ESP: '37400' } },
  { codigo: 'pantalon-largo-frisa-liso', categoria: 'Pantalones y shorts',
    nombre: 'Pantalón largo con frisa liso', linea: 'ROPA_LISA',
    precios: { '4-10': '24200', '12-16': '26400', 'S-XL': '28600', ESP: '31900' } },
  { codigo: 'short-sin-frisa-bordado', categoria: 'Pantalones y shorts',
    nombre: 'Short sin frisa bordado', linea: 'UNIFORMES',
    precios: { '4-10': '20900', '12-16': '22000', 'S-XL': '23100', ESP: '25300' } },
  { codigo: 'short-sin-frisa-liso', categoria: 'Pantalones y shorts',
    nombre: 'Short sin frisa liso', linea: 'ROPA_LISA',
    precios: { '4-10': '15400', '12-16': '16500', 'S-XL': '17600', ESP: '19800' } },

  { codigo: 'buzo-cuello-red-frisa-bordado', categoria: 'Buzos',
    nombre: 'Buzo cuello redondo con frisa bordado', linea: 'UNIFORMES',
    precios: { '4-10': '29700', '12-16': '31900', 'S-XL': '34100', ESP: '37400' } },
  { codigo: 'buzo-cuello-red-frisa-liso', categoria: 'Buzos',
    nombre: 'Buzo cuello redondo con frisa liso', linea: 'ROPA_LISA',
    precios: { '4-10': '24200', '12-16': '26400', 'S-XL': '28600', ESP: '31900' } },
  { codigo: 'buzo-canguro-frisa-bordado', categoria: 'Buzos',
    nombre: 'Buzo canguro con frisa bordado', linea: 'UNIFORMES',
    precios: { '4-10': '34100', '12-16': '36300', 'S-XL': '38500', ESP: '41800' } },
  { codigo: 'buzo-canguro-frisa-liso', categoria: 'Buzos',
    nombre: 'Buzo canguro con frisa liso', linea: 'ROPA_LISA',
    precios: { '4-10': '28600', '12-16': '30800', 'S-XL': '33000', ESP: '36300' } },

  { codigo: 'campera-canguro-frisa-bordado', categoria: 'Camperas',
    nombre: 'Campera canguro con frisa bordado', linea: 'UNIFORMES',
    precios: { '4-10': '41800', '12-16': '44000', 'S-XL': '46200', ESP: '49500' } },
  { codigo: 'campera-canguro-frisa-liso', categoria: 'Camperas',
    nombre: 'Campera canguro con frisa lisa', linea: 'ROPA_LISA',
    precios: { '4-10': '36300', '12-16': '38500', 'S-XL': '40700', ESP: '44000' } },
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
      precioCentavos: parsearImporte(prenda.precios[TALLE_BASE]!),
      orden: i,
    };

    const articulo = yaEsta
      ? await prisma.articulo.update({ where: { id: yaEsta.id }, data: datos })
      : await prisma.articulo.create({ data: datos });
    yaEsta ? actualizados++ : creados++;

    for (const talle of TALLES) {
      const pesos = prenda.precios[talle];
      if (!pesos) continue;
      await prisma.precioPorTalle.upsert({
        where: { articuloId_talle: { articuloId: articulo.id, talle } },
        create: { articuloId: articulo.id, talle, precioCentavos: parsearImporte(pesos) },
        update: { precioCentavos: parsearImporte(pesos) },
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

  console.log(`Lista de precios: ${creados} creados, ${actualizados} actualizados.`);
  console.log(`Precios por talle escritos: ${preciosEscritos}.`);
  if (fuera.count > 0) {
    console.log(`Artículos fuera de la lista, desactivados (no borrados): ${fuera.count}.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
