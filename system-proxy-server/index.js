const http = require('http');
const WebSocket = require('ws');
const net = require('net');
const admin = require('firebase-admin');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ----- AUTO-START DO TOR (Se o binario existir na pasta ./tor/) -----
// O Tor Expert Bundle deve ser extraido dentro de ./tor/ com o binario em ./tor/tor (Linux)
// ou ./tor/tor.exe (Windows). O servidor inicia o Tor automaticamente na porta 9050.
function startTorDaemon() {
    const isWindows = process.platform === 'win32';
    const torBinary = isWindows ? path.join(__dirname, 'tor', 'tor.exe') : path.join(__dirname, 'tor', 'tor');
    
    if (!fs.existsSync(torBinary)) {
        console.log('[Tor] Binario do Tor nao encontrado em ./tor/');
        console.log('[Tor] V3 (Modo Tor) ficara DESABILITADO. V1 e V2 funcionam normalmente.');
        console.log('[Tor] Para habilitar: baixe o Tor Expert Bundle e extraia em ./tor/');
        return null;
    }

    // Garante permissao de execucao no Linux
    if (!isWindows) {
        try { execSync(`chmod +x "${torBinary}"`); } catch(e) {}
    }

    // Cria o diretorio de dados do Tor se nao existir
    const torDataDir = path.join(__dirname, 'tor-data');
    if (!fs.existsSync(torDataDir)) {
        fs.mkdirSync(torDataDir, { recursive: true });
    }

    // Cria um torrc minimalista
    const torrcPath = path.join(__dirname, 'torrc');
    const torrcContent = `SocksPort 9050\nDataDirectory ${torDataDir}\nLog notice stdout\n`;
    fs.writeFileSync(torrcPath, torrcContent);

    console.log('[Tor] Iniciando servico Tor na porta 9050...');
    
    const torDir = path.dirname(torBinary);
    const customEnv = {
        ...process.env,
        LD_LIBRARY_PATH: torDir + (process.env.LD_LIBRARY_PATH ? path.delimiter + process.env.LD_LIBRARY_PATH : '')
    };

    const torProcess = spawn(torBinary, ['-f', torrcPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: customEnv
    });

    torProcess.stdout.on('data', (data) => {
        const line = data.toString().trim();
        if (line.includes('Bootstrapped 100%')) {
            console.log('[Tor] Rede Tor CONECTADA com sucesso! V3 habilitado.');
        } else if (line.includes('Bootstrapped')) {
            // Mostra progresso do bootstrap (ex: 25%, 50%, 75%)
            const match = line.match(/Bootstrapped (\d+%)/);
            if (match) console.log(`[Tor] Conectando a Rede Tor... ${match[1]}`);
        }
    });

    torProcess.stderr.on('data', (data) => {
        const line = data.toString().trim();
        if (line.length > 0) console.error(`[Tor ERRO] ${line}`);
    });

    torProcess.on('close', (code) => {
        console.log(`[Tor] Processo Tor encerrado (codigo: ${code})`);
    });

    // Mata o Tor quando o servidor Node.js encerrar
    process.on('exit', () => { try { torProcess.kill(); } catch(e) {} });
    process.on('SIGINT', () => { try { torProcess.kill(); } catch(e) {} process.exit(); });
    process.on('SIGTERM', () => { try { torProcess.kill(); } catch(e) {} process.exit(); });

    return torProcess;
}

const torProcess = startTorDaemon();

// 1. INICIALIZE O FIREBASE COM A SUA CHAVE SECRETA (Voc precisa baixar o serviceAccountKey.json do Firebase)
// No Firebase v em: Configuraes do Projeto -> Contas de Servio -> Gerar Nova Chave Privada
// Jogue o arquivo na Wispbyte e troque o nome abaixo:
let db = null;
try {
    const serviceAccount = require('./serviceAccountKey.json');
    if (Object.keys(serviceAccount).length > 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log(" Firebase Firestore conectado com Sucesso!");
        db = admin.firestore();
    } else {
        console.log(" Passando sem firebase! Apenas para dev local.");
    }
} catch (e) {
    console.error(" ERRO GRAVE: Voc no colocou o serviceAccountKey.json na pasta do servidor Wispbyte!", e.message);
}

// Na Wispbyte, os painis Pterodactyl geralmente usam SERVER_PORT
const port = process.env.SERVER_PORT || process.env.PORT || 8080;

// LISTA BRANCA DE PCs AUTORIZADOS (In-Memory Cache para no travar o Firebase)
const pcAutorizados = new Map();

// Funo de Validao Unificada (Usada pelo WebSocket e pelo Stager HTTP)
async function validateToken(clientToken, clientRG) {
    if (!db) {
        // Modo DEV local (ignora DB)
        return { ok: true };
    }
    if (!clientToken || !clientRG) {
        console.log(`[Auth Falhou] Credenciais ausentes. Token: ${clientToken}, RG: ${clientRG}`);
        return { ok: false, msg: 'Missing Auth' };
    }
    const agora = Date.now();

    if (pcAutorizados.has(clientToken)) {
        const pcDaLista = pcAutorizados.get(clientToken);
        if (agora > pcDaLista.expiresAt) {
            console.log(`[Auth Falhou] Token expirado no cache em memoria: ${clientToken}`);
            pcAutorizados.delete(clientToken);
            return { ok: false, msg: 'Token Expired In Cache' };
        }
        if (pcDaLista.rg !== clientRG) {
            console.log(`[Auth Falhou] RG invalido no cache. Esperado: ${pcDaLista.rg}, Recebido: ${clientRG}`);
            return { ok: false, msg: 'RG Invalido' };
        }
        return { ok: true };
    }

    try {
        const tokenDoc = await db.collection('proxy_tokens').doc(clientToken).get();
        if (!tokenDoc.exists) {
            console.log(`[Auth Falhou] Token nao existe no Firebase Firestore: ${clientToken}`);
            return { ok: false, msg: 'Invalid Token' };
        }

        const data = tokenDoc.data();
        if (agora > data.expiresAt) {
            console.log(`[Auth Falhou] Token expirado no Firestore. Agora: ${agora}, Expira em: ${data.expiresAt}`);
            return { ok: false, msg: 'Token Expired' };
        }
        if (data.computadorRg && data.computadorRg !== clientRG) {
            console.log(`[Auth Falhou] Token em uso por outra maquina. Gravado no DB: ${data.computadorRg}, Enviado pelo cliente: ${clientRG}`);
            return { ok: false, msg: 'Token em uso por outro RG' };
        }

        if (!data.computadorRg) {
            await tokenDoc.ref.update({ computadorRg: clientRG });
        }

        pcAutorizados.set(clientToken, {
            expiresAt: data.expiresAt,
            rg: data.computadorRg || clientRG
        });
        return { ok: true };
    } catch (err) {
        console.error(`[Auth Erro] Falha ao acessar Firestore para o token ${clientToken}:`, err.message);
        return { ok: false, msg: 'Database Error' };
    }
}

// ----- CONECTOR TOR (SOCKS5 Nativo, Zero Dependencias) -----
// Faz o handshake SOCKS5 com o servico Tor rodando localmente (porta 9050)
// e devolve um socket TCP puro ja conectado ao destino pela rede Tor.
function connectThroughTor(host, port, callback) {
    const torSocket = net.createConnection(9050, '127.0.0.1', () => {
        // Passo 1: Greeting SOCKS5 (Versao 5, 1 Metodo, Sem Auth)
        torSocket.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    let step = 1;

    torSocket.on('data', (data) => {
        if (step === 1) {
            // Resposta do Greeting: [0x05, 0x00] = OK
            if (data[0] !== 0x05 || data[1] !== 0x00) {
                torSocket.destroy();
                return callback(new Error('Tor SOCKS5 Handshake falhou'));
            }
            // Passo 2: Envia CONNECT para o endereco de destino (.onion ou qualquer site)
            step = 2;
            const hostBuf = Buffer.from(host, 'utf8');
            const req = Buffer.alloc(5 + hostBuf.length + 2);
            req[0] = 0x05; // Versao
            req[1] = 0x01; // Comando CONNECT
            req[2] = 0x00; // Reservado
            req[3] = 0x03; // Tipo: Domain Name
            req[4] = hostBuf.length;
            hostBuf.copy(req, 5);
            req.writeUInt16BE(port, 5 + hostBuf.length);
            torSocket.write(req);
        } else if (step === 2) {
            // Resposta CONNECT: [0x05, 0x00, ...] = Conectado com sucesso
            if (data[0] !== 0x05 || data[1] !== 0x00) {
                torSocket.destroy();
                return callback(new Error('Tor recusou conexao (Status ' + data[1] + ')'));
            }
            // Conexao Tor estabelecida! Entrega o socket limpo
            torSocket.removeAllListeners('data');
            callback(null, torSocket);
        }
    });

    torSocket.on('error', (err) => {
        callback(new Error('Erro ao conectar no servico Tor local (porta 9050): ' + err.message));
    });
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
Write-Host " GhostProxy - PS1 Injector In-Memory" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
$token = Read-Host " Digite seu Token"
$rg = [BitConverter]::ToString([System.Text.Encoding]::UTF8.GetBytes($env:COMPUTERNAME + "-" + $env:USERNAME)).Replace("-","").ToLower()
Write-Host " Autenticando PC [$rg]..." -ForegroundColor Yellow
try {
    $payload = Invoke-RestMethod -Uri "$hostUrl/payload?token=$token&rg=$rg" -UseBasicParsing -ErrorAction Stop
    Invoke-Expression $payload
} catch {
    Write-Host " Falha na autenticacao ou token expirado." -ForegroundColor Red
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
                        ws.Options.Proxy = new WebProxy();
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
            if (res.MessageType == WebSocketMessageType.Text) continue;
            await stream.WriteAsync(buffer, 0, res.Count);
        } } catch {}
    }
}
'@

try {
    Add-Type -TypeDefinition $code -Language CSharp
} catch {
    # Suprime erros caso ja injetado na mesma sessao
}
Write-Host " Acesso Autorizado! Payload Injetado na memoria..." -ForegroundColor Green

[Console]::TreatControlCAsInput = $true
$reg = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"

try {
    Write-Host "  Ativando Proxy no Sistema (127.0.0.1:8080)" -ForegroundColor Yellow
    Set-ItemProperty -Path $reg -Name ProxyEnable -Value 1
    Set-ItemProperty -Path $reg -Name ProxyServer -Value "127.0.0.1:8080"
    Set-ItemProperty -Path $reg -Name ProxyOverride -Value "localhost;127.0.0.1;<local>;${hostUrl}"
    
    Write-Host " Proxy In-Memory Rodando! Pressione QUALQUER TECLA para sair limpo." -ForegroundColor Cyan
    
    $task = [GhostCore]::Start($wsUrl)
    while (-not [Console]::KeyAvailable) {
        Start-Sleep -Milliseconds 200
    }
    $null = [Console]::ReadKey($true)
} finally {
    Write-Host "\`n Limpando rastros e Restaurando Proxy..." -ForegroundColor Yellow
    Set-ItemProperty -Path $reg -Name ProxyEnable -Value 0
    Remove-ItemProperty -Path $reg -Name ProxyOverride -ErrorAction SilentlyContinue
    Write-Host " Limpo! Pode fechar a janela." -ForegroundColor Green
}
            `;
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end(csharpCode.trim());
        } else if (url.pathname === '/stager-socks.ps1') {
            const script = `
$hostUrl = "${httpProto}://${hostUrl}"
Clear-Host
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " GhostProxy - RED TEAM SOCKS5 (STEAM E JOGOS)" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
$token = Read-Host " Digite seu Token"
$rg = [BitConverter]::ToString([System.Text.Encoding]::UTF8.GetBytes($env:COMPUTERNAME + "-" + $env:USERNAME)).Replace("-","").ToLower()
Write-Host " Autenticando PC [$rg]..." -ForegroundColor Yellow
try {
    $payload = Invoke-RestMethod -Uri "$hostUrl/payload-socks?token=$token&rg=$rg" -UseBasicParsing -ErrorAction Stop
    Invoke-Expression $payload
} catch {
    Write-Host " Falha na autenticacao ou token expirado." -ForegroundColor Red
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
        } catch { }
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
Write-Host " SOCKS5 Habilitado na porta 1080!" -ForegroundColor Green

[Console]::TreatControlCAsInput = $true
try {
    Write-Host "  Abra o Proxifier, adicione o Proxy Local -> 127.0.0.1:1080 (SOCKS5)" -ForegroundColor Yellow
    Write-Host " Aguardando conexoes do Proxifier... Pressione QUALQUER TECLA para sair." -ForegroundColor Cyan
    
    $task = [GhostSocksCore]::Start($wsUrl)
    while (-not [Console]::KeyAvailable) { Start-Sleep -Milliseconds 200 }
    $null = [Console]::ReadKey($true)
} finally { Write-Host "\`n Encerrando SOCKS5..." -ForegroundColor Yellow }
`;
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end(csharpCode.trim());

        // =====================================================
        // ========== V3 - MODO TOR (NAVEGACAO ANONIMA) ========
        // =====================================================
        } else if (url.pathname === '/stager-tor.ps1') {
            const script = `
$hostUrl = "${httpProto}://${hostUrl}"
Clear-Host
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host " GhostProxy - MODO TOR (Navegacao Anonima)" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host " Todo trafego sera roteado pela Rede Tor." -ForegroundColor DarkGray
Write-Host " Voce podera acessar sites .onion no Chrome!" -ForegroundColor DarkGray
Write-Host ""
$token = Read-Host " Digite seu Token"
$rg = [BitConverter]::ToString([System.Text.Encoding]::UTF8.GetBytes($env:COMPUTERNAME + "-" + $env:USERNAME)).Replace("-","").ToLower()
Write-Host " Autenticando PC [$rg]..." -ForegroundColor Yellow
try {
    $payload = Invoke-RestMethod -Uri "$hostUrl/payload-tor?token=$token&rg=$rg" -UseBasicParsing -ErrorAction Stop
    Invoke-Expression $payload
} catch {
    Write-Host " Falha na autenticacao ou token expirado." -ForegroundColor Red
    Start-Sleep -Seconds 5
}
`;
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end(script.trim());
        } else if (url.pathname === '/payload-tor') {
            const token = (url.searchParams.get('token') || '').trim();
            const rg = (url.searchParams.get('rg') || '').trim();
            const authOk = await validateToken(token, rg);
            
            if (!authOk.ok) {
                res.writeHead(401);
                return res.end("Write-Host 'Acesso Negado!' -ForegroundColor Red");
            }

            const csharpCode = `
# GhostProxy Tor Payload in C# Memory
$wsUrl = "${wsProto}://${hostUrl}/socks-tor?token=${token}&rg=${rg}"

$code = @'
using System;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public class GhostTorCore {
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
                        ws.Options.Proxy = new WebProxy();
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
            Console.WriteLine("Erro Tor Target: " + ex.Message);
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
            if (res.MessageType == WebSocketMessageType.Text) continue;
            await stream.WriteAsync(buffer, 0, res.Count);
        } } catch {}
    }
}
'@

try {
    Add-Type -TypeDefinition $code -Language CSharp
} catch {
    # Suprime erros caso ja injetado na mesma sessao
}
Write-Host " Acesso Autorizado! Modo Tor Injetado na Memoria..." -ForegroundColor Green

[Console]::TreatControlCAsInput = $true
$reg = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"

try {
    Write-Host "  Ativando Proxy Tor no Sistema (127.0.0.1:8080)" -ForegroundColor Yellow
    Set-ItemProperty -Path $reg -Name ProxyEnable -Value 1
    Set-ItemProperty -Path $reg -Name ProxyServer -Value "127.0.0.1:8080"
    Set-ItemProperty -Path $reg -Name ProxyOverride -Value "localhost;127.0.0.1;<local>;${hostUrl}"
    
    Write-Host "" -ForegroundColor Cyan
    Write-Host " REDE TOR ATIVA! Navegacao 100% Anonima." -ForegroundColor Green
    Write-Host " Acesse https://check.torproject.org/ para verificar." -ForegroundColor DarkGray
    Write-Host " Sites .onion funcionam direto no Chrome!" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host " Pressione QUALQUER TECLA para sair e restaurar a internet." -ForegroundColor Cyan
    
    $task = [GhostTorCore]::Start($wsUrl)
    while (-not [Console]::KeyAvailable) {
        Start-Sleep -Milliseconds 200
    }
    $null = [Console]::ReadKey($true)
} finally {
    Write-Host "\`n Limpando rastros e Restaurando Proxy..." -ForegroundColor Yellow
    Set-ItemProperty -Path $reg -Name ProxyEnable -Value 0
    Remove-ItemProperty -Path $reg -Name ProxyOverride -ErrorAction SilentlyContinue
    Write-Host " Limpo! Pode fechar a janela." -ForegroundColor Green
}
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
            console.log(`[Seguranca] Bloqueado: ${auth.msg}`);
            return callback(false, 401, auth.msg);
        }
        callback(true);
    }
});

wss.on('connection', (ws, req) => {
    const isTorMode = req.url.startsWith('/socks-tor');
    let targetSocket = null;

    // A primeira mensagem que o Cliente (.exe da escola) mandar vai ser o comando pra onde conectar
    ws.once('message', (msg) => {
        const command = msg.toString();
        
        // Suporte para 3 Versoes (V1 = Cliente .exe | V2 = Memory PowerShell | V3 = Tor)
        if (command.startsWith('CONNECT ') || command.startsWith('CONNECTV2 ')) {
            const isV2 = command.startsWith('CONNECTV2 ');
            const params = isV2 ? command.substring(10) : command.substring(8);
            const [host, portStr] = params.split(':');
            const targetPort = parseInt(portStr, 10);

            // ----- MODO TOR: Rota pela Rede Tor via SOCKS5 Local (porta 9050) -----
            if (isTorMode) {
                console.log(`[Tor Proxy] Roteando via Rede Tor para: ${host}:${targetPort}`);
                connectThroughTor(host, targetPort, (err, torSock) => {
                    if (err) {
                        console.error(`[Tor] Falha ao conectar: ${err.message}`);
                        ws.close();
                        return;
                    }
                    targetSocket = torSock;
                    targetSocket.setNoDelay(true);
                    if (!isV2) ws.send('CONNECTED');

                    let taPausado = false;

                    targetSocket.on('data', (data) => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(data);
                            if (ws.bufferedAmount > 2 * 1024 * 1024 && !taPausado) {
                                taPausado = true;
                                targetSocket.pause();
                                const verifyBuffer = setInterval(() => {
                                    if (ws.readyState !== WebSocket.OPEN) { clearInterval(verifyBuffer); return; }
                                    if (ws.bufferedAmount < 512 * 1024) { clearInterval(verifyBuffer); taPausado = false; targetSocket.resume(); }
                                }, 20);
                            }
                        }
                    });

                    targetSocket.on('error', (err) => {
                        if (err.code !== 'ECONNRESET') {
                            console.error(`[Tor Erro] ${host}:${targetPort} -`, err.message);
                        }
                        ws.close();
                    });

                    targetSocket.on('close', () => { ws.close(); });

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
                });
                return; // Nao cai no proxy normal abaixo
            }

            console.log(`[Proxy] Tunelando conexao (V${isV2?2:1}) para: ${host}:${targetPort}`);

            // Conecta no site de destino (ex: Google, Discord, Youtube, Steam)
            targetSocket = net.createConnection(targetPort, host, () => {
                // GAME MODE: Envia as conexoes sem esperar (Nagle OFF)
                targetSocket.setNoDelay(true);
                targetSocket.setKeepAlive(true, 1000);
                if (!isV2) ws.send('CONNECTED'); // V1 exige, V2 nao mistura lixo no stream
            });

            // Variavel pra evitar criar multiplos checks e travar a CPU/Velocidade
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
                        }, 20); // Checa mais rapido (20ms) pra nao "engasgar" a Steam
                    }
                }
            });

            targetSocket.on('error', (err) => {
                if (err.code === 'ECONNRESET') {
                    // Aviso bem discreto, pois jogos abrem dezenas dessas e caem de fininho
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
            // Se alguem tentar mandar baboseira, fecha (protecao)
            ws.close();
        }
    });

    // Cloudflare derruba conexoes inativas apos 100 segundos.
    // Pra Steam ficar online, precisamos responder aos Pings de Manutencao!
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => {
        if (targetSocket) targetSocket.destroy();
    });
    
    ws.on('error', (err) => {
       // Ocultamos erros pequenos comuns pra nao floodar o terminal
    });
});

// A cada 30 segundos, joga um Ping na conexao. Se nao responder em 30s, Cloudflare caiu.
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
    console.log(` Servidor Tunnel WebSocket Iniciado!`);
    console.log(` Porta: ${port}`);
    console.log(`=========================================`);
});
