import { useUpdateStatus } from "../update/index.js";
import { Block, BlockError, BlockLoading } from "./Block.js";
import { sinceWords } from "./words.js";

/** `v0.6.1` e o que se sabe da próxima: `atualização disponível: v0.7.0` ou `em dia · verificado há 3 min` (AC 48). */
export function VersionLine({ now }: { now: number }) {
  const status = useUpdateStatus();
  const data = status.data;

  return (
    <Block label="Versão">
      {status.isPending ? (
        <BlockLoading what="a versão" />
      ) : data === undefined ? (
        <BlockError what="a versão" />
      ) : (
        <p className="menubar__item">
          <span className="menubar__label">{`v${data.current}`}</span>
          <span className="menubar__note">
            {data.updateAvailable && data.latest !== null
              ? `atualização disponível: v${data.latest}`
              : data.checkedAt === null
                ? "ainda não verificado"
                : `em dia · verificado ${sinceWords(data.checkedAt, now)}`}
          </span>
        </p>
      )}
    </Block>
  );
}
