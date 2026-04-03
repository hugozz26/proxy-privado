# GhostNode - Advanced Network Bypass System

**GhostNode** é um sistema completo de gerenciamento e evasão de rede desenvolvido para ultrapassar bloqueios como Firewalls DPI, bloqueios por DNS, e regras restritas de acesso corporativo ou em redes fechadas.

O projeto é dividido em três camadas principais:

## 1. Web Proxy (Bare-Mux)
Uma aba completa no painel Frontend executável inteiramente no navegador via **Service Workers**. Permite navegar livremente pela internet sem a necessidade de instalar nada localmente, ideal para ambientes onde não se há permissão de execução de `.exe` ou restrições administrativas.

## 2. GhostProxy (.exe System-Wide)
Um executável local (compilado usando `pkg` do Node.js) que intercepta literalmente toda a internet que passa pela máquina do usuário.
- Ele se anexa nativamente ao Registro (`reg add`) do Internet Settings do Windows de forma silenciosa para o usuário logado (sem necessitar permissão `Administrator`).
- Encapsula pacotes web por um túnel **WebSocket Seguro (wss://)** via Nuvem.

## 3. The Relay Server (Wispbyte Backend)
Um servidor Node.js operando na porta alocada pelo painel (Pterodactyl).
- Protegido pelo **Cloudflare (Proxy com SSL Flexível e WebSocket habilitado)**.
- Trabalha recebendo pacotes WebSocket encriptados do `GhostProxy.exe`, abrindo a conexão e injetando na internet limpa sem ser bloqueado pela nuvem (sem causar erros 302/502).
- Contém um **Firewall anti-vazamento** com Firebase Firestore. Um script gera Tokens Temporários (2H) por máquina (via Hash/RG do Windows/User). Evitando que o token seja espalhado, economizando quota diária e blindando contra DDoS.

## Como fazer o Build do GhostProxy
Na pasta `system-proxy-client`:
```bash
npm install
npm run build
```
Isso gerará o `GhostProxy.exe`, que deverá ser lançado dentro do frontend React (`public/GhostProxy.exe`) para download.

---

> Disclaimer: This project is meant for educational and private learning regarding Network Relays, Reverse Proxies (Cloudflare), WSS tunneling and Firewalls bypassing with Node.js streams. Always ensure you comply with the network policy terms of your environment.
