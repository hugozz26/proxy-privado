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
      const res = await fetch('http://localhost:3001/proxy?url=' + encodeURIComponent(url), {
        headers: { Authorization: token }
      });
      const data = await res.text();
      setProxyResult(data.substring(0, 1000) + '... (truncated for preview)');
    } catch (err) {
      setProxyResult('Error: ' + err.message);
    }
  };

  const handleDownload = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      // Using fetch with token for proper auth download
      const res = await fetch('http://localhost:3001/download?url=' + encodeURIComponent(url), {
        headers: { Authorization: token }
      });
      
      const blob = await res.blob();
      const objUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = 'downloaded_file';
      a.click();
      window.URL.revokeObjectURL(objUrl);
    } catch (err) {
      alert('Error downloading: ' + err.message);
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

      {proxyResult && (
        <pre style={{ marginTop: 20, background: '#f4f4f4', padding: 10, overflow: 'auto' }}>
          {proxyResult}
        </pre>
      )}
    </div>
  );
}

export default App;

