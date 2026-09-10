import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { cerrarSesion, leerSesion } from '../api';

const enlaces = [
  { a: '/', texto: 'Cobrar', exacto: true },
  { a: '/canje', texto: 'Canjear' },
  { a: '/admin', texto: 'Panel', soloAdmin: true },
];

export function Estructura() {
  const sesion = leerSesion();
  const navegar = useNavigate();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-[var(--color-borde)] bg-[var(--color-marino)] text-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <span className="text-lg font-bold tracking-tight">
            Puntos <span className="text-[var(--color-punto)]">InCollege</span>
          </span>

          <nav className="ml-2 flex gap-1">
            {enlaces
              .filter((e) => !e.soloAdmin || sesion?.rol === 'ADMINISTRADOR')
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
            <button
              type="button"
              className="chip bg-white/10 text-white/90 hover:bg-white/20"
              onClick={() => {
                cerrarSesion();
                navegar('/ingresar');
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
