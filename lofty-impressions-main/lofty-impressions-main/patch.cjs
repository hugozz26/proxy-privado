const fs = require('fs');

const proxyPath = 'C:\\Users\\hugod\\Downloads\\proxy\\lofty-impressions-main\\lofty-impressions-main\\src\\components\\ProxyCard.tsx';
let proxyCode = fs.readFileSync(proxyPath, 'utf8');

proxyCode = proxyCode.replace(
    /let registration = await navigator\.serviceWorker\.register\('\/sw\.js', { scope: window\.__uv\$config\.prefix }\);\s*await navigator\.serviceWorker\.ready;\s*\/\/ Small delay to ensure SW takes control of the document if necessary\.\s*await new Promise\(r => setTimeout\(r, 500\)\);/,
    `let registration = await navigator.serviceWorker.getRegistration();
          if (!registration) {
            registration = await navigator.serviceWorker.register('/sw.js', { scope: window.__uv$config.prefix });
            if (registration.installing) {
              await new Promise(resolve => registration.installing.addEventListener('statechange', e => { if (e.target.state === 'activated') resolve(true); }));
            }
          }
          await navigator.serviceWorker.ready;
          await new Promise(r => setTimeout(r, 500));`
);

fs.writeFileSync(proxyPath, proxyCode);

const dnPath = 'C:\\Users\\hugod\\Downloads\\proxy\\lofty-impressions-main\\lofty-impressions-main\\src\\components\\DownloaderCard.tsx';
let dnCode = fs.readFileSync(dnPath, 'utf8');

dnCode = dnCode.replace(
    /const res = await fetch\([\s\S]*?window\.URL\.revokeObjectURL\(objUrl\);/,
    `let dlUrl = downloadEndpoint + encodeURIComponent(url);
      if (token) dlUrl += '&token=' + encodeURIComponent(token);
      window.open(dlUrl, '_blank');

      setFileInfo({
        name: url.split('/').pop() || 'arquivo',
        size: 'Desconhecido',
        type: 'Download Nativo'
      });`
);

fs.writeFileSync(dnPath, dnCode);
console.log('Update finished');
