import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './estilos.css';
import { Ingreso } from './paginas/Ingreso';
import { Cobro } from './paginas/Cobro';
import { Estructura } from './componentes/Estructura';
import { leerSesion } from './api';

function Privado({ children }: { children: React.ReactNode }) {
  return leerSesion() ? <>{children}</> : <Navigate to="/ingresar" replace />;
}

createRoot(document.getElementById('raiz')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/ingresar" element={<Ingreso />} />
        <Route
          path="/"
          element={
            <Privado>
              <Estructura />
            </Privado>
          }
        >
          <Route index element={<Cobro />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
