/**
 * Armazón de la app del cliente: contenido arriba, cuatro pestañas abajo.
 *
 * Cuatro y no más: cuenta, movimientos, locales y novedades. La cuenta es lo
 * primero que se ve al abrir, siempre.
 */
import { NavLink, Outlet } from 'react-router-dom';
import { Logo } from '../componentes/Logo';

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
    a: '/app/novedades',
    texto: 'Novedades',
    icono: <Icono d="M4 4h16v12H7l-3 3zm3 4h10v2H7zm0 4h7v2H7z" />,
  },
];

export function AppCliente() {
  return (
    <div className="app-cliente">
      {/* El logo arriba de todo: es la única marca visible una vez adentro,
          porque la pantalla la manda el saldo y no el encabezado (D-037). */}
      <header className="app-encabezado">
        <Logo alto={26} alt="InCollege" />
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
