import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './estilos.css';

// Mostrador y administración
import { Ingreso } from './paginas/Ingreso';
import { CambiarContrasena } from './paginas/CambiarContrasena';
import { Cobro } from './paginas/Cobro';
import { Canje } from './paginas/Canje';
import { Admin } from './paginas/Admin';
import { Estructura } from './componentes/Estructura';
import { leerSesion } from './api';

// App del cliente
import { AppCliente } from './cliente/AppCliente';
import { IngresoCliente } from './cliente/Ingreso';
import { IngresoPorCodigo } from './cliente/IngresoPorCodigo';
import { RegistroCliente } from './cliente/Registro';
import { RecuperarCliente } from './cliente/Recuperar';
import { Cuenta } from './cliente/Cuenta';
import { Movimientos } from './cliente/Movimientos';
import { Locales } from './cliente/Locales';
import { Novedades } from './cliente/Novedades';
import { DesdeElLink } from './cliente/DesdeElLink';
import { leerAcceso } from './cliente/api';

function SoloPersonal({ children }: { children: React.ReactNode }) {
  const sesion = leerSesion();
  if (!sesion) return <Navigate to="/ingresar" replace />;
  // Con la contraseña puesta por otro no se opera: al cambio y nada más (D-034).
  if (sesion.debeCambiarContrasena) return <Navigate to="/contrasena" replace />;
  return <>{children}</>;
}

/** Con sesión alcanza: es la única pantalla que se ve con el cambio pendiente. */
function ConSesion({ children }: { children: React.ReactNode }) {
  return leerSesion() ? <>{children}</> : <Navigate to="/ingresar" replace />;
}

function SoloCliente({ children }: { children: React.ReactNode }) {
  return leerAcceso() ? <>{children}</> : <Navigate to="/app/entrar" replace />;
}

createRoot(document.getElementById('raiz')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* App del cliente */}
        <Route path="/app/entrar" element={<IngresoCliente />} />
        <Route path="/app/entrar-con-codigo" element={<IngresoPorCodigo />} />
        <Route path="/app/registrarse" element={<RegistroCliente />} />
        <Route path="/app/recuperar" element={<RecuperarCliente />} />
        <Route
          path="/app"
          element={
            <SoloCliente>
              <AppCliente />
            </SoloCliente>
          }
        >
          <Route index element={<Cuenta />} />
          <Route path="movimientos" element={<Movimientos />} />
          <Route path="locales" element={<Locales />} />
          <Route path="novedades" element={<Novedades />} />
        </Route>

        {/* El link de WhatsApp deja la sesión abierta y entra a la app */}
        <Route path="/s/:token" element={<DesdeElLink />} />

        {/* Mostrador y administración */}
        <Route path="/ingresar" element={<Ingreso />} />
        <Route
          path="/contrasena"
          element={
            <ConSesion>
              <CambiarContrasena />
            </ConSesion>
          }
        />
        <Route
          path="/"
          element={
            <SoloPersonal>
              <Estructura />
            </SoloPersonal>
          }
        >
          <Route index element={<Cobro />} />
          <Route path="canje" element={<Canje />} />
          <Route path="admin" element={<Admin />} />
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);

// El service worker es lo que permite instalarla en la pantalla de inicio.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app funciona igual, sólo que no se instala.
    });
  });
}
