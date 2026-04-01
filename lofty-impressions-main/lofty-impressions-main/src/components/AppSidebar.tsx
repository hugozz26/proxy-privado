import { LayoutDashboard, Globe, Download, Activity, Settings, Ghost, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Proxy", url: "/proxy", icon: Globe },
  { title: "Downloader", url: "/downloader", icon: Download },
  { title: "Modo Lite", url: "/lite", icon: Ghost },
  { title: "Activity", url: "/activity", icon: Activity },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border flex flex-col">
      <div className="p-4 flex items-center gap-3 border-b border-border">
        <Ghost className="h-7 w-7 text-primary shrink-0" />
        {!collapsed && (
          <span className="font-mono text-lg font-bold tracking-tight text-foreground">
            GhostNode
          </span>
        )}
      </div>
      <SidebarContent className="flex-1">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-muted/50 transition-colors"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter className="p-4 border-t border-border mt-auto">
        <SidebarMenu>
          <SidebarMenuItem>
             <SidebarMenuButton onClick={handleLogout} className="hover:bg-red-500/10 hover:text-red-500 transition-colors">
                <LogOut className="mr-2 h-4 w-4 shrink-0" />
                {!collapsed && <span>Logout</span>}
             </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
