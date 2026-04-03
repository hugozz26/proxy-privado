const http = require('http');
const WebSocket = require('ws');
const { execSync } = require('child_process');
const readline = require('readline'); // Adicionamos leitura do terminal
const os = require('os');

// Gerando o "RG" unico do Computador (Baseado no nome do PC para não mudar se o exe fechar)
const MEU_RG = Buffer.from(os.hostname() + '-' + os.userInfo().username).toString('hex');

const LOCAL_PORT = 8080;
// Coloque aqui o seu domínio que está no Cloudflare!
let REMOTE_WS_URL = 'wss://hackmail.eu.org'; 

console.log(`=========================================`);
console.log(`🛡️  GhostProxy - Cliente Privado`);
console.log(`=========================================`);

// Vai criar o terminal de pergunta da senha
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Começa tudo somente DEPOIS que o usuário bater Enter na senha
rl.question('🔑 Digite seu Token de Acesso (Senha): ', (senhaDigitada) => {
    // Acopla a senha e o RG do PC no link
    REMOTE_WS_URL = `${REMOTE_WS_URL}/?token=${senhaDigitada}&rg=${MEU_RG}`;
    console.log(`⏳ Verificando credenciais para o PC [${MEU_RG}]...`);
    
    // Liga o servidor na porta 8080 (invisível de fora) e ativa o proxy no Windows
    server.listen(LOCAL_PORT, '127.0.0.1', () => {
        console.log(`📡 Servidor Proxy Local escutando na porta ${LOCAL_PORT}`);
        setWindowsProxy(true);
    });
});

// ----- CONFIGURANDO O PROXY DO WINDOWS AUTOMATICAMENTE -----
function setWindowsProxy(enable) {
    try {
        if (enable) {
            console.log(`⚙️  Ativando Proxy no Windows para 127.0.0.1:${LOCAL_PORT}...`);
            execSync('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f');
            execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d "127.0.0.1:${LOCAL_PORT}" /f`);
            console.log(`✅ O Sistema agora esta usando o nosso proxy!`);
        } else {
            console.log(`\n🛑 Desativando Proxy do Windows (Voltando ao normal)...`);
            execSync('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f');
            console.log(`✅ Internet restaurada para o padrao.`);
        }
    } catch (err) {
        console.error('❌ Erro ao mudar proxy do Windows (tente rodar como admin se falhar muito):', err.message);
    }
}

// Quando você apertar Ctrl+C ou fechar a janela, ele restaura a internet normal!
process.on('SIGINT', () => {
    setWindowsProxy(false);
    process.exit();
});
process.on('exit', () => setWindowsProxy(false));

// ----- CRIANDO O SERVIDOR PROXY LOCAL (Ouvindo o Navegador) -----
const server = http.createServer((req, res) => {
    // Para requisições HTTP puro (raras hoje em dia, quase tudo é HTTPS)
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Use requisições HTTPS e o método CONNECT.');
});

// A mágica acontece aqui: O método CONNECT é o que os navegadores usam para HTTPS (99% da internet hoje)
server.on('connect', (req, clientSocket, head) => {
    const targetUrl = req.url; // Ex: 'google.com:443'
    console.log(`[Requisito Local] Se conectando a: ${targetUrl}`);

    // Cria a conexãoWebSocket secreta lá pro seu Cloudflare/Wispbyte
    const ws = new WebSocket(REMOTE_WS_URL, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Upgrade': 'websocket',
            'Connection': 'Upgrade'
        },
        followRedirects: true // Se for um 302, tenta seguir!
    });

    // Vamos rastrear EXATAMENTE quem está redicionando e devolvendo 302
    ws.on('unexpected-response', (request, response) => {
        console.error(`[Redirecionamento/Bloqueio WS] Cloudflare/Wispbyte devolveu: ${response.statusCode}`);
        if(response.headers['location']) {
            console.error(`👉 Ele está tentando redigirigir para: ${response.headers['location']}`);
        }
        if(response.headers['server']) {
             console.error(`🛑 Quem bloqueou: ${response.headers['server']}`);
        }
    });

    ws.on('open', () => {
        // Manda pro nosso Servidor na Wispbyte: "Ei, me conecte nisso aqui"
        ws.send(`CONNECT ${targetUrl}`);
    });

    // Quando nosso servidor Wispbyte responder, lidamos com os dados
    ws.once('message', (msg) => {
        if (msg.toString() === 'CONNECTED') {
            // O servidor Wispbyte conseguiu conectar ao destino real.
            // Avisamos o navegador local: "Conexão bem-sucedida! Pode mandar os dados."
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            
            // O navegador da escola conectou via WebSocket!
            // Agora, tudo que vier do WebSocket vai pro navegador...
            ws.on('message', (dataChunk) => {
                if (clientSocket.writable) clientSocket.write(dataChunk);
            });

            // ...e tudo que vier do navegador vai pro WebSocket
            clientSocket.on('data', (chunk) => {
                if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
            });

            // Se o navegador enviou dados "head" junto com a conexão inicial
            if (head && head.length > 0) {
                ws.send(head);
            }
        } else {
            clientSocket.end();
        }
    });

    ws.on('error', (err) => {
       console.error(`[Erro WebSocket] -> ${REMOTE_WS_URL}`, err.message);
       clientSocket.end();
    });

    ws.on('close', () => {
        clientSocket.end();
    });

    clientSocket.on('error', () => ws.close());
    clientSocket.on('close', () => ws.close());
});
