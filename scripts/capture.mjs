/**
 * Captura os prints que ilustram a documentação.
 *
 * Dois passos, porque o login é feito por você (o agente nunca digita senha):
 *
 *   node scripts/capture.mjs login   # abre o navegador; você entra na conta
 *   node scripts/capture.mjs shots   # reusa a sessão e tira os prints
 *
 * Variáveis de ambiente:
 *   BASE_URL   origem da plataforma (padrão: http://localhost:5173, o dev server
 *              do frontend). Para capturar do staging:
 *              BASE_URL=https://teste.miggomkt.com.br node scripts/capture.mjs shots
 *   HEADED=1   mostra o navegador durante o `shots` (útil para depurar)
 *   PNG=1      salva em PNG em vez de JPEG
 */

import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ESTADO = path.join(RAIZ, '.auth', 'state.json');
const SAIDA = path.join(RAIZ, 'images');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const VIEWPORT = { width: 1440, height: 900 };
const ESCALA = 2; // prints em 2x, para não ficarem borrados em tela retina

// JPEG a 92 em 2x pesa ~5x menos que PNG e continua nítido nos textos da
// interface. PNG=1 força PNG (útil se algum print sair com artefato).
const USAR_PNG = process.env.PNG === '1';
const EXT = USAR_PNG ? 'png' : 'jpg';
const OPCOES_IMG = USAR_PNG ? {} : { type: 'jpeg', quality: 92 };

/** Espera a tela assentar: rede parada + um respiro para animações e gráficos. */
async function assentar(page, ms = 1200) {
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(ms);
}

/**
 * Troca dados reais por fictícios direto no DOM, logo antes do print.
 *
 * Roda no navegador: percorre só nós de texto (nunca script/style, para não
 * quebrar a página) aplicando as substituições literais do mock.json e os
 * padrões de e-mail, telefone e CPF/CNPJ.
 */
async function mocar(page, mock) {
    await page.evaluate((cfg) => {
        const { substituicoes = {}, identidade = {}, ocultar = [] } = cfg;

        const trocar = (texto) => {
            let saida = texto;
            // Os padrões vêm ANTES das substituições literais: trocar o nome da
            // marca primeiro quebraria o e-mail que a contém
            // (fulano@ibarco.com.br), e aí o regex não casaria mais.
            if (identidade.email) {
                saida = saida.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, identidade.email);
            }
            if (identidade.telefone) {
                // Números crus com DDI vêm primeiro (5584991923640): o padrão
                // formatado casaria só um pedaço e deixaria dígitos órfãos.
                saida = saida.replace(/\b\d{10,13}\b/g, identidade.telefone);
                saida = saida.replace(/\+?\d{2}\s?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, identidade.telefone);
                saida = saida.replace(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, identidade.telefone);
            }
            if (identidade.documento) {
                saida = saida
                    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, identidade.documento)
                    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, identidade.documento);
            }
            for (const [de, para] of Object.entries(substituicoes)) {
                saida = saida.split(de).join(para);
            }
            return saida;
        };

        const caminhador = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: (no) => {
                const pai = no.parentNode?.nodeName;
                if (pai === 'SCRIPT' || pai === 'STYLE' || pai === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
                return no.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            },
        });

        const nos = [];
        for (let no = caminhador.nextNode(); no; no = caminhador.nextNode()) nos.push(no);
        for (const no of nos) {
            const novo = trocar(no.nodeValue);
            if (novo !== no.nodeValue) no.nodeValue = novo;
        }

        // Atributos que aparecem na tela (placeholder, title, alt, value).
        for (const el of document.querySelectorAll('[placeholder],[title],[alt],input[value]')) {
            for (const attr of ['placeholder', 'title', 'alt', 'value']) {
                const v = el.getAttribute(attr);
                if (v) el.setAttribute(attr, trocar(v));
            }
        }

        // Campos controlados pelo React guardam o texto na PROPRIEDADE .value,
        // não no atributo — sem isto, formulários preenchidos (nome, e-mail do
        // usuário logado) vazam dado real mesmo com o resto mascarado.
        for (const el of document.querySelectorAll('input, textarea')) {
            if (typeof el.value === 'string' && el.value) {
                const novo = trocar(el.value);
                if (novo !== el.value) el.value = novo;
            }
        }

        // Seletores que você quiser esconder por completo.
        for (const seletor of ocultar) {
            for (const el of document.querySelectorAll(seletor)) el.style.visibility = 'hidden';
        }
    }, mock);
}

/**
 * Procura dados reais que tenham escapado do mock, já com a página mascarada.
 *
 * Confere o texto visível e o valor dos campos — foi por um <input> controlado
 * pelo React que o e-mail real vazou na primeira rodada. Devolve os termos
 * encontrados para o relatório; vazio significa tela limpa.
 */
async function checarVazamento(page, termos) {
    if (!termos.length) return [];
    return page.evaluate((lista) => {
        const partes = [document.body.innerText];
        for (const el of document.querySelectorAll('input, textarea')) {
            if (typeof el.value === 'string') partes.push(el.value);
            const ph = el.getAttribute('placeholder');
            if (ph) partes.push(ph);
        }
        const texto = partes.join('\n').toLowerCase();
        return lista.filter((t) => texto.includes(t.toLowerCase()));
    }, termos);
}

/**
 * Placeholder SVG determinístico: a mesma URL sempre gera a mesma arte, então
 * a galeria fica variada mas estável entre execuções.
 */
function placeholder(url) {
    let h = 0;
    for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) >>> 0;

    const paletas = [
        ['#174c54', '#34b6c6'], ['#bf5a1e', '#f2994a'], ['#1a365d', '#4285f4'],
        ['#3d295c', '#8b5cf6'], ['#115e59', '#10b981'], ['#7c2d12', '#fb923c'],
    ];
    const [a, b] = paletas[h % paletas.length];
    const id = `g${h}`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
</linearGradient></defs>
<rect width="400" height="500" fill="url(#${id})"/>
<circle cx="200" cy="215" r="46" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="6"/>
<path d="M176 232l18-18 15 15 12-12 23 23z" fill="#fff" fill-opacity=".55"/>
<circle cx="215" cy="198" r="8" fill="#fff" fill-opacity=".55"/>
<text x="200" y="310" font-family="Segoe UI,Arial" font-size="19" fill="#fff"
 fill-opacity=".75" text-anchor="middle">imagem de exemplo</text></svg>`;
}

/**
 * Substitui as imagens do acervo real por placeholders.
 *
 * A conta usada nos prints tem centenas de imagens reais (artes de marca e
 * fotos de pessoas identificáveis) que não podem aparecer numa doc pública.
 * Interceptar na rede cobre galeria, cards e miniaturas de uma vez — nenhum
 * byte da imagem original chega a ser desenhado.
 */
async function protegerImagens(contexto, preservar) {
    await contexto.route('**/*', async (rota) => {
        const req = rota.request();
        const url = req.url();
        // 'media' cobre os <video> do acervo: o navegador desenha o primeiro
        // quadro como prévia, então um vídeo vaza imagem igual a uma foto.
        const tipo = req.resourceType();
        const ehAcervo = (tipo === 'image' || tipo === 'media') && /\/media\//.test(url);
        const preservada = preservar.some((p) => url.includes(p));

        if (!ehAcervo || preservada) return rota.continue();

        // Vídeo não pode ser respondido com SVG (o player quebraria e mostraria
        // o controle nativo); devolvemos vazio, que renderiza um bloco neutro.
        if (tipo === 'media') {
            return rota.fulfill({ status: 200, contentType: 'video/mp4', body: '' });
        }

        await rota.fulfill({
            status: 200,
            contentType: 'image/svg+xml',
            body: placeholder(url),
        });
    });
}

/**
 * Passo 1 — você faz login, o script só guarda a sessão.
 *
 * O sinal de sucesso é o token JWT em localStorage, NÃO a mudança de URL:
 * o login pelo Google sai do domínio da Miggo, e senha errada mantém você
 * em /signin. Só o token prova que a autenticação deu certo.
 */
async function login() {
    const CHAVE_TOKEN = 'miggo_access_token';
    const ESPERA_MAX = 900000; // 15 min — tentativas erradas não custam nada

    const navegador = await chromium.launch({ headless: false });
    const contexto = await navegador.newContext({ viewport: VIEWPORT });
    const page = await contexto.newPage();

    await page.goto(`${BASE_URL}/signin`);

    console.log('\n──────────────────────────────────────────────');
    console.log(`  Faça login em ${BASE_URL}/signin na janela aberta.`);
    console.log('  Pode errar a senha e tentar de novo, ou usar o Google:');
    console.log('  o script espera até a autenticação dar certo de verdade.');
    console.log('  A janela só fecha quando a sessão estiver válida.');
    console.log('  (Ctrl+C aqui cancela sem salvar nada.)');
    console.log('──────────────────────────────────────────────\n');

    const limite = Date.now() + ESPERA_MAX;
    let autenticado = false;

    while (Date.now() < limite) {
        await page.waitForTimeout(2000);

        // A janela pode estar no Google, ou a página sendo recarregada:
        // qualquer erro aqui é transitório, então só seguimos tentando.
        let token = '';
        try {
            const url = new URL(page.url());
            if (url.origin !== BASE_URL) continue; // ainda fora da Miggo (SSO)
            token = await page.evaluate((k) => localStorage.getItem(k) || '', CHAVE_TOKEN);
        } catch {
            if (page.isClosed()) {
                console.error('\nJanela fechada antes de o login concluir. Nada foi salvo.');
                await navegador.close().catch(() => {});
                process.exit(1);
            }
            continue;
        }

        if (token) {
            autenticado = true;
            break;
        }
    }

    if (!autenticado) {
        console.error('\nTempo esgotado sem login válido. Nada foi salvo.');
        await navegador.close().catch(() => {});
        process.exit(1);
    }

    await assentar(page);
    await mkdir(path.dirname(ESTADO), { recursive: true });
    await contexto.storageState({ path: ESTADO });

    // Confere que o token realmente entrou no arquivo antes de dar por pronto.
    const salvo = JSON.parse(await readFile(ESTADO, 'utf-8'));
    const temToken = (salvo.origins || []).some((o) =>
        (o.localStorage || []).some((i) => i.name === CHAVE_TOKEN && i.value)
    );

    if (!temToken) {
        console.error('Sessão salva sem token. Rode o login de novo.');
        await navegador.close().catch(() => {});
        process.exit(1);
    }

    console.log(`\nSessão válida salva em ${path.relative(RAIZ, ESTADO)}`);
    await navegador.close();
}

/** Passo 2 — percorre a lista de telas e salva os PNGs. */
async function shots() {
    if (!existsSync(ESTADO)) {
        console.error('Sessão não encontrada. Rode primeiro: node scripts/capture.mjs login');
        process.exit(1);
    }

    // Sem token, todas as rotas caem em /signin e os prints saem errados.
    // Melhor parar aqui do que gerar 11 telas de login.
    const sessao = JSON.parse(await readFile(ESTADO, 'utf-8'));
    const temToken = (sessao.origins || []).some((o) =>
        (o.localStorage || []).some((i) => i.name === 'miggo_access_token' && i.value)
    );
    if (!temToken) {
        console.error('A sessão salva não tem token de acesso — o login não foi concluído.');
        console.error('Rode de novo: node scripts/capture.mjs login');
        process.exit(1);
    }

    const telas = JSON.parse(await readFile(path.join(RAIZ, 'scripts', 'shots.json'), 'utf-8'));
    const mock = JSON.parse(await readFile(path.join(RAIZ, 'scripts', 'mock.json'), 'utf-8'));
    const navegador = await chromium.launch({ headless: !process.env.HEADED });
    const contexto = await navegador.newContext({
        storageState: ESTADO,
        viewport: VIEWPORT,
        deviceScaleFactor: ESCALA,
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        colorScheme: 'light',
    });

    // Congela animações: evita print pego no meio de uma transição.
    await contexto.addInitScript(() => {
        const css = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}';
        document.addEventListener('DOMContentLoaded', () => {
            const tag = document.createElement('style');
            tag.textContent = css;
            document.head.appendChild(tag);
        });
    });

    // Telas públicas (login) precisam de contexto SEM sessão: logado, /signin
    // redireciona para o dashboard e o print sai da tela errada.
    const contextoAnonimo = await navegador.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: ESCALA,
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        colorScheme: 'light',
    });

    const preservar = mock.preservarImagens || [];
    await protegerImagens(contexto, preservar);
    await protegerImagens(contextoAnonimo, preservar);

    await mkdir(SAIDA, { recursive: true });
    const pageAutenticada = await contexto.newPage();
    const pageAnonima = await contextoAnonimo.newPage();
    const relatorio = [];

    for (const tela of telas) {
        const destino = path.join(SAIDA, `${tela.file}.${EXT}`);
        const page = tela.auth === false ? pageAnonima : pageAutenticada;
        try {
            await page.goto(`${BASE_URL}${tela.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await assentar(page);

            const atual = new URL(page.url()).pathname;
            // Se a plataforma redirecionou (sessão caiu, onboarding pendente,
            // assinatura inativa), o print seria da tela errada — melhor avisar.
            const redirecionou = tela.auth !== false && !atual.startsWith(tela.path);

            await mocar(page, mock);
            const vazou = await checarVazamento(page, mock.termosProibidos || []);
            await page.screenshot({ path: destino, fullPage: false, ...OPCOES_IMG });

            const problemas = [];
            if (redirecionou) problemas.push(`REDIRECIONOU para ${atual}`);
            if (vazou.length) problemas.push(`VAZOU: ${vazou.join(', ')}`);

            relatorio.push({
                arquivo: `${tela.file}.${EXT}`,
                titulo: tela.titulo,
                rota: tela.path,
                url_final: atual,
                status: problemas.length ? problemas.join(' | ') : 'ok',
            });
            console.log(`${problemas.length ? '!' : 'v'} ${tela.titulo} -> images/${tela.file}.${EXT}`
                + (problemas.length ? `  [${problemas.join(' | ')}]` : ''));
        } catch (erro) {
            relatorio.push({ arquivo: `${tela.file}.${EXT}`, titulo: tela.titulo, rota: tela.path, status: `FALHOU: ${erro.message}` });
            console.log(`x ${tela.titulo} -> ${erro.message}`);
        }
    }

    await writeFile(path.join(SAIDA, '_relatorio.json'), JSON.stringify(relatorio, null, 2), 'utf-8');
    await navegador.close();
    console.log(`\nRelatório: images/_relatorio.json`);
}

const comando = process.argv[2];
if (comando === 'login') await login();
else if (comando === 'shots') await shots();
else {
    console.log('Uso: node scripts/capture.mjs <login|shots>');
    process.exit(1);
}
