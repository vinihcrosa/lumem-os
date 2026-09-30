import { Skeleton } from "../../ui/index.js";
import { useDaemonSettings, useSetDaemonSettings } from "../update/index.js";
import { SettingRow, SettingSection } from "./SettingsPanel.js";

/**
 * As preferências de versão da máquina (`038`, Parte 2): o interruptor de procurar
 * versão nova.
 *
 * **Desligado à força** é o caso que exige texto: `LUMEM_NO_UPDATE_CHECK=1` no
 * ambiente do daemon vale acima de qualquer coisa que esta tela grave, e um
 * interruptor que simplesmente não obedecesse seria pior que um que diz por quê.
 * Note que o valor **gravado** continua sendo mostrado nos outros casos: o que a
 * pessoa pediu é dela, e o ambiente é só quem o cala.
 */
export function UpdateSettings() {
  const settings = useDaemonSettings();
  const save = useSetDaemonSettings();

  const description = (
    <>
      O daemon pergunta ao registry do npm, a cada 6 h, qual é a última versão. É um{" "}
      <code>GET</code> sem identificador — nada de telemetria.
    </>
  );

  if (settings.isPending) {
    return (
      <SettingSection title="Atualizações" description={description}>
        <Skeleton label="lendo as preferências do daemon" />
      </SettingSection>
    );
  }

  if (settings.data === undefined) {
    return (
      <SettingSection title="Atualizações" description={description}>
        <p className="set__err" role="alert">
          {settings.error?.message ?? "o daemon não respondeu"}
        </p>
      </SettingSection>
    );
  }

  const { updateCheck, updateCheckForcedOff } = settings.data;
  const on = updateCheck && !updateCheckForcedOff;

  return (
    <SettingSection title="Atualizações" description={description}>
      <div className="set__rows">
        <SettingRow
          label="Procurar versão nova"
          description={
            <>
              Sem isto o Lumem só sabe da versão nova se você rodar <code>lumem upgrade</code>.
            </>
          }
          owner="máquina"
        >
          <label className="set__switch">
            <input
              type="checkbox"
              aria-label="Procurar versão nova"
              checked={on}
              disabled={updateCheckForcedOff}
              onChange={(event) => {
                save.mutate({ updateCheck: event.target.checked });
              }}
            />
            <span>
              {updateCheckForcedOff
                ? "desligado por LUMEM_NO_UPDATE_CHECK"
                : on
                  ? "ligado"
                  : "desligado"}
            </span>
          </label>
        </SettingRow>
      </div>
    </SettingSection>
  );
}
