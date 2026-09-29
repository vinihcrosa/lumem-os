import { useEffect, useRef, useState } from "react";

import type { AcpPermissionOption } from "@lumem/shared";

import { Button } from "../../ui/index.js";
import type { PendingPermission, ToolCallView } from "./conversation-model.js";
import { Markdown } from "./Markdown.js";

/**
 * O pedido de sair do plan mode, com o plano inteiro na tela (`035` S3).
 *
 * O tool call `switch_mode` do adaptador traz o plano em markdown, e o
 * `ToolCard` mostrava as últimas 12 linhas em texto cru — o começo, onde está o
 * objetivo, sumia. Aqui o plano é renderizado inteiro enquanto se decide, e
 * recolhido depois, quando o cartão vira o registro do que foi decidido.
 *
 * - **As opções são do adaptador, verbatim** (Q1, A13): uma delas apaga o
 *   contexto da conversa, e o texto exato de quem vai apagar pesa na decisão.
 *   O texto do Lumem fica em volta: o cabeçalho, *"ou continuar planejando"*
 *   antes da recusa, o registro.
 * - **As teclas são as do pedido de permissão**: Enter escolhe a `allow_once`,
 *   Esc a `reject_once`.
 * - **Responde uma vez**, pelo mesmo motivo do `PermissionRequest`.
 */

export interface PlanApprovalProps {
  call: ToolCallView;
  /** O pedido pendente **deste** tool call, ou null. */
  request: PendingPermission | null;
  onRespond(optionId: string): void;
}

export function PlanApproval({ call, request, onRespond }: PlanApprovalProps) {
  const record = recordOf(call);
  // Pendente, sempre aberto; registro, recolhido (Q4).
  const [open, setOpen] = useState(false);
  const text = planText(call);
  const showPlan = record === null || open;

  return (
    <div className="plan-approval" role="group" aria-label="aprovar o plano">
      <div className="plan-approval__head">
        <span className="plan-approval__glyph" aria-hidden="true">
          ◈
        </span>
        plano do agente
        <span className="spacer" />
        {request !== null && <span className="kbd">o turno está parado aqui</span>}
      </div>

      {request?.policyReason != null && <div className="plan-approval__why">{request.policyReason}</div>}

      {showPlan &&
        (text === "" ? (
          <div className="plan-approval__none">o agente não mandou o texto do plano</div>
        ) : (
          <div className="msg plan-approval__doc">
            <Markdown text={text} />
          </div>
        ))}

      {request !== null && <PlanOptions request={request} onRespond={onRespond} />}

      {record !== null && (
        <div className="plan-approval__record">
          {record}
          <span className="spacer" />
          <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "esconder o plano" : "ver o plano"}
          </Button>
        </div>
      )}
    </div>
  );
}

function PlanOptions({ request, onRespond }: { request: PendingPermission; onRespond(optionId: string): void }) {
  const [answered, setAnswered] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const allows = request.options.filter((option) => option.kind.startsWith("allow"));
  const rejects = request.options.filter((option) => option.kind.startsWith("reject"));
  const primary = pick(request.options, "allow_once") ?? request.options[0]!;
  const rejectOnce = pick(request.options, "reject_once");

  const respond = (optionId: string): void => {
    if (answered) return;
    setAnswered(true);
    onRespond(optionId);
  };

  useEffect(() => {
    primaryRef.current?.focus();
  }, [request.requestId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        respond(primary.optionId);
        return;
      }
      if (event.key === "Escape" && rejectOnce) {
        event.preventDefault();
        respond(rejectOnce.optionId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const button = (option: AcpPermissionOption) => (
    <Button
      key={option.optionId}
      ref={option === primary ? primaryRef : undefined}
      variant={option === primary ? "primary" : "ghost"}
      size="sm"
      disabled={answered}
      onClick={() => respond(option.optionId)}
    >
      {option.name}
      {option === primary && <span className="kbd" aria-hidden="true">⏎</span>}
      {option === rejectOnce && <span className="kbd" aria-hidden="true">esc</span>}
    </Button>
  );

  return (
    <div className="plan-approval__opts">
      <div className="plan-approval__allow">{allows.map(button)}</div>
      {rejects.length > 0 && (
        <div className="plan-approval__keep">
          <span>ou continuar planejando</span>
          {rejects.map(button)}
        </div>
      )}
    </div>
  );
}

/** O texto do plano: o `content` de texto do tool call, que é onde o adaptador o põe. */
function planText(call: ToolCallView): string {
  return call.content
    .flatMap((item) => (item.type === "content" ? [item.text] : []))
    .join("\n\n")
    .trim();
}

/** O que foi decidido, na frase do registro — ou null enquanto não há decisão. */
function recordOf(call: ToolCallView): string | null {
  if (call.verdict?.kind.startsWith("allow")) return `plano aprovado — ${call.verdict.name}`;
  if (call.verdict?.kind.startsWith("reject")) return "você pediu para continuar planejando";
  if (call.askWithdrawn) return "pedido cancelado";
  return null;
}

function pick(
  options: readonly AcpPermissionOption[],
  kind: AcpPermissionOption["kind"],
): AcpPermissionOption | undefined {
  return options.find((option) => option.kind === kind);
}
