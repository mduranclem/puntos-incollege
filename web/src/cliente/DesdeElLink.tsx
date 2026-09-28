/**
 * El link de WhatsApp (`/s/<token>`): entra a la app y deja la sesión abierta.
 *
 * Así el cliente que abre el aviso una vez ya queda adentro: no tiene que pedir
 * ningún código, y la próxima vez entra directo desde el ícono.
 *
 * **El token del link se canjea, no se guarda** (D-045). El que viaja por
 * WhatsApp dura 7 días porque queda escrito en el historial de n8n, que no
 * controlamos; acá se cambia por una sesión normal. La persona no paga esa
 * cuenta, y lo que quedó guardado afuera no sirve para nada una semana después.
 *
 * Y si el link venció, se dice y se manda a entrar, en vez de guardar un token
 * muerto y fallar más adelante sin explicar por qué.
 */
import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { apiCliente, guardarAcceso } from './api';
import { Cargando } from './Estados';

type Estado = 'canjeando' | 'listo' | 'vencido';

export function DesdeElLink() {
  const { token } = useParams();
  const [estado, setEstado] = useState<Estado>('canjeando');

  useEffect(() => {
    if (!token) {
      setEstado('vencido');
      return;
    }
    apiCliente<{ token: string }>('/acceso/desde-link', { cuerpo: { token } })
      .then((datos) => {
        guardarAcceso(datos.token);
        setEstado('listo');
      })
      .catch(() => setEstado('vencido'));
  }, [token]);

  if (estado === 'canjeando') return <Cargando filas={2} etiqueta="Abriendo tu cuenta" />;
  if (estado === 'vencido') return <Navigate to="/app/entrar" replace />;
  return <Navigate to="/app" replace />;
}
