import { Shield, User } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";

const Topbar = () => {
  return (
    <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-glow" />
          <span className="text-muted-foreground hidden sm:inline">Secure Connection Active</span>
        </div>
        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center border border-border">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </header>
  );
};

export default Topbar;
