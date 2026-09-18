/**
 * Escáner del QR del cliente (D-024).
 *
 * Aparece sólo donde hay cámara: en la PC de la caja no se ve y no molesta. La
 * vendedora abre la misma pantalla de cobro en su celular y escanea.
 *
 * Usa `BarcodeDetector` cuando el navegador lo trae (Chrome en Android) y cae a
 * jsQR si no está (iPhone). El QR lleva sólo el teléfono, así que lo único que
 * sale de acá es un número.
 */
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

type DetectorDeCodigos = {
  detect: (fuente: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

/** ¿Este dispositivo puede escanear? Se pregunta una sola vez, al montar. */
export function useHayCamara(): boolean {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    let vigente = true;
    const puede =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      // La cámara necesita origen seguro; en http:// ni se ofrece.
      (window.isSecureContext || location.hostname === 'localhost');
    if (!puede) return;

    navigator.mediaDevices
      .enumerateDevices()
      .then((dispositivos) => {
        if (vigente) setHay(dispositivos.some((d) => d.kind === 'videoinput'));
      })
      .catch(() => {
        // Sin permiso todavía no se puede saber; se ofrece igual y decide la persona.
        if (vigente) setHay(true);
      });
    return () => {
      vigente = false;
    };
  }, []);
  return hay;
}

export function Escaner({
  alLeer,
  alCerrar,
}: {
  alLeer: (texto: string) => void;
  alCerrar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let flujo: MediaStream | null = null;
    let cuadro = 0;
    let terminado = false;

    async function arrancar() {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (terminado) {
          flujo.getTracks().forEach((t) => t.stop());
          return;
        }
        if (video.current) {
          video.current.srcObject = flujo;
          await video.current.play();
        }

        const Detector = (window as unknown as { BarcodeDetector?: new (opciones: unknown) => DetectorDeCodigos })
          .BarcodeDetector;
        const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;

        const mirar = async () => {
          if (terminado || !video.current || video.current.readyState < 2) {
            cuadro = requestAnimationFrame(() => void mirar());
            return;
          }
          try {
            let leido: string | null = null;

            if (detector) {
              const codigos = await detector.detect(video.current);
              leido = codigos[0]?.rawValue ?? null;
            } else if (lienzo.current) {
              const ancho = video.current.videoWidth;
              const alto = video.current.videoHeight;
              lienzo.current.width = ancho;
              lienzo.current.height = alto;
              const pincel = lienzo.current.getContext('2d', { willReadFrequently: true });
              if (pincel && ancho && alto) {
                pincel.drawImage(video.current, 0, 0, ancho, alto);
                const imagen = pincel.getImageData(0, 0, ancho, alto);
                leido = jsQR(imagen.data, ancho, alto)?.data ?? null;
              }
            }

            if (leido) {
              terminado = true;
              alLeer(leido);
              return;
            }
          } catch {
            // Un cuadro ilegible no es un error: se sigue mirando.
          }
          cuadro = requestAnimationFrame(() => void mirar());
        };

        void mirar();
      } catch {
        setError('No pudimos abrir la cámara. Revisá el permiso en el navegador.');
      }
    }

    void arrancar();
    return () => {
      terminado = true;
      cancelAnimationFrame(cuadro);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [alLeer]);

  return (
    <div className="escaner" role="dialog" aria-modal="true" aria-label="Escanear el código del cliente">
      <div className="escaner-caja">
        {error ? (
          <p className="escaner-error">{error}</p>
        ) : (
          <>
            <video ref={video} className="escaner-video" playsInline muted />
            <canvas ref={lienzo} hidden />
            <div className="escaner-marco" aria-hidden="true" />
            <p className="escaner-ayuda">Apuntá al código que muestra el cliente en su app.</p>
          </>
        )}
        <button type="button" className="escaner-cerrar" onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
