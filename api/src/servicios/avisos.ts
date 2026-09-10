/**
 * Avisos salientes. Se encolan en `EventoSaliente` y los despacha el worker hacia
 * el webhook de n8n, que es quien habla con Evolution API (D-014).
 *
 * Encolar nunca puede hacer fallar un cobro: si algo se rompe acá, se registra y
 * la caja sigue.
 */
import type { PrismaClient } from '@prisma/client';
import { linkDeSaldo } from './tokenCliente.js';
import { formatearPesos } from '../dominio/dinero.js';
import { configuracionVigente } from './configuracion.js';

export type AvisoDeAcreditacion = {
  clienteId: string;
  pagoId: string;
  puntos: number;
  saldoPuntos: number;
};

export async function encolarEvento(
  prisma: PrismaClient,
  tipo: string,
  payload: Record<string, unknown>,
  claveUnica?: string,
): Promise<void> {
  try {
    await prisma.eventoSaliente.create({
      data: { tipo, payload: payload as never, claveUnica: claveUnica ?? null },
    });
  } catch (error) {
    const codigo = (error as { code?: string }).code;
    if (codigo === 'P2002') return; // ya estaba encolado, no se manda dos veces
    console.error('No se pudo encolar el aviso', error);
  }
}

export async function encolarAvisoDeAcreditacion(
  prisma: PrismaClient,
  aviso: AvisoDeAcreditacion,
): Promise<void> {
  try {
    const [cliente, config] = await Promise.all([
      prisma.cliente.findUniqueOrThrow({ where: { id: aviso.clienteId } }),
      configuracionVigente(prisma),
    ]);
    const equivalente = BigInt(aviso.saldoPuntos) * config.valorPuntoCentavos;

    await encolarEvento(
      prisma,
      'puntos.acreditados',
      {
        telefono: cliente.telefonoE164,
        nombre: cliente.nombre,
        puntos: aviso.puntos,
        saldoPuntos: aviso.saldoPuntos,
        equivalenteTexto: formatearPesos(equivalente),
        venceEn: config.temporada.cierreEn.toISOString(),
        link: linkDeSaldo(cliente.id, cliente.tokenVersion),
      },
      `acreditacion:${aviso.pagoId}`,
    );
  } catch (error) {
    console.error('No se pudo preparar el aviso de acreditación', error);
  }
}
