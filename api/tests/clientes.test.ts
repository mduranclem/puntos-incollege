/**
 * El mostrador cobra a quien tiene cuenta en la app, y a nadie más (D-060).
 *
 * Lo que se prueba acá es la puerta: que el mismo número escrito de cualquier
 * forma encuentre la misma cuenta (D-010), y que no la encuentre cuando no hay
 * cuenta que encontrar. Se prueba contra un doble mínimo de Prisma, sin base.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { clienteConCuenta } from '../src/servicios/clientes.js';

type FilaCliente = {
  id: string;
  telefonoE164: string;
  telefonoCrudo: string;
  nombre: string;
  registradoEn: Date | null;
  fusionadoEnId: string | null;
};

/** Doble de Prisma: sólo lo que usa la búsqueda, con la unicidad del teléfono. */
function prismaFalso() {
  const filas: FilaCliente[] = [];
  const buscar = (where: { id?: string; telefonoE164?: string }) =>
    filas.find(
      (f) =>
        (where.id !== undefined && f.id === where.id) ||
        (where.telefonoE164 !== undefined && f.telefonoE164 === where.telefonoE164),
    ) ?? null;

  const cliente = {
    findUnique: async ({ where }: never) => buscar(where),
    findUniqueOrThrow: async ({ where }: never) => {
      const fila = buscar(where);
      if (!fila) throw new Error('no existe');
      return fila;
    },
  };

  /** Alta directa, como la que hace el registro en la app. */
  const alta = (datos: Partial<FilaCliente> & { telefonoE164: string }) => {
    const fila: FilaCliente = {
      id: randomUUID(),
      telefonoCrudo: datos.telefonoE164,
      nombre: 'Cliente',
      registradoEn: new Date(),
      fusionadoEnId: null,
      ...datos,
    };
    filas.push(fila);
    return fila;
  };

  return { prisma: { cliente } as unknown as PrismaClient, filas, alta };
}

let doble: ReturnType<typeof prismaFalso>;

beforeEach(() => {
  doble = prismaFalso();
});

const FORMATOS = [
  '0341 15 555-1234',
  '341 555 1234',
  '+54 9 341 555 1234',
  '3415551234',
  '(0341) 15-5551234',
];

describe('a quién se le puede cobrar', () => {
  it('cinco formatos del mismo número encuentran la misma cuenta', async () => {
    const registrado = doble.alta({ telefonoE164: '+5493415551234' });
    const ids = new Set<string>();
    for (const formato of FORMATOS) {
      const encontrado = await clienteConCuenta(doble.prisma, {
        telefonoCrudo: formato,
        areaPorDefecto: '341',
      });
      ids.add(encontrado!.id);
    }
    expect(ids).toEqual(new Set([registrado.id]));
  });

  it('un teléfono que no está no se da de alta: devuelve null', async () => {
    const encontrado = await clienteConCuenta(doble.prisma, {
      telefonoCrudo: FORMATOS[0]!,
      areaPorDefecto: '341',
    });
    expect(encontrado).toBeNull();
    // Lo importante no es el null, es que no se creó nada (D-060).
    expect(doble.filas).toHaveLength(0);
  });

  it('una ficha vieja sin cuenta tampoco sirve', async () => {
    doble.alta({ telefonoE164: '+5493415551234', registradoEn: null });
    const encontrado = await clienteConCuenta(doble.prisma, {
      telefonoCrudo: FORMATOS[0]!,
      areaPorDefecto: '341',
    });
    expect(encontrado).toBeNull();
  });

  it('sigue la fusión hasta la cuenta sobreviviente', async () => {
    const sobreviviente = doble.alta({ telefonoE164: '+5493415559999' });
    doble.alta({ telefonoE164: '+5493415551234', fusionadoEnId: sobreviviente.id });
    const encontrado = await clienteConCuenta(doble.prisma, {
      telefonoCrudo: FORMATOS[0]!,
      areaPorDefecto: '341',
    });
    expect(encontrado!.id).toBe(sobreviviente.id);
  });

  it('números de locales distintos no se confunden', async () => {
    doble.alta({ telefonoE164: '+5493415551234' });
    const rosario = await clienteConCuenta(doble.prisma, {
      telefonoCrudo: '555-1234',
      areaPorDefecto: '341',
    });
    const santaFe = await clienteConCuenta(doble.prisma, {
      telefonoCrudo: '555-1234',
      areaPorDefecto: '342',
    });
    expect(rosario).not.toBeNull();
    expect(santaFe).toBeNull();
  });
});
