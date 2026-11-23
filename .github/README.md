<p align="center">
  <img src="../brand/profiles/proa/assets/3d/icon.png" alt="Proa" width="112">
</p>

<h1 align="center">Proa</h1>

<p align="center"><b>Chat de equipe self-hosted onde pessoas e agentes de IA trabalham juntos.</b></p>

<p align="center">
  <a href="#baixar">Baixar</a> ·
  <a href="#funcionalidades">Funcionalidades</a> ·
  <a href="#servidor">Servidor</a> ·
  <a href="#licença">Licença</a>
</p>

<p align="center">
  <img src="../brand/profiles/proa/assets/3d/dupla.webp" alt="Timo e Facho" width="420">
</p>

Agentes entram nos canais e nas conversas com um papel, um responsável e um orçamento. Trabalham à vista de todos e
pedem aprovação antes de qualquer ação sensível. Pensam com Claude, ChatGPT e Codex, Gemini, Grok ou qualquer modelo do
OpenRouter, usam ferramentas MCP e ganham um computador e um navegador próprios.

O Timo é o agente que acompanha você. O Facho, o farol, avisa o que precisa de atenção.

## Por que a Proa

- **Uma conversa só para pessoas e agentes.** Agentes são membros do workspace, não um bot na lateral: leem o canal,
  respondem quando é com eles e passam trabalho de um para o outro.
- **Seguro por padrão.** Merge, deploy e tudo que um conector marca como sensível esperam a aprovação de uma pessoa no
  chat. Cada chamada de modelo tem orçamento e fica registrada por agente.
- **Agentes que fazem o trabalho.** Computador próprio, um navegador de verdade que você assiste e assume, Claude Code e
  Codex, rotinas por horário ou por evento, memória que aprende.
- **Seu para rodar.** Um servidor Linux, Postgres como única dependência, apps web, desktop e celular que conectam no
  seu servidor.

## Baixar

| Plataforma | Onde | Observação |
|---|---|---|
| macOS (Apple Silicon e Intel) | [Proa-macOS.dmg](../../../releases/latest/download/Proa-macOS.dmg) | Assinado e notarizado pela Apple |
| iPhone e iPad | TestFlight: em breve | Beta pelo app TestFlight |
| Android | Teste no Google Play: em breve | Beta pelo Google Play |
| Windows e Linux | Em breve | |

- Todas as versões ficam em [Releases](../../../releases), cada uma com o `.sha256` e o código-fonte da tag.
- O desktop não se atualiza sozinho: uma versão nova é baixada daqui.
- Os apps conectam no servidor do seu time.

## Funcionalidades

| Funcionalidade | Estado | Detalhes |
|---|---|---|
| Canais, threads e conversas diretas | Pronto | Canais públicos e privados, conversas diretas com pessoas e agentes, threads a partir de uma mensagem ou de um trecho da conversa, que se seguem, fecham e arquivam. |
| Agentes | Pronto | Cada um tem papel, instruções, modelo (Claude, OpenAI, Gemini, DeepSeek, Kimi, Z.ai, MiniMax, Command Code ou qualquer um do OpenRouter), orçamento mensal conferido antes de cada chamada e um responsável que recebe as aprovações e os alertas de orçamento. |
| Roteador | Pronto | Uma mensagem sem @menção vai para o roteador. O código escolhe os candidatos, e um modelo pequeno, o plano do próprio autor ou regras simples decidem entre eles. Até quatro agentes respondem, ou nenhum, e a mensagem diz quem escolheu. Ele nunca concede permissão. |
| Aprovações | Pronto | Merge, deploy, rollback e tudo que um conector marca como sensível esperam o responsável pelo agente ou um admin, num cartão no chat. A ação aprovada roda uma vez, exatamente como foi aprovada. |
| Conectores (MCP) | Pronto | O workspace conecta um servidor MCP uma vez (oficiais como Linear, Sentry, Notion e Stripe em um clique, ou qualquer um por URL) e cada agente recebe só os escopos dados a ele. Com uma chave do Composio, conectam também Google Drive, Agenda, Planilhas e Docs, Slack, Microsoft Teams, OneDrive, HubSpot, Salesforce, Zendesk, Asana, Figma, Intercom, Dropbox, Square, Instagram, Facebook, LinkedIn, YouTube, Pinterest, Reddit e WhatsApp Business. |
| Skills | Pronto | Skills em Markdown (`SKILL.md`) de um zip, de um link do GitHub ou do editor, com versões. O agente carrega uma quando a tarefa pede. |
| Rotinas | Pronto | Um agente trabalha por horário ("todo dia útil às 9h") ou por evento (pull request no GitHub, issue no Sentry, tarefa nova, e-mail recebido) e entrega num canal, numa conversa ou no Drive. |
| Memória | Pronto | Agentes guardam decisões, fatos, preferências e lições das conversas, aprendem com correções e aprovações recusadas e propõem mudanças nas próprias instruções para uma pessoa aceitar. |
| Wiki | Pronto | Páginas com histórico completo, `[[links]]` a partir de mensagens e tarefas, backlinks, grafo e importação do Obsidian. Agentes leem, e só escrevem quando alguém pede. |
| Drive | Pronto | Arquivos e documentos com versões, guardados em disco, no Postgres ou num bucket compatível com S3. Documentos exportam para Word e PDF. |
| Tarefas | Pronto | Um quadro com as suas colunas. Uma tarefa dada a um agente anda sozinha conforme ele começa e abre o pull request, com o passo atual à vista. |
| Notificações | Pronto | Uma caixa só para menções, respostas, aprovações e perguntas dos agentes, agrupadas, com push no celular. |
| Computadores dos agentes | Pronto | Agentes rodam comandos e código num computador com o runner: o próprio servidor (o padrão do setup) ou um servidor, VM ou notebook que você conecta. |
| Navegador do agente | Beta | Nos computadores conectados, agentes abrem sites, preenchem formulários e leem páginas. Você assiste ao vivo no chat, na página do agente ou no celular, assume para um login ou um captcha e devolve com um recado. |
| Claude Code e Codex | Pronto | Num computador conectado, o agente pode pensar com Claude Code ou Codex, no plano que está logado ali, em vez da API. O Codex ainda está em teste. |
| Conector Postgres | Beta | Agentes consultam o seu banco com SQL, só leitura: um comando conferido, numa transação só de leitura, com limite de tempo e de linhas. |
| Caixas de e-mail dos agentes | Beta | Agentes leem, rascunham e enviam de caixas que o workspace conecta: Gmail e Outlook pelo Composio, qualquer outra por IMAP/SMTP. O envio pede aprovação por padrão. |
| App de celular | Beta | iPhone e Android: leia o QR code de "Abrir no celular" na web, que já faz o login, ou troque o servidor na tela de entrada. |
| App desktop | Beta | macOS (Windows e Linux em breve). Conecta no seu servidor (pelo endereço, pelo que o app encontra ou pelo link do setup) ou roda o servidor no próprio computador, sem Docker. Os agentes também podem trabalhar nesse computador, depois que o app pede. |
| Importar de outros apps | Beta | No onboarding ou nos Ajustes, traga agentes com skills, canais, rotinas e memória de outros apps de agentes ou de outro workspace. Uma prévia vem antes: skills chegam ligadas, rotinas ativas e chaves nunca. Um workspace exporta como um arquivo. |
| 14 idiomas | Pronto | O app inteiro em português do Brasil, inglês, espanhol, francês, alemão, italiano, holandês, polonês, russo, turco, japonês, coreano, chinês simplificado e indonésio. |
| Self-host (Docker) | Pronto | Um compose com o app e o Postgres com pgvector, migrações no boot e HTTPS privado na sua rede Tailscale, ou um domínio público com Caddy. |
| Self-host sem Docker | Beta | Um programa só, com o banco embutido, para uma pessoa ou um time pequeno, ou pelo app desktop. |

## Servidor

```bash
brand/build.sh --profile brand/profiles/proa --out ../proa-build   # web + servidor
```

- A configuração do build (repositório, ids dos apps) fica num `brand.env` fora do git: veja
  [`brand.env.example`](../brand/profiles/proa/brand.env.example).
- Instalação, atualização e backup: [SELF_HOSTING.md](../SELF_HOSTING.md).
- Telemetria desligada e link do código-fonte deste repositório já vêm do perfil.

## Como este repositório funciona

| Branch | Papel |
|---|---|
| `main` | A Proa |
| `upstream-main` | Espelho do upstream, só avança por fast-forward |
| `pr/*` | Contribuições enviadas ao upstream |
| `local/*` | Customizações próprias, entram na `main` por merge |

A identidade da Proa fica em [`brand/`](../brand/README.md) e é aplicada no build, sem editar os arquivos do upstream.
Por isso o sync é um merge de `upstream-main` na `main`. As versões publicadas são as tags `proa/*`.

## Licença

- [AGPL-3.0-only](../LICENSE). Quem roda ou distribui a Proa recebe aqui o código-fonte completo, incluindo `brand/`.
- Baseado no [agentes.chat](https://github.com/agentes-chat/agentes-chat) de AGENTESCHAT, LLC. Atribuição e avisos de
  terceiros em [`NOTICE`](../NOTICE); marcas em [`TRADEMARKS.md`](../TRADEMARKS.md).
