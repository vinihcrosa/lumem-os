# Lumem-Os

O lumem-os é um harness para orquestração de agentes de IA, ele é inspirado em outros orquestradores como o [compozy](https://www.compozy.com/), [superset](https://superset.sh/) e [conductor](https://www.conductor.build/), esses projetos são uma inspiração, não deve copiar nada deles.

tem uma arquitetura cliente servidor, um servidor que tem os agentes de IA configurados, projetos e outras coisas, e um cliente para usar isso tudo.

o objetivo é poder usar multiplos agentes, em projetos diferentes, ele deve poder orquestrar worktrees, com agentes trabalhando em cada uma.

## O que eu penso para o lumem-os

ter uma hierarquia de workspaces, projetos, e worktrees.

um projeto sempre é um repositório git, dele saem as worktrees para poder trabalhar em tarefas diferentes.

Um workspace é um conjunto de projetos, isso será importante mais a frente.

inspirado no compozy eu quero um sistema de self learn, onde o harness aprende coisas sobre os projetos e o comportamento do usuário, mas isso a nível tanto de projeto quanto de workspace, dessa forma projetos diferentes que tem conexões, como um front e back da mesma aplicação fazem parte de um workspaces, e conhecimentos do produto e de processos devem ser lidados com ambos os projetos, por isso o conceito de workspace.

ter um sistema de controle de git, se abrir uma PR poder ver, mas não apenas no github, poder ver no gitlab, e em outros lugares, dependendo do projeto.

ter tarefas por workspaces, linkando com os projetos, dessa forma é possível criar tarefas em um workspace sobre algum projeto e um agente pegar essa tarefa e fazer. Um outro fluxo é um agente está fazendo uma tarefa e percebe que um outro projeto deve mudar alguma coisa, ele cria a tarefa para o outro projeto, e então ela pode ser implementada pelo projeto depois.

## Obsevações

esse é um projeto pessoal, não tem pretensão de ser comercial, eu quero satisfazer as minhas dores com o desenvolvimento com IA.