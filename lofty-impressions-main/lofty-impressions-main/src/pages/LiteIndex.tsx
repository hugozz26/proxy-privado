import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

const LiteIndex = () => {
  const [url, setUrl] = useState("");
  const [proxyResult, setProxyResult] = useState("");
  const [proxyViewUrl, setProxyViewUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleProxy = async () => {
    if (!auth.currentUser) return;
    try {
      setLoading(true);
      const normalizedUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;

      if (window.BareMux) {
        const bareMux = new window.BareMux.BareMuxConnection("/bare-mux/worker.js");
        const backendOrigin = import.meta.env.VITE_BACKEND_URL || window.location.origin;
        const bareUrl = backendOrigin.replace(/\/$/, '') + "/bare/";
        await bareMux.setTransport("/bare-as-module3/index.mjs", [bareUrl]);
      }

      if ("serviceWorker" in navigator) {
        setProxyResult("Iniciando Service Worker...");
        let registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          registration = await navigator.serviceWorker.register("/sw.js", { scope: window.__uv$config.prefix });
          if (registration.installing) {
            await new Promise(resolve => {
              registration.installing.addEventListener("statechange", (e: any) => {
                if (e.target.state === "activated") resolve(true);
              });
            });
          }
        }
      }

      await new Promise(r => setTimeout(r, 500));

      const encoded = window.__uv$config.encodeUrl(normalizedUrl);
      const proxyUrl = window.__uv$config.prefix + encoded;

      setProxyViewUrl(proxyUrl);
      setProxyResult("Navegando via Ultraviolet (Bare): " + normalizedUrl);
    } catch (err: any) {
      setProxyResult("Erro: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!auth.currentUser) return;
    try {
      setProxyResult("Iniciando download...");
      setLoading(true);
      const token = await auth.currentUser.getIdToken();
      const backendOrigin = import.meta.env.VITE_BACKEND_URL || window.location.origin;
      const downloadEndpoint = backendOrigin.replace(/\/$/, '') + '/download?url=';
      const res = await fetch(downloadEndpoint + encodeURIComponent(url), {
        headers: { Authorization: token }
      });

      if (!res.ok) throw new Error(`Falha no servidor: ${res.statusText}`);

      let fileName = "arquivo_baixado";
      const disposition = res.headers.get("Content-Disposition");
      if (disposition && disposition.includes("filename=")) {
        fileName = disposition.split("filename=")[1].replace(/"/g, "");
      } else {
        try {
          const parsed = new URL(url.startsWith("http") ? url : "https://" + url);
          const fallbackName = parsed.pathname.split("/").pop();
          if (fallbackName) fileName = fallbackName;
        } catch(e) {}
      }

      const blob = await res.blob();
      const objUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objUrl);
      setProxyResult("Download conclu�do!");
    } catch (err: any) {
      setProxyResult("Erro no download: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-8 flex flex-col font-mono">
      <div className="flex items-center justify-between mb-8 max-w-4xl mx-auto w-full">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-indigo-500">
          Proxy/Downloader - Lite
        </h2>
        <div className="space-x-4">
          <a href="/" className="px-4 py-2 border border-border rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-sm">
            Ir para Dashboard (Full)
          </a>
          <button onClick={() => signOut(auth)} className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm border border-red-500/20">
            Sair
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full space-y-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="url"
            placeholder="https://exemplo.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="flex-1 bg-secondary border border-border p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            onKeyDown={(e) => { if (e.key === "Enter") handleProxy(); }}
          />
          <button 
            onClick={handleProxy} 
            disabled={loading}
            className="px-6 py-3 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-600/30 transition-colors disabled:opacity-50"
          >
            Acessar Proxy
          </button>
          <button 
            onClick={handleDownload} 
            disabled={loading}
            className="px-6 py-3 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg hover:bg-indigo-600/30 transition-colors disabled:opacity-50"
          >
            Download
          </button>
        </div>

        {proxyResult && (
          <details className="mt-4" open>
            <summary className="cursor-pointer text-muted-foreground select-none">Status da Execu��o</summary>
            <pre className="mt-2 bg-secondary/80 p-4 border border-border rounded-lg overflow-auto max-h-[250px] text-xs">
              {proxyResult}
            </pre>
          </details>
        )}

        {proxyViewUrl && (
          <div className="mt-6 rounded-xl border border-border overflow-hidden bg-card shadow-2xl h-[70vh] relative">
            <iframe
              title="Proxy Viewer"
              src={proxyViewUrl}
              className="w-full h-full border-0 absolute inset-0 text-white"
              style={{ colorScheme: "dark" }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default LiteIndex;
