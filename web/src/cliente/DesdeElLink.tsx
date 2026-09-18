/**
 * El link de WhatsApp (`/s/<token>`) ahora deja la sesión abierta y entra a la app.
 *
 * Así el cliente que abre el link una vez ya queda adentro: no tiene que pedir
 * ningún código, y la próxima vez entra directo desde el ícono. El link sigue
 * funcionando igual que siempre para quien sólo quiere mirar el saldo.
 */
import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { guardarAcceso } from './api';

export function DesdeElLink() {
  const { token } = useParams();

  useEffect(() => {
    if (token) guardarAcceso(token);
  }, [token]);

  if (!token) return <Navigate to="/app/entrar" replace />;
  return <Navigate to="/app" replace />;
}
