/**
 * Despachador de avisos hacia n8n (D-014).
 *
 * La API no habla con Evolution API: postea el evento a un webhook de n8n y n8n
 * decide plantilla, instancia y reintentos del lado de WhatsApp. Acá se reintenta
 * con backoff por si n8n está caído; el cobro nunca depende de esto.
 */
import type { PrismaClient } from '@prisma/client';

const MAX_INTENTOS = 6;

/** 1, 2, 4, 8, 16, 32 minutos. */
function proximoIntento(intentos: number): Date {
  const minutos = Math.min(2 ** intentos, 60);
  return new Date(Date.now() + minutos * 60_000);
}

export async function despacharPendientes(
  prisma: PrismaClient,
  limite = 25,
): Promise<{ enviados: number; fallidos: number; sinConfigurar: boolean }> {
  const url = process.env.N8N_WEBHOOK_URL?.trim();
  if (!url) return { enviados: 0, fallidos: 0, sinConfigurar: true };

  const pendientes = await prisma.eventoSaliente.findMany({
    where: { estado: 'PENDIENTE', proximoIntentoEn: { lte: new Date() } },
    orderBy: { creadoEn: 'asc' },
    take: limite,
  });

  let enviados = 0;
  let fallidos = 0;

  for (const evento of pendientes) {
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.N8N_WEBHOOK_TOKEN
            ? { Authorization: `Bearer ${process.env.N8N_WEBHOOK_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          tipo: evento.tipo,
          eventoId: evento.id,
          creadoEn: evento.creadoEn,
          datos: evento.payload,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!respuesta.ok) throw new Error(`n8n respondió ${respuesta.status}`);

      await prisma.eventoSaliente.update({
        where: { id: evento.id },
        data: { estado: 'ENVIADO', enviadoEn: new Date(), intentos: evento.intentos + 1 },
      });
      enviados++;
    } catch (error) {
      const intentos = evento.intentos + 1;
      const agotado = intentos >= MAX_INTENTOS;
      await prisma.eventoSaliente.update({
        where: { id: evento.id },
        data: {
          intentos,
          estado: agotado ? 'FALLIDO' : 'PENDIENTE',
          proximoIntentoEn: proximoIntento(intentos),
          ultimoError: error instanceof Error ? error.message : String(error),
        },
      });
      if (agotado) fallidos++;
    }
  }

  return { enviados, fallidos, sinConfigurar: false };
}
