const http = require('http');
const WebSocket = require('ws');
const net = require('net');
const admin = require('firebase-admin');

// 1. INICIALIZE O FIREBASE COM A SUA CHAVE SECRETA (Você precisa baixar o serviceAccountKey.json do Firebase)
// No Firebase vá em: Configurações do Projeto -> Contas de Serviço -> Gerar Nova Chave Privada
// Jogue o arquivo na Wispbyte e troque o nome abaixo:
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("🔥 Firebase Firestore conectado com Sucesso!");
} catch (e) {
    console.error("❌ ERRO GRAVE: Você não colocou o serviceAccountKey.json na pasta do servidor Wispbyte!", e.message);
}

const db = admin.firestore();

// Na Wispbyte, os painéis Pterodactyl geralmente usam SERVER_PORT
const port = process.env.SERVER_PORT || process.env.PORT || 8080;

// Servidor HTTP normal apenas para responder se alguém acessar o site pelo navegador (disfarce)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Servico operacional - ' + new Date().toISOString());
});

// LISTA BRANCA DE PCs AUTORIZADOS (In-Memory Cache para não travar o Firebase)
const pcAutorizados = new Map();

// Anexando o Servidor WebSocket na mesma porta
const wss = new WebSocket.Server({ 
    server,
    verifyClient: async (info, callback) => {
        const params = new URL(info.req.url, `http://${info.req.headers.host}`).searchParams;
        const clientToken = params.get('token');
        const clientRG = params.get('rg'); // O 'RG' do computador enviado pelo nosso .exe
        
        const clienteIp = info.req.headers['cf-connecting-ip'] || info.req.headers['x-forwarded-for'];
        const agora = Date.now();

        if (!clientToken || !clientRG) {
            console.log(`[Segurança] 🔴 Sem Token ou sem RG. Bloqueado.`);
            return callback(false, 401, 'Unauthorized');
        }

        // ==========================================================
        // 1. MODO JATO (LISTA BRANCA NA MEMÓRIA)
        // O Navegador abre 50 conexões rápido, não vamos pro banco!
        // ==========================================================
        if (pcAutorizados.has(clientToken)) {
            const pcDaLista = pcAutorizados.get(clientToken);

            if (agora > pcDaLista.expiresAt) {
                console.log(`[Cache] ⏰ Token Expirado na Memória! Deletando.`);
                pcAutorizados.delete(clientToken);
                return callback(false, 403, 'Token Expired');
            }

            if (pcDaLista.rg !== clientRG) {
                console.log(`[Cache] 🚔 O RG de Invasor [${clientRG}] tentou usar o Token do PC [${pcDaLista.rg}]. Bloqueado!`);
                return callback(false, 403, 'Token em uso por outro aparelho');
            }

            // O RG e a Senha bateram com a Lista Branca? Liberação imediata sem Firestore!
            return callback(true);
        }

        // ==========================================================
        // 2. MODO LENTO (BANCO DE DADOS - Primeira vez que o PC liga)
        // ==========================================================
        try {
            console.log(`🔍 [Firestore] Verificando Token Inédito: ${clientToken} para o RG: ${clientRG}`);
            const tokenDoc = await db.collection('proxy_tokens').doc(clientToken).get();

            if (!tokenDoc.exists) {
                console.log(`[Segurança] 🔴 Token Inexistente.`);
                return callback(false, 401, 'Invalid Token');
            }

            const data = tokenDoc.data();

            if (agora > data.expiresAt) {
                return callback(false, 403, 'Token Expired');
            }

            // 3. Verificamos se lá no banco já tem um RG dono dessa senha. Se não for ele, barra.
            if (data.computadorRg && data.computadorRg !== clientRG) {
                console.log(`[Banco] 🕵️ Tentativa de usar token do PC [${data.computadorRg}] no PC [${clientRG}]!`);
                return callback(false, 403, 'Token em uso por outro RG');
            }

            // 4. É a primeira vez? Vamos colar esse RG no Token lá no Firebase!
            if (!data.computadorRg) {
                console.log(`🛡️ Registrando DONO OFICIAL do Token: RG [${clientRG}]`);
                await tokenDoc.ref.update({ computadorRg: clientRG });
            }

            // 5. Deu tudo certo? JOGA ESSE PC NA LISTA BRANCA DA MEMÓRIA!
            // Assim as próximas milhares de conexões dele não vão derrubar a Wispbyte nem o Firebase!
            pcAutorizados.set(clientToken, {
                expiresAt: data.expiresAt,
                rg: data.computadorRg || clientRG
            });

            callback(true);
        } catch (err) {
            console.error(`[Erro Firewall] Falha ao consultar Token:`, err);
            callback(false, 500, 'Internal Server Error');
        }
    }
});

wss.on('connection', (ws, req) => {
    let targetSocket = null;

    // A primeira mensagem que o Cliente (.exe da escola) mandar vai ser o comando pra onde conectar
    ws.once('message', (msg) => {
        const command = msg.toString();
        
        // Formato esperado do nosso .exe: "CONNECT site.com:443"
        if (command.startsWith('CONNECT ')) {
            const [host, portStr] = command.substring(8).split(':');
            const targetPort = parseInt(portStr, 10);

            console.log(`[Proxy] Tunelando conexao para: ${host}:${targetPort}`);

            // Conecta no site de destino (ex: Google, Discord, Youtube)
            targetSocket = net.createConnection(targetPort, host, () => {
                ws.send('CONNECTED'); // Avisa o .exe que conectou
            });

            // Tudo que voltar da internet, repassa pro WebSocket da escola
            targetSocket.on('data', (data) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(data);
                }
            });

            targetSocket.on('error', (err) => {
                console.error(`[Erro no Destino] ${host}:${targetPort} -`, err.message);
                ws.close();
            });

            targetSocket.on('close', () => {
                ws.close();
            });

            // Tudo o que o .exe da escola pedir daqui pra frente (depois do CONNECT), repassa pra internet
            ws.on('message', (data) => {
                if (targetSocket && !targetSocket.destroyed) {
                    targetSocket.write(data);
                }
            });
        } else {
            // Se alguém tentar mandar baboseira, fecha (proteção)
            ws.close();
        }
    });

    ws.on('close', () => {
        if (targetSocket) targetSocket.destroy();
    });
    
    ws.on('error', (err) => {
       console.error('[Erro no WebSocket]', err.message);
    });
});

server.listen(port, () => {
    console.log(`=========================================`);
    console.log(`🚀 Servidor Tunnel WebSocket Iniciado!`);
    console.log(`📡 Porta: ${port}`);
    console.log(`=========================================`);
});
