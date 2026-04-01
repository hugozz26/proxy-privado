import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [proxyResult, setProxyResult] = useState('');
  const [proxyViewUrl, setProxyViewUrl] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return () => unsub();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      alert('Login failed: ' + err.message);
    }
  };

  const handleProxy = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      
      const normalizedUrl = url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `https://${url}`;

      // Initialize Bare-Mux connection first
      if (window.BareMux) {
        const bareMux = new window.BareMux.BareMuxConnection('/bare-mux/worker.js');
        const bareUrl = 'http://localhost:3001/bare/'; 
        await bareMux.setTransport('/bare-as-module3/index.mjs', [bareUrl]);
      }

      // Request Service worker proxying
      if ('serviceWorker' in navigator) {
        setProxyResult('Iniciando Service Worker do proxy...');
        let registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          registration = await navigator.serviceWorker.register('/sw.js', { scope: window.__uv$config.prefix });
          if (registration.installing) {
              await new Promise(resolve => {
                  registration.installing.addEventListener('statechange', (e) => {
                      if (e.target.state === 'activated') resolve();
                  });
              });
          }
        }
      } // <- this was missing!

      // Encode the URL using UV's XOR encoder
      const encoded = window.__uv$config.encodeUrl(normalizedUrl);
      const proxyUrl = window.__uv$config.prefix + encoded;

      setProxyViewUrl(proxyUrl);
      setProxyResult('Navegando via Ultraviolet (Bare): ' + normalizedUrl);

    } catch (err) {
      setProxyResult('Error: ' + err.message);
    }
  };

  const handleDownload = async () => {
    if (!user) return;
    try {
      setProxyResult('Iniciando download...');
      const token = await user.getIdToken();
      // Using fetch with token for proper auth download
      const res = await fetch('http://localhost:3001/download?url=' + encodeURIComponent(url), {
        headers: { Authorization: token }
      });
      
      if (!res.ok) {
        throw new Error(`Falha no servidor: ${res.statusText}`);
      }

      // Try to get filename from headers
      let fileName = 'arquivo_baixado';
      const disposition = res.headers.get('Content-Disposition');
      if (disposition && disposition.includes('filename=')) {
        fileName = disposition.split('filename=')[1].replace(/"/g, '');
      } else {
        // Fallback to URL path
        try {
           const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
           const fallbackName = parsed.pathname.split('/').pop();
           if (fallbackName) fileName = fallbackName;
        } catch(e) {}
      }
      
      const blob = await res.blob();
      const objUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objUrl);
      setProxyResult('Download concluído!');
    } catch (err) {
      setProxyResult('Erro no download: ' + err.message);
    }
  };

  if (!user) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Proxy Login</h2>
        <form onSubmit={handleLogin}>
          <input type='email' placeholder='Email' value={email} onChange={e => setEmail(e.target.value)} required />
          <input type='password' placeholder='Senha' value={password} onChange={e => setPassword(e.target.value)} required />
          <button type='submit'>Entrar</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Bem-vindo ao Proxy</h2>
      <button onClick={() => signOut(auth)}>Sair</button>
      
      <div style={{ marginTop: 20 }}>
        <input 
          type='url' 
          placeholder='https://exemplo.com' 
          value={url} 
          onChange={e => setUrl(e.target.value)} 
          style={{ width: '300px', padding: 5 }}
        />
        <button onClick={handleProxy} style={{ marginLeft: 10 }}>Proxy</button>
        <button onClick={handleDownload} style={{ marginLeft: 10 }}>Download</button>
      </div>

      {proxyViewUrl && (
        <div style={{ marginTop: 20 }}>
          <iframe
            title='Proxy Viewer'
            src={proxyViewUrl}
            style={{ width: '100%', height: '70vh', border: '1px solid #ccc', borderRadius: 8, background: '#fff' }}
          />
        </div>
      )}

      {proxyResult && (
        <details style={{ marginTop: 16 }}>
          <summary>Status</summary>
          <pre style={{ marginTop: 10, background: '#f4f4f4', padding: 10, overflow: 'auto', maxHeight: '250px' }}>
            {proxyResult}
          </pre>
        </details>
      )}
    </div>
  );
}

export default App;





