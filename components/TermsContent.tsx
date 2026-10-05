/**
 * The platform's terms of use, shared by /terminos and the acceptance screen organizers see (TermsGate). When the
 * text changes in substance, bump TERMS_UPDATED_AT in lib/terms.ts so everyone accepts it again.
 */
export const TERMS_SECTIONS = [
  { id: "que-es", title: "Qué es Ibirifas" },
  { id: "organizador", title: "Lo que le corresponde al organizador" },
  { id: "datos", title: "Datos de los compradores" },
  { id: "uso", title: "Uso no permitido" },
  { id: "servicio", title: "El servicio" },
  { id: "cambios", title: "Cambios" },
];

export function TermsContent() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-text">
      <section id="que-es" className="scroll-mt-24 space-y-1">
        <h2 className="font-semibold">1. Qué es Ibirifas</h2>
        <p>
          Ibirifas es una herramienta para que un organizador gestione sus rifas: el tablero de números, las ventas y
          los cobros, su equipo de vendedores, la imagen y el enlace para compartir. <strong>Ibirifas no organiza, vende
          ni promociona rifas</strong>, no recibe el dinero de los compradores (los pagos van directo a las cuentas que
          cada organizador publica) y no entrega premios.
        </p>
      </section>

      <section id="organizador" className="scroll-mt-24 space-y-1">
        <h2 className="font-semibold">2. Lo que le corresponde al organizador</h2>
        <p>Quien crea una organización y sus rifas responde por ellas. En particular:</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>
            Que la rifa cumpla la ley, incluidos los permisos que exija: según su alcance, ante la alcaldía, la
            gobernación o Coljuegos (Ley 643 de 2001 y sus decretos).
          </li>
          <li>Que el premio exista, se entregue como se anunció y que la información publicada sea cierta (premio, fecha, lotería, valor).</li>
          <li>Los impuestos y retenciones que apliquen, como la ganancia ocasional del ganador.</li>
          <li>Lo que hagan sus vendedores dentro de la plataforma.</li>
          <li>Verificar los pagos: la confirmación automática con el aviso del banco es una ayuda, no una garantía.</li>
        </ul>
      </section>

      <section id="datos" className="scroll-mt-24 space-y-1">
        <h2 className="font-semibold">3. Datos de los compradores</h2>
        <p>
          El organizador es el responsable de los datos de sus compradores (Ley 1581 de 2012) y debe usarlos solo para
          gestionar su rifa. Ibirifas los trata por su cuenta y según sus instrucciones, no los vende ni los usa para
          publicidad.
        </p>
      </section>

      <section id="uso" className="scroll-mt-24 space-y-1">
        <h2 className="font-semibold">4. Uso no permitido</h2>
        <p>
          No se permiten rifas engañosas o con premios inexistentes, cobros a nombre de otros, suplantación ni ningún uso
          para fines ilegales. Ibirifas puede suspender una rifa o una organización ante denuncias o incumplimiento de
          estos términos, y atender los requerimientos de las autoridades competentes.
        </p>
      </section>

      <section id="servicio" className="scroll-mt-24 space-y-1">
        <h2 className="font-semibold">5. El servicio</h2>
        <p>
          Se presta tal como está, con un esfuerzo razonable para que funcione y esté disponible. Ibirifas no responde
          por las rifas, sus resultados, premios o pagos, ni por las decisiones de cada organizador.
        </p>
      </section>

      <section id="cambios" className="scroll-mt-24 space-y-1">
        <h2 className="font-semibold">6. Cambios</h2>
        <p>Estos términos pueden actualizarse. Si cambian en algo importante, te pediremos aceptarlos de nuevo al entrar.</p>
      </section>

      <p className="text-xs text-text-muted">Vigentes desde el 2 de octubre de 2026.</p>
    </div>
  );
}
