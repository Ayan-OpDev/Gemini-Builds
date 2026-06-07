import React from 'react';
import { ToolId, Tool } from '../types';
import { TOOLS } from '../data/tools';
import { 
  FileText, 
  LayoutDashboard, 
  Scissors, 
  Image as ImageIcon, 
  FileImage, 
  PenTool, 
  Award as StampIcon, 
  QrCode, 
  BookOpen, 
  Unlock, 
  Lock,
  Menu,
  X,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Combine,
  Hash,
  FileSearch,
  LockKeyhole,
  Maximize,
  ShieldBan,
  PaintBucket,
  GitPullRequest,
  FormInput,
  Headphones
} from 'lucide-react';

import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import FloatingQuickActionBall from './FloatingQuickActionBall';

interface ShellProps {
  children: React.ReactNode;
  activeTool: string;
  onSelectTool: (id: string) => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Scissors: Scissors,
  Image: ImageIcon,
  FileImage: FileImage,
  PenTool: PenTool,
  Stamp: StampIcon,
  QrCode: QrCode,
  BookOpen: BookOpen,
  Combine: Combine,
  Hash: Hash,
  FileSearch: FileSearch,
  LockKeyhole: LockKeyhole,
  Unlock: Unlock,
  Maximize: Maximize,
  ShieldBan: ShieldBan,
  PaintBucket: PaintBucket,
  GitPullRequest: GitPullRequest,
  FormInput: FormInput,
  Headphones: Headphones,
  Sparkles: Sparkles
};

interface SidebarContentProps {
  activeTool: string;
  onSelectTool: (id: string) => void;
  setMenuOpen: (open: boolean) => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  user: any;
  profile: any;
  loading: boolean;
  signInWithGoogle: () => void;
  logOut: () => void;
}

function SidebarContent({ 
  activeTool, 
  onSelectTool, 
  setMenuOpen, 
  theme, 
  setTheme, 
  user, 
  profile, 
  loading, 
  signInWithGoogle, 
  logOut 
}: SidebarContentProps) {
  const routerLocation = useLocation();
  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-y-hidden select-none">
      {/* Top Group: List items & selectors */}
      <div className="flex-1 overflow-y-auto p-5 space-y-7 scrollbar">
        
        {/* Drawer Header Close Row */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Menu Navigation
          </span>
          <button 
            onClick={() => setMenuOpen(false)}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 Transition-colors cursor-pointer"
            title="Close menu drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main items panel */}
        <div className="space-y-4">
          <span className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">
            Workspace
          </span>
          
          <button
            id="sidebar-nav-dashboard"
            onClick={() => {
               onSelectTool('dashboard');
               setMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all focus:outline-none ${
              activeTool === 'dashboard'
                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-l-2 border-emerald-500 rounded-l-none pl-2.5 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Dashboard Overview
            </span>
          </button>

          <button
            id="sidebar-nav-local"
            onClick={() => {
               onSelectTool('local');
               setMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all focus:outline-none ${
              routerLocation.pathname.startsWith('/local') && !routerLocation.pathname.startsWith('/local/summarizer')
                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-l-2 border-emerald-500 rounded-l-none pl-2.5 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Scissors className="w-4 h-4" />
              Local Tools
            </span>
          </button>

          <button
            id="sidebar-nav-summarizer"
            onClick={() => {
               onSelectTool('summarizer');
               setMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all focus:outline-none ${
              activeTool === 'summarizer'
                ? 'bg-violet-50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-400 border-l-2 border-violet-500 rounded-l-none pl-2.5 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              PDF Summarizer
            </span>
          </button>

          <button
            id="sidebar-nav-flashcards"
            onClick={() => {
               onSelectTool('flashcards');
               setMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all focus:outline-none ${
              activeTool === 'flashcards'
                ? 'bg-violet-50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-400 border-l-2 border-violet-500 rounded-l-none pl-2.5 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Flashcard Studio
            </span>
          </button>
        </div>

        {/* Mobile Theme selector settings */}
        <div className="md:hidden pt-5 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <span className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
            Theme Appearance
          </span>
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200/60 dark:border-slate-700/60 shadow-inner">
            <button
              onClick={() => setTheme('light')}
              className={`flex-grow flex justify-center items-center gap-1.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                theme === 'light'
                  ? 'bg-white dark:bg-slate-700 text-amber-500 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex-grow flex justify-center items-center gap-1.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                theme === 'dark'
                  ? 'bg-white dark:bg-slate-700 text-indigo-400 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Dark</span>
            </button>
            <button
              onClick={() => setTheme('system')}
              className={`flex-grow flex justify-center items-center gap-1.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                theme === 'system'
                  ? 'bg-white dark:bg-slate-700 text-emerald-500 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>System</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar Account and Footer Info (Bottom group with mt-auto) */}
      <div className="mt-auto p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 space-y-4 shrink-0">
        {/* Account Details & Sign Out for Mobile viewports */}
        <div className="md:hidden">
          {loading ? (
            <div className="text-xs text-slate-400 py-2">Loading account details...</div>
          ) : user ? (
            <div className="flex flex-col gap-2.5 p-3.5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-9 h-9 rounded-full border border-slate-200 dark:border-slate-700 shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                      {(profile?.name || user.displayName || 'U')[0]}
                    </span>
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate pr-1">
                    {profile?.name || user.displayName || 'User'}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                    {user.email}
                  </span>
                </div>
              </div>
              
              <button 
                onClick={logOut} 
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-xl text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 border border-rose-100 dark:border-rose-900/50 transition-all cursor-pointer focus:outline-none"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button 
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/15 cursor-pointer transition-all"
              title="Sign in with Google"
            >
              Sign In with Google
            </button>
          )}
        </div>

        <div className="flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200">Local Sandbox Mode</span>
            <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-normal">
              All PDF.js and pdf-lib calls are held in memory. No files ever leave this container.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Shell({ children, activeTool, onSelectTool }: ShellProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const location = useLocation();
  const isAIMode = location.pathname.startsWith('/ai');
  const { user, profile, loading, signInWithGoogle, logOut } = useAuth();

  // Load global theme option with Light, Dark, System values
  const [theme, setTheme] = React.useState<'light' | 'dark' | 'system'>(() => {
    try {
      return (localStorage.getItem('pdf_workspace_theme') as 'light' | 'dark' | 'system') || 'system';
    } catch {
      return 'system';
    }
  });

  // Synchronize Dark / Light document settings
  React.useEffect(() => {
    const root = window.document.documentElement;
    
    const applyTheme = () => {
      root.classList.remove('light', 'dark');

      if (theme === 'dark') {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else if (theme === 'light') {
        root.classList.add('light');
        root.style.colorScheme = 'light';
      } else {
        // Evaluate system query
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (systemPrefersDark) {
          root.classList.add('dark');
          root.style.colorScheme = 'dark';
        } else {
          root.classList.add('light');
          root.style.colorScheme = 'light';
        }
      }
    };

    applyTheme();
    try {
      localStorage.setItem('pdf_workspace_theme', theme);
    } catch (e) {
      console.error(e);
    }

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        root.classList.remove('light', 'dark');
        if (e.matches) {
          root.classList.add('dark');
          root.style.colorScheme = 'dark';
        } else {
          root.classList.add('light');
          root.style.colorScheme = 'light';
        }
      };
      
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
      } else {
        mediaQuery.addListener(listener);
        return () => mediaQuery.removeListener(listener);
      }
    }
  }, [theme]);

  return (
    <div id="application-shell" className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans transition-colors duration-300">
      
      {/* Upper Navigation Header */}
      <header id="shell-header" className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 h-16 flex items-center justify-between px-6 transition-colors duration-300 select-none">
        
        <div className="flex items-center gap-3">
          {/* Universal Hamburger Button */}
          <button
            id="workspace-burger-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer focus:outline-none"
            aria-label="Toggle navigation drawer"
            title="Toggle workspace menu"
          >
            {menuOpen ? <X className="w-5 h-5 text-emerald-600" /> : <Menu className="w-5 h-5" />}
          </button>

          <div
            onClick={() => {
              onSelectTool('dashboard');
              setMenuOpen(false);
            }}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <div className="p-2 bg-emerald-600 rounded-lg text-white group-hover:scale-105 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
              PDF Editor & Reader
            </span>
          </div>
        </div>

          {/* Security & Client-Side indicator & Theme Controller */}
          <div className="flex items-center gap-4">
            
            {isAIMode && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full border border-amber-200/60 dark:border-amber-700/50 text-[10px] font-bold select-none whitespace-nowrap">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                <span>Credits: {profile?.credits ?? (user ? '...' : 0)}</span>
              </div>
            )}

            {/* User Auth Controller - Desktop only */}
            <div className="hidden md:block">
              {loading ? (
                <div className="text-xs text-slate-400">Loading...</div>
              ) : user ? (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{profile?.name || user.displayName || 'User'}</span>
                    <button onClick={logOut} className="text-[10px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                      Sign Out
                    </button>
                  </div>
                  {user.photoURL && (
                    <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700" />
                  )}
                </div>
              ) : (
                <button 
                  onClick={signInWithGoogle}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                  title="Sign in with Google"
                >
                  Sign In
                </button>
              )}
            </div>

            {/* Theme Selector Tab Widget - Desktop only */}
            <div className="hidden md:flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200/60 dark:border-slate-700/60 shadow-inner">
              <button
                onClick={() => setTheme('light')}
                className={`p-1.5 rounded-md transition-all focus:outline-none cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white dark:bg-slate-700 text-amber-500 shadow-xs ring-1 ring-black/5 font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
                title="Light style theme"
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`p-1.5 rounded-md transition-all focus:outline-none cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-white dark:bg-slate-700 text-indigo-400 dark:text-indigo-300 shadow-xs ring-1 ring-black/5 font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
                title="Dark style theme"
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setTheme('system')}
                className={`p-1.5 rounded-md transition-all focus:outline-none cursor-pointer ${
                  theme === 'system'
                    ? 'bg-white dark:bg-slate-700 text-emerald-500 shadow-xs ring-1 ring-black/5 font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
                title="Sync with OS System theme override"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
            </div>

            {isAIMode ? (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-violet-50 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300 rounded-full border border-violet-200 dark:border-violet-700/40 text-[10px] font-bold select-none">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                </span>
                AI Engine Active
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-800 dark:text-emerald-400 rounded-full border border-emerald-100 dark:border-emerald-900/40 text-[10px] font-bold select-none">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                100% Private Client Execution
              </div>
            )}
          </div>
      </header>

      {/* Primary body divider: Left Sidebar + Main Content */}
      <div id="shell-body" className="flex-1 flex relative overflow-hidden">
        
        {/* UNIFIED BURGER SLIDING DRAWER MENU (Universal for all viewports) */}
        <aside
          id="shell-sidebar-drawer"
          style={{ height: '100dvh' }}
          className={`shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 fixed top-0 bottom-0 left-0 w-72 transform ${
            menuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
          } transition-transform duration-300 ease-in-out z-50 flex flex-col justify-between h-screen h-[100dvh] overflow-y-hidden`}
        >
          <SidebarContent 
            activeTool={activeTool} 
            onSelectTool={onSelectTool} 
            setMenuOpen={setMenuOpen} 
            theme={theme}
            setTheme={setTheme}
            user={user}
            profile={profile}
            loading={loading}
            signInWithGoogle={signInWithGoogle}
            logOut={logOut}
          />
        </aside>

        {/* Background Shade Overlay When Menu Drawer is Toggled Open */}
        {menuOpen && (
          <div
            id="drawer-backdrop-shading"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 transition-all duration-300 cursor-pointer"
          />
        )}

        {/* Primary View Area */}
        <main id="shell-main" className={`flex-1 max-w-full ${isAIMode ? 'p-0 overflow-hidden' : 'p-6 overflow-y-auto'}`}>
          {children}
        </main>
      </div>

      {/* Floating touch gesture tool selector for Mobile/Tablet viewports */}
      <div className="md:hidden">
        <FloatingQuickActionBall activeTool={activeTool} onSelectTool={onSelectTool} />
      </div>
    </div>
  );
}
