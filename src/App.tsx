import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { Ticket, Sector, User, Status, Comment, Notification } from './types';
import { 
  Plus, Search, Bell, User as UserIcon, LogOut, 
  MessageSquare, ChevronRight, Moon, Sun,
  AlertCircle, Send, X, Shield, Settings, Mail, Lock, Paperclip, FileText, Download, Edit,
  BarChart3, LayoutGrid, Menu, ArrowLeft, Zap, Users as UsersIcon, Sparkles, Building2, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AdminPanel } from './components/AdminPanel';
import { apiFetch } from './lib/apiFetch';
import { ToastProvider, useToast } from './components/Toast';

const TICKETS_PAGE_SIZE = 50;
const COMMENTS_PAGE_SIZE = 100;
const METRICS_TICKETS_LIMIT = 200;
const THEME_STORAGE_PREFIX = 'gestao360:theme';
const TICKETS_VIEW_STORAGE_KEY = 'gestao360:tickets-view';
const getThemeStorageKey = (userId?: number | null) => `${THEME_STORAGE_PREFIX}:${userId ?? 'default'}`;

type AppShellContext = {
  notifications: Notification[];
  markAsRead: (id: number) => Promise<void>;
};

type AuthMode = 'login' | 'register';
type TicketFilters = {
  period_months: string;
  sector_solicitor: string;
  sector_executor: string;
  status_ids: string[];
  search: string;
};
type TicketsViewMode = 'cards' | 'kanban';
type DashboardPeriod = '30d' | '3m' | '6m' | '1y';
type DashboardSectorMetricBase = {
  sectorId: number | null;
  name: string;
  total: number;
  done: number;
  pending: number;
};
type DashboardSectorMetric = DashboardSectorMetricBase & { completionRate: number };

const dashboardPeriodOptions: Array<{ value: DashboardPeriod; label: string }> = [
  { value: '30d', label: 'Ultimos 30 dias' },
  { value: '3m', label: 'Ultimos 3 meses' },
  { value: '6m', label: 'Ultimos 6 meses' },
  { value: '1y', label: 'Ultimo ano' },
];

const DASHBOARD_FALLBACK_CHART_COLORS = ['#2563eb', '#0ea5e9', '#14b8a6', '#f97316', '#84cc16'];

const getDashboardStatusColor = (statusName: string, index: number) => {
  const normalizedName = statusName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalizedName.includes('abert')) return '#ef4444';
  if (normalizedName.includes('andamento') || normalizedName.includes('atend')) return '#f59e0b';
  if (normalizedName.includes('conclu')) return '#16a34a';

  return DASHBOARD_FALLBACK_CHART_COLORS[index % DASHBOARD_FALLBACK_CHART_COLORS.length];
};

const getDashboardStatusStyle = (statusName: string, index = 0) => {
  const color = getDashboardStatusColor(statusName, index);

  return {
    color,
    borderColor: `${color}55`,
    backgroundColor: `${color}1a`,
  };
};

const isThemeValue = (value: string | null): value is 'light' | 'dark' =>
  value === 'light' || value === 'dark';

const areTicketFiltersEqual = (a: TicketFilters, b: TicketFilters) =>
  a.period_months === b.period_months &&
  a.sector_solicitor === b.sector_solicitor &&
  a.sector_executor === b.sector_executor &&
  a.search === b.search &&
  a.status_ids.length === b.status_ids.length &&
  a.status_ids.every((value, index) => value === b.status_ids[index]);

const getPeriodStartIso = (months: string) => {
  if (months === 'all') return null;

  const parsedMonths = Number(months);
  if (Number.isNaN(parsedMonths) || parsedMonths <= 0) return null;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setMonth(start.getMonth() - parsedMonths);
  return start.toISOString();
};

const getPeriodEndIso = () => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
};

const getDashboardPeriodStartIso = (period: DashboardPeriod) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  if (period === '30d') {
    start.setDate(start.getDate() - 30);
    return start.toISOString();
  }

  if (period === '3m') {
    start.setMonth(start.getMonth() - 3);
    return start.toISOString();
  }

  if (period === '6m') {
    start.setMonth(start.getMonth() - 6);
    return start.toISOString();
  }

  start.setFullYear(start.getFullYear() - 1);
  return start.toISOString();
};

const fetchWithRetry = async (url: string, options?: RequestInit, retries = 3): Promise<any> => {
  try {
    const res = await apiFetch(url, options);
    if (res.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      if (retries > 0) return fetchWithRetry(url, options, retries - 1);
      throw new Error('Too many requests. Please try again later.');
    }
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    if (retries > 0 && !(err instanceof Error && err.message.includes('429'))) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
};

function Login({ initialMode = 'login', onBack }: { initialMode?: AuthMode; onBack?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegistering, setIsRegistering] = useState(initialMode === 'register');
  const { login, signup } = useAuth();
  const toast = useToast();

  useEffect(() => {
    setIsRegistering(initialMode === 'register');
  }, [initialMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isRegistering) {
        await signup(email, name, password);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      toast.error(err.message || 'Ocorreu um erro. Tente novamente.');
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(var(--primary-rgb),0.2),transparent_34%),radial-gradient(circle_at_85%_12%,rgba(14,165,233,0.16),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.52)_0%,rgba(255,255,255,0)_45%)] dark:bg-[linear-gradient(145deg,rgba(6,19,23,0.2)_0%,rgba(6,19,23,0)_48%)]" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative"
      >
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-24 h-24 bg-primary/20 rounded-3xl rotate-12 blur-2xl" />
        
        <div className="ui-surface rounded-[2rem] p-8 sm:p-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/80 to-transparent opacity-80" />
          
          {onBack && (
            <div className="mb-6 flex justify-start">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <ArrowLeft size={14} />
                Voltar
              </button>
            </div>
          )}

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/12 text-primary mb-6 border border-primary/15">
              <Shield size={32} />
            </div>
            <h1 className="text-4xl font-black tracking-tighter mb-2">Gestão 360</h1>
            <p className="text-muted-foreground font-semibold">
              {isRegistering ? 'Crie sua conta e a estrutura inicial do tenant' : 'Entre para acompanhar tickets e prioridades'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isRegistering && (
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                  Seu Nome
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input
                    type="text"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="ui-input w-full pl-12 font-medium"
                    placeholder="Seu nome completo"
                    autoComplete="name"
                    required={isRegistering}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ui-input w-full pl-12 font-medium"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input
                  type="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ui-input w-full pl-12 font-medium"
                  placeholder="••••••••"
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
                  required
                  minLength={6}
                />
              </div>
            </div>

            <button
              type="submit"
              className="ui-btn-primary w-full py-4 uppercase tracking-wider shadow-[0_20px_45px_-28px_rgba(var(--primary-rgb),0.75)]"
            >
              {isRegistering ? 'Cadastrar' : 'Entrar'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-border/70 flex flex-col gap-3 text-center">
            <button 
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-sm font-bold text-primary/90 hover:text-primary transition-colors"
            >
              {isRegistering ? 'Já possui acesso? Faça login' : 'Não tem conta? Cadastre-se agora'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function PublicLanding({
  onSelectMode,
  theme,
  onToggleTheme
}: {
  onSelectMode: (mode: AuthMode) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}) {
  const highlights = [
    {
      title: 'Chamados intersetoriais sem ruído',
      description: 'Centralize solicitações entre áreas com fluxo claro de origem, execução e acompanhamento.',
      icon: <Zap size={18} />
    },
    {
      title: 'Visão operacional em tempo real',
      description: 'Dashboard, fila pessoal, tickets recentes e notificações em um único painel.',
      icon: <BarChart3 size={18} />
    },
    {
      title: 'Governança para admins',
      description: 'Gerencie setores, usuários e estrutura do tenant sem sair da aplicação.',
      icon: <UsersIcon size={18} />
    }
  ];

  const featurePills = ['Tickets', 'Dashboard', 'Notificações', 'Administração', 'Anexos'];

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(var(--primary-rgb),0.22),transparent_32%),radial-gradient(circle_at_88%_8%,rgba(14,165,233,0.16),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.35),rgba(255,255,255,0))] dark:bg-[radial-gradient(circle_at_12%_10%,rgba(var(--primary-rgb),0.18),transparent_32%),radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.16),transparent_36%),linear-gradient(180deg,rgba(6,16,19,0.08),rgba(6,16,19,0))]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col gap-8">
        <header className="flex items-center justify-between rounded-full border border-border/70 bg-card/65 px-5 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12 text-primary">
              <Building2 size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Gestão 360</p>
              <p className="text-sm font-semibold">Coordenação entre setores com contexto compartilhado</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-background/80 transition-colors hover:bg-muted/60"
              aria-label={`Ativar tema ${theme === 'light' ? 'escuro' : 'claro'}`}
              title={`Ativar tema ${theme === 'light' ? 'escuro' : 'claro'}`}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              type="button"
              onClick={() => onSelectMode('login')}
              className="hidden rounded-full border border-border/70 bg-background/80 px-4 py-2 text-sm font-bold transition-colors hover:bg-muted/60 md:inline-flex"
            >
              Entrar
            </button>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-primary">
                <Sparkles size={14} />
                Fluxo intersetorial sem atrito
              </div>

              <div className="space-y-4">
                <h1 className="max-w-3xl text-5xl font-black leading-none tracking-tight sm:text-6xl">
                  Organize pedidos entre setores sem perder contexto, prioridade ou prazo.
                </h1>
                <p className="max-w-2xl text-lg font-medium leading-8 text-muted-foreground">
                  O Gestão 360 concentra tickets, responsáveis, notificações e status em uma operação única para times que dependem uns dos outros.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => onSelectMode('login')}
                  className="ui-btn-primary px-7 py-4 text-sm uppercase tracking-wider"
                >
                  Entrar na plataforma
                </button>
                <button
                  type="button"
                  onClick={() => onSelectMode('register')}
                  className="ui-btn-secondary px-7 py-4 text-sm uppercase tracking-wider"
                >
                  Criar conta
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {featurePills.map((pill) => (
                  <span key={pill} className="ui-chip">
                    {pill}
                  </span>
                ))}
              </div>
            </motion.div>

            <div className="grid gap-4 md:grid-cols-3">
              {highlights.map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * (index + 1) }}
                  className="ui-surface-soft p-5"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                    {item.icon}
                  </div>
                  <h2 className="text-lg font-bold">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </section>

          <motion.aside
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            className="ui-surface relative overflow-hidden p-6 sm:p-8"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary/90 to-transparent" />
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Como o produto funciona</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight">Uma trilha simples para cada demanda</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Cada ticket nasce com setor solicitante e executor, percorre status lineares e mantém histórico, anexos e notificações no mesmo lugar.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-border/70 bg-background/75 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-primary">1. Solicitar</p>
                  <p className="mt-2 text-sm text-muted-foreground">Abra um ticket e direcione para o setor executor certo.</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/75 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-primary">2. Acompanhar</p>
                  <p className="mt-2 text-sm text-muted-foreground">Use dashboard, comentários e notificações para destravar a execução.</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/75 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-primary">3. Governar</p>
                  <p className="mt-2 text-sm text-muted-foreground">Admins mantêm setores e usuários organizados dentro do tenant.</p>
                </div>
              </div>

              <div className="rounded-3xl border border-primary/15 bg-primary/8 p-5">
                <p className="text-sm font-semibold text-foreground">Pronto para centralizar a operação?</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Entre para acessar o ambiente da sua organização ou crie a estrutura inicial em poucos passos.
                </p>
                <button
                  type="button"
                  onClick={() => onSelectMode('login')}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-black uppercase tracking-wider text-primary"
                >
                  Acessar agora
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  );
}

function PublicExperience() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const themeStorageKey = getThemeStorageKey();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const persisted = localStorage.getItem(themeStorageKey);
    return isThemeValue(persisted) ? persisted : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(themeStorageKey, theme);
  }, [theme, themeStorageKey]);

  if (authMode) {
    return <Login initialMode={authMode} onBack={() => setAuthMode(null)} />;
  }

  return <PublicLanding onSelectMode={setAuthMode} theme={theme} onToggleTheme={() => setTheme((prev) => prev === 'light' ? 'dark' : 'light')} />;
}

function TicketModal({ onClose, onCreated }: { onClose: () => void, onCreated: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    executor_sector_id: '',
    executor_id: '',
    attachments: [] as string[]
  });
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const body = new FormData();
    body.append('file', file);

    try {
      const res = await apiFetch('/api/upload', {
        method: 'POST',
        body
      });
      const data = await res.json();
      if (data.url) {
        setFormData(prev => ({ ...prev, attachments: [...prev.attachments, data.url] }));
      }
    } catch (err) {
      console.error("Upload failed:", err);
      toast.error('Falha ao enviar arquivo.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    apiFetch(`/api/sectors?tenant_id=${user?.tenant_id}`).then(res => res.json()).then(setSectors);
  }, [user]);

  useEffect(() => {
    if (formData.executor_sector_id) {
      apiFetch(`/api/users?tenant_id=${user?.tenant_id}&sector_id=${formData.executor_sector_id}`)
        .then(res => res.json())
        .then(setUsers);
    }
  }, [formData.executor_sector_id, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.tenant_id || !user?.id || !user?.sector_id) {
      toast.warning('Dados do usuario nao carregados completamente.');
      return;
    }

    const res = await apiFetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formData.title,
        description: formData.description,
        attachments: formData.attachments,
        executor_sector_id: formData.executor_sector_id ? Number(formData.executor_sector_id) : null,
        executor_id: formData.executor_id ? Number(formData.executor_id) : null,
        tenant_id: user.tenant_id,
        solicitor_id: user.id,
        solicitor_sector_id: user.sector_id
      }),
    });
    if (res.ok) {
      toast.success('Ticket criado com sucesso.');
      onCreated();
      onClose();
    } else {
      const data = await res.json();
      console.error("Ticket creation failed:", data);
      toast.error(`Erro ao criar ticket: ${data.error || 'Erro desconhecido'}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="ui-surface flex w-full max-w-2xl max-h-[92vh] flex-col overflow-hidden rounded-[1.75rem] sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/35 p-4 sm:p-6">
          <h2 className="text-xl font-bold">Novo Ticket</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors"><X size={20}/></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 space-y-4 sm:p-6">
          <div>
            <label className="block text-sm font-medium mb-1">Título</label>
            <input
              required
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
              className="ui-input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Setor Executor</label>
            <select
              required
              value={formData.executor_sector_id}
              onChange={e => setFormData({...formData, executor_sector_id: e.target.value, executor_id: ''})}
              className="ui-select w-full"
            >
              <option value="">Selecione o setor</option>
              {sectors.filter(s => s.id !== user?.sector_id).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Executor (Opcional)</label>
            <select
              value={formData.executor_id}
              onChange={e => setFormData({...formData, executor_id: e.target.value})}
              className="ui-select w-full"
              disabled={!formData.executor_sector_id}
            >
              <option value="">Selecione o executor</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Descrição</label>
            <textarea
              required
              rows={4}
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              className="ui-input w-full resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Anexos</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.attachments.map((url, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted/70 border border-border/60 p-2 rounded-xl text-xs">
                  <FileText size={14} />
                  <span className="truncate max-w-[100px]">Anexo {i + 1}</span>
                  <button 
                    type="button" 
                    onClick={() => setFormData(prev => ({ ...prev, attachments: prev.attachments.filter((_, idx) => idx !== i) }))}
                    className="hover:text-destructive"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-border/80 rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
              <Paperclip size={18} className={uploading ? 'animate-pulse' : ''} />
              <span className="text-sm font-medium">{uploading ? 'Enviando...' : 'Adicionar Anexo'}</span>
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
          </div>
          <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="ui-btn-secondary w-full px-4 py-2 sm:w-auto">Cancelar</button>
            <button type="submit" className="ui-btn-primary w-full px-6 py-2 sm:w-auto">Criar Ticket</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function TicketDetail({ ticketId, onClose }: { ticketId: number, onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const [uploadingComment, setUploadingComment] = useState(false);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [mentionUsers, setMentionUsers] = useState<User[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAttachments, setEditAttachments] = useState<string[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchTicket = async () => {
    const res = await apiFetch(`/api/tickets/${ticketId}`);
    const data = await res.json();
    setTicket(data);
    setEditTitle(data.title);
    setEditDescription(data.description);
    setEditAttachments(data.attachments || []);
  };

  const fetchComments = async (options?: { append?: boolean }) => {
    const offset = options?.append ? comments.length : 0;
    const limit = COMMENTS_PAGE_SIZE + 1;
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      order: 'desc'
    });

    try {
      if (options?.append) setCommentsLoadingMore(true);
      const res = await apiFetch(`/api/tickets/${ticketId}/comments?${params}`);
      const data = await res.json();
      const hasMore = data.length > COMMENTS_PAGE_SIZE;
      const page = (hasMore ? data.slice(0, COMMENTS_PAGE_SIZE) : data).reverse();
      setComments(prev => (options?.append ? [...page, ...prev] : page));
      setCommentsHasMore(hasMore);
    } finally {
      if (options?.append) setCommentsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchTicket();
    fetchComments();
    apiFetch(`/api/statuses?tenant_id=${user?.tenant_id}`).then(res => res.json()).then(setStatuses);
  }, [ticketId, user]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && commentAttachments.length === 0) return;
    const res = await apiFetch(`/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        user_id: user?.id, 
        content: newComment,
        attachments: commentAttachments
      }),
    });
    if (res.ok) {
      setNewComment('');
      setCommentAttachments([]);
      fetchTicket();
      fetchComments();
    }
  };

  const handleCommentFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingComment(true);
    const body = new FormData();
    body.append('file', file);

    try {
      const res = await apiFetch('/api/upload', {
        method: 'POST',
        body
      });
      const data = await res.json();
      if (data.url) {
        setCommentAttachments(prev => [...prev, data.url]);
      }
    } catch (err) {
      console.error("Upload failed:", err);
      toast.error('Falha ao enviar arquivo.');
    } finally {
      setUploadingComment(false);
    }
  };

  const handleNextStatus = async () => {
    if (!ticket) return;
    const nextStatus = statuses.find(s => s.sequence === ticket.status_sequence + 1);
    if (!nextStatus) return;

    const res = await apiFetch(`/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_id: nextStatus.id, user_id: user?.id, role: user?.role }),
    });
    if (res.ok) {
      toast.success('Status atualizado com sucesso.');
      fetchTicket();
    }
    else {
      const data = await res.json();
      toast.error(data.error || 'Falha ao atualizar status.');
    }
  };

  const handleMention = (u: User) => {
    const lastAt = newComment.lastIndexOf('@');
    const text = newComment.substring(0, lastAt) + `@[${u.name}](${u.id}) `;
    setNewComment(text);
    setShowMentions(false);
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim() || !editDescription.trim()) return;
    setIsSavingEdit(true);
    try {
      const res = await apiFetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          title: editTitle,
          description: editDescription,
          attachments: editAttachments
        }),
      });
      if (res.ok) {
        toast.success('Ticket atualizado com sucesso.');
        setIsEditing(false);
        fetchTicket();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Falha ao atualizar ticket.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Falha ao atualizar ticket.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleEditFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const body = new FormData();
    body.append('file', file);

    try {
      const res = await apiFetch('/api/upload', { method: 'POST', body });
      const data = await res.json();
      if (data.url) setEditAttachments(prev => [...prev, data.url]);
    } catch (err) {
      console.error(err);
      toast.error('Falha ao enviar arquivo.');
    }
  };

  const onCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewComment(val);
    if (val.endsWith('@')) {
      apiFetch(`/api/users?tenant_id=${user?.tenant_id}&sector_id=${ticket?.executor_sector_id}`)
        .then(res => res.json())
        .then(setMentionUsers);
      setShowMentions(true);
    } else if (!val.includes('@')) {
      setShowMentions(false);
    }
  };

  if (!ticket) return null;

  const nextStatus = statuses.find(s => s.sequence === ticket.status_sequence + 1);

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        className="ui-surface flex h-full max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] sm:rounded-3xl"
      >
        <div className="flex flex-col gap-4 border-b bg-muted/30 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-1">
              <span>#{ticket.id}</span>
              <span>•</span>
              <span>{new Date(ticket.created_at).toLocaleString()}</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight break-words">{ticket.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm sm:gap-4">
                <span className="flex min-w-0 items-center gap-1 break-words"><UserIcon size={14} className="shrink-0" /> {ticket.solicitor_name} ({ticket.solicitor_sector_name})</span>
                <ChevronRight size={14} className="hidden opacity-50 sm:block"/>
                <span className="flex min-w-0 items-center gap-1 break-words">
                  <UserIcon size={14}/> 
                  {ticket.executor_name || 'Não atribuído'} 
                  {ticket.executor_sector_name ? ` (${ticket.executor_sector_name})` : ' (Sem setor)'}
                </span>
              </div>
          </div>
          <div className="flex w-full items-start justify-between gap-3 sm:w-auto sm:flex-col sm:items-end">
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {(user?.role === 'admin' || user?.id === ticket.solicitor_id) && !isEditing && (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="p-2 hover:bg-primary/10 text-primary rounded-full transition-colors"
                  title="Editar Ticket"
                >
                  <Edit size={18}/>
                </button>
              )}
              <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors"><X size={20}/></button>
            </div>
            <div className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold uppercase tracking-wider">
              {ticket.status_name}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-8 sm:p-6">
          {isEditing ? (
            <div className="space-y-6 rounded-2xl border-2 border-primary/20 bg-muted/20 p-4 sm:p-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Título do Ticket</label>
                <input 
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="ui-input w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Descrição Detalhada</label>
                <textarea 
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="ui-input w-full min-h-[150px]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Anexos</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {editAttachments.map((url, i) => (
                    <div key={i} className="flex items-center gap-2 bg-background border p-2 rounded-lg text-xs">
                      <FileText size={14} />
                      <span className="truncate max-w-[150px]">Anexo {i + 1}</span>
                      <button 
                        type="button" 
                        onClick={() => setEditAttachments(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-destructive hover:bg-destructive/10 p-1 rounded"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-background border-2 border-dashed rounded-xl text-sm cursor-pointer hover:bg-muted transition-colors">
                  <Paperclip size={16} />
                  <span>Adicionar Anexo</span>
                  <input type="file" className="hidden" onChange={handleEditFileUpload} />
                </label>
              </div>
              <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row">
                <button 
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="ui-btn-primary flex-1 py-3 disabled:opacity-50"
                >
                  {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="ui-btn-secondary px-6 py-3"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-muted/20 p-4 rounded-xl border">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Descrição</h3>
              <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
              {ticket.attachments && ticket.attachments.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {ticket.attachments.map((url, i) => (
                    <a 
                      key={i} 
                      href={url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-background border p-2 rounded-lg text-xs hover:bg-muted transition-colors"
                    >
                      <FileText size={14} />
                      <span>Anexo {i + 1}</span>
                      <Download size={14} className="opacity-50" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Histórico e Comentários</h3>
            {commentsHasMore && (
              <button
                type="button"
                onClick={() => fetchComments({ append: true })}
                disabled={commentsLoadingMore}
                className="w-full py-2 text-xs font-bold uppercase tracking-widest rounded-xl border bg-muted/30 hover:bg-muted transition-colors disabled:opacity-50"
              >
                {commentsLoadingMore ? 'Carregando...' : 'Carregar comentários anteriores'}
              </button>
            )}
            {comments.map(c => (
              <div key={c.id} className={`flex flex-col ${c.type === 'system' ? 'items-center' : 'items-start'}`}>
                {c.type === 'system' ? (
                  <div className="bg-muted px-4 py-1 rounded-full text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">
                    {c.content}
                  </div>
                ) : (
                  <div className={`max-w-full p-3 rounded-2xl border sm:max-w-[80%] ${c.user_id === user?.id ? 'bg-primary text-primary-foreground ml-auto' : 'bg-card'}`}>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-bold opacity-70 uppercase">{c.user_name}</span>
                      <span className="text-[10px] opacity-50">{new Date(c.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm">{c.content.replace(/@\[([^\]]+)\]\(\d+\)/g, '@$1')}</p>
                    {c.attachments && c.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {c.attachments.map((url, i) => (
                          <a 
                            key={i} 
                            href={url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 p-2 rounded-lg text-[10px] border transition-colors ${
                              c.user_id === user?.id ? 'bg-primary-foreground/10 border-primary-foreground/20 hover:bg-primary-foreground/20' : 'bg-muted border-transparent hover:bg-muted/80'
                            }`}
                          >
                            <FileText size={12} />
                            <span>Anexo {i + 1}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t bg-muted/10 p-4 space-y-4 sm:p-6">
          {nextStatus && (user?.id === ticket.executor_id || user?.role === 'admin') && (
            <button onClick={handleNextStatus} className="ui-btn-primary w-full py-3 flex items-center justify-center gap-2">
              Mudar para: {nextStatus.name} <ChevronRight size={18}/>
            </button>
          )}

          <form onSubmit={handleComment} className="relative">
            <div className="flex flex-wrap gap-2 mb-2">
              {commentAttachments.map((url, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted p-2 rounded-lg text-[10px]">
                  <FileText size={12} />
                  <span className="truncate max-w-[80px]">Anexo {i + 1}</span>
                  <button 
                    type="button" 
                    onClick={() => setCommentAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    className="hover:text-destructive"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="relative">
              <textarea
                value={newComment}
                onChange={onCommentChange}
                placeholder="Digite seu comentário... Use @ para mencionar"
                className="ui-input w-full resize-none pb-14 pr-4 sm:pb-3 sm:pr-24"
                rows={2}
              />
              <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 sm:inset-x-auto sm:right-3 sm:left-auto sm:justify-start">
                <label className="p-2 hover:bg-muted rounded-lg cursor-pointer transition-colors">
                  <Paperclip size={18} className={uploadingComment ? 'animate-pulse' : ''} />
                  <input type="file" className="hidden" onChange={handleCommentFileUpload} disabled={uploadingComment} />
                </label>
                <button type="submit" className="ui-btn-primary p-2 rounded-lg">
                  <Send size={18}/>
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showMentions && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-full left-0 z-10 mb-2 w-full overflow-hidden rounded-xl border bg-card shadow-2xl sm:w-64"
                >
                  <div className="p-2 text-[10px] font-bold text-muted-foreground uppercase border-b bg-muted/30">Mencionar Usuário</div>
                  {mentionUsers.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleMention(u)}
                      className="w-full p-3 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold">{u.name[0]}</div>
                      {u.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

function TenantNameModal({ tenantId, currentName, onUpdated }: { tenantId: number, currentName: string, onUpdated: (newName: string) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name === currentName) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, admin_id: user?.id }),
      });
      if (res.ok) {
        toast.success('Nome da empresa atualizado com sucesso.');
        onUpdated(name);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Falha ao atualizar nome da empresa.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Falha ao atualizar nome da empresa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="ui-surface w-full max-w-md rounded-[2rem] p-8 sm:p-10 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-6">
            <Settings size={32} />
          </div>
          <h2 className="text-3xl font-black tracking-tighter mb-2">Configure sua Empresa</h2>
          <p className="text-muted-foreground text-sm">Para começar, informe o nome oficial da sua organização.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Nome da Empresa</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                <Shield size={18} />
              </div>
              <input
                required
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Minha Empresa LTDA"
                className="ui-input w-full pl-12 pr-4 py-4 bg-muted/45 border-transparent font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="ui-btn-primary w-full py-4 text-lg shadow-[0_22px_48px_-30px_rgba(var(--primary-rgb),0.8)] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'Salvando...' : 'Confirmar e Iniciar'}
            {!loading && <ChevronRight size={20} />}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

type TicketSummaryCardProps = {
  key?: React.Key;
  ticket: Ticket;
  onOpen: () => void;
  showStatusChip?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  dimmed?: boolean;
  embedded?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
};

function TicketSummaryCard({
  ticket,
  onOpen,
  showStatusChip = true,
  draggable = false,
  dragging = false,
  dimmed = false,
  embedded = false,
  onDragStart,
  onDragEnd,
}: TicketSummaryCardProps) {
  return (
    <motion.div
      layoutId={`ticket-${ticket.id}`}
      animate={dragging ? { rotate: 1.2, scale: 0.985, y: -2 } : { rotate: 0, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 340, damping: 26 }}
      role="button"
      tabIndex={0}
      draggable={draggable}
      onClick={onOpen}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`transition-all group relative overflow-hidden ${
        embedded ? 'rounded-[1.35rem] border border-border/55 bg-background/72 p-4 shadow-none backdrop-blur-none' : 'ui-surface-soft p-5'
      } ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${dragging ? 'opacity-55 shadow-[0_22px_40px_-28px_rgba(var(--primary-rgb),0.75)]' : 'hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-30px_rgba(var(--primary-rgb),0.55)]'} ${dimmed ? 'opacity-45 saturate-0' : ''}`}
    >
      {showStatusChip && (
        <div className="absolute top-0 right-0 p-4">
          <div className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            ticket.status_name.toLowerCase().includes('conclu') ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'
          }`}>
            {ticket.status_name}
          </div>
        </div>
      )}

      <div className="mb-2 break-words text-[10px] font-mono text-muted-foreground">
        #{ticket.id} • {new Date(ticket.created_at).toLocaleDateString()} • {new Date(ticket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      <h3 className={`font-bold mb-4 line-clamp-2 group-hover:text-primary transition-colors ${embedded ? 'text-base' : 'text-lg'}`}>{ticket.title}</h3>

      <div className="space-y-3">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center font-bold shrink-0">{ticket.solicitor_name[0]}</div>
          <span className="text-muted-foreground shrink-0">De:</span>
          <span className="min-w-0 truncate font-medium">{ticket.solicitor_sector_name}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
            {ticket.executor_name ? ticket.executor_name[0] : '?'}
          </div>
          <span className="text-muted-foreground shrink-0">Para:</span>
          <span className="min-w-0 truncate font-medium">{ticket.executor_sector_name || 'Não atribuído'}</span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-2 border-t pt-4">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare size={14}/> <span>Ver detalhes</span>
        </div>
        <ChevronRight size={16} className="text-muted-foreground group-hover:translate-x-1 transition-transform"/>
      </div>
    </motion.div>
  );
}

function TicketsPage() {
  const { user } = useAuth();
  const { notifications, markAsRead } = useOutletContext<AppShellContext>();
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsHasMore, setTicketsHasMore] = useState(false);
  const [ticketsLoadingMore, setTicketsLoadingMore] = useState(false);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [viewMode, setViewMode] = useState<TicketsViewMode>(() => {
    const storedView = localStorage.getItem(TICKETS_VIEW_STORAGE_KEY);
    return storedView === 'cards' ? 'cards' : 'kanban';
  });
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });
  const [draggedTicketId, setDraggedTicketId] = useState<number | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<number | null>(null);
  const [updatingTicketId, setUpdatingTicketId] = useState<number | null>(null);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);
  const filtersPanelRef = useRef<HTMLDivElement | null>(null);
  const periodOptions = [
    { value: '1', label: 'Ultimo mes' },
    { value: '3', label: 'Ultimos 3 meses' },
    { value: '6', label: 'Ultimos 6 meses' },
    { value: '12', label: 'Ultimos 12 meses' },
    { value: 'all', label: 'Todo o periodo' }
  ];

  const createDefaultTicketFilters = (sectorId?: number, availableStatuses: Status[] = []): TicketFilters => ({
    period_months: '3',
    sector_solicitor: '',
    sector_executor: sectorId ? String(sectorId) : '',
    status_ids: availableStatuses
      .filter((status) => status.sequence === 1 || status.sequence === 2)
      .sort((a, b) => a.sequence - b.sequence)
      .map((status) => String(status.id)),
    search: ''
  });

  const defaultFilters = createDefaultTicketFilters(user?.sector_id, statuses);
  const [filters, setFilters] = useState<TicketFilters>(() => createDefaultTicketFilters(user?.sector_id));
  const hasActiveFilters = !areTicketFiltersEqual(filters, defaultFilters);

  const selectedStatusLabels = statuses
    .filter((status) => filters.status_ids.includes(String(status.id)))
    .sort((a, b) => a.sequence - b.sequence)
    .map((status) => status.name);
  const selectedPeriodLabel = periodOptions.find((item) => item.value === filters.period_months)?.label || 'Todo o periodo';
  const selectedSolicitorLabel = filters.sector_solicitor
    ? sectors.find((sector) => String(sector.id) === filters.sector_solicitor)?.name || 'Setor selecionado'
    : 'Todos solicitantes';
  const selectedExecutorLabel = filters.sector_executor
    ? sectors.find((sector) => String(sector.id) === filters.sector_executor)?.name || 'Setor selecionado'
    : 'Todos executores';
  const statusSummaryLabel = selectedStatusLabels.length > 0 ? selectedStatusLabels.join(' + ') : 'Todos os status';
  const activeFiltersCount =
    Number(filters.period_months !== defaultFilters.period_months) +
    Number(filters.sector_solicitor !== defaultFilters.sector_solicitor) +
    Number(filters.sector_executor !== defaultFilters.sector_executor) +
    Number(filters.search.trim() !== '') +
    Number(filters.status_ids.join(',') !== defaultFilters.status_ids.join(','));
  const effectiveViewMode: TicketsViewMode = isMobileView ? 'cards' : viewMode;
  const visibleStatuses = [...statuses].sort((a, b) => a.sequence - b.sequence);
  const draggedTicket = tickets.find((ticket) => ticket.id === draggedTicketId) || null;

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;

      const statusContainer = statusFilterRef.current;
      if (statusContainer && !statusContainer.contains(event.target)) {
        setShowStatusFilter(false);
      }

      const filtersContainer = filtersPanelRef.current;
      if (filtersContainer && !filtersContainer.contains(event.target)) {
        setShowFiltersPanel(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    localStorage.setItem(TICKETS_VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const applyViewportMode = () => setIsMobileView(mediaQuery.matches);
    applyViewportMode();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', applyViewportMode);
      return () => mediaQuery.removeEventListener('change', applyViewportMode);
    }

    mediaQuery.addListener(applyViewportMode);
    return () => mediaQuery.removeListener(applyViewportMode);
  }, []);

  useEffect(() => {
    setFilters((current) => {
      const currentMatchesDefaultQueue =
        current.period_months === '3' &&
        current.sector_executor === (user?.sector_id ? String(user.sector_id) : '') &&
        current.sector_solicitor === '' &&
        current.search === '' &&
        current.status_ids.length <= 2;

      if (areTicketFiltersEqual(current, defaultFilters)) {
        return current;
      }

      if (currentMatchesDefaultQueue) {
        return defaultFilters;
      }

      return current;
    });
  }, [user?.id, user?.sector_id, statuses]);

  const fetchTickets = async (options?: { append?: boolean }) => {
    const offset = options?.append ? tickets.length : 0;
    const limit = TICKETS_PAGE_SIZE + 1;
    const params = new URLSearchParams({
      tenant_id: user?.tenant_id.toString() || '',
      user_id: user?.id.toString() || '',
      role: user?.role || '',
      limit: String(limit),
      offset: String(offset),
      sector_solicitor: filters.sector_solicitor,
      sector_executor: filters.sector_executor,
      search: filters.search,
    });
    const createdFrom = getPeriodStartIso(filters.period_months);
    if (createdFrom) {
      params.set('created_from', createdFrom);
      params.set('created_to', getPeriodEndIso());
    }
    if (filters.status_ids.length > 0) {
      params.set('status_id', filters.status_ids.join(','));
    }
    try {
      if (options?.append) setTicketsLoadingMore(true);
      const data = await fetchWithRetry(`/api/tickets?${params}`);
      const hasMore = data.length > TICKETS_PAGE_SIZE;
      const page = hasMore ? data.slice(0, TICKETS_PAGE_SIZE) : data;
      setTickets(prev => (options?.append ? [...prev, ...page] : page));
      setTicketsHasMore(hasMore);
    } catch (err) {
      console.error("Failed to fetch tickets:", err);
    } finally {
      if (options?.append) setTicketsLoadingMore(false);
    }
  };

  const canManipulateTicket = (ticket: Ticket) =>
    user?.role === 'admin' ||
    ticket.executor_id === user?.id ||
    (!ticket.executor_id && ticket.executor_sector_id === user?.sector_id);

  const canDropTicketOnStatus = (ticket: Ticket | null, status: Status) => {
    if (!ticket) return false;
    if (!canManipulateTicket(ticket)) return false;
    if (ticket.status_id === status.id) return false;
    if (user?.role === 'admin') return true;
    return status.sequence === ticket.status_sequence + 1;
  };

  const moveTicketToStatus = async (ticket: Ticket, status: Status) => {
    if (!canManipulateTicket(ticket)) {
      toast.warning('Você só pode mover tickets atribuídos a você ou sem executor do seu setor.');
      return;
    }

    if (user?.role !== 'admin' && status.sequence !== ticket.status_sequence + 1) {
      toast.warning('A progressão continua linear: mova o ticket apenas para a próxima coluna.');
      return;
    }

    setUpdatingTicketId(ticket.id);

    try {
      const res = await apiFetch(`/api/tickets/${ticket.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_id: status.id, user_id: user?.id, role: user?.role }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Não foi possível mover o ticket.');
        return;
      }

      setTickets((current) =>
        current.map((item) =>
          item.id === ticket.id
            ? { ...item, status_id: status.id, status_name: status.name, status_sequence: status.sequence }
            : item,
        ),
      );
      toast.success(`Ticket movido para ${status.name}.`);
      fetchTickets();
    } catch (error) {
      console.error('Failed to move ticket:', error);
      toast.error('Não foi possível mover o ticket.');
    } finally {
      setUpdatingTicketId(null);
      setDraggedTicketId(null);
      setDragOverStatusId(null);
    }
  };

  useEffect(() => {
    if (!user?.tenant_id) {
      setSectors([]);
      setStatuses([]);
      return;
    }

    fetchWithRetry(`/api/sectors?tenant_id=${user.tenant_id}`).then(setSectors).catch(console.error);
    fetchWithRetry(`/api/statuses?tenant_id=${user.tenant_id}`).then(setStatuses).catch(console.error);
  }, [user?.tenant_id]);

  useEffect(() => {
    if (user) {
      fetchTickets();
    } else {
      setTickets([]);
      setTicketsHasMore(false);
    }
  }, [user, filters]);

  return (
    <div className="relative min-w-0">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-3xl font-bold tracking-tight break-words">Tickets</h2>
            <p className="text-muted-foreground break-words">Priorize, filtre e acompanhe demandas intersetoriais de {user?.tenant_name}</p>
            {user?.sector_name && (
              <p className="mt-2 break-words text-xs font-bold uppercase tracking-[0.16em] text-primary sm:tracking-[0.22em] [overflow-wrap:anywhere]">
                Fila inicial: setor executor {user.sector_name}
              </p>
            )}
          </div>
          <div className="flex w-full min-w-0 flex-col gap-3 md:w-auto md:flex-row md:items-center">
            {!isMobileView && (
              <div className="inline-grid w-full max-w-full grid-cols-2 overflow-hidden rounded-2xl border border-border/70 bg-card/65 p-1 backdrop-blur-sm md:w-auto">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`w-full rounded-xl px-3 py-2 text-sm font-bold transition-colors sm:px-4 ${
                    viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`w-full rounded-xl px-3 py-2 text-sm font-bold transition-colors sm:px-4 ${
                    viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Kanban
                </button>
              </div>
            )}
            <button 
              onClick={() => setShowNewTicket(true)}
              className="ui-btn-primary flex w-full items-center justify-center gap-2 px-4 py-3 text-sm shadow-[0_20px_45px_-28px_rgba(var(--primary-rgb),0.72)] sm:px-6 md:w-auto"
            >
              <Plus size={20} className="shrink-0" />
              <span className="truncate">Novo Ticket</span>
            </button>
          </div>
        </div>

        {effectiveViewMode === 'kanban' && (
          <div className="rounded-2xl border border-primary/15 bg-primary/8 px-4 py-3 text-sm text-muted-foreground break-words">
            Arraste o ticket para outra coluna para atualizar o status. As 3 colunas do fluxo ficam sempre visíveis; o filtro de status apenas decide quais tickets aparecem dentro de cada uma.
          </div>
        )}

        <div ref={filtersPanelRef} className="relative z-20">
          <div className="ui-surface-soft flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
            <button
              type="button"
              onClick={() => {
                setShowFiltersPanel((current) => {
                  const next = !current;
                  if (!next) setShowStatusFilter(false);
                  return next;
                });
              }}
              className={`inline-flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-bold transition-colors sm:w-auto ${
                showFiltersPanel
                  ? 'border-primary/45 bg-primary/10 text-primary'
                  : 'border-border/70 bg-background/70 text-foreground hover:bg-muted/55'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Filter size={16} className="shrink-0" />
                Filtros
                {hasActiveFilters && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground">
                    {activeFiltersCount}
                  </span>
                )}
              </span>
              <ChevronRight size={16} className={`shrink-0 transition-transform ${showFiltersPanel ? 'rotate-90' : ''}`} />
            </button>

            <div className="min-w-0 flex-1 rounded-2xl border border-border/60 bg-background/35 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Resumo dos filtros</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="truncate"><span className="font-semibold text-foreground">Periodo:</span> {selectedPeriodLabel}</span>
                <span className="truncate"><span className="font-semibold text-foreground">Solicitante:</span> {selectedSolicitorLabel}</span>
                <span className="truncate"><span className="font-semibold text-foreground">Executor:</span> {selectedExecutorLabel}</span>
                <span className="truncate"><span className="font-semibold text-foreground">Status:</span> {statusSummaryLabel}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={!hasActiveFilters}
              onClick={() => setFilters(defaultFilters)}
              className="ui-btn-secondary inline-flex w-full items-center justify-center px-4 py-3 text-xs uppercase tracking-[0.18em] disabled:opacity-45 sm:w-auto"
            >
              Limpar filtros
            </button>
          </div>

          <AnimatePresence>
            {showFiltersPanel && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute left-0 right-0 top-full z-40 mt-3"
              >
                <div className="ui-surface overflow-visible border-border/70 p-4 sm:p-5">
                  <div className="mb-4 border-b border-border/60 pb-3">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">Configurar Filtros</p>
                  </div>

                  <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <div className="space-y-1.5 xl:col-span-2">
                      <p className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Periodo</p>
                      <select
                        className="ui-select text-sm"
                        value={filters.period_months}
                        onChange={e => setFilters({...filters, period_months: e.target.value})}
                      >
                        {periodOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5 xl:col-span-1">
                      <p className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Setor Solicitante</p>
                      <select
                        className="ui-select text-sm"
                        value={filters.sector_solicitor}
                        onChange={e => setFilters({...filters, sector_solicitor: e.target.value})}
                      >
                        <option value="">Setor Solicitante</option>
                        {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5 xl:col-span-1">
                      <p className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Setor Executor</p>
                      <select
                        className="ui-select text-sm"
                        value={filters.sector_executor}
                        onChange={e => setFilters({...filters, sector_executor: e.target.value})}
                      >
                        <option value="">Setor Executor</option>
                        {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5 xl:col-span-1">
                      <p className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Status</p>
                      <div ref={statusFilterRef} className={`relative ${showStatusFilter ? 'z-50' : 'z-0'}`}>
                        <button
                          type="button"
                          onClick={() => setShowStatusFilter((prev) => !prev)}
                          className="ui-select flex w-full items-center justify-between gap-3 text-sm"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Filter size={15} className="shrink-0 text-muted-foreground" />
                            <span className="truncate">
                              {selectedStatusLabels.length > 0 ? selectedStatusLabels.join(' + ') : 'Todos os status'}
                            </span>
                          </span>
                          <ChevronRight size={16} className={`shrink-0 transition-transform ${showStatusFilter ? 'rotate-90' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {showStatusFilter && (
                            <motion.div
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 8 }}
                              className="absolute left-0 top-full z-50 mt-2 w-full min-w-0 rounded-2xl border border-border/75 bg-card/98 p-2 shadow-2xl backdrop-blur-xl sm:min-w-[240px]"
                            >
                              <div className="border-b border-border/70 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                                Status visiveis
                              </div>
                              <div className="max-h-64 overflow-y-auto py-2">
                                {statuses
                                  .slice()
                                  .sort((a, b) => a.sequence - b.sequence)
                                  .map((status) => {
                                    const statusId = String(status.id);
                                    const checked = filters.status_ids.includes(statusId);

                                    return (
                                      <label
                                        key={status.id}
                                        className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => {
                                            setFilters((current) => {
                                              const nextStatusIds = checked
                                                ? current.status_ids.filter((id) => id !== statusId)
                                                : [...current.status_ids, statusId];

                                              return {
                                                ...current,
                                                status_ids: statuses
                                                  .filter((item) => nextStatusIds.includes(String(item.id)))
                                                  .sort((a, b) => a.sequence - b.sequence)
                                                  .map((item) => String(item.id))
                                              };
                                            });
                                          }}
                                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary/25"
                                        />
                                        <span className="flex-1">{status.name}</span>
                                      </label>
                                    );
                                  })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="space-y-1.5 xl:col-span-1">
                      <p className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Busca</p>
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={filters.search}
                          onChange={e => setFilters({...filters, search: e.target.value})}
                          placeholder="Buscar por título ou #"
                          className="ui-input w-full text-sm py-3 pl-9 pr-3"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Persistent Notifications Popups */}
        <div className="fixed inset-x-4 bottom-4 z-50 flex flex-col gap-4 sm:inset-x-auto sm:right-8 sm:bottom-8 sm:w-80">
          <AnimatePresence>
            {notifications.filter(n => n.is_persistent).map(n => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="ui-surface p-4 rounded-2xl border-primary/35 flex justify-between items-start gap-4"
              >
                <div className="flex gap-3">
                  <div className="mt-1 text-primary"><AlertCircle size={18}/></div>
                  <p className="text-sm font-medium">{n.content}</p>
                </div>
                <button onClick={() => markAsRead(n.id)} className="p-1 hover:bg-muted rounded-full"><X size={14}/></button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {effectiveViewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tickets.map((ticket) => (
              <TicketSummaryCard
                key={ticket.id}
                ticket={ticket}
                onOpen={() => setSelectedTicketId(ticket.id)}
              />
            ))}
          </div>
        ) : (
          <div className="min-w-0 overflow-x-auto pb-2">
            <div className="kanban-board">
            {visibleStatuses.map((status) => {
              const columnTickets = tickets.filter((ticket) => ticket.status_id === status.id);
              const statusIsSelected = filters.status_ids.length === 0 || filters.status_ids.includes(String(status.id));
              const isActiveDropZone = dragOverStatusId === status.id && canDropTicketOnStatus(draggedTicket, status);

              return (
                <motion.div
                  key={status.id}
                  onDragOver={(event) => {
                    if (!canDropTicketOnStatus(draggedTicket, status)) return;
                    event.preventDefault();
                    setDragOverStatusId(status.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverStatusId === status.id) setDragOverStatusId(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggedTicket || !canDropTicketOnStatus(draggedTicket, status)) {
                      setDragOverStatusId(null);
                      return;
                    }
                    moveTicketToStatus(draggedTicket, status);
                  }}
                  animate={isActiveDropZone ? { backgroundColor: 'rgba(15, 118, 110, 0.06)' } : { backgroundColor: 'rgba(0, 0, 0, 0)' }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  className={`kanban-column ${isActiveDropZone ? 'kanban-column-active' : ''} ${!statusIsSelected ? 'kanban-column-dimmed' : ''}`}
                >
                  <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Status</p>
                      <h3 className="mt-1 text-lg font-bold">{status.name}</h3>
                    </div>
                    <div className="rounded-full border border-border/60 bg-background/55 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {columnTickets.length}
                    </div>
                  </div>

                  <div className="flex-1 space-y-3">
                    {isActiveDropZone && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="kanban-dropzone"
                      >
                        Solte aqui para mover para {status.name}
                      </motion.div>
                    )}

                    {!statusIsSelected && (
                      <div className="rounded-2xl border border-dashed border-border/75 bg-background/45 px-4 py-4 text-center text-sm text-muted-foreground">
                        Coluna mantida visível, mas os tickets deste status estão ocultos pelo filtro atual.
                      </div>
                    )}

                    {columnTickets.map((ticket) => (
                      <TicketSummaryCard
                        key={ticket.id}
                        ticket={ticket}
                        showStatusChip={false}
                        embedded
                        draggable={canManipulateTicket(ticket) && updatingTicketId !== ticket.id}
                        dragging={draggedTicketId === ticket.id || updatingTicketId === ticket.id}
                        dimmed={!statusIsSelected}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggedTicketId(ticket.id);
                        }}
                        onDragEnd={() => {
                          setDraggedTicketId(null);
                          setDragOverStatusId(null);
                        }}
                        onOpen={() => setSelectedTicketId(ticket.id)}
                      />
                    ))}

                    {columnTickets.length === 0 && statusIsSelected && (
                      <div className="rounded-2xl border border-dashed border-border/75 bg-background/45 px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhum ticket nesta coluna.
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
            </div>
          </div>
        )}

        {tickets.length > 0 && ticketsHasMore && (
          <div className="mt-2 flex justify-center">
            <button
              onClick={() => fetchTickets({ append: true })}
              disabled={ticketsLoadingMore}
              className="ui-btn-secondary px-6 py-3 text-xs uppercase tracking-widest disabled:opacity-50"
            >
              {ticketsLoadingMore ? 'Carregando...' : 'Carregar mais tickets'}
            </button>
          </div>
        )}

        {tickets.length === 0 && (
          <div className="text-center py-20 bg-card/40 rounded-3xl border-2 border-dashed border-border/80">
            <Search size={48} className="mx-auto mb-4 opacity-20"/>
            <p className="text-muted-foreground font-medium">Nenhum ticket encontrado com os filtros atuais.</p>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showNewTicket && <TicketModal onClose={() => setShowNewTicket(false)} onCreated={fetchTickets} />}
        {selectedTicketId && <TicketDetail ticketId={selectedTicketId} onClose={() => setSelectedTicketId(null)} />}
      </AnimatePresence>
    </div>
  );
}

function DashboardPage() {
  const { user } = useAuth();
  const { notifications } = useOutletContext<AppShellContext>();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [period, setPeriod] = useState<DashboardPeriod>('3m');
  const [statusSectorFilter, setStatusSectorFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isAdminDashboard = user?.role === 'admin';

  const loadDashboard = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      tenant_id: user.tenant_id.toString(),
      user_id: user.id.toString(),
      role: user.role,
      limit: String(METRICS_TICKETS_LIMIT),
      offset: '0'
    });
    params.set('created_from', getDashboardPeriodStartIso(period));
    params.set('created_to', getPeriodEndIso());
    if (user.role !== 'admin' && user.sector_id) {
      params.set('dashboard_scope', 'sector');
      params.set('sector_executor', String(user.sector_id));
    }
    try {
      const [ticketsData, statusData, sectorsData] = await Promise.all([
        fetchWithRetry(`/api/tickets?${params}`),
        fetchWithRetry(`/api/statuses?tenant_id=${user.tenant_id}`),
        fetchWithRetry(`/api/sectors?tenant_id=${user.tenant_id}`)
      ]);
      setTickets(ticketsData || []);
      setStatuses(statusData || []);
      setSectors(sectorsData || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError('Não foi possível carregar o dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [user, period]);

  useEffect(() => {
    if (!isAdminDashboard) {
      setStatusSectorFilter('all');
      return;
    }

    setStatusSectorFilter((current) => {
      if (current === 'all') return current;
      const exists = sectors.some((sector) => String(sector.id) === current);
      return exists ? current : 'all';
    });
  }, [isAdminDashboard, sectors]);

  const total = tickets.length;
  const ticketsForStatusChart =
    isAdminDashboard && statusSectorFilter !== 'all'
      ? tickets.filter((ticket) => String(ticket.executor_sector_id) === statusSectorFilter)
      : tickets;
  const statusChartTotal = ticketsForStatusChart.length;
  const countsByStatusId = ticketsForStatusChart.reduce<Record<number, number>>((acc, t) => {
    acc[t.status_id] = (acc[t.status_id] || 0) + 1;
    return acc;
  }, {});
  const doneStatusIds = statuses
    .filter((status) => status.name.toLowerCase().includes('conclu'))
    .map((status) => status.id);
  const doneCount = tickets.filter((ticket) => doneStatusIds.includes(ticket.status_id)).length;
  const pendingCount = total - doneCount;
  const withoutExecutor = tickets.filter(t => !t.executor_sector_id).length;
  const mySectorQueue = tickets.filter(
    (ticket) => ticket.executor_sector_id === user?.sector_id && !doneStatusIds.includes(ticket.status_id)
  ).length;

  const statusBreakdown = [...statuses]
    .sort((a, b) => a.sequence - b.sequence)
    .map((status, index) => ({
      ...status,
      count: countsByStatusId[status.id] || 0,
      percent: statusChartTotal ? Math.round(((countsByStatusId[status.id] || 0) / statusChartTotal) * 100) : 0,
      color: getDashboardStatusColor(status.name, index),
    }));
  const statusBreakdownWithTickets = statusBreakdown.filter((status) => status.count > 0);
  const pieGradient = (() => {
    if (statusBreakdownWithTickets.length === 0 || statusChartTotal === 0) {
      return 'conic-gradient(hsl(var(--muted)) 0% 100%)';
    }

    let accumulated = 0;
    const slices = statusBreakdownWithTickets.map((status) => {
      const start = accumulated;
      accumulated += (status.count / statusChartTotal) * 100;
      return `${status.color} ${start.toFixed(2)}% ${accumulated.toFixed(2)}%`;
    });

    return `conic-gradient(${slices.join(', ')})`;
  })();
  const sectorMetricsMap = sectors.reduce<Record<string, DashboardSectorMetricBase>>(
    (acc, sector) => {
      acc[String(sector.id)] = { sectorId: sector.id, name: sector.name, total: 0, done: 0, pending: 0 };
      return acc;
    },
    {},
  );
  for (const ticket of tickets) {
    const key = ticket.executor_sector_id ? String(ticket.executor_sector_id) : 'unassigned';
    if (!sectorMetricsMap[key]) {
      sectorMetricsMap[key] = { sectorId: null, name: ticket.executor_sector_name || 'Sem setor executor', total: 0, done: 0, pending: 0 };
    }
    sectorMetricsMap[key].total += 1;
    if (doneStatusIds.includes(ticket.status_id)) sectorMetricsMap[key].done += 1;
    else sectorMetricsMap[key].pending += 1;
  }
  const sectorPerformance: DashboardSectorMetric[] = (Object.values(sectorMetricsMap) as DashboardSectorMetricBase[])
    .map((metric) => ({
      ...metric,
      completionRate: metric.total ? Math.round((metric.done / metric.total) * 100) : 0,
    }))
    .sort((a, b) => (b.completionRate - a.completionRate) || (b.total - a.total) || a.name.localeCompare(b.name));
  const sectorsWithTickets = sectorPerformance.filter((sector) => sector.total > 0);
  const bestSector = sectorsWithTickets[0] || null;
  const worstCandidates = bestSector
    ? sectorsWithTickets.filter((sector) => sector.sectorId !== bestSector.sectorId)
    : sectorsWithTickets;
  const worstSector = [...worstCandidates]
    .sort((a, b) => (a.completionRate - b.completionRate) || (b.pending - a.pending) || a.name.localeCompare(b.name))[0] || null;
  const highestBacklogSector = [...sectorsWithTickets]
    .sort((a, b) => (b.pending - a.pending) || (a.completionRate - b.completionRate) || a.name.localeCompare(b.name))[0] || null;

  const recentTickets = [...tickets]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  const recentNotifications = [...notifications]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);
  const selectedPeriodLabel =
    dashboardPeriodOptions.find((option) => option.value === period)?.label || 'Ultimos 3 meses';
  const selectedStatusSectorLabel =
    statusSectorFilter === 'all'
      ? 'Todos os setores'
      : sectors.find((sector) => String(sector.id) === statusSectorFilter)?.name || 'Setor';
  const dashboardDescription = isAdminDashboard
    ? `Saúde de todos os setores da ${user?.tenant_name} no período de ${selectedPeriodLabel.toLowerCase()}.`
    : `Saúde do setor ${user?.sector_name} no período de ${selectedPeriodLabel.toLowerCase()}.`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="ui-surface p-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={loadDashboard} className="ui-btn-secondary px-4 py-2 text-xs uppercase tracking-widest">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">{dashboardDescription}</p>
        </div>
        <div className="w-full max-w-xs space-y-1.5">
          <p className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Periodo</p>
          <select
            className="ui-select text-sm"
            value={period}
            onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
          >
            {dashboardPeriodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="ui-surface-soft p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold">Distribuição por status</h3>
              <p className="text-xs text-muted-foreground">
                {selectedPeriodLabel}
                {isAdminDashboard ? ` • ${selectedStatusSectorLabel}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isAdminDashboard && (
                <select
                  className="ui-select max-w-[200px] text-xs"
                  value={statusSectorFilter}
                  onChange={(event) => setStatusSectorFilter(event.target.value)}
                >
                  <option value="all">Todos os setores</option>
                  {sectors
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((sector) => (
                      <option key={sector.id} value={String(sector.id)}>
                        {sector.name}
                      </option>
                    ))}
                </select>
              )}
              <button onClick={() => navigate('/tickets')} className="text-xs font-bold text-primary hover:underline">
                Ver tickets
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center">
            <div className="mx-auto flex min-h-[260px] w-full items-center justify-center lg:min-h-[320px]">
              <div className="relative h-56 w-56 rounded-full border border-border/70" style={{ background: pieGradient }}>
                <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full border border-border/70 bg-card/95 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                  <p className="mt-1 text-3xl font-black">{statusChartTotal}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{selectedPeriodLabel}</p>
                </div>
              </div>
            </div>

            <div className="flex min-h-[260px] w-full items-center lg:min-h-[320px]">
              <div className="w-full space-y-2">
              {statusBreakdown.map((status) => (
                <div key={status.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-background/45 px-3 py-2 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
                    <span className="truncate font-semibold" style={{ color: status.color }}>{status.name}</span>
                  </div>
                  <span style={{ color: status.color }}>{status.count} ({status.percent}%)</span>
                </div>
              ))}
              {statusBreakdown.length === 0 && (
                <div className="text-sm text-muted-foreground">Nenhum status configurado.</div>
              )}
              </div>
            </div>
          </div>
        </div>

        <div className="ui-surface-soft overflow-hidden p-0">
          {isAdminDashboard ? (
            <>
              <div className="border-b border-border/70 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
                <h3 className="mt-1 text-xl font-black tracking-tight">Resumo executivo</h3>
                <p className="mt-1 text-xs text-muted-foreground">Panorama rápido de performance entre setores.</p>
              </div>

              <div className="space-y-2 p-4">
                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded-2xl border border-emerald-500/45 bg-white/90 px-4 py-2 dark:bg-emerald-500/10">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">Melhor setor</p>
                    <p className="mt-1 text-base font-black text-foreground">
                      {bestSector ? `${bestSector.name} (${bestSector.completionRate}%)` : 'Sem dados'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-red-500/45 bg-white/90 px-4 py-2 dark:bg-red-500/10">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-800 dark:text-red-300">Pior setor</p>
                    <p className="mt-1 text-base font-black text-foreground">
                      {worstSector ? `${worstSector.name} (${worstSector.completionRate}%)` : 'Sem dados'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-amber-500/45 bg-white/90 px-4 py-2 dark:bg-amber-500/10">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-800 dark:text-amber-300">Maior fila</p>
                    <p className="mt-1 text-base font-black text-foreground">
                      {highestBacklogSector ? `${highestBacklogSector.name} (${highestBacklogSector.pending})` : 'Sem dados'}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/45 px-3 py-2 text-xs text-muted-foreground">
                  Ranking baseado em percentual de conclusão e volume de pendências por setor.
                </div>

                <button onClick={() => navigate('/tickets')} className="ui-btn-secondary w-full py-3 text-xs uppercase tracking-widest">
                  Ir para tickets
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4 p-5">
              <h3 className="text-lg font-bold">Saúde do meu setor</h3>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Tickets do setor</p>
                <p className="text-xl font-black">{total}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-xl font-black">{pendingCount}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Concluídos</p>
                <p className="text-xl font-black">{doneCount}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Sem executor</p>
                <p className="text-xl font-black">{withoutExecutor}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Fila ativa do meu setor</p>
                <p className="text-xl font-black">{mySectorQueue}</p>
              </div>
              <button onClick={() => navigate('/tickets')} className="ui-btn-secondary w-full py-3 text-xs uppercase tracking-widest">
                Ir para tickets
              </button>
            </div>
          )}
        </div>
      </div>

      {isAdminDashboard && (
        <div className="ui-surface-soft p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Performance por setor</h3>
              <p className="text-xs text-muted-foreground">Comparativo de eficiência e fila entre setores da empresa.</p>
            </div>
            <button onClick={() => navigate('/tickets')} className="text-xs font-bold text-primary hover:underline">
              Ver tickets
            </button>
          </div>
          <div className="space-y-2">
            {sectorPerformance.map((sector) => {
              const tone = sector.completionRate >= 60 ? 'text-emerald-600' : sector.completionRate >= 30 ? 'text-amber-600' : 'text-red-600';

              return (
                <div key={`${sector.sectorId ?? 'unassigned'}-${sector.name}`} className="grid grid-cols-[minmax(0,1fr)_80px_80px_90px] items-center gap-3 rounded-xl border border-border/70 bg-background/45 px-3 py-2 text-xs">
                  <p className="truncate font-semibold">{sector.name}</p>
                  <p className="text-right text-muted-foreground">{sector.total} total</p>
                  <p className="text-right text-muted-foreground">{sector.pending} pend.</p>
                  <p className={`text-right font-bold ${tone}`}>{sector.completionRate}% concl.</p>
                </div>
              );
            })}
            {sectorPerformance.length === 0 && (
              <div className="text-sm text-muted-foreground">Nenhum setor encontrado.</div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="ui-surface-soft p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Tickets recentes</h3>
            <button onClick={() => navigate('/tickets')} className="text-xs font-bold text-primary hover:underline">
              Abrir lista
            </button>
          </div>
          <div className="space-y-3">
            {recentTickets.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-muted/55 transition-colors">
                <div>
                  <p className="text-sm font-semibold line-clamp-1">{t.title}</p>
                  <p className="text-[11px] text-muted-foreground">#{t.id} • {t.solicitor_sector_name} → {t.executor_sector_name || 'Não atribuído'}</p>
                </div>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border"
                  style={getDashboardStatusStyle(t.status_name, t.status_id)}
                >
                  {t.status_name}
                </span>
              </div>
            ))}
            {recentTickets.length === 0 && (
              <div className="text-sm text-muted-foreground">Nenhum ticket recente.</div>
            )}
          </div>
        </div>

        <div className="ui-surface-soft p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Notificações recentes</h3>
            <button onClick={() => navigate('/tickets')} className="text-xs font-bold text-primary hover:underline">
              Ver detalhes
            </button>
          </div>
          <div className="space-y-3">
            {recentNotifications.map(n => (
              <div key={n.id} className="p-3 rounded-xl border border-border/70 bg-muted/25 text-xs">
                <p className="font-medium">{n.content}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
            {recentNotifications.length === 0 && (
              <div className="text-sm text-muted-foreground">Nenhuma notificação recente.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminPage() {
  return (
    <div className="flex flex-col gap-8">
      <AdminPanel />
    </div>
  );
}

function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const themeStorageKey = getThemeStorageKey(user?.id);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const persisted = localStorage.getItem(themeStorageKey);
    if (isThemeValue(persisted)) return persisted;
    return user?.theme || 'light';
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const notificationsPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (user && user.role === 'admin' && user.tenant_name?.startsWith('Empresa de ')) {
      setShowTenantModal(true);
    }
  }, [user]);

  const handleTenantUpdated = (newName: string) => {
    if (user) {
      const updatedUser = { ...user, tenant_name: newName };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      window.location.reload();
    }
  };

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const data = await fetchWithRetry(`/api/notifications/${user.id}`);
      setNotifications(data || []);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
    } else {
      setNotifications([]);
    }
    const interval = setInterval(() => {
      if (user) fetchNotifications();
    }, 10000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(themeStorageKey, theme);
  }, [theme, themeStorageKey]);

  useEffect(() => {
    const persisted = localStorage.getItem(themeStorageKey);
    if (isThemeValue(persisted)) {
      setTheme(persisted);
      return;
    }
    setTheme(user?.theme || 'light');
  }, [themeStorageKey, user?.theme]);

  useEffect(() => {
    setSidebarOpen(false);
    setShowNotificationsPanel(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      const panel = notificationsPanelRef.current;
      if (!panel) return;
      if (event.target instanceof Node && !panel.contains(event.target)) {
        setShowNotificationsPanel(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const markAsRead = async (id: number) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    fetchNotifications();
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const sortedNotifications = [...notifications].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const pageTitle = location.pathname.startsWith('/tickets')
    ? 'Tickets'
    : location.pathname.startsWith('/admin')
    ? 'Administração'
      : 'Dashboard';

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
      isActive
        ? 'bg-primary/14 text-primary border border-primary/20 shadow-[0_10px_20px_-18px_rgba(var(--primary-rgb),0.8)]'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted/45 border border-transparent'
    }`;

  return (
    <div className="h-screen text-foreground flex overflow-hidden">
      {showTenantModal && user && (
        <TenantNameModal 
          tenantId={user.tenant_id} 
          currentName={user.tenant_name || ''} 
          onUpdated={handleTenantUpdated} 
        />
      )}

      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity md:hidden ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 h-screen bg-card/88 backdrop-blur-xl border-r border-border/75 p-6 flex flex-col gap-8 transition-transform md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Gestão 360</p>
            <p className="text-xl font-black tracking-tight mt-1">{user?.tenant_name || 'Seu Tenant'}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Operação intersetorial em tempo real</p>
          </div>
          <button className="md:hidden p-2 hover:bg-muted rounded-full" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-col gap-2">
          <NavLink to="/" end className={navLinkClass} onClick={() => setSidebarOpen(false)}>
            <BarChart3 size={18} />
            Dashboard
          </NavLink>
          <NavLink to="/tickets" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
            <LayoutGrid size={18} />
            Tickets
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
              <Shield size={18} />
              Administração
            </NavLink>
          )}
        </nav>

        <div className="mt-auto space-y-3">
          <button onClick={toggleTheme} className="ui-btn-secondary w-full flex items-center justify-between px-3 py-2 text-sm font-semibold">
            <span>Tema</span>
            {theme === 'light' ? <Sun size={18}/> : <Moon size={18}/>}
          </button>
          <button onClick={logout} className="ui-btn-secondary w-full flex items-center justify-between px-3 py-2 text-sm font-semibold hover:bg-destructive/10 hover:text-destructive">
            <span>Sair</span>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-screen">
        <header className="sticky top-0 z-30 w-full border-b border-border/70 bg-background/70 backdrop-blur-xl">
          <div className="px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button className="md:hidden p-2 hover:bg-muted rounded-full" onClick={() => setSidebarOpen(true)}>
                <Menu size={20} />
              </button>
              <div>
                <p className="text-lg font-bold tracking-tight">Gestão 360</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div ref={notificationsPanelRef} className="relative">
                <button
                  onClick={() => setShowNotificationsPanel(prev => !prev)}
                  className="p-2.5 hover:bg-muted rounded-xl transition-colors relative border border-transparent hover:border-border/65"
                >
                  <Bell size={19}/>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-destructive text-destructive-foreground flex items-center justify-center">
                      {Math.min(unreadCount, 9)}
                    </span>
                  )}
                </button>
                <div className={`absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border/75 bg-card/98 shadow-2xl transition-all sm:w-80 ${
                  showNotificationsPanel ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-1'
                }`}>
                  <div className="p-4 border-b bg-muted/30 font-bold text-sm">Notificações</div>
                  <div className="max-h-96 overflow-y-auto">
                    {sortedNotifications.length === 0 ? (
                      <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma notificação nova</div>
                    ) : (
                      sortedNotifications.map(n => (
                        <div key={n.id} className="p-4 border-b border-border/60 hover:bg-muted/50 transition-colors flex justify-between items-start gap-2">
                          <p className="text-xs">{n.content}</p>
                          <button onClick={() => markAsRead(n.id)} className="text-[10px] font-bold text-primary hover:underline">
                            Lido
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="hidden md:flex items-center gap-3 pl-4 border-l border-border/70">
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{user?.name}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{user?.sector_name}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-primary/12 text-primary border border-primary/25 flex items-center justify-center font-bold">{user?.name?.[0]}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-8 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1200px]">
            <Outlet context={{ notifications, markAsRead }} />
          </div>
        </main>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route
          path="admin"
          element={user?.role === 'admin' ? <AdminPage /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full"
      />
    </div>
  );

  return user ? <AuthenticatedApp /> : <PublicExperience />;
}
