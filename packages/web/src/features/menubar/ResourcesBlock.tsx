import { Block, BlockError, BlockLoading } from "./Block.js";
import { useResources } from "./queries.js";
import { cpuOf, memoryOf } from "./words.js";

const GROUPS = [
  { key: "daemon", name: "Daemon" },
  { key: "agents", name: "Agentes" },
  { key: "terminals", name: "Terminais" },
] as const;

/** CPU e memória dos três grupos, e os cinco processos que mais pesam (`038`, AC 40 e 44). */
export function ResourcesBlock() {
  const resources = useResources();

  return (
    <Block label="Recursos">
      {resources.isPending ? (
        <BlockLoading what="os recursos" />
      ) : resources.data === undefined ? (
        <BlockError what="os recursos" />
      ) : (
        <>
          <dl className="menubar__groups">
            {GROUPS.map(({ key, name }) => (
              <div key={key} className="menubar__group">
                <dt>{name}</dt>
                <dd className="menubar__num">{cpuOf(resources.data.groups[key].cpuPercent)}</dd>
                <dd className="menubar__num">{memoryOf(resources.data.groups[key].rssBytes)}</dd>
              </div>
            ))}
          </dl>
          {resources.data.top.length > 0 && (
            <ol className="menubar__list">
              {resources.data.top.map((process) => (
                <li key={process.pid} className="menubar__item">
                  <span className="menubar__label">{process.label}</span>
                  <span className="menubar__num">{memoryOf(process.rssBytes)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Block>
  );
}
