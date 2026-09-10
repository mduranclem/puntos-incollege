/**
 * Etapa 2: el mismo número cargado de cualquier forma tiene que dar una sola
 * cuenta. Se prueba el servicio contra un doble mínimo de Prisma, sin base.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { resolverCliente } from '../src/servicios/clientes.js';

type FilaCliente = {
  id: string;
  telefonoE164: string;
  telefonoCrudo: string;
  nombre: string;
  documento: string | null;
  localOrigenId: string | null;
  fusionadoEnId: string | null;
};

/** Doble de Prisma: sólo lo que usa `resolverCliente`, con la unicidad del teléfono. */
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
    create: async ({ data }: never) => {
      if (filas.some((f) => f.telefonoE164 === data.telefonoE164)) {
        const error = new Error('unique') as Error & { code: string };
        error.code = 'P2002';
        throw error;
      }
      const fila: FilaCliente = {
        id: randomUUID(),
        documento: null,
        localOrigenId: null,
        fusionadoEnId: null,
        ...data,
      };
      filas.push(fila);
      return fila;
    },
    update: async ({ where, data }: never) => {
      const fila = buscar(where);
      if (!fila) throw new Error('no existe');
      Object.assign(fila, data);
      return fila;
    },
  };

  return { prisma: { cliente } as unknown as PrismaClient, filas };
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

describe('alta de clientes por teléfono', () => {
  it('cinco formatos del mismo número dan una sola cuenta', async () => {
    const ids = new Set<string>();
    for (const formato of FORMATOS) {
      const cliente = await resolverCliente(doble.prisma, {
        telefonoCrudo: formato,
        nombre: 'Cliente de mostrador',
        areaPorDefecto: '341',
      });
      ids.add(cliente.id);
    }
    expect(ids.size).toBe(1);
    expect(doble.filas).toHaveLength(1);
    expect(doble.filas[0]!.telefonoE164).toBe('+5493415551234');
  });

  it('la primera carga crea y las siguientes reusan', async () => {
    const primero = await resolverCliente(doble.prisma, {
      telefonoCrudo: FORMATOS[0]!,
      areaPorDefecto: '341',
    });
    const segundo = await resolverCliente(doble.prisma, {
      telefonoCrudo: FORMATOS[3]!,
      areaPorDefecto: '341',
    });
    expect(primero.creado).toBe(true);
    expect(segundo.creado).toBe(false);
    expect(segundo.id).toBe(primero.id);
  });

  it('completa el nombre si la cuenta se había creado sin él', async () => {
    await resolverCliente(doble.prisma, { telefonoCrudo: FORMATOS[0]!, areaPorDefecto: '341' });
    expect(doble.filas[0]!.nombre).toBe('Sin nombre');
    const conNombre = await resolverCliente(doble.prisma, {
      telefonoCrudo: FORMATOS[1]!,
      nombre: 'Nombre cargado después',
      areaPorDefecto: '341',
    });
    expect(conNombre.nombre).toBe('Nombre cargado después');
    expect(doble.filas).toHaveLength(1);
  });

  it('números de locales distintos no se confunden', async () => {
    const rosario = await resolverCliente(doble.prisma, {
      telefonoCrudo: '555-1234',
      areaPorDefecto: '341',
    });
    const santaFe = await resolverCliente(doble.prisma, {
      telefonoCrudo: '555-1234',
      areaPorDefecto: '342',
    });
    expect(rosario.id).not.toBe(santaFe.id);
    expect(doble.filas).toHaveLength(2);
  });
});
