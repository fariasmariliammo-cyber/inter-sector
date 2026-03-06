import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { Ticket, Sector, User, Status, Comment, Notification } from './types';
import { 
  Plus, Search, Bell, User as UserIcon, LogOut, 
  MessageSquare, ChevronRight, Moon, Sun,
  CheckCircle2, Clock, AlertCircle, Send, X, Shield, Settings, Mail, Lock, Paperclip, FileText, Download, Edit,
  BarChart3, LayoutGrid, Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AdminPanel } from './components/AdminPanel';
import { apiFetch } from './lib/apiFetch';
import { ToastProvider, useToast } from './components/Toast';

const TICKETS_PAGE_SIZE = 50;
const COMMENTS_PAGE_SIZE = 100;
const METRICS_TICKETS_LIMIT = 200;

type AppShellContext = {
  notifications: Notification[];
  markAsRead: (id: number) => Promise<void>;
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

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const { login, signup } = useAuth();
  const toast = useToast();

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
            <h1 className="text-4xl font-black tracking-tighter mb-2">Gestão 360</h1>
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
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-4 pl-12 rounded-2xl border bg-background focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
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
                  className="w-full p-4 pl-12 rounded-2xl border bg-background focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
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
                  className="w-full p-4 pl-12 rounded-2xl border bg-background focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                  placeholder="••••••••"
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
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
            <label className="block text-sm font-medium mb-1">Executor (Opcional)</label>
            <select
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
                <span className="flex items-center gap-1">
                  <UserIcon size={14}/> 
                  {ticket.executor_name || 'Não atribuído'} 
                  {ticket.executor_sector_name ? ` (${ticket.executor_sector_name})` : ' (Sem setor)'}
                </span>
              </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
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

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {isEditing ? (
            <div className="space-y-6 bg-muted/20 p-6 rounded-2xl border-2 border-primary/20">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Título do Ticket</label>
                <input 
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full p-3 rounded-xl border bg-background focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Descrição Detalhada</label>
                <textarea 
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full p-3 rounded-xl border bg-background focus:ring-2 focus:ring-primary outline-none min-h-[150px]"
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
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="px-6 py-3 bg-muted rounded-xl font-bold hover:bg-muted/80 transition-colors"
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
    <div className="fixed inset-0 bg-background/80 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-card w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl border-2 relative overflow-hidden"
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
                className="w-full pl-12 pr-4 py-4 bg-muted/30 border-2 border-transparent focus:border-primary/20 focus:bg-background rounded-2xl outline-none transition-all font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? 'Salvando...' : 'Confirmar e Iniciar'}
            {!loading && <ChevronRight size={20} />}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function TicketsPage() {
  const { user } = useAuth();
  const { notifications, markAsRead } = useOutletContext<AppShellContext>();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsHasMore, setTicketsHasMore] = useState(false);
  const [ticketsLoadingMore, setTicketsLoadingMore] = useState(false);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  
  const [filters, setFilters] = useState({
    sector_solicitor: '',
    sector_executor: '',
    status_id: '',
    search: ''
  });

  const fetchTickets = async (options?: { append?: boolean }) => {
    const offset = options?.append ? tickets.length : 0;
    const limit = TICKETS_PAGE_SIZE + 1;
    const params = new URLSearchParams({
      tenant_id: user?.tenant_id.toString() || '',
      user_id: user?.id.toString() || '',
      role: user?.role || '',
      limit: String(limit),
      offset: String(offset),
      ...filters
    });
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

  useEffect(() => {
    if (user) {
      fetchTickets();
      fetchWithRetry(`/api/sectors?tenant_id=${user?.tenant_id}`).then(setSectors).catch(console.error);
      fetchWithRetry(`/api/statuses?tenant_id=${user?.tenant_id}`).then(setStatuses).catch(console.error);
    } else {
      setTickets([]);
      setTicketsHasMore(false);
    }
  }, [user, filters]);

  return (
    <div className="relative">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Tickets</h2>
            <p className="text-muted-foreground">Gerencie as demandas intersetoriais da {user?.tenant_name}</p>
          </div>
          <button 
            onClick={() => setShowNewTicket(true)}
            className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-lg w-full md:w-auto"
          >
            <Plus size={20}/> Novo Ticket
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-card/50 border rounded-2xl p-4">
          <select 
            className="bg-muted/40 border-none rounded-lg text-sm p-3 outline-none"
            value={filters.sector_solicitor}
            onChange={e => setFilters({...filters, sector_solicitor: e.target.value})}
          >
            <option value="">Setor Solicitante</option>
            {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select 
            className="bg-muted/40 border-none rounded-lg text-sm p-3 outline-none"
            value={filters.sector_executor}
            onChange={e => setFilters({...filters, sector_executor: e.target.value})}
          >
            <option value="">Setor Executor</option>
            {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select 
            className="bg-muted/40 border-none rounded-lg text-sm p-3 outline-none"
            value={filters.status_id}
            onChange={e => setFilters({...filters, status_id: e.target.value})}
          >
            <option value="">Status</option>
            {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filters.search}
              onChange={e => setFilters({...filters, search: e.target.value})}
              placeholder="Buscar por título ou #"
              className="w-full bg-muted/40 border-none rounded-lg text-sm py-3 pl-9 pr-3 outline-none"
            />
          </div>
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
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                    {t.executor_name ? t.executor_name[0] : '?'}
                  </div>
                  <span className="text-muted-foreground">Para:</span>
                  <span className="font-medium">{t.executor_sector_name || 'Não atribuído'}</span>
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

        {tickets.length > 0 && ticketsHasMore && (
          <div className="mt-2 flex justify-center">
            <button
              onClick={() => fetchTickets({ append: true })}
              disabled={ticketsLoadingMore}
              className="px-6 py-3 text-xs font-bold uppercase tracking-widest rounded-xl border bg-muted/30 hover:bg-muted transition-colors disabled:opacity-50"
            >
              {ticketsLoadingMore ? 'Carregando...' : 'Carregar mais tickets'}
            </button>
          </div>
        )}

        {tickets.length === 0 && (
          <div className="text-center py-20 bg-muted/20 rounded-3xl border-2 border-dashed">
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

function MetricCard({ title, value, subtitle, icon }: { title: string; value: string | number; subtitle?: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
        <div className="text-primary">{icon}</div>
      </div>
      <div className="mt-4 text-3xl font-black tracking-tight">{value}</div>
      {subtitle && <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>}
    </div>
  );
}

function DashboardPage() {
  const { user } = useAuth();
  const { notifications } = useOutletContext<AppShellContext>();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const [ticketsData, statusData] = await Promise.all([
        fetchWithRetry(`/api/tickets?${params}`),
        fetchWithRetry(`/api/statuses?tenant_id=${user.tenant_id}`)
      ]);
      setTickets(ticketsData || []);
      setStatuses(statusData || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError('Não foi possível carregar o dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [user]);

  const total = tickets.length;
  const countsByStatusId = tickets.reduce<Record<number, number>>((acc, t) => {
    acc[t.status_id] = (acc[t.status_id] || 0) + 1;
    return acc;
  }, {});
  const openCount = tickets.filter(t => t.status_sequence === 1).length;
  const inProgressCount = tickets.filter(t => t.status_sequence === 2).length;
  const inReviewCount = tickets.filter(t => t.status_sequence === 3).length;
  const doneCount = tickets.filter(t => t.status_sequence === 4).length;
  const withoutExecutor = tickets.filter(t => !t.executor_sector_id).length;
  const myQueue = tickets.filter(t => t.executor_id === user?.id && t.status_sequence < 4).length;

  const statusBreakdown = [...statuses]
    .sort((a, b) => a.sequence - b.sequence)
    .map(s => ({
      ...s,
      count: countsByStatusId[s.id] || 0,
      percent: total ? Math.round(((countsByStatusId[s.id] || 0) / total) * 100) : 0
    }));

  const recentTickets = [...tickets]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  const recentNotifications = [...notifications]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

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
      <div className="bg-card border rounded-2xl p-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button onClick={loadDashboard} className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg border hover:bg-muted">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Visão geral das operações de tickets da {user?.tenant_name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard title="Total de tickets" value={total} subtitle={`Últimos ${Math.min(total, METRICS_TICKETS_LIMIT)} carregados`} icon={<LayoutGrid size={18} />} />
        <MetricCard title="Em aberto" value={openCount} subtitle="Aguardando início" icon={<Clock size={18} />} />
        <MetricCard title="Em andamento" value={inProgressCount} subtitle="Em atendimento" icon={<AlertCircle size={18} />} />
        <MetricCard title="Concluídos" value={doneCount} subtitle="Finalizados" icon={<CheckCircle2 size={18} />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-card border rounded-2xl p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Distribuição por status</h3>
            <button onClick={() => navigate('/tickets')} className="text-xs font-bold text-primary hover:underline">
              Ver tickets
            </button>
          </div>
          <div className="space-y-3">
            {statusBreakdown.map(s => (
              <div key={s.id} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-muted-foreground">{s.count} ({s.percent}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${s.percent}%` }} />
                </div>
              </div>
            ))}
            {statusBreakdown.length === 0 && (
              <div className="text-sm text-muted-foreground">Nenhum status configurado.</div>
            )}
          </div>
        </div>

        <div className="bg-card border rounded-2xl p-5">
          <h3 className="text-lg font-bold mb-4">Fila pessoal</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Tickets comigo</p>
              <p className="text-xl font-black">{myQueue}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Sem executor</p>
              <p className="text-xl font-black">{withoutExecutor}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Em revisão</p>
              <p className="text-xl font-black">{inReviewCount}</p>
            </div>
            <button onClick={() => navigate('/tickets')} className="w-full py-3 text-xs font-bold uppercase tracking-widest rounded-xl border hover:bg-muted">
              Ir para tickets
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-card border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Tickets recentes</h3>
            <button onClick={() => navigate('/tickets')} className="text-xs font-bold text-primary hover:underline">
              Abrir lista
            </button>
          </div>
          <div className="space-y-3">
            {recentTickets.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-muted/40 transition-colors">
                <div>
                  <p className="text-sm font-semibold line-clamp-1">{t.title}</p>
                  <p className="text-[11px] text-muted-foreground">#{t.id} • {t.solicitor_sector_name} → {t.executor_sector_name || 'Não atribuído'}</p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-primary/10 text-primary">
                  {t.status_name}
                </span>
              </div>
            ))}
            {recentTickets.length === 0 && (
              <div className="text-sm text-muted-foreground">Nenhum ticket recente.</div>
            )}
          </div>
        </div>

        <div className="bg-card border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Notificações recentes</h3>
            <button onClick={() => navigate('/tickets')} className="text-xs font-bold text-primary hover:underline">
              Ver detalhes
            </button>
          </div>
          <div className="space-y-3">
            {recentNotifications.map(n => (
              <div key={n.id} className="p-3 rounded-xl border bg-muted/20 text-xs">
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
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Administração</h2>
        <p className="text-muted-foreground">Gerencie setores e usuários do tenant.</p>
      </div>
      <AdminPanel />
    </div>
  );
}

function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState<'light' | 'dark'>(user?.theme || 'light');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
  }, [theme]);

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
    `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
      isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
    }`;

  return (
    <div className="h-screen bg-background text-foreground flex overflow-hidden">
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

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 h-screen bg-card border-r p-6 flex flex-col gap-8 transition-transform md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Gestão 360</p>
            <p className="text-lg font-black tracking-tight">{user?.tenant_name || 'Seu Tenant'}</p>
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
          <button onClick={toggleTheme} className="w-full flex items-center justify-between px-3 py-2 rounded-xl border bg-muted/30 hover:bg-muted transition-colors text-sm font-semibold">
            <span>Tema</span>
            {theme === 'light' ? <Sun size={18}/> : <Moon size={18}/>}
          </button>
          <button onClick={logout} className="w-full flex items-center justify-between px-3 py-2 rounded-xl border hover:bg-destructive/10 hover:text-destructive transition-colors text-sm font-semibold">
            <span>Sair</span>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-screen">
        <header className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur-md">
          <div className="px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button className="md:hidden p-2 hover:bg-muted rounded-full" onClick={() => setSidebarOpen(true)}>
                <Menu size={20} />
              </button>
              <div>
                <p className="text-lg font-bold tracking-tight">{pageTitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative group">
                <button className="p-2 hover:bg-muted rounded-full transition-colors relative">
                  <Bell size={20}/>
                  {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full"/>}
                </button>
                <div className="absolute right-0 top-full mt-2 w-80 bg-card border rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                  <div className="p-4 border-b bg-muted/30 font-bold text-sm">Notificações</div>
                  <div className="max-h-96 overflow-y-auto">
                    {sortedNotifications.length === 0 ? (
                      <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma notificação nova</div>
                    ) : (
                      sortedNotifications.map(n => (
                        <div key={n.id} className="p-4 border-b hover:bg-muted/50 transition-colors flex justify-between items-start gap-2">
                          <p className="text-xs">{n.content}</p>
                          <button onClick={() => markAsRead(n.id)} className="text-[10px] font-bold text-primary hover:underline">Lido</button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="hidden md:flex items-center gap-3 pl-4 border-l">
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{user?.sector_name}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-bold">{user?.name?.[0]}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 py-6 lg:px-8 overflow-y-auto">
          <Outlet context={{ notifications, markAsRead }} />
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

  return user ? <AuthenticatedApp /> : <Login />;
}
