import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { Sector, User } from '../types';
import { 
  Plus, Users, Layout, Mail, Shield, UserPlus, 
  CheckCircle2, AlertCircle, Loader2, Trash2, 
  ChevronRight, Building2, UserCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/apiFetch';

function StatusMessage({ message, type }: { message: string, type: 'success' | 'error' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`p-3 rounded-xl flex items-center gap-2 text-sm font-medium ${
        type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
      }`}
    >
      {type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      {message}
    </motion.div>
  );
}

export function AdminPanel() {
  const { user } = useAuth();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [users, setUsers] = useState<(User & { sector_name: string })[]>([]);
  const [newSectorName, setNewSectorName] = useState('');
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    sector_id: '',
    role: 'user'
  });
  
  const [isSubmittingSector, setIsSubmittingSector] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [deletingSectorId, setDeletingSectorId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [confirmDeleteSector, setConfirmDeleteSector] = useState<number | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<number | null>(null);
  const [sectorError, setSectorError] = useState<{ id: number, message: string } | null>(null);
  const [userError, setUserError] = useState<{ id: number, message: string } | null>(null);
  const [feedback, setFeedback] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const fetchData = async () => {
    if (!user?.tenant_id || !user?.id) return;
    
    try {
      const [sRes, uRes] = await Promise.all([
        apiFetch(`/api/sectors?tenant_id=${user.tenant_id}`),
        apiFetch(`/api/admin/users?tenant_id=${user.tenant_id}&admin_id=${user.id}`)
      ]);

      let sData, uData;
      
      try {
        sData = await sRes.json();
      } catch (e) {
        if (!sRes.ok) throw new Error(`Erro no servidor de setores (${sRes.status})`);
        throw new Error("Resposta inválida do servidor de setores.");
      }

      try {
        uData = await uRes.json();
      } catch (e) {
        if (!uRes.ok) throw new Error(`Erro no servidor de usuários (${uRes.status})`);
        throw new Error("Resposta inválida do servidor de usuários.");
      }

      if (!sRes.ok) throw new Error(sData.error || `Erro ao buscar setores (${sRes.status})`);
      if (!uRes.ok) throw new Error(uData.error || `Erro ao buscar usuários (${uRes.status})`);

      setSectors(sData);
      setUsers(uData);
    } catch (err: any) {
      console.error("Erro ao carregar dados do painel admin:", err);
      setFeedback({ message: err.message || 'Erro ao carregar dados.', type: 'error' });
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const handleCreateSector = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingSector(true);
    try {
      const res = await apiFetch('/api/admin/sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: user?.tenant_id, name: newSectorName, admin_id: user?.id }),
      });
      if (res.ok) {
        setNewSectorName('');
        setFeedback({ message: 'Setor criado com sucesso!', type: 'success' });
        fetchData();
      } else {
        setFeedback({ message: 'Erro ao criar setor.', type: 'error' });
      }
    } catch (err) {
      setFeedback({ message: 'Erro de conexão.', type: 'error' });
    } finally {
      setIsSubmittingSector(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingUser(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newUser, tenant_id: user?.tenant_id, admin_id: user?.id }),
      });
      if (res.ok) {
        setNewUser({ name: '', email: '', sector_id: '', role: 'user' });
        setFeedback({ message: 'Usuário convidado com sucesso!', type: 'success' });
        fetchData();
      } else {
        const data = await res.json();
        setFeedback({ message: data.error || 'Erro ao convidar usuário.', type: 'error' });
      }
    } catch (err) {
      setFeedback({ message: 'Erro de conexão.', type: 'error' });
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleDeleteSector = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setSectorError(null);
    console.log("Delete sector requested for ID:", id);
    if (confirmDeleteSector !== id) {
      setConfirmDeleteSector(id);
      setTimeout(() => setConfirmDeleteSector(null), 3000);
      return;
    }
    
    setDeletingSectorId(id);
    setConfirmDeleteSector(null);
    try {
      const url = `/api/admin/sectors/${id}?admin_id=${user?.id}`;
      const res = await apiFetch(url, { method: 'DELETE' });
      if (res.ok) {
        setFeedback({ message: 'Setor excluído com sucesso!', type: 'success' });
        fetchData();
      } else {
        const data = await res.json();
        const errorMsg = data.error || 'Erro ao excluir setor.';
        setSectorError({ id, message: errorMsg });
        setTimeout(() => setSectorError(null), 5000);
      }
    } catch (err) {
      setSectorError({ id, message: 'Erro de conexão.' });
      setTimeout(() => setSectorError(null), 5000);
    } finally {
      setDeletingSectorId(null);
    }
  };

  const handleDeleteUser = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setUserError(null);
    console.log("Delete user requested for ID:", id);
    if (confirmDeleteUser !== id) {
      setConfirmDeleteUser(id);
      setTimeout(() => setConfirmDeleteUser(null), 3000);
      return;
    }

    setDeletingUserId(id);
    setConfirmDeleteUser(null);
    try {
      const url = `/api/admin/users/${id}?admin_id=${user?.id}`;
      const res = await apiFetch(url, { method: 'DELETE' });
      if (res.ok) {
        setFeedback({ message: 'Usuário excluído com sucesso!', type: 'success' });
        fetchData();
      } else {
        const data = await res.json();
        const errorMsg = data.error || 'Erro ao excluir usuário.';
        setUserError({ id, message: errorMsg });
        setTimeout(() => setUserError(null), 5000);
      }
    } catch (err) {
      setUserError({ id, message: 'Erro de conexão.' });
      setTimeout(() => setUserError(null), 5000);
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-xs">
            <Shield size={14} />
            Administração
          </div>
          <h2 className="text-4xl font-black tracking-tight">Painel de Controle</h2>
          <p className="text-muted-foreground text-lg">Gerencie a infraestrutura humana da sua organização.</p>
        </div>
        
        <AnimatePresence>
          {feedback && <StatusMessage message={feedback.message} type={feedback.type} />}
        </AnimatePresence>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Sectors */}
        <div className="lg:col-span-4 space-y-8">
          <section className="bg-card border rounded-3xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Building2 size={20} />
                </div>
                <h3 className="text-xl font-bold">Setores</h3>
              </div>
              <span className="text-xs font-mono bg-muted px-2 py-1 rounded-full text-muted-foreground">
                {sectors.length} total
              </span>
            </div>
            
            <form onSubmit={handleCreateSector} className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={newSectorName}
                  onChange={(e) => setNewSectorName(e.target.value)}
                  placeholder="Nome do setor (ex: RH, TI)"
                  className="w-full p-4 pr-12 rounded-2xl border bg-background focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/50"
                  required
                />
                <button 
                  type="submit" 
                  disabled={isSubmittingSector}
                  className="absolute right-2 top-2 p-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSubmittingSector ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
                </button>
              </div>
            </form>

            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {sectors.map((s) => (
                <motion.div 
                  layout
                  key={s.id} 
                  className="group p-4 rounded-2xl border bg-background/50 hover:bg-background hover:shadow-md transition-all flex justify-between items-center"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                    <span className="font-semibold">{s.name}</span>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => handleDeleteSector(e, s.id)}
                        disabled={deletingSectorId === s.id}
                        className={`p-2 rounded-lg transition-all flex items-center gap-1 ${
                          confirmDeleteSector === s.id 
                            ? 'bg-destructive text-destructive-foreground px-3' 
                            : 'text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10'
                        }`}
                        title={confirmDeleteSector === s.id ? "Clique para confirmar" : "Excluir Setor"}
                      >
                        {deletingSectorId === s.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : confirmDeleteSector === s.id ? (
                          <>
                            <Trash2 size={14} />
                            <span className="text-[10px] font-bold uppercase">Confirmar?</span>
                          </>
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                      <ChevronRight size={16} className="text-muted-foreground/30 group-hover:text-primary transition-colors" />
                    </div>
                    <AnimatePresence>
                      {sectorError?.id === s.id && (
                        <motion.div
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="text-[10px] font-bold text-destructive bg-destructive/10 px-2 py-1 rounded-md max-w-[200px] text-right"
                        >
                          {sectorError.message}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Users */}
        <div className="lg:col-span-8 space-y-8">
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Users size={20} />
                </div>
                <h3 className="text-xl font-bold">Gestão de Membros</h3>
              </div>
              <div className="flex gap-2">
                <span className="text-xs font-mono bg-muted px-2 py-1 rounded-full text-muted-foreground">
                  {users.length} usuários
                </span>
              </div>
            </div>

            {/* Create User Form */}
            <form onSubmit={handleCreateUser} className="bg-card border rounded-3xl p-8 shadow-sm space-y-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary/20" />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Nome Completo</label>
                  <div className="relative">
                    <UserCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                      type="text"
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                      className="w-full p-4 pl-12 rounded-2xl border bg-background focus:ring-2 focus:ring-primary outline-none transition-all"
                      placeholder="João Silva"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="w-full p-4 pl-12 rounded-2xl border bg-background focus:ring-2 focus:ring-primary outline-none transition-all"
                      placeholder="joao@empresa.com"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Setor Designado</label>
                  <select
                    value={newUser.sector_id}
                    onChange={(e) => setNewUser({ ...newUser, sector_id: e.target.value })}
                    className="w-full p-4 rounded-2xl border bg-background focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                    required
                  >
                    <option value="">Selecione um setor...</option>
                    {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Nível de Acesso</label>
                  <div className="flex p-1 bg-muted rounded-2xl gap-1">
                    <button
                      type="button"
                      onClick={() => setNewUser({ ...newUser, role: 'user' })}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${newUser.role === 'user' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Usuário
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUser({ ...newUser, role: 'admin' })}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${newUser.role === 'admin' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Admin
                    </button>
                  </div>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isSubmittingUser}
                className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {isSubmittingUser ? <Loader2 size={20} className="animate-spin" /> : <UserPlus size={20} />}
                Confirmar Convite
              </button>
            </form>

            {/* Users Table */}
            <div className="bg-card border rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 border-b">
                      <th className="p-6 text-xs font-black uppercase tracking-widest text-muted-foreground">Colaborador</th>
                      <th className="p-6 text-xs font-black uppercase tracking-widest text-muted-foreground">Setor</th>
                      <th className="p-6 text-xs font-black uppercase tracking-widest text-muted-foreground">Acesso</th>
                      <th className="p-6 text-xs font-black uppercase tracking-widest text-muted-foreground text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-muted/10 transition-colors group">
                        <td className="p-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-black text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                              {u.name[0]}
                            </div>
                            <div>
                              <div className="font-bold text-lg">{u.name}</div>
                              <div className="text-sm text-muted-foreground">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-6">
                          <span className="px-3 py-1.5 bg-muted rounded-xl text-xs font-bold border">
                            {u.sector_name}
                          </span>
                        </td>
                        <td className="p-6">
                          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest border ${
                            u.role === 'admin' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-transparent'
                          }`}>
                            {u.role === 'admin' ? <Shield size={12} /> : <Mail size={12} />}
                            {u.role}
                          </div>
                        </td>
                        <td className="p-6 text-right">
                          <div className="flex flex-col items-end gap-2">
                            {u.id !== user?.id && u.role !== 'admin' && (
                              <button 
                                onClick={(e) => handleDeleteUser(e, u.id)}
                                disabled={deletingUserId === u.id}
                                className={`p-2 rounded-xl transition-all flex items-center gap-1 ml-auto ${
                                  confirmDeleteUser === u.id 
                                    ? 'bg-destructive text-destructive-foreground px-4' 
                                    : 'text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10'
                                }`}
                                title={confirmDeleteUser === u.id ? "Clique para confirmar" : "Excluir Usuário"}
                              >
                                {deletingUserId === u.id ? (
                                  <Loader2 size={18} className="animate-spin" />
                                ) : confirmDeleteUser === u.id ? (
                                  <>
                                    <Trash2 size={16} />
                                    <span className="text-xs font-bold uppercase">Confirmar?</span>
                                  </>
                                ) : (
                                  <Trash2 size={18} />
                                )}
                              </button>
                            )}
                            <AnimatePresence>
                              {userError?.id === u.id && (
                                <motion.div
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 5 }}
                                  className="text-[10px] font-bold text-destructive bg-destructive/10 px-2 py-1 rounded-md max-w-[200px]"
                                >
                                  {userError.message}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
