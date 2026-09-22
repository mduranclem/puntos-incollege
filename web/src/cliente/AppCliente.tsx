/**
 * Armazón de la app del cliente: logo y salida arriba, cuatro pestañas abajo.
 *
 * Cuatro y no más: cuenta, movimientos, locales y precios. La cuenta es lo
 * primero que se ve al abrir, siempre.
 *
 * "Salir" vive acá y no adentro de Mi cuenta: se puede salir desde cualquier
 * pestaña, y el encabezado queda igual en las cuatro.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '../componentes/Logo';
import { cerrarAcceso } from './api';

type Pestania = { a: string; texto: string; icono: JSX.Element; exacto?: boolean };

const Icono = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={d} />
  </svg>
);

const PESTANIAS: Pestania[] = [
  {
    a: '/app',
    texto: 'Mi cuenta',
    exacto: true,
    icono: <Icono d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z" />,
  },
  {
    a: '/app/movimientos',
    texto: 'Movimientos',
    icono: <Icono d="M4 5h16v2H4zm0 6h16v2H4zm0 6h10v2H4z" />,
  },
  {
    a: '/app/locales',
    texto: 'Locales',
    icono: (
      <Icono d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" />
    ),
  },
  {
    // La ruta sigue siendo /novedades para no romper ningún enlace ya repartido;
    // lo que cambia es el nombre, porque lo que muestra son precios.
    a: '/app/novedades',
    texto: 'Precios',
    icono: (
      <Icono d="M3 5h12l6 7-6 7H3l6-7-6-7zm9.5 4.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
    ),
  },
];

export function AppCliente() {
  const navegar = useNavigate();

  return (
    <div className="app-cliente">
      <header className="app-encabezado">
        <Logo alto={26} alt="InCollege" />
        <button
          type="button"
          className="app-salir"
          onClick={() => {
            cerrarAcceso();
            navegar('/app/entrar', { replace: true });
          }}
        >
          Salir
        </button>
      </header>

      <main className="app-contenido">
        <Outlet />
      </main>

      <nav className="app-pestanias" aria-label="Secciones">
        {PESTANIAS.map((p) => (
          <NavLink
            key={p.a}
            to={p.a}
            end={p.exacto}
            // NavLink pone `aria-current="page"` solo en la que está activa.
            className={({ isActive }) => `app-pestania${isActive ? ' activa' : ''}`}
          >
            {p.icono}
            <span>{p.texto}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
