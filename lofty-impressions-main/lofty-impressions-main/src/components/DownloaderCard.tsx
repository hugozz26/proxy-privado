import { useState } from "react";
import { Download, ArrowRight, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { auth } from "../firebase";

const DownloaderCard = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string; type: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!url) return;
    setLoading(true);
    setFileInfo(null);
    setErrorMsg(null);

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const backendOrigin = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const downloadEndpoint = backendOrigin.replace(/\/$/, '') + '/download?url=';
      let dlUrl = downloadEndpoint + encodeURIComponent(url);
      if (token) dlUrl += '&token=' + encodeURIComponent(token);
      window.open(dlUrl, '_blank');

      setFileInfo({
        name: url.split('/').pop() || 'arquivo',
        size: 'Desconhecido',
        type: 'Download Nativo'
      });
      
      setFileInfo({
        name: fileName,
        size: (blob.size / 1024 / 1024).toFixed(2) + ' MB',
        type: res.headers.get('content-type') || 'application/octet-stream',
      });

    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 glow-blue glow-border-blue transition-all hover:border-accent/40">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
          <Download className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">File Downloader</h3>
          <p className="text-xs text-muted-foreground">Download files through your secure server</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="https://example.com/file.zip"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
          className="bg-secondary border-border font-mono text-sm"
        />
        <Button onClick={handleDownload} disabled={loading || !url} variant="secondary" className="shrink-0 gap-2 border border-accent/20 hover:bg-accent/10 hover:text-accent">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Download via Server
        </Button>
      </div>

      <div className="rounded-xl bg-background border border-border p-4 min-h-[80px]">
        {errorMsg ? (
          <span className="text-red-400 font-mono text-xs">Error: {errorMsg}</span>
        ) : fileInfo ? (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-accent" />
            </div>
            <div className="font-mono text-sm">
              <p className="text-foreground break-all clamp-1">{fileInfo.name}</p>
              <p className="text-muted-foreground text-xs">{fileInfo.size}  {fileInfo.type}</p>
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground font-mono text-xs">File info will appear here...</span>
        )}
      </div>
    </div>
  );
};

export default DownloaderCard;
