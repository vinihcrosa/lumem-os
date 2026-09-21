import { EmptyState } from "../../ui/index.js";
import { useMemoryCore, useMemorySettings, useUsage } from "./useMemory.js";

/**
 * A aba `Números` — os números do §6 do context-delivery.
 *
 * O que interessa não é cada linha: é a **comparação** entre o custo fixo e as
 * perguntas feitas. Perto de zero perguntas significa que a camada 3 é
 * decoração — e é a medida que decide se o desenho continua de pé.
 */

/**
 * Onde o alarme toca — não onde o corte acontece (D5).
 *
 * Não existe teto: passar disto não corta nada e não recusa nada, só diz que o
 * núcleo virou documentação e que consolidar é decisão sua. A referência é o
 * teto do Hermes (2.200 caracteres), mais a folga que o §6 autoriza depois de o
 * spike mostrar que o piso de uma sessão é ~39k tokens — e não nosso.
 */
const CORE_ALARM_CHARS = 4_000;

export function MemoryNumbers({ core }: { core: ReturnType<typeof useMemoryCore> }) {
  const usage = useUsage();
  const settings = useMemorySettings();

  if (usage.isPending) return <p className="mem-meta">carregando…</p>;
  if (usage.isError) {
    return <EmptyState title="Não deu para ler os números">{usage.error.message}</EmptyState>;
  }

  const watermark = core.data;

  return (
    <div className="mem-stats">
      {/*
       * A marca d'água vem primeiro, e é o único número desta aba que descreve um
       * custo **recorrente**: o núcleo é cobrado em toda sessão. Não há teto (D5)
       * — cortar diretriz no meio produz regra errada, não regra menor —, então
       * medir é a única coisa que impede "sem teto" de virar "sem controle".
       */}
      {watermark !== undefined && watermark.entries.length > 0 ? (
        <div className={`mem-stat${watermark.chars > CORE_ALARM_CHARS ? " mem-stat--warn" : ""}`}>
          <div className="n">{watermark.chars.toLocaleString("pt-BR")}</div>
          <div className="l">caracteres no núcleo</div>
          <div className="hint">
            {watermark.entries.length}{" "}
            {watermark.entries.length === 1 ? "diretriz fixada" : "diretrizes fixadas"}
            {watermark.recentChars > 0
              ? ` · ${watermark.recentChars.toLocaleString("pt-BR")} entraram em 30 dias`
              : ""}
            {watermark.chars > CORE_ALARM_CHARS ? " · hora de consolidar" : ""}
          </div>
        </div>
      ) : null}
      {/*
       * Desligado por padrão só é honesto se for visível: uma captura que ninguém
       * sabe se está ligada é uma captura que ninguém confere. E ela é a única
       * parte do sistema que gasta token sem você pedir.
       */}
      {settings.data !== undefined ? (
        <div className="mem-stat">
          <div className="n">{settings.data.distill ? "on" : "off"}</div>
          <div className="l">destilação de fim de sessão</div>
          <div className="hint">
            {settings.data.distill
              ? "cada sessão de agente que termina custa uma sessão de destilação"
              : "ligue com LUMEM_MEMORY_DISTILL=1"}
          </div>
        </div>
      ) : null}
      {/*
       * O auto-learn é o único lugar em que uma pergunta **cria** memória sem
       * ninguém pedir. Se isso está ligado, tem que estar escrito na tela.
       */}
      {settings.data !== undefined ? (
        <div className="mem-stat">
          <div className="n">{settings.data.autoLearn ? "on" : "off"}</div>
          <div className="l">pesquisa automática</div>
          <div className="hint">
            {settings.data.autoLearn
              ? `pergunta sem resposta sobe um agente · até ${String(settings.data.autoLearnBudget)} por sessão`
              : "ligue com LUMEM_MEMORY_AUTO_LEARN=1"}
          </div>
        </div>
      ) : null}
      {usage.data.map((row) => (
        <div key={row.kind} className="mem-stat">
          <div className="n">{row.events}</div>
          <div className="l">
            {row.kind} · {row.totalAmount} no total · {row.averageDurationMs} ms
          </div>
        </div>
      ))}
      {/* Zero é um número, e é diferente de tela vazia: antes esta aba sumia
          inteira enquanto ninguém tivesse buscado, escondendo a marca d'água e o
          estado da destilação junto. */}
      {usage.data.length === 0 ? (
        <div className="mem-stat">
          <div className="n">0</div>
          <div className="l">uso registrado</div>
          <div className="hint">os números aparecem depois da primeira busca</div>
        </div>
      ) : null}
    </div>
  );
}
