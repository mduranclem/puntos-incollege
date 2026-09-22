import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { cerrarSesion, leerSesion } from '../api';
import { Logo } from './Logo';

const enlaces = [
  { a: '/mostrador', texto: 'Cobrar', exacto: true },
  { a: '/mostrador/canje', texto: 'Canjear' },
  { a: '/mostrador/admin', texto: 'Panel', soloAdmin: true },
];

export function Estructura() {
  const sesion = leerSesion();
  const navegar = useNavigate();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-[var(--color-borde)] bg-[var(--color-marino)] text-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <span className="flex items-center gap-2">
            <Logo alto={30} alt="InCollege" />
            <span className="hidden text-sm font-semibold text-white/80 sm:inline">Puntos</span>
          </span>

          <nav className="ml-2 flex gap-1">
            {enlaces
              .filter((e) => !e.soloAdmin || sesion?.rol === 'GERENTE')
              .map((e) => (
                <NavLink
                  key={e.a}
                  to={e.a}
                  end={e.exacto}
                  className={({ isActive }) =>
                    `chip ${isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white'}`
                  }
                >
                  {e.texto}
                </NavLink>
              ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-white/80 sm:inline">{sesion?.localNombre}</span>
            <NavLink
              to="/mostrador/contrasena"
              className="chip bg-white/10 text-white/90 hover:bg-white/20"
              title="Cambiar mi contraseña"
            >
              {sesion?.usuario}
            </NavLink>
            <button
              type="button"
              className="chip bg-white/10 text-white/90 hover:bg-white/20"
              onClick={() => {
                cerrarSesion();
                navegar('/mostrador/ingresar');
              }}
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
