import { Helmet } from "react-helmet-async";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ProxyCard from "@/components/ProxyCard";
import TokenGeneratorCard from "@/components/TokenGeneratorCard";
import DownloaderCard from "@/components/DownloaderCard";
import ActivityTable from "@/components/ActivityTable";
import { Shield, Zap, Server } from "lucide-react";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

const Index = () => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
          const docRef = doc(db, "admin_users", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setIsAdmin(true);
          }
        } catch (e) {
          console.error("Erro ao checar admin:", e);
        }
      }
    };
    checkAdmin();
  }, []);

  return (
    <DashboardLayout>
      <Helmet>
        <title>GhostNode — Dashboard</title>
        <meta name="description" content="Secure developer dashboard for proxy access, file downloading, and network tools." />
      </Helmet>

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Your Private Internet Gateway
          </h1>
          <p className="text-muted-foreground mt-1">
            Securely access and download content through your personal node.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Uptime", value: "99.97%", icon: Server },
            { label: "Requests Today", value: "1,284", icon: Zap },
            { label: "Threats Blocked", value: "47", icon: Shield },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <stat.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tools */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <ProxyCard />
            
            {isAdmin && (
              <div className="p-6 rounded-2xl border border-border bg-card shadow-sm glow-purple glow-border-purple mt-6">
                <h3 className="text-xl font-bold flex items-center gap-2 mb-2">
                  <Shield className="h-6 w-6 text-primary" />
                  Ferramentas SandBox (Admin)
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Acesso liberado apenas para contas com privilégio de administrador. Baixe o pacote de testes para uso no ambiente local.
                </p>
                <a href="https://drive.google.com/file/d/1sB7wXoIN89VKswEob8GfzuLYTw80coTW/view?usp=sharing" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary leading-none text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full gap-2 mb-3">
                  <Zap className="h-4 w-4" />
                  Baixar Meu_sandbox_pratico.zip
                </a>
                <a href="https://drive.google.com/file/d/1EWh9y6W2SQPyo4SUcWcWDNl0TA2IlLI0/view?usp=sharing" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary leading-none text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full gap-2">
                  <Shield className="h-4 w-4" />
                  Ferramentas Game Mode Extra
                </a>
              </div>
            )}
          </div>
          <div className="space-y-6">
            <TokenGeneratorCard isAdmin={isAdmin} />
            <DownloaderCard />
          </div>
        </div>

        {/* Activity */}
        <ActivityTable />
      </div>
    </DashboardLayout>
  );
};

export default Index;
