import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { Ticket, Sector, User, Status, Comment, Notification } from './types';
import { 
  Plus, Search, Bell, User as UserIcon, LogOut, 
  MessageSquare, ChevronRight, Filter, Moon, Sun,
  CheckCircle2, Clock, AlertCircle, Send, X, Shield, Settings, Mail, Lock, Paperclip, FileText, Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AdminPanel } from './components/AdminPanel';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const { login, signup } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isRegistering) {
        await signup(email, name, password);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      alert(err.message || 'Ocorreu um erro. Tente novamente.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent_50%)]" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative"
      >
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-primary/10 rounded-3xl rotate-12 blur-2xl" />
        
        <div className="bg-card border-2 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
          
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-6">
              <Shield size={32} />
            </div>
            <h1 className="text-4xl font-black tracking-tighter mb-2">InterSector</h1>
            <p className="text-muted-foreground font-medium">
              {isRegistering ? 'Crie sua conta e organização' : 'Bem-vindo de volta'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {isRegistering && (
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                  Seu Nome
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-4 pl-12 rounded-2xl border bg-background focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                    placeholder="Seu nome completo"
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-4 pl-12 rounded-2xl border bg-background focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                  placeholder="seu@email.com"
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-4 pl-12 rounded-2xl border bg-background focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
            >
              {isRegistering ? 'Cadastrar' : 'Entrar'}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t flex flex-col gap-4 text-center">
            <button 
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-sm font-bold text-primary hover:underline transition-all"
            >
              {isRegistering ? 'Já possui acesso? Faça login' : 'Não tem conta? Cadastre-se agora'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function TicketModal({ onClose, onCreated }: { onClose: () => void, onCreated: () => void }) {
  const { user } = useAuth();
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
      const res = await fetch('/api/upload', {
        method: 'POST',
        body
      });
      const data = await res.json();
      if (data.url) {
        setFormData(prev => ({ ...prev, attachments: [...prev.attachments, data.url] }));
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    fetch(`/api/sectors?tenant_id=${user?.tenant_id}`).then(res => res.json()).then(setSectors);
  }, [user]);

  useEffect(() => {
    if (formData.executor_sector_id) {
      fetch(`/api/users?tenant_id=${user?.tenant_id}&sector_id=${formData.executor_sector_id}`)
        .then(res => res.json())
        .then(setUsers);
    }
  }, [formData.executor_sector_id, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        tenant_id: user?.tenant_id,
        solicitor_id: user?.id,
        solicitor_sector_id: user?.sector_id
      }),
    });
    if (res.ok) {
      onCreated();
      onClose();
    } else {
      const data = await res.json();
      alert(data.error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border"
      >
        <div className="p-6 border-b flex justify-between items-center bg-muted/30">
          <h2 className="text-xl font-bold">Novo Ticket</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors"><X size={20}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Título</label>
            <input
              required
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
              className="w-full p-2 border rounded-lg bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Setor Executor</label>
            <select
              required
              value={formData.executor_sector_id}
              onChange={e => setFormData({...formData, executor_sector_id: e.target.value, executor_id: ''})}
              className="w-full p-2 border rounded-lg bg-background"
            >
              <option value="">Selecione o setor</option>
              {sectors.filter(s => s.id !== user?.sector_id).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Executor</label>
            <select
              required
              value={formData.executor_id}
              onChange={e => setFormData({...formData, executor_id: e.target.value})}
              className="w-full p-2 border rounded-lg bg-background"
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
              className="w-full p-2 border rounded-lg bg-background resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Anexos</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.attachments.map((url, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted p-2 rounded-lg text-xs">
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
            <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
              <Paperclip size={18} className={uploading ? 'animate-pulse' : ''} />
              <span className="text-sm font-medium">{uploading ? 'Enviando...' : 'Adicionar Anexo'}</span>
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 hover:bg-muted rounded-lg transition-colors">Cancelar</button>
            <button type="submit" className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity">Criar Ticket</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function TicketDetail({ ticketId, onClose }: { ticketId: number, onClose: () => void }) {
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);
  const [uploadingComment, setUploadingComment] = useState(false);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [mentionUsers, setMentionUsers] = useState<User[]>([]);
  const [showMentions, setShowMentions] = useState(false);

  const fetchTicket = () => {
    fetch(`/api/tickets/${ticketId}`).then(res => res.json()).then(setTicket);
    fetch(`/api/tickets/${ticketId}/comments?user_id=${user?.id}`).then(res => res.json()).then(setComments);
  };

  useEffect(() => {
    fetchTicket();
    fetch(`/api/statuses?tenant_id=${user?.tenant_id}`).then(res => res.json()).then(setStatuses);
  }, [ticketId, user]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() && commentAttachments.length === 0) return;
    const res = await fetch(`/api/tickets/${ticketId}/comments`, {
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
    }
  };

  const handleCommentFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingComment(true);
    const body = new FormData();
    body.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body
      });
      const data = await res.json();
      if (data.url) {
        setCommentAttachments(prev => [...prev, data.url]);
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploadingComment(false);
    }
  };

  const handleNextStatus = async () => {
    if (!ticket) return;
    const nextStatus = statuses.find(s => s.sequence === ticket.status_sequence + 1);
    if (!nextStatus) return;

    const res = await fetch(`/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_id: nextStatus.id, user_id: user?.id, role: user?.role }),
    });
    if (res.ok) fetchTicket();
    else {
      const data = await res.json();
      alert(data.error);
    }
  };

  const handleReassign = async (newExecutorId: string) => {
    if (!newExecutorId) return;
    const res = await fetch(`/api/tickets/${ticketId}/reassign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ executor_id: newExecutorId, user_id: user?.id }),
    });
    if (res.ok) fetchTicket();
  };

  const handleMention = (u: User) => {
    const lastAt = newComment.lastIndexOf('@');
    const text = newComment.substring(0, lastAt) + `@[${u.name}](${u.id}) `;
    setNewComment(text);
    setShowMentions(false);
  };

  const onCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewComment(val);
    if (val.endsWith('@')) {
      fetch(`/api/users?tenant_id=${user?.tenant_id}&sector_id=${ticket?.executor_sector_id}`)
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        className="bg-card w-full max-w-3xl h-full max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border"
      >
        <div className="p-6 border-b bg-muted/30 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-1">
              <span>#{ticket.id}</span>
              <span>•</span>
              <span>{new Date(ticket.created_at).toLocaleString()}</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">{ticket.title}</h2>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="flex items-center gap-1"><UserIcon size={14}/> {ticket.solicitor_name} ({ticket.solicitor_sector_name})</span>
              <ChevronRight size={14} className="mt-1 opacity-50"/>
              <span className="flex items-center gap-1"><UserIcon size={14}/> {ticket.executor_name} ({ticket.executor_sector_name})</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors"><X size={20}/></button>
            <div className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold uppercase tracking-wider">
              {ticket.status_name}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
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

          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Histórico e Comentários</h3>
            {comments.map(c => (
              <div key={c.id} className={`flex flex-col ${c.type === 'system' ? 'items-center' : 'items-start'}`}>
                {c.type === 'system' ? (
                  <div className="bg-muted px-4 py-1 rounded-full text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">
                    {c.content}
                  </div>
                ) : (
                  <div className={`max-w-[80%] p-3 rounded-2xl border ${c.user_id === user?.id ? 'bg-primary text-primary-foreground ml-auto' : 'bg-card'}`}>
                    <div className="flex justify-between items-center gap-4 mb-1">
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

        <div className="p-6 border-t bg-muted/10 space-y-4">
          {user?.role === 'admin' && (
            <div className="flex gap-2">
              <select 
                className="flex-1 p-2 border rounded-lg bg-background text-sm"
                onChange={(e) => handleReassign(e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>Reatribuir executor...</option>
                {mentionUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          {nextStatus && (user?.id === ticket.executor_id || user?.role === 'admin') && (
            <button 
              onClick={handleNextStatus}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
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
                className="w-full p-3 pr-24 rounded-xl border bg-background resize-none focus:ring-2 focus:ring-primary outline-none"
                rows={2}
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                <label className="p-2 hover:bg-muted rounded-lg cursor-pointer transition-colors">
                  <Paperclip size={18} className={uploadingComment ? 'animate-pulse' : ''} />
                  <input type="file" className="hidden" onChange={handleCommentFileUpload} disabled={uploadingComment} />
                </label>
                <button type="submit" className="p-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
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
                  className="absolute bottom-full left-0 w-64 bg-card border rounded-xl shadow-2xl mb-2 overflow-hidden z-10"
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

function Dashboard() {
  const { user, logout } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(user?.theme || 'light');
  const [view, setView] = useState<'tickets' | 'admin'>('tickets');
  
  const [filters, setFilters] = useState({
    sector_solicitor: '',
    sector_executor: '',
    status_id: '',
    search: ''
  });

  const fetchWithRetry = async (url: string, options?: RequestInit, retries = 3): Promise<any> => {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    } catch (err) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchWithRetry(url, options, retries - 1);
      }
      throw err;
    }
  };

  const fetchTickets = async () => {
    const params = new URLSearchParams({
      tenant_id: user?.tenant_id.toString() || '',
      user_id: user?.id.toString() || '',
      role: user?.role || '',
      ...filters
    });
    try {
      const data = await fetchWithRetry(`/api/tickets?${params}`);
      setTickets(data);
    } catch (err) {
      console.error("Failed to fetch tickets:", err);
    }
  };

  const fetchNotifications = async () => {
    try {
      const data = await fetchWithRetry(`/api/notifications/${user?.id}`);
      setNotifications(data);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchTickets();
      fetchWithRetry(`/api/sectors?tenant_id=${user?.tenant_id}`).then(setSectors).catch(console.error);
      fetchWithRetry(`/api/statuses?tenant_id=${user?.tenant_id}`).then(setStatuses).catch(console.error);
      fetchNotifications();
    }
    const interval = setInterval(() => {
      if (user) fetchNotifications();
    }, 10000);
    return () => clearInterval(interval);
  }, [user, filters]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const markAsRead = async (id: number) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    fetchNotifications();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold tracking-tighter">InterSector</h1>
            <div className="hidden md:flex items-center gap-4">
              <select 
                className="bg-muted/50 border-none rounded-lg text-xs p-2 outline-none"
                value={filters.sector_solicitor}
                onChange={e => setFilters({...filters, sector_solicitor: e.target.value})}
              >
                <option value="">Setor Solicitante</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select 
                className="bg-muted/50 border-none rounded-lg text-xs p-2 outline-none"
                value={filters.sector_executor}
                onChange={e => setFilters({...filters, sector_executor: e.target.value})}
              >
                <option value="">Setor Executor</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select 
                className="bg-muted/50 border-none rounded-lg text-xs p-2 outline-none"
                value={filters.status_id}
                onChange={e => setFilters({...filters, status_id: e.target.value})}
              >
                <option value="">Status</option>
                {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {user?.role === 'admin' && (
              <button 
                onClick={() => setView(view === 'tickets' ? 'admin' : 'tickets')}
                className={`p-2 rounded-full transition-colors ${view === 'admin' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                title="Painel Administrativo"
              >
                <Settings size={20}/>
              </button>
            )}
            <button onClick={toggleTheme} className="p-2 hover:bg-muted rounded-full transition-colors">
              {theme === 'light' ? <Moon size={20}/> : <Sun size={20}/>}
            </button>
            
            <div className="relative group">
              <button className="p-2 hover:bg-muted rounded-full transition-colors relative">
                <Bell size={20}/>
                {notifications.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full"/>}
              </button>
              <div className="absolute right-0 top-full mt-2 w-80 bg-card border rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                <div className="p-4 border-b bg-muted/30 font-bold text-sm">Notificações</div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma notificação nova</div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className="p-4 border-b hover:bg-muted/50 transition-colors flex justify-between items-start gap-2">
                        <p className="text-xs">{n.content}</p>
                        <button onClick={() => markAsRead(n.id)} className="text-[10px] font-bold text-primary hover:underline">Lido</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold leading-none">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{user?.sector_name}</p>
              </div>
              <button onClick={logout} className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-full transition-colors">
                <LogOut size={20}/>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        {view === 'admin' ? (
          <AdminPanel />
        ) : (
          <>
            <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Tickets</h2>
            <p className="text-muted-foreground">Gerencie as demandas intersetoriais da {user?.tenant_name}</p>
          </div>
          <button 
            onClick={() => setShowNewTicket(true)}
            className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-lg"
          >
            <Plus size={20}/> Novo Ticket
          </button>
        </div>

        {/* Persistent Notifications Popups */}
        <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-4 w-80">
          <AnimatePresence>
            {notifications.filter(n => n.is_persistent).map(n => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-card border-2 border-primary p-4 rounded-2xl shadow-2xl flex justify-between items-start gap-4"
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

        {/* Tickets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tickets.map(t => (
            <motion.div
              layoutId={`ticket-${t.id}`}
              key={t.id}
              onClick={() => setSelectedTicketId(t.id)}
              className="bg-card border rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4">
                <div className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  t.status_sequence === 4 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'
                }`}>
                  {t.status_name}
                </div>
              </div>
              
              <div className="text-[10px] font-mono text-muted-foreground mb-2">#{t.id} • {new Date(t.created_at).toLocaleDateString()}</div>
              <h3 className="text-lg font-bold mb-4 line-clamp-1 group-hover:text-primary transition-colors">{t.title}</h3>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center font-bold">{t.solicitor_name[0]}</div>
                  <span className="text-muted-foreground">De:</span>
                  <span className="font-medium">{t.solicitor_sector_name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">{t.executor_name[0]}</div>
                  <span className="text-muted-foreground">Para:</span>
                  <span className="font-medium">{t.executor_sector_name}</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t flex justify-between items-center">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MessageSquare size={14}/> <span>Ver detalhes</span>
                </div>
                <ChevronRight size={16} className="text-muted-foreground group-hover:translate-x-1 transition-transform"/>
              </div>
            </motion.div>
          ))}
        </div>

        {tickets.length === 0 && (
          <div className="text-center py-20 bg-muted/20 rounded-3xl border-2 border-dashed">
            <Search size={48} className="mx-auto mb-4 opacity-20"/>
            <p className="text-muted-foreground font-medium">Nenhum ticket encontrado com os filtros atuais.</p>
          </div>
        )}
          </>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showNewTicket && <TicketModal onClose={() => setShowNewTicket(false)} onCreated={fetchTickets} />}
        {selectedTicketId && <TicketDetail ticketId={selectedTicketId} onClose={() => setSelectedTicketId(null)} />}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => console.log('Server health:', data))
      .catch(err => console.error('Server health check failed:', err));
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full"
      />
    </div>
  );

  return user ? <Dashboard /> : <Login />;
}
