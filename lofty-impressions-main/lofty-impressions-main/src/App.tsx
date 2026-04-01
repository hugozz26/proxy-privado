import { useState, useEffect } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import LiteIndex from "./pages/LiteIndex.tsx";
import NotFound from "./pages/NotFound.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield } from "lucide-react";

const queryClient = new QueryClient();

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError('Login falhou: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-card glow-purple glow-border-purple shadow-xl">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Acesso Restrito</h1>
            <p className="text-sm text-muted-foreground mt-1">Fa�a login para acessar seu GhostNode</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Input 
              type="email" 
              placeholder="Email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              className="bg-secondary border-border font-mono"
            />
          </div>
          <div className="space-y-2">
            <Input 
              type="password" 
              placeholder="Senha" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              className="bg-secondary border-border font-mono"
            />
          </div>
          
          {error && <div className="text-red-400 text-xs font-mono p-2 bg-red-400/10 rounded-lg">{error}</div>}
          
          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar na Central'}
          </Button>
        </form>
      </div>
    </div>
  );
};

const ProtectedRoute = ({ children, user }) => {
  if (user === null) {
      return <Login onLogin={() => {}} />;
  }
  return children;
};

const App = () => {
  const [user, setUser] = useState<any>(undefined); // undefined means loading auth state

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  if (user === undefined) {
      // loading state
      return <div className="min-h-screen bg-background flex justify-center items-center">
         <span className="text-muted-foreground animate-pulse text-sm font-mono">Verificando seguran�a...</span>
      </div>;
  }

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            {user ? (
               <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/lite" element={<LiteIndex />} />
                  <Route path="*" element={<NotFound />} />
               </Routes>
            ) : (
               <Login />
            )}
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
};

export default App;


