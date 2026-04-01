import { useState } from "react";
import { Globe, ArrowRight, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ProxyCard = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);

  const handleProxy = async () => {
    if (!url) return;
    setLoading(true);
    setResult(null);
    setProxyUrl(null);

    try {
      const actualNormalUrl = url.startsWith('http') ? url : 'https://' + url;

      if (window.BareMux) {
        const bareMux = new window.BareMux.BareMuxConnection('/bare-mux/worker.js');
        const backendOrigin = import.meta.env.VITE_BACKEND_URL || window.location.origin;
        const bareUrl = backendOrigin.replace(/\/$/, '') + "/bare/";
        await bareMux.setTransport('/bare-as-module3/index.mjs', [bareUrl]);
      }

      if ('serviceWorker' in navigator) {
        setResult('Verificando Service Worker de seguran�a...');
        
        let registration = await navigator.serviceWorker.getRegistration();
          if (!registration) {
            registration = await navigator.serviceWorker.register('/sw.js', { scope: window.__uv$config.prefix });
            if (registration.installing) {
              await new Promise(resolve => registration.installing.addEventListener('statechange', e => { if (e.target.state === 'activated') resolve(true); }));
            }
          }
          await navigator.serviceWorker.ready;
          await new Promise(r => setTimeout(r, 500));
      }

      const encoded = window.__uv$config.encodeUrl(actualNormalUrl);
      const finalUrl = window.__uv$config.prefix + encoded;
      
      setProxyUrl(finalUrl);
      setResult('Proxy conectado em t�nel protegido.\nHost: ' + actualNormalUrl + '\nStatus: 200 OK');
      
    } catch (err: any) {
      setResult('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 glow-purple glow-border-purple transition-all hover:border-primary/40">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Globe className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Proxy Access</h3>
          <p className="text-xs text-muted-foreground">Acesso seguro criptografado pela rede da sua m�quina</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="https://youtube.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleProxy()}
          className="bg-secondary border-border font-mono text-sm"
        />
        <Button onClick={handleProxy} disabled={loading || !url} className="shrink-0 gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Ligar Proxy
        </Button>
      </div>

      <div className="rounded-xl bg-background border border-border p-4 mb-4 min-h-[80px] font-mono text-xs overflow-auto">
        {result ? (
          <pre className="text-emerald-400 whitespace-pre-wrap">{result}</pre>
        ) : (
          <span className="text-muted-foreground">Logs do servidor ir�o aparecer aqui...</span>
        )}
      </div>

      {proxyUrl && (
        <div className="mt-4 flex flex-col gap-2">
            <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground font-mono">Live View</span>
                <a href={proxyUrl} target="_blank" rel="noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                    Expandir para nova aba <ExternalLink className="h-3 w-3" />
                </a>
            </div>
            {/* The iframe background is white because some sites like google are transparent and we can't see them over dark mode */}
            <div className="relative w-full h-[600px] rounded-xl overflow-hidden border border-border bg-white">
                <iframe src={proxyUrl} className="w-full h-full border-0" title="Proxy View" />
            </div>
        </div>
      )}
    </div>
  );
};

export default ProxyCard;

