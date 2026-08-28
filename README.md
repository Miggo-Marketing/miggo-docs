# Documentação da plataforma Miggo

Site público de documentação da plataforma Miggo (`app.miggomkt.com.br`),
publicado com [Mintlify](https://mintlify.com).

O conteúdo é voltado para **clientes finais** e cobre onboarding, marca, produção
e aprovação de conteúdo, redes sociais, plano e suporte.

## Estrutura

```
docs.json            Configuração do site (tema, cores, navegação)
index.mdx            Página inicial
quickstart.mdx       Primeiros passos
onboarding.mdx       Etapas do fluxo de cadastro
visao-geral.mdx      Tour do menu da plataforma
marca/               Minha Marca e estilo visual
conteudo/            Conteúdos, aprovação, calendário, ideias e fotos
redes/               Conexão de redes sociais e publicação
conta/               Plano, perfil e notificações
ajuda/               Suporte, FAQ e solução de problemas
logo/                Logo da Miggo (versões clara e escura)
```

## Rodar localmente

```bash
npm i -g mint
mint dev
```

O site abre em `http://localhost:3000`.

## Publicar

O Mintlify publica automaticamente a cada push na branch principal.

## Antes de escrever

Leia o `AGENTS.md`: ele fixa a terminologia da plataforma, o estilo de escrita e
o que **não** deve ser documentado (áreas administrativas).
