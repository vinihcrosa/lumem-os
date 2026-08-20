import { useQuery } from "@tanstack/react-query";

import { trpc } from "../lib/trpc.js";
import { Banner, Button, CheckList, CheckRow, CopyCommand, Skeleton } from "../ui/index.js";
import { eyebrowFor } from "./steps.js";
import { StepShell } from "./StepShell.js";

export const PREFLIGHT_KEY = ["setup", "preflight"];

export interface MachineStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

/**
 * Step 1: what the Lumem needs from this machine.
 *
 * Five checks, all local, and none of them blocks (D6). A `fail` here is
 * information: git 2.29 is a problem that shows up at the first worktree, with
 * the right sentence — and nobody should be stuck on a welcome screen for it.
 */
export function MachineStep({ onNext, onBack, onSkip }: MachineStepProps) {
  const preflight = useQuery({
    queryKey: PREFLIGHT_KEY,
    queryFn: () => trpc.setup.preflight.query(),
    // Read on arrival and on demand. Nothing here changes on its own, and a
    // poll would re-run five process calls for no reason.
    refetchOnWindowFocus: false,
  });

  const checks = preflight.data?.checks ?? [];
  const gitFailed = checks.some((check) => check.id === "git" && check.state === "fail");

  return (
    <StepShell
      eyebrow={eyebrowFor("machine")}
      title="O que o Lumem precisa da sua máquina"
      lede="Cinco verificações, todas locais. Nenhuma delas instala nada."
      primary={{ label: "Continuar" }}
      onSubmit={onNext}
      onBack={onBack}
      onSkip={onSkip}
      extra={
        <Button
          variant="ghost"
          disabled={preflight.isFetching}
          onClick={() => void preflight.refetch()}
        >
          {preflight.isFetching ? "verificando…" : "Verificar de novo"}
        </Button>
      }
      hint={
        <>
          <b>esc</b> volta
        </>
      }
    >
      {preflight.isPending && <Skeleton label="lendo a máquina" />}

      {preflight.isError && (
        <Banner tone="danger">
          <strong>O daemon não respondeu ao pré-voo.</strong> {preflight.error.message}
        </Banner>
      )}

      {checks.length > 0 && (
        <CheckList label="o que o Lumem encontrou nesta máquina">
          {checks.map((check) => (
            <CheckRow
              key={check.id}
              // Refetching is a state of every row at once: the values on screen
              // are the previous answer until the new one lands, and saying so is
              // what makes "verificar de novo" look like it did something.
              state={preflight.isFetching ? "running" : check.state}
              what={check.label}
              value={check.value}
              status={preflight.isFetching ? "lendo" : statusWord(check.state)}
              {...(check.fix === null
                ? {}
                : { action: <CopyCommand command={check.fix} /> })}
            />
          ))}
        </CheckList>
      )}

      {gitFailed && (
        <Banner tone="warning">
          Git abaixo de <strong>2.30</strong> não serve: o Lumem usa <code>git worktree</code> com{" "}
          <code>--orphan</code>, e o comportamento muda antes dessa versão. Dá para continuar — a
          falha aparece na primeira worktree, com esta mesma frase.
        </Banner>
      )}
    </StepShell>
  );
}

function statusWord(state: "ok" | "warn" | "fail"): string {
  if (state === "ok") return "ok";
  if (state === "warn") return "atenção";
  return "falha";
}
