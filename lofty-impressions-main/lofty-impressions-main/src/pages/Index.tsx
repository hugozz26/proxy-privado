import { Helmet } from "react-helmet-async";
import DashboardLayout from "@/components/DashboardLayout";
import ProxyCard from "@/components/ProxyCard";
import TokenGeneratorCard from "@/components/TokenGeneratorCard";
import DownloaderCard from "@/components/DownloaderCard";
import ActivityTable from "@/components/ActivityTable";
import { Shield, Zap, Server } from "lucide-react";

const Index = () => {
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
          <ProxyCard />
          <TokenGeneratorCard />
          <DownloaderCard />
        </div>

        {/* Activity */}
        <ActivityTable />
      </div>
    </DashboardLayout>
  );
};

export default Index;
