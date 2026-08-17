/**
 * O scan determinístico do portão (Q10).
 *
 * Roda **antes** de qualquer escrita, sem LLM. Existe por uma assimetria: um
 * arquivo lido é lido uma vez; uma **memória** envenenada é relida para sempre,
 * em todos os projetos do workspace, até alguém perceber.
 *
 * Não é fronteira de segurança contra atacante determinado — é filtro contra
 * **acidente**: o agente colar um `.env` no que "aprendeu", ou salvar um
 * parágrafo de README de terceiro que diz "ignore as instruções anteriores".
 *
 * Três categorias **bloqueiam**, uma **anota**, e o que o Compozy bloqueia e
 * mata memória legítima — bloco de código, caminho de repositório, a palavra
 * "cron" — fica de fora de propósito (§12.6 do estudo).
 */

export type ScanVerdict = "allow" | "annotate" | "reject";

export type ScanReasonCode =
  | "secret"
  | "prompt_injection"
  | "invisible_unicode"
  | "relative_time";

export interface ScanFinding {
  code: ScanReasonCode;
  /**
   * O que casou, **por nome da regra** — nunca o texto casado.
   *
   * Regra do Compozy que vale ouro: o motivo não pode conter o conteúdo
   * escaneado, senão o log vira o vazamento que o scan existia para evitar.
   */
  rule: string;
}

export interface ScanResult {
  verdict: ScanVerdict;
  findings: readonly ScanFinding[];
  /**
   * O texto que deve ser gravado.
   *
   * Difere da entrada quando havia Unicode invisível: aquilo é **limpo**, não
   * rejeitado — o caractere não carrega significado nenhum numa memória
   * legítima, e recusar a escrita inteira por causa dele seria punir o usuário
   * por um byte que ele não vê.
   */
  cleaned: string;
}

interface Rule {
  code: ScanReasonCode;
  rule: string;
  pattern: RegExp;
}

/**
 * Segredo e credencial: forma, não conteúdo.
 *
 * É o único grupo em que errar para o lado permissivo é catastrófico — e, com o
 * `~/.lumem` versionado (Q36), um segredo commitado **não sai mais do
 * histórico**. Daí ser o primeiro.
 */
const SECRET_RULES: readonly Rule[] = [
  { code: "secret", rule: "anthropic_key", pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
  { code: "secret", rule: "openai_key", pattern: /\bsk-[A-Za-z0-9]{32,}/ },
  { code: "secret", rule: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { code: "secret", rule: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { code: "secret", rule: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { code: "secret", rule: "google_api_key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { code: "secret", rule: "private_key_block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { code: "secret", rule: "bearer_token", pattern: /\bAuthorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}/i },
  {
    code: "secret",
    rule: "env_assignment",
    // `CHAVE=<valor longo e sem espaço>` — a forma de uma linha de `.env`. O
    // nome tem que cheirar a credencial: `PORT=3000` é legítimo e não casa.
    pattern:
      /^[A-Z][A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CREDENTIALS?)[A-Z0-9_]*\s*=\s*\S{12,}$/m,
  },
];

/**
 * Prompt injection: frases que só existem para instruir um modelo.
 *
 * Fora de memória isso é texto inofensivo. Dentro, é instrução com autoridade
 * de sistema — porque memória entra no prompt de toda sessão futura.
 */
const INJECTION_RULES: readonly Rule[] = [
  {
    code: "prompt_injection",
    rule: "ignore_previous",
    pattern: /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
  },
  {
    code: "prompt_injection",
    rule: "ignore_previous_pt",
    pattern: /\b(ignore|desconsidere|esqueça)\s+(as\s+)?(instruções|regras|ordens)\s+(anteriores|acima)/i,
  },
  { code: "prompt_injection", rule: "you_are_now", pattern: /\byou are now\b/i },
  { code: "prompt_injection", rule: "system_prompt_override", pattern: /\b(system prompt|override the system)\b/i },
  {
    code: "prompt_injection",
    rule: "hide_from_user",
    pattern: /\b(do not|don't|never)\s+(tell|inform|mention (this )?to)\s+(the\s+)?user/i,
  },
];

/**
 * Tempo relativo: **anota**, não bloqueia.
 *
 * Memória com data relativa envelhece mentindo — "hoje" vira mentira amanhã. É
 * a regra do prompt de consolidação do Compozy, aplicada na entrada em vez de
 * na limpeza.
 */
const RELATIVE_TIME_RULES: readonly Rule[] = [
  {
    code: "relative_time",
    rule: "relative_time_pt",
    pattern: /\b(hoje|ontem|amanhã|agora|esta semana|semana passada|mês passado|atualmente)\b/i,
  },
  {
    code: "relative_time",
    rule: "relative_time_en",
    pattern: /\b(today|yesterday|tomorrow|right now|this week|last week|currently)\b/i,
  },
];

/**
 * Unicode invisível e bidirecional — a classe **Trojan Source**.
 *
 * O texto lê de um jeito para você e de outro para o modelo. Aqui a ação certa
 * é **limpar**: numa memória legítima esses caracteres não carregam significado.
 */
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]|[\u{E0000}-\u{E007F}]/gu;

export function scanMemoryContent(text: string): ScanResult {
  const findings: ScanFinding[] = [];

  const cleaned = text.replace(INVISIBLE, "");
  if (cleaned !== text) {
    findings.push({ code: "invisible_unicode", rule: "trojan_source" });
  }

  for (const rule of [...SECRET_RULES, ...INJECTION_RULES]) {
    if (rule.pattern.test(cleaned)) findings.push({ code: rule.code, rule: rule.rule });
  }

  const blocking = findings.some(
    (finding) => finding.code === "secret" || finding.code === "prompt_injection",
  );
  if (blocking) return { verdict: "reject", findings, cleaned };

  for (const rule of RELATIVE_TIME_RULES) {
    if (rule.pattern.test(cleaned)) findings.push({ code: rule.code, rule: rule.rule });
  }

  return { verdict: findings.length === 0 ? "allow" : "annotate", findings, cleaned };
}

/** A frase que o usuário lê. Sem o conteúdo escaneado, nunca. */
export function describeFindings(findings: readonly ScanFinding[]): string {
  const secret = findings.filter((finding) => finding.code === "secret");
  if (secret.length > 0) {
    return `parece conter credencial (${secret.map((finding) => finding.rule).join(", ")})`;
  }
  const injection = findings.filter((finding) => finding.code === "prompt_injection");
  if (injection.length > 0) {
    return `parece conter instrução dirigida ao modelo (${injection
      .map((finding) => finding.rule)
      .join(", ")})`;
  }
  return findings.map((finding) => finding.rule).join(", ");
}
