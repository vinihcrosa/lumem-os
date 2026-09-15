import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { trpc } from "../lib/trpc.js";
import { CredentialDialog, type SecretSlotView } from "./CredentialDialog.js";

/**
 * As credenciais dos serviços, no rodapé da sidebar
 * ([ADR de 2026-09-13](../../../../docs/adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md)).
 *
 * **Uma credencial é da máquina, e não do workspace.** O cofre mora no
 * `~/.lumem`, que é um por instalação: guardar a chave do Linear dentro da tela
 * de um workspace prometeria que existe outra no workspace seguinte, e não
 * existe. O rodapé já é o lugar do que é da máquina — é lá que os adaptadores
 * moram, pelo mesmo motivo.
 *
 * **Sem `＋`**, e é a diferença para o bloco de cima: o catálogo é **fechado**.
 * Os serviços que o Lumem sabe guardar são os que ele sabe usar, e um `＋`
 * prometeria acrescentar um — produzindo uma credencial que nada lê, guardada
 * para sempre, com quem a pôs achando que configurou alguma coisa.
 */

export function Credentials() {
  const [editing, setEditing] = useState<SecretSlotView | null>(null);
  const slots = useQuery({
    queryKey: ["secrets"],
    queryFn: () => trpc.secrets.list.query() as Promise<SecretSlotView[]>,
  });

  const list = slots.data ?? [];
  // Nada a mostrar enquanto o daemon não responde, e nenhum esqueleto: o rodapé
  // é a última coisa da sidebar, e um esqueleto piscando ali chama mais atenção
  // que a informação que ele substitui.
  if (list.length === 0) return null;

  return (
    <>
      <div className="foot-head">
        <span className="foot-head__label">Credenciais</span>
      </div>
      {list.map((slot) => (
        <button
          key={slot.id}
          type="button"
          className={`foot-row foot-row--${slot.present ? "on" : "off"} focus-ring`}
          onClick={() => setEditing(slot)}
        >
          <span className="glyph glyph--key">⚿</span>
          <span className="foot-row__label">{slot.label}</span>
          <span className="pip" />
          <span className="foot-row__st">{slot.present ? "guardada" : "sem chave"}</span>
        </button>
      ))}

      {editing === null ? null : (
        <CredentialDialog slot={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
