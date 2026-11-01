# Documentação da plataforma Miggo

Site público de documentação da plataforma Miggo (`app.miggomkt.com.br`),
publicado com [Mintlify](https://mintlify.com).

O conteúdo é voltado para **clientes finais** e agências. Cada artigo cobre uma
tarefa. Ao mover ou apagar uma página, crie o redirect em `docs.json`.

## Estrutura

```
docs.json            Configuração do site (tema, cores, navegação, redirects)
index.mdx            Página inicial (hub por assunto)
novidades.mdx        Histórico de versões
comecar/             Como funciona, cadastro, primeiros passos e menu
marca/               Minha marca e estilo visual
conteudo/            Meus conteúdos, aprovação, ajuste, calendário, ideias e fotos
redes/               Conexão das redes, WhatsApp e publicação
resultados/          Meus resultados e Meu painel
conta/               Entrar, senha, perfil, plano, pagamento e benefícios
ajuda/               Problemas por sintoma, FAQ, segurança e suporte
agencias/            Área da agência (aba Para agências)
logo/                Logo da Miggo (versões clara e escura)
images/              Prints das telas usados nas páginas
scripts/             Captura automatizada dos prints (não vai para o site)
```

## Rodar localmente

```bash
npm i -g mint
mint dev
```

O site abre em `http://localhost:3000`.

## Atualizar os prints

```bash
npm install
npx playwright install chromium

node scripts/capture.mjs login   # você faz o login na janela que abrir
node scripts/capture.mjs shots   # captura as telas de scripts/shots.json
```

Por padrão aponta para `http://localhost:5173`. Para outro ambiente:
`BASE_URL=https://teste.miggomkt.com.br node scripts/capture.mjs shots`.

**Sobre privacidade.** As telas são capturadas de uma conta real, então o script
mascara os dados antes de cada print: troca nomes, e-mails, telefones e
documentos (`scripts/mock.json`) e substitui **toda imagem e vídeo do acervo**
por um placeholder — o acervo tem artes de marca e fotos de pessoas
identificáveis. No fim, cada tela é conferida contra a lista `termosProibidos`
e qualquer vazamento aparece como `VAZOU` no console e em
`images/_relatorio.json`.

Sempre revise os prints antes de publicar: o mascaramento cobre texto e
requisições de rede, mas não alcança texto embutido dentro de uma imagem.

## Publicar

O Mintlify publica automaticamente a cada push na branch principal.

## Antes de escrever

Leia o `AGENTS.md`: ele fixa a terminologia da plataforma, o estilo de escrita e
o que **não** deve ser documentado (áreas administrativas).
