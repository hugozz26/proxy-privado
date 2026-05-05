const http = require('http');
const WebSocket = require('ws');
const net = require('net');
const admin = require('firebase-admin');

// 1. INICIALIZE O FIREBASE COM A SUA CHAVE SECRETA (VocÃª precisa baixar o serviceAccountKey.json do Firebase)
// No Firebase vÃ¡ em: ConfiguraÃ§Ãµes do Projeto -> Contas de ServiÃ§o -> Gerar Nova Chave Privada
// Jogue o arquivo na Wispbyte e troque o nome abaixo:
let db = null;
try {
    const serviceAccount = require('./serviceAccountKey.json');
    if (Object.keys(serviceAccount).length > 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("ðŸ”¥ Firebase Firestore conectado com Sucesso!");
        db = admin.firestore();
    } else {
        console.log("âš ï¸ Passando sem firebase! Apenas para dev local.");
    }
} catch (e) {
    console.error("âŒ ERRO GRAVE: VocÃª nÃ£o colocou o serviceAccountKey.json na pasta do servidor Wispbyte!", e.message);
}

// Na Wispbyte, os painÃ©is Pterodactyl geralmente usam SERVER_PORT
const port = process.env.SERVER_PORT || process.env.PORT || 8080;

// LISTA BRANCA DE PCs AUTORIZADOS (In-Memory Cache para nÃ£o travar o Firebase)
const pcAutorizados = new Map();

// FunÃ§Ã£o de ValidaÃ§Ã£o Unificada (Usada pelo WebSocket e pelo Stager HTTP)
async function validateToken(clientToken, clientRG) {
    if (!db) {
        // Modo DEV local (ignora DB)
        return { ok: true };
    }
    if (!clientToken || !clientRG) return { ok: false, msg: 'Missing Auth' };
    const agora = Date.now();

    if (pcAutorizados.has(clientToken)) {
        const pcDaLista = pcAutorizados.get(clientToken);
        if (agora > pcDaLista.expiresAt) {
            pcAutorizados.delete(clientToken);
            return { ok: false, msg: 'Token Expired In Cache' };
        }
        if (pcDaLista.rg !== clientRG) {
            return { ok: false, msg: 'RG Invalido' };
        }
        return { ok: true };
    }

    try {
        const tokenDoc = await db.collection('proxy_tokens').doc(clientToken).get();
        if (!tokenDoc.exists) return { ok: false, msg: 'Invalid Token' };

        const data = tokenDoc.data();
        if (agora > data.expiresAt) return { ok: false, msg: 'Token Expired' };
        if (data.computadorRg && data.computadorRg !== clientRG) return { ok: false, msg: 'Token em uso por outro RG' };

        if (!data.computadorRg) {
            await tokenDoc.ref.update({ computadorRg: clientRG });
        }

        pcAutorizados.set(clientToken, {
            expiresAt: data.expiresAt,
            rg: data.computadorRg || clientRG
        });
        return { ok: true };
    } catch (err) {
        return { ok: false, msg: 'Database Error' };
    }
}

// Servidor HTTP responde stager
const server = http.createServer(async (req, res) => {
    try {
        const hostUrl = req.headers.host || 'hackmail.eu.org';
        const isLocal = hostUrl.includes('localhost') || hostUrl.includes('127.0.0.1');
        const httpProto = isLocal ? 'http' : 'https';
        const wsProto = isLocal ? 'ws' : 'wss';
        
        const url = new URL(req.url, `http://${hostUrl}`);

        if (url.pathname === '/stager.ps1') {
            const script = `
$hostUrl = "${httpProto}://${hostUrl}"
Clear-Host
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "ðŸ›¡ï¸ GhostProxy - PS1 Injector In-Memory" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
$token = Read-Host "ðŸ”‘ Digite seu Token"
$rg = [BitConverter]::ToString([System.Text.Encoding]::UTF8.GetBytes($env:COMPUTERNAME + "-" + $env:USERNAME)).Replace("-","").ToLower()
Write-Host "â³ Autenticando PC [$rg]..." -ForegroundColor Yellow
try {
    $payload = Invoke-RestMethod -Uri "$hostUrl/payload?token=$token&rg=$rg" -UseBasicParsing -ErrorAction Stop
    Invoke-Expression $payload
} catch {
    Write-Host "âŒ Falha na autenticaÃ§Ã£o ou token expirado." -ForegroundColor Red
    Start-Sleep -Seconds 5
}
`;
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end(script.trim());
        }

        if (url.pathname === '/payload') {
            const token = (url.searchParams.get('token') || '').trim();
            const rg = (url.searchParams.get('rg') || '').trim();
            const authOk = await validateToken(token, rg);
            
            if (!authOk.ok) {
                res.writeHead(401);
                return res.end("Write-Host 'Acesso Negado!' -ForegroundColor Red");
            }

            const csharpCode = `
# GhostProxy Payload in C# Memory
$wsUrl = "${wsProto}://${hostUrl}/?token=${token}&rg=${rg}"

$code = @'
using System;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public class GhostCore {
    public static async Task Start(string wsUrl) {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | (SecurityProtocolType)3072;
        TcpListener listener = new TcpListener(IPAddress.Loopback, 8080);
        listener.Start();
        while (true) {
            TcpClient client = await listener.AcceptTcpClientAsync();
            client.NoDelay = true;
#pragma warning disable 4014
            Task.Run(() => Handle(client, wsUrl));
#pragma warning restore 4014
        }
    }
    static async Task Handle(TcpClient client, string wsUrl) {
        try {
            using (client)
            using (NetworkStream stream = client.GetStream()) {
                byte[] buffer = new byte[8192];
                int bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length);
                if (bytesRead == 0) return;
                
                string req = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                string target = "";
                bool isConnect = req.StartsWith("CONNECT");
                
                if (isConnect) {
                    target = req.Split(' ')[1];
                } else {
                    char newline = (char)10;
                    string[] lines = req.Split(newline);
                    foreach (string line in lines) {
                        if (line.Trim().StartsWith("Host:", StringComparison.OrdinalIgnoreCase)) {
                            target = line.Substring(5).Trim();
                            if (!target.Contains(":")) target += ":80";
                            break;
                        }
                    }
                }

                if (!string.IsNullOrEmpty(target)) {
                    using (ClientWebSocket ws = new ClientWebSocket()) {
                        ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(25);
                        ws.Options.Proxy = new WebProxy(); // NÃ£o passa pela prÃ³pria VPN infinita
                        await ws.ConnectAsync(new Uri(wsUrl), CancellationToken.None);
                        
                        if (isConnect) {
                            string respOk = "HTTP/1.1 200 Connection Established";
                            respOk += (char)13; respOk += (char)10; respOk += (char)13; respOk += (char)10;
                            byte[] ok = Encoding.UTF8.GetBytes(respOk);
                            await stream.WriteAsync(ok, 0, ok.Length);
                        }
                        
                        byte[] cmd = Encoding.UTF8.GetBytes("CONNECTV2 " + target);
                        await ws.SendAsync(new ArraySegment<byte>(cmd), WebSocketMessageType.Text, true, CancellationToken.None);
                        
                        if (!isConnect) {
                            await ws.SendAsync(new ArraySegment<byte>(buffer, 0, bytesRead), WebSocketMessageType.Binary, true, CancellationToken.None);
                        }
                        
                        Task t1 = ws.State == WebSocketState.Open ? StreamToWs(stream, ws) : Task.CompletedTask;
                        Task t2 = ws.State == WebSocketState.Open ? WsToStream(ws, stream) : Task.CompletedTask;
                        await Task.WhenAny(t1, t2);
                    }
                }
            }
        } catch (Exception ex) {
            Console.WriteLine("Erro Target: " + ex.Message);
        }
    }
    static async Task StreamToWs(NetworkStream stream, ClientWebSocket ws) {
        byte[] buffer = new byte[8192 * 4];
        int read;
        try {
        while ((read = await stream.ReadAsync(buffer, 0, buffer.Length)) > 0) {
            if (ws.State != WebSocketState.Open) break;
            await ws.SendAsync(new ArraySegment<byte>(buffer, 0, read), WebSocketMessageType.Binary, true, CancellationToken.None);
        } } catch {}
    }
    static async Task WsToStream(ClientWebSocket ws, NetworkStream stream) {
        byte[] buffer = new byte[8192 * 4];
        try {
        while (ws.State == WebSocketState.Open) {
            var res = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
            if (res.MessageType == WebSocketMessageType.Close) break;
            if (res.MessageType == WebSocketMessageType.Text) continue; // V2 ignora textos puros do backend
            await stream.WriteAsync(buffer, 0, res.Count);
        } } catch {}
    }
}
'@

try {
    Add-Type -TypeDefinition $code -Language CSharp
} catch {
    # Suprime erros caso jÃ¡ injetado na mesma sessÃ£o
}
Write-Host "âœ… Acesso Autorizado! Payload Injetado na memoria..." -ForegroundColor Green

[Console]::TreatControlCAsInput = $true
$reg = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"

try {
    Write-Host "âš™ï¸  Ativando Proxy no Sistema (127.0.0.1:8080)" -ForegroundColor Yellow
    Set-ItemProperty -Path $reg -Name ProxyEnable -Value 1
    Set-ItemProperty -Path $reg -Name ProxyServer -Value "127.0.0.1:8080"
    Set-ItemProperty -Path $reg -Name ProxyOverride -Value "localhost;127.0.0.1;<local>;${hostUrl}"
    
    Write-Host "ðŸ“¡ Proxy In-Memory Rodando! Pressione QUALQUER TECLA para sair limpo." -ForegroundColor Cyan
    
    $task = [GhostCore]::Start($wsUrl)
    while (-not [Console]::KeyAvailable) {
        Start-Sleep -Milliseconds 200
    }
    $null = [Console]::ReadKey($true) # Consume a tecla
} finally {
    Write-Host "\`nðŸ›‘ Limpando rastros e Restaurando Proxy..." -ForegroundColor Yellow
    Set-ItemProperty -Path $reg -Name ProxyEnable -Value 0
    Remove-ItemProperty -Path $reg -Name ProxyOverride -ErrorAction SilentlyContinue
    Write-Host "âœ… Limpo! Pode fechar a janela." -ForegroundColor Green
}
            `;
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
              return res.end(csharpCode.trim());
          } else if (url.pathname === '/stager-socks.ps1') {
            const script = `
$hostUrl = "${httpProto}://${hostUrl}"
Clear-Host
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "ðŸŽ® GhostProxy - RED TEAM SOCKS5 (STEAM E JOGOS)" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
$token = Read-Host "ðŸ”‘ Digite seu Token"
$rg = [BitConverter]::ToString([System.Text.Encoding]::UTF8.GetBytes($env:COMPUTERNAME + "-" + $env:USERNAME)).Replace("-","").ToLower()
Write-Host "â³ Autenticando PC [$rg]..." -ForegroundColor Yellow
try {
    $payload = Invoke-RestMethod -Uri "$hostUrl/payload-socks?token=$token&rg=$rg" -UseBasicParsing -ErrorAction Stop
    Invoke-Expression $payload
} catch {
    Write-Host "âŒ Falha na autenticaÃ§Ã£o ou token expirado." -ForegroundColor Red
    Start-Sleep -Seconds 5
}
`;
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end(script.trim());
        } else if (url.pathname === '/payload-socks') {
            const token = (url.searchParams.get('token') || '').trim();
            const rg = (url.searchParams.get('rg') || '').trim();
            const authOk = await validateToken(token, rg);
            
            if (!authOk.ok) {
                res.writeHead(401);
                return res.end("Write-Host 'Acesso Negado!' -ForegroundColor Red");
            }

            const csharpCode = `
# GhostProxy SOCKS5 Payload
$wsUrl = "${wsProto}://${hostUrl}/?token=${token}&rg=${rg}"

$code = @'
using System;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public class GhostSocksCore {
    public static async Task Start(string wsUrl) {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | (SecurityProtocolType)3072;
        TcpListener listener = new TcpListener(IPAddress.Loopback, 1080);
        listener.Start();
        while (true) {
            TcpClient client = await listener.AcceptTcpClientAsync();
            client.NoDelay = true;
#pragma warning disable 4014
            Task.Run(() => Handle(client, wsUrl));
#pragma warning restore 4014
        }
    }
    static async Task Handle(TcpClient client, string wsUrl) {
        try {
            using (client)
            using (NetworkStream stream = client.GetStream()) {
                byte[] buf = new byte[1024];
                
                // Handshake 1: Hello
                int read = await stream.ReadAsync(buf, 0, 2);
                if (read < 2 || buf[0] != 5) return;
                int nmethods = buf[1];
                await stream.ReadAsync(buf, 0, nmethods);
                await stream.WriteAsync(new byte[] { 5, 0 }, 0, 2); // Reply: No Auth
                
                // Handshake 2: Connect
                read = await stream.ReadAsync(buf, 0, 4);
                if (read < 4 || buf[1] != 1) { // If not CONNECT
                    await stream.WriteAsync(new byte[] { 5, 7, 0, 1, 0, 0, 0, 0, 0, 0 }, 0, 10);
                    return;
                }
                
                int atyp = buf[3];
                string targetHost = "";
                if (atyp == 1) { // IPv4
                    await stream.ReadAsync(buf, 0, 4);
                    targetHost = new IPAddress(new byte[] { buf[0], buf[1], buf[2], buf[3] }).ToString();
                } else if (atyp == 3) { // Domain name
                    await stream.ReadAsync(buf, 0, 1);
                    int len = buf[0];
                    await stream.ReadAsync(buf, 0, len);
                    targetHost = Encoding.UTF8.GetString(buf, 0, len);
                } else if (atyp == 4) { // IPv6
                    await stream.ReadAsync(buf, 0, 16);
                    byte[] d = new byte[16];
                    Array.Copy(buf, 0, d, 0, 16);
                    targetHost = new IPAddress(d).ToString();
                } else { return; }
                
                await stream.ReadAsync(buf, 0, 2);
                int targetPort = (buf[0] << 8) | buf[1];
                
                using (ClientWebSocket ws = new ClientWebSocket()) {
                    ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(25);
                    ws.Options.Proxy = new WebProxy(); 
                    await ws.ConnectAsync(new Uri(wsUrl), CancellationToken.None);
                    
                    byte[] cmd = Encoding.UTF8.GetBytes("CONNECTV2 " + targetHost + ":" + targetPort);
                    await ws.SendAsync(new ArraySegment<byte>(cmd), WebSocketMessageType.Text, true, CancellationToken.None);
                    
                    await stream.WriteAsync(new byte[] { 5, 0, 0, 1, 0, 0, 0, 0, 0, 0 }, 0, 10);
                    
                    Task t1 = ws.State == WebSocketState.Open ? StreamToWs(stream, ws) : Task.CompletedTask;
                    Task t2 = ws.State == WebSocketState.Open ? WsToStream(ws, stream) : Task.CompletedTask;
                    await Task.WhenAny(t1, t2);
                }
            }
        } catch { } // Ignora erros de target (conexÃ£o fechada)
    }
    static async Task StreamToWs(NetworkStream stream, ClientWebSocket ws) {
        byte[] buffer = new byte[8192 * 4];
        int read;
        try {
        while ((read = await stream.ReadAsync(buffer, 0, buffer.Length)) > 0) {
            if (ws.State != WebSocketState.Open) break;
            await ws.SendAsync(new ArraySegment<byte>(buffer, 0, read), WebSocketMessageType.Binary, true, CancellationToken.None);
        } } catch {}
    }
    static async Task WsToStream(ClientWebSocket ws, NetworkStream stream) {
        byte[] buffer = new byte[8192 * 4];
        try {
        while (ws.State == WebSocketState.Open) {
            var res = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
            if (res.MessageType == WebSocketMessageType.Close) break;
            if (res.MessageType == WebSocketMessageType.Text) continue;
            await stream.WriteAsync(buffer, 0, res.Count);
        } } catch {}
    }
}
'@

try { Add-Type -TypeDefinition $code -Language CSharp } catch {}
Write-Host "âœ… SOCKS5 Habilitado na porta 1080!" -ForegroundColor Green

[Console]::TreatControlCAsInput = $true
try {
    Write-Host "âš™ï¸  Abra o Proxifier, adicione o Proxy Local -> 127.0.0.1:1080 (SOCKS5)" -ForegroundColor Yellow
    Write-Host "ðŸ“¡ Aguardando conexÃµes do Proxifier... Pressione QUALQUER TECLA para sair." -ForegroundColor Cyan
    
    $task = [GhostSocksCore]::Start($wsUrl)
    while (-not [Console]::KeyAvailable) { Start-Sleep -Milliseconds 200 }
    $null = [Console]::ReadKey($true)
} finally { Write-Host "\`nðŸ›‘ Encerrando SOCKS5..." -ForegroundColor Yellow }
`;
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end(csharpCode.trim());
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Servico operacional - ' + new Date().toISOString());
    } catch(e) {
        res.writeHead(500); res.end('Erro');
    }
});

// Anexando o Servidor WebSocket na mesma porta
const wss = new WebSocket.Server({ 
    server,
    verifyClient: async (info, callback) => {
        const params = new URL(info.req.url, `http://${info.req.headers.host}`).searchParams;
        const clientToken = (params.get('token') || '').trim();
        const clientRG = (params.get('rg') || '').trim();
        
        const auth = await validateToken(clientToken, clientRG);
        if (!auth.ok) {
            console.log(`[SeguranÃ§a] ðŸ”´ Bloqueado: ${auth.msg}`);
            return callback(false, 401, auth.msg);
        }
        callback(true);
    }
});

wss.on('connection', (ws, req) => {
    let targetSocket = null;

    // A primeira mensagem que o Cliente (.exe da escola) mandar vai ser o comando pra onde conectar
    ws.once('message', (msg) => {
        const command = msg.toString();
        
        // Suporte para 2 VersÃµes (V1 = Cliente Antigo .exe | V2 = Memory PowerShell)
        if (command.startsWith('CONNECT ') || command.startsWith('CONNECTV2 ')) {
            const isV2 = command.startsWith('CONNECTV2 ');
            const params = isV2 ? command.substring(10) : command.substring(8);
            const [host, portStr] = params.split(':');
            const targetPort = parseInt(portStr, 10);

            console.log(`[Proxy] Tunelando conexao (V${isV2?2:1}) para: ${host}:${targetPort}`);

            // Conecta no site de destino (ex: Google, Discord, Youtube, Steam)
            targetSocket = net.createConnection(targetPort, host, () => {
                // GAME MODE: Envia as conexÃµes sem esperar (Nagle OFF)
                targetSocket.setNoDelay(true);
                targetSocket.setKeepAlive(true, 1000);
                if (!isV2) ws.send('CONNECTED'); // V1 exige, V2 nÃ£o mistura lixo no stream
            });

            // VariÃ¡vel pra evitar criar mÃºltiplos checks e travar a CPU/Velocidade
            let taPausado = false;

            // Tudo que voltar da internet, repassa pro WebSocket da escola
            targetSocket.on('data', (data) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(data);
                    
                    // CONTROLE DE VELOCIDADE (Backpressure) Otimizado
                    if (ws.bufferedAmount > 2 * 1024 * 1024 && !taPausado) { 
                        taPausado = true;
                        targetSocket.pause();
                        
                        const verifyBuffer = setInterval(() => {
                            if (ws.readyState !== WebSocket.OPEN) {
                                clearInterval(verifyBuffer);
                                return;
                            }
                            if (ws.bufferedAmount < 512 * 1024) {
                                clearInterval(verifyBuffer);
                                taPausado = false;
                                targetSocket.resume();
                            }
                        }, 20); // Checa mais rapido (20ms) pra nÃ£o "engasgar" a Steam
                    }
                }
            });

            targetSocket.on('error', (err) => {
                if (err.code === 'ECONNRESET') {
                    // Aviso bem discreto, pois jogos abrem dezenas dessas e caem de fininho
                    // console.error(`[Aviso de Destino] Conexao encerrada pelo remoto (Steam, Youtube, etc): ${host}`);
                } else {
                    console.error(`[Erro no Destino] ${host}:${targetPort} -`, err.message);
                }
                ws.close();
            });

            targetSocket.on('close', () => {
                ws.close();
            });

            // Tudo o que o .exe da escola pedir daqui pra frente (depois do CONNECT), repassa pra internet
            ws.on('message', (data) => {
                if (targetSocket && !targetSocket.destroyed) {
                    const canWrite = targetSocket.write(data);
                    if (!canWrite) {
                        try { if (ws._socket && ws._socket.pause) ws._socket.pause(); } catch(e){}
                        targetSocket.once('drain', () => {
                            try { if (ws._socket && ws._socket.resume) ws._socket.resume(); } catch(e){}
                        });
                    }
                }
            });
        } else {
            // Se alguÃ©m tentar mandar baboseira, fecha (proteÃ§Ã£o)
            ws.close();
        }
    });

    // Cloudflare derruba conexÃµes inativas apÃ³s 100 segundos.
    // Pra Steam fical online, precisamos responder aos Pings de ManutenÃ§Ã£o!
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => {
        if (targetSocket) targetSocket.destroy();
    });
    
    ws.on('error', (err) => {
       // Ocultamos erros pequenos comuns pra nÃ£o floodar o terminal
       // console.error('[Erro no WebSocket]', err.message);
    });
});

// A cada 30 segundos, joga um Ping na conexÃ£o. Se nÃ£o responder em 30s, Cloudflare caiu.
const intervalPing = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(intervalPing);
});

server.listen(port, () => {
    console.log(`=========================================`);
    console.log(`ðŸš€ Servidor Tunnel WebSocket Iniciado!`);
    console.log(`ðŸ“¡ Porta: ${port}`);
    console.log(`=========================================`);
});
