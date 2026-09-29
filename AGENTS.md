# Instruções do projeto de documentação

## Sobre este projeto

- Site de documentação da **plataforma Miggo** (`app.miggomkt.com.br`), feito em [Mintlify](https://mintlify.com).
- Publicado em **`ajuda.miggomkt.com.br`** — a central de ajuda do cliente, pública e sem login.
  É o link do item **Central de ajuda** no menu da plataforma. A documentação do
  desenvolvedor é outro site (`developer.miggomkt.com.br`) e não se mistura com esta.
- Público-alvo: **clientes finais da Miggo**. Não é documentação de API nem de uso interno.
- Páginas são arquivos MDX com frontmatter YAML. A configuração fica em `docs.json`.
- Todo o conteúdo é em **português do Brasil**.

## Terminologia

Use sempre o nome que aparece no menu da plataforma:

| Use | Não use |
| --- | --- |
| Meus conteúdos | Kanban, board, quadro de posts |
| Minhas fotos | Biblioteca de mídias, media library |
| Ideias de post | Sugestão de pauta, agenda |
| Minha Marca | Briefing, brandkit |
| Meu plano | Faturamento, billing |
| Calendário | Calendário editorial (ok no corpo do texto) |
| Estilo visual | Grid, mosaico (ok no corpo do texto) |

Outros termos: "post" e "conteúdo" são intercambiáveis; "equipe Miggo" (nunca "nós"
da empresa em primeira pessoa nos títulos).

## Preferências de estilo

- Voz ativa e segunda pessoa ("você").
- Frases curtas — uma ideia por frase.
- Títulos em caixa baixa, estilo frase.
- **Negrito** para elementos da interface: clique em **Conectar**.
- `Código` para nomes de arquivo, comandos e caminhos.
- Links diretos para a plataforma sempre no formato
  `https://app.miggomkt.com.br/app/<rota>`, seguindo as rotas reais do frontend.

## Limites de conteúdo

- **Não documente áreas administrativas** (`/admin/*`): gestão de clientes,
  faturamento global, logs de integração, gerenciamento de time e planos.
- Não cite dados de clientes, métricas globais da plataforma nem valores de
  faturamento.
- Nunca instrua o usuário a compartilhar senha, código de verificação ou dados de
  cartão.
- Não invente funcionalidades: confirme no frontend (`frontend-miggo`) ou no
  backend (`backend-miggo`) antes de documentar um comportamento.

## Sincronia com o assistente de suporte

O **Miggo AI** (chat da Central de Suporte, dentro da plataforma) responde a partir
de um prompt de sistema que vive no backend:
`backend-miggo/app/account/support_views.py` → `SUPPORT_SYSTEM_PROMPT`.

Esse prompt é escrito a partir **desta** documentação: mesma terminologia, mesmas
rotas (`/app/<rota>`) e links para os artigos correspondentes em
`ajuda.miggomkt.com.br`. Ao mudar um comportamento documentado aqui, atualize o
prompt junto — senão o chat passa a orientar diferente do que a central de ajuda diz.
