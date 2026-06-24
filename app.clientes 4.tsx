import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Pencil, Trash2, Send, Copy, MessageCircle, Mail, Receipt, CreditCard, BadgeDollarSign, KeyRound, Eye, EyeOff, Users, Sparkles, UserCheck, Zap, Trophy } from "lucide-react";
import { Plus } from "lucide-react";
import { waLink } from "@/lib/whatsapp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClienteHistoricoDialog } from "@/components/ClienteHistoricoDialog";
import { useServerFn } from "@tanstack/react-start";
import { adminResetUserPassword } from "@/lib/admin-users.functions";
import { useArenaCategorias } from "@/lib/use-arena-categorias";

export const Route = createFileRoute("/app/clientes")({
  head: () => ({ meta: [{ title: "Clientes · ArenaPro" }] }),
  component: ClientesPage,
});

type Profile = {
  id: string; nome: string; email: string | null; telefone: string | null; nivel: string | null;
  cpf?: string | null; data_nascimento?: string | null; genero?: string | null;
  cep?: string | null; endereco?: string | null; cidade?: string | null; estado?: string | null;
  observacoes?: string | null;
  parceiro?: string | null;
  parceiro_id?: string | null;
  aula_experimental_usada?: boolean;
  mensalista?: boolean;
  categoria_arena?: string | null;
};

function ClientesPage() {
  const [clientes, setClientes] = useState<Profile[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroNivel, setFiltroNivel] = useState<string>("todos");
  const [loading, setLoading] = useState(true);
  const [canEditNivel, setCanEditNivel] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [arenaId, setArenaId] = useState<string | null>(null);
  const categoriasArena = useArenaCategorias(arenaId);
  const [featMensalistas, setFeatMensalistas] = useState(false);
  const [novo, setNovo] = useState<Profile | null>(null);
  const [convidando, setConvidando] = useState<Profile | null>(null);
  const [conviteLink, setConviteLink] = useState<string>("");
  const [arenaNome, setArenaNome] = useState<string>("");
  const [gerandoConvite, setGerandoConvite] = useState(false);
  const [historicoCli, setHistoricoCli] = useState<Profile | null>(null);
  const [nivelTarget, setNivelTarget] = useState<{ cliente: Profile; novoNivel: string } | null>(null);
  const [motivoNivel, setMotivoNivel] = useState("");
  const [salvandoNivel, setSalvandoNivel] = useState(false);
  const [planoTarget, setPlanoTarget] = useState<Profile | null>(null);
  const [planosArena, setPlanosArena] = useState<{ id: string; nome: string; qtd_checkins: number | null; duracao_dias: number; preco: number }[]>([]);
  const [contratoAtivo, setContratoAtivo] = useState<{ id: string; plano_id: string; inicio: string; fim: string; checkins_usados: number; preco_pago: number; desconto?: number } | null>(null);
  const [planoForm, setPlanoForm] = useState<{ plano_id: string; inicio: string; fim: string; checkins_usados: number; preco_pago: number; desconto: number }>({ plano_id: "", inicio: "", fim: "", checkins_usados: 0, preco_pago: 0, desconto: 0 });
  const [salvandoPlano, setSalvandoPlano] = useState(false);
  const [pwReset, setPwReset] = useState<Profile | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwShow, setPwShow] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const resetPassword = useServerFn(adminResetUserPassword);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      let myArenaId: string | null = null;
      if (u.user) {
        const { data: prof } = await supabase.from("profiles").select("arena_id").eq("id", u.user.id).maybeSingle();
        myArenaId = prof?.arena_id ?? null;
        setArenaId(myArenaId);
        if (prof?.arena_id) {
          const { data: arena } = await supabase.from("arenas").select("nome, feature_mensalistas").eq("id", prof.arena_id).maybeSingle();
          setArenaNome(arena?.nome ?? "");
          setFeatMensalistas(!!(arena as { feature_mensalistas?: boolean } | null)?.feature_mensalistas);
        }
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", u.user.id);
        const rs = roles ?? [];
        setCanEditNivel(rs.some((r) =>
          r.role === "arena_admin" || r.role === "super_admin" || r.role === "professor"
        ));
        setIsAdmin(rs.some((r) => r.role === "arena_admin" || r.role === "super_admin"));
      }
      if (!myArenaId) { setLoading(false); return; }
      // Cap defensivo: arenas com >2000 alunos devem usar busca paginada (TODO)
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, email, telefone, nivel, cpf, data_nascimento, genero, cep, endereco, cidade, estado, observacoes, parceiro, parceiro_id, aula_experimental_usada, mensalista, categoria_arena")
        .eq("arena_id", myArenaId)
        .order("nome")
        .limit(2000);
      setClientes((data as Profile[]) ?? []);
      setLoading(false);
    })();
  }, []);

  async function buscarCep(cep: string) {
    const c = cep.replace(/\D/g, "");
    if (c.length !== 8 || !editing) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
      const d = await r.json();
      if (!d.erro) setEditing({ ...editing, endereco: d.logradouro, cidade: d.localidade, estado: d.uf });
    } catch {}
  }

  async function salvarPerfil() {
    if (!editing) return;
    setSaving(true);
    const { id, ...payload } = editing;
    const { error } = await supabase.from("profiles").update(payload as any).eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    setClientes((cs) => cs.map((c) => (c.id === id ? { ...c, ...payload } : c)));
    toast.success("Perfil atualizado");
    setEditing(null);
  }

  async function excluirCliente(id: string) {
    if (!confirm("Tem certeza que deseja remover este cliente?")) return;
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setClientes((cs) => cs.filter((c) => c.id !== id));
    toast.success("Cliente removido");
  }

  async function abrirConvite(cliente: Profile) {
    if (!arenaId) return;
    if (!cliente.email && !cliente.telefone) {
      return toast.error("Cadastre e-mail ou telefone do cliente antes de convidar.");
    }
    setConvidando(cliente);
    setConviteLink("");
    setGerandoConvite(true);
    try {
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const { error } = await supabase.from("convites").insert({
        arena_id: arenaId,
        token,
        email: cliente.email?.trim() || null,
        role: "aluno",
      } as any);
      if (error) {
        toast.error(error.message);
        setConvidando(null);
        return;
      }
      setConviteLink(`${window.location.origin}/invite/${token}`);
    } finally {
      setGerandoConvite(false);
    }
  }

  function mensagemConvite() {
    const arena = arenaNome || "nossa arena";
    return `Olá ${convidando?.nome?.split(" ")[0] ?? ""}! Você foi convidado(a) para acessar o app da ${arena}. Crie seu login aqui: ${conviteLink}`.trim();
  }

  function enviarWhatsApp() {
    if (!convidando?.telefone || !conviteLink) return;
    const fone = convidando.telefone.replace(/\D/g, "");
    const url = `https://wa.me/${fone.startsWith("55") ? fone : "55" + fone}?text=${encodeURIComponent(mensagemConvite())}`;
    window.open(url, "_blank");
  }

  function enviarEmail() {
    if (!convidando?.email || !conviteLink) return;
    const subject = encodeURIComponent(`Convite para o app da ${arenaNome || "arena"}`);
    const body = encodeURIComponent(mensagemConvite());
    window.location.href = `mailto:${convidando.email}?subject=${subject}&body=${body}`;
  }

  async function copiarLink() {
    if (!conviteLink) return;
    try {
      await navigator.clipboard.writeText(conviteLink);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function criarCliente() {
    if (!novo || !arenaId) return;
    if (!novo.nome.trim()) return toast.error("Nome é obrigatório");

    // Limite de alunos do plano
    const { data: sub } = await supabase
      .from("arena_subscriptions")
      .select("saas_plans(max_alunos, nome)")
      .eq("arena_id", arenaId).maybeSingle();
    const plan = (sub as { saas_plans?: { max_alunos: number | null; nome: string } } | null)?.saas_plans;
    if (plan?.max_alunos) {
      const { count } = await supabase
        .from("profiles").select("id", { count: "exact", head: true }).eq("arena_id", arenaId);
      if ((count ?? 0) >= plan.max_alunos) {
        return toast.error(`Plano ${plan.nome} permite até ${plan.max_alunos} alunos. Fale com o admin (lorran25rb12@gmail.com) para liberar mais.`);
      }
    }

    const emailLimpo = novo.email?.trim() || null;
    const cpfLimpo = novo.cpf?.replace(/\D/g, "") || null;

    if (emailLimpo) {
      const { data: emailExiste } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", emailLimpo)
        .limit(1)
        .maybeSingle();
      if (emailExiste) return toast.error("Já existe um cliente com este e-mail.");
    }

    if (cpfLimpo) {
      const { data: cpfExiste } = await supabase
        .from("profiles")
        .select("id")
        .ilike("cpf", `%${cpfLimpo}%`)
        .limit(1)
        .maybeSingle();
      if (cpfExiste) return toast.error("Já existe um cliente com este CPF.");
    }

    setSaving(true);
    const id = crypto.randomUUID();
    const payload = {
      id, arena_id: arenaId,
      nome: novo.nome.trim(),
      email: emailLimpo,
      telefone: novo.telefone?.trim() || null,
      nivel: (novo.nivel || null) as "iniciante" | "intermediario" | "avancado" | null,
      cpf: cpfLimpo,
      data_nascimento: novo.data_nascimento || null,
      genero: (novo.genero || null) as "masculino" | "feminino" | "outro" | null,
      cep: novo.cep?.trim() || null,
      endereco: novo.endereco?.trim() || null,
      cidade: novo.cidade?.trim() || null,
      estado: novo.estado?.trim() || null,
      observacoes: novo.observacoes?.trim() || null,
    };
    const { error } = await supabase.from("profiles").insert(payload as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    setClientes((cs) => [...cs, payload as Profile].sort((a, b) => a.nome.localeCompare(b.nome)));
    toast.success("Cliente adicionado");
    setNovo(null);
  }

  const updateNivel = (cliente: Profile, novaCategoria: string) => {
    if ((cliente.categoria_arena ?? "") === novaCategoria) return;
    setMotivoNivel("");
    setNivelTarget({ cliente, novoNivel: novaCategoria });
  };

  const confirmarAlteracaoNivel = async () => {
    if (!nivelTarget || !arenaId) return;
    if (!motivoNivel.trim()) return toast.error("Informe o motivo da alteração");
    setSalvandoNivel(true);
    const { cliente, novoNivel } = nivelTarget;
    const { error } = await supabase
      .from("profiles")
      .update({ categoria_arena: novoNivel })
      .eq("id", cliente.id);
    if (error) { setSalvandoNivel(false); return toast.error(error.message); }
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from("nivel_alteracoes").insert({
        arena_id: arenaId,
        aluno_id: cliente.id,
        alterado_por: u.user.id,
        nivel_anterior: cliente.categoria_arena ?? null,
        nivel_novo: novoNivel,
        motivo: motivoNivel.trim(),
      } as never);
    }
    setClientes((cs) => cs.map((c) => (c.id === cliente.id ? { ...c, categoria_arena: novoNivel } : c)));
    toast.success("Categoria atualizada");
    setSalvandoNivel(false);
    setNivelTarget(null);
  };

  const filtrados = clientes.filter((c) => {
    const buscaOk =
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(busca.toLowerCase());
    const nivelOk = filtroNivel === "todos" || c.nivel === filtroNivel;
    return buscaOk && nivelOk;
  });

  async function abrirPlano(cliente: Profile) {
    if (!arenaId) return;
    setPlanoTarget(cliente);
    setContratoAtivo(null);
    if (planosArena.length === 0) {
      const { data } = await supabase
        .from("planos")
        .select("id, nome, qtd_checkins, duracao_dias, preco")
        .eq("arena_id", arenaId)
        .eq("ativo", true)
        .neq("tipo", "avulsa") // planos avulsos não são atribuídos como contrato — são comprados por aula
        .order("nome");
      setPlanosArena((data as { id: string; nome: string; qtd_checkins: number | null; duracao_dias: number; preco: number }[]) ?? []);
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: contrato } = await supabase
      .from("contratos")
      .select("id, plano_id, inicio, fim, checkins_usados, preco_pago, desconto")
      .eq("aluno_id", cliente.id)
      .eq("status", "ativo")
      .gte("fim", hoje)
      .order("fim", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (contrato) {
      setContratoAtivo(contrato as typeof contratoAtivo);
      setPlanoForm({
        plano_id: contrato.plano_id,
        inicio: contrato.inicio,
        fim: contrato.fim,
        checkins_usados: contrato.checkins_usados ?? 0,
        preco_pago: Number(contrato.preco_pago ?? 0),
        desconto: Number((contrato as { desconto?: number }).desconto ?? 0),
      });
    } else {
      setPlanoForm({ plano_id: "", inicio: hoje, fim: "", checkins_usados: 0, preco_pago: 0, desconto: 0 });
    }
  }

  function selecionarPlano(planoId: string) {
    const p = planosArena.find((x) => x.id === planoId);
    if (!p) return setPlanoForm((f) => ({ ...f, plano_id: planoId }));
    const inicio = planoForm.inicio || new Date().toISOString().slice(0, 10);
    const fimDate = new Date(inicio + "T00:00");
    fimDate.setDate(fimDate.getDate() + (p.duracao_dias ?? 30));
    const sameAsAtivo = contratoAtivo?.plano_id === planoId;
    const desc = sameAsAtivo ? planoForm.desconto : 0;
    setPlanoForm({
      plano_id: planoId,
      inicio,
      fim: fimDate.toISOString().slice(0, 10),
      checkins_usados: sameAsAtivo ? planoForm.checkins_usados : 0,
      preco_pago: sameAsAtivo ? planoForm.preco_pago : Math.max(Number(p.preco ?? 0) - desc, 0),
      desconto: desc,
    });
  }

  async function salvarPlano() {
    if (!planoTarget || !arenaId) return;
    if (!planoForm.plano_id) return toast.error("Escolha um plano");
    if (!planoForm.inicio || !planoForm.fim) return toast.error("Defina início e fim");
    setSalvandoPlano(true);
    // Always use the RPC — it computes fim from plano.duracao_dias safely
    // and prevents single-day contracts (the bug that hit Ana Laura).
    if (contratoAtivo) {
      const plano = planosArena.find(p => p.id === planoForm.plano_id);
      const inicio = planoForm.inicio;
      const fimDate = new Date(inicio + "T00:00");
      fimDate.setDate(fimDate.getDate() + (plano?.duracao_dias ?? 30));
      const fimSafe = fimDate.toISOString().slice(0, 10);
      const { error } = await supabase.from("contratos").update({
        plano_id: planoForm.plano_id,
        inicio,
        fim: fimSafe,
        checkins_usados: Math.max(0, Number(planoForm.checkins_usados) || 0),
        preco_pago: Number(planoForm.preco_pago) || 0,
        desconto: Math.max(0, Number(planoForm.desconto) || 0),
        status: "ativo" as const,
      }).eq("id", contratoAtivo.id);
      setSalvandoPlano(false);
      if (error) return toast.error(error.message);
      toast.success("Plano atualizado");
    } else {
      const { error } = await supabase.rpc("criar_contrato_aluno", {
        _aluno_id: planoTarget.id,
        _plano_id: planoForm.plano_id,
        _preco_pago: Number(planoForm.preco_pago) || 0,
        _desconto: Math.max(0, Number(planoForm.desconto) || 0),
        _inicio: planoForm.inicio,
      });
      setSalvandoPlano(false);
      if (error) return toast.error(error.message);
      toast.success("Plano atribuído");
    }
    setPlanoTarget(null);
  }

  async function removerPlano() {
    if (!contratoAtivo) return;
    if (!confirm("Cancelar o plano ativo deste aluno?")) return;
    const { error } = await supabase
      .from("contratos")
      .update({ status: "cancelado" })
      .eq("id", contratoAtivo.id);
    if (error) return toast.error(error.message);
    toast.success("Plano cancelado");
    setPlanoTarget(null);
  }

  const planoSelecionado = planosArena.find((p) => p.id === planoForm.plano_id);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="relative overflow-hidden bg-gradient-hero text-primary-foreground px-5 pt-12 pb-20 rounded-b-[2rem] shadow-elevated">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
        <div aria-hidden className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-white/70 text-[11px] font-semibold uppercase tracking-[0.18em]">Comunidade</p>
            <h1 className="font-display text-white text-[28px] mt-1 leading-tight">Clientes</h1>
            <p className="text-white/70 text-xs mt-1">{clientes.length} {clientes.length === 1 ? "cadastrado" : "cadastrados"}</p>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setNovo({ id: "", nome: "", email: "", telefone: "", nivel: "" })}
              className="rounded-full shadow-card"
            >
              <Plus className="h-4 w-4 mr-1" /> Novo
            </Button>
          )}
        </div>
      </header>

      <div className="px-4 -mt-14 relative z-10 space-y-3">
        {/* Bento métricas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-card border border-border shadow-card p-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
              <Users className="h-4 w-4" />
            </div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Total</p>
            <p className="font-display text-2xl leading-tight">{clientes.length}</p>
          </div>
          <div className="rounded-2xl bg-card border border-border shadow-card p-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/15 text-emerald-700 flex items-center justify-center mb-2">
              <UserCheck className="h-4 w-4" />
            </div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Mensalistas</p>
            <p className="font-display text-2xl leading-tight">{clientes.filter(c => c.mensalista).length}</p>
          </div>
        </div>
        {categoriasArena.length > 0 && (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(categoriasArena.length, 3)}, minmax(0, 1fr))` }}
          >
            {categoriasArena.map((cat, idx) => {
              const palette = [
                { bg: "bg-amber-500/15", fg: "text-amber-700", Icon: Sparkles },
                { bg: "bg-sky-500/15", fg: "text-sky-700", Icon: Zap },
                { bg: "bg-violet-500/15", fg: "text-violet-700", Icon: Trophy },
                { bg: "bg-emerald-500/15", fg: "text-emerald-700", Icon: UserCheck },
                { bg: "bg-primary/10", fg: "text-primary", Icon: Users },
              ];
              const p = palette[idx % palette.length];
              const catLower = cat.toLowerCase();
              const count = clientes.filter(
                (c) =>
                  (c.categoria_arena ?? "").toLowerCase() === catLower ||
                  (!c.categoria_arena && (c.nivel ?? "").toLowerCase() === catLower)
              ).length;
              return (
                <div key={cat} className="rounded-2xl bg-card border border-border shadow-card p-3">
                  <div className={`h-9 w-9 rounded-xl ${p.bg} ${p.fg} flex items-center justify-center mb-2`}>
                    <p.Icon className="h-4 w-4" />
                  </div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground truncate">{cat}</p>
                  <p className="font-display text-2xl leading-tight">{count}</p>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" className="pl-9 bg-card rounded-2xl h-11 shadow-card border-border/60" />
          </div>
          <Select value={filtroNivel} onValueChange={(v) => setFiltroNivel(v)}>
            <SelectTrigger className="h-11 w-[130px] bg-card rounded-2xl shadow-card border-border/60 text-xs">
              <SelectValue placeholder="Nível" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {categoriasArena.map((cat) => (
                <SelectItem key={cat} value={cat.toLowerCase()}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="px-4 mt-4 space-y-2">
        {loading && <p className="text-sm text-muted-foreground text-center py-8">Carregando…</p>}
        {!loading && filtrados.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum cliente encontrado.</p>
        )}
        {filtrados.map((c) => (
          <Card key={c.id} className="p-3 rounded-2xl space-y-2 border-border/60 hover:shadow-card transition">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-primary text-primary-foreground flex items-center justify-center font-display text-lg shadow-glow">
                {c.nome.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base leading-tight truncate">{c.nome}</p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{c.email ?? c.telefone ?? "—"}</p>
              </div>
              {c.mensalista && (
                <span className="text-[9px] uppercase font-bold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-700 shrink-0">Mensal</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {canEditNivel ? (
              <Select value={c.categoria_arena ?? ""} onValueChange={(v) => updateNivel(c, v)}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue placeholder="Definir categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categoriasArena.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : c.nivel ? (
              <span className="text-[10px] uppercase font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
                {c.nivel}
              </span>
            ) : null}
            {isAdmin && (
              <div className="flex items-center gap-1 ml-auto">
                <Button size="icon" variant="ghost" onClick={() => setHistoricoCli(c)} title="Histórico de compras">
                  <Receipt className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => abrirPlano(c)} title="Plano e check-ins">
                  <CreditCard className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Lançar taxa de inscrição"
                  onClick={async () => {
                    if (!confirm(`Lançar taxa de inscrição para ${c.nome}?`)) return;
                    const { error } = await supabase.rpc("admin_lancar_taxa_inscricao", { _aluno_id: c.id });
                    if (error) return toast.error(error.message);
                    toast.success("Taxa lançada — aluno foi notificado.");
                  }}
                >
                  <BadgeDollarSign className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => abrirConvite(c)} title="Enviar convite de login">
                  <Send className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" title="Trocar senha do aluno" onClick={() => { setPwReset(c); setPwValue(""); }}>
                  <KeyRound className="h-4 w-4" />
                </Button>
                {c.telefone && (
                  <a
                    href={waLink(c.telefone, `Olá, ${c.nome.split(" ")[0]}! 👋`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Falar no WhatsApp"
                    className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-accent text-green-600"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                )}
                <Button size="icon" variant="ghost" onClick={() => setEditing(c)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => excluirCliente(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar perfil</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editing.nome ?? ""} onChange={(e) => setEditing({ ...editing, nome: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>E-mail</Label><Input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
                <div><Label>Telefone</Label><Input value={editing.telefone ?? ""} onChange={(e) => setEditing({ ...editing, telefone: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>CPF</Label><Input value={editing.cpf ?? ""} onChange={(e) => setEditing({ ...editing, cpf: e.target.value })} /></div>
                <div><Label>Nascimento</Label><Input type="date" value={editing.data_nascimento ?? ""} onChange={(e) => setEditing({ ...editing, data_nascimento: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Gênero</Label>
                  <Select value={editing.genero ?? ""} onValueChange={(v) => setEditing({ ...editing, genero: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nível</Label>
                  <Select value={editing.nivel ?? ""} onValueChange={(v) => setEditing({ ...editing, nivel: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="iniciante">Iniciante</SelectItem>
                      <SelectItem value="intermediario">Intermediário</SelectItem>
                      <SelectItem value="avancado">Avançado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Categoria da arena</Label>
                <Select
                  value={editing.categoria_arena ?? "__none"}
                  onValueChange={(v) => setEditing({ ...editing, categoria_arena: v === "__none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— sem categoria —</SelectItem>
                    {categoriasArena.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Define em quais aulas o aluno pode se inscrever. A ordem das categorias da arena define o ranking (a primeira é a mais básica).
                </p>
              </div>
              <div>
                <Label>CEP</Label>
                <Input value={editing.cep ?? ""} onChange={(e) => { setEditing({ ...editing, cep: e.target.value }); buscarCep(e.target.value); }} />
              </div>
              <div><Label>Endereço</Label><Input value={editing.endereco ?? ""} onChange={(e) => setEditing({ ...editing, endereco: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Cidade</Label><Input value={editing.cidade ?? ""} onChange={(e) => setEditing({ ...editing, cidade: e.target.value })} /></div>
                <div><Label>UF</Label><Input maxLength={2} value={editing.estado ?? ""} onChange={(e) => setEditing({ ...editing, estado: e.target.value.toUpperCase() })} /></div>
              </div>
              <div><Label>Observações</Label><Input value={editing.observacoes ?? ""} onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })} /></div>
              <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                <Label className="text-xs font-semibold">Aula experimental gratuita</Label>
                <p className="text-[11px] text-muted-foreground">
                  Marque como <strong>já usada</strong> para alunos migrados de outro app, evitando que ganhem uma aula extra ao logar pela primeira vez.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={editing.aula_experimental_usada ? "default" : "outline"}
                    onClick={async () => {
                      if (!editing.cpf || editing.cpf.replace(/\D/g, "").length !== 11) {
                        return toast.error("Cadastre o CPF do aluno antes de marcar.");
                      }
                      const { error } = await supabase.rpc("admin_set_experimental_usada", {
                        _aluno_id: editing.id, _usada: true, _motivo: "Migração de outro app",
                      });
                      if (error) return toast.error(error.message);
                      toast.success("Marcado como já usada");
                      setEditing({ ...editing, aula_experimental_usada: true });
                      setClientes((cs) => cs.map((c) => c.id === editing.id ? { ...c, aula_experimental_usada: true } : c));
                    }}
                  >
                    Já usou
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!editing.aula_experimental_usada ? "default" : "outline"}
                    onClick={async () => {
                      const { error } = await supabase.rpc("admin_set_experimental_usada", {
                        _aluno_id: editing.id, _usada: false, _motivo: "Liberado pelo admin",
                      });
                      if (error) return toast.error(error.message);
                      toast.success("Liberado");
                      setEditing({ ...editing, aula_experimental_usada: false });
                      setClientes((cs) => cs.map((c) => c.id === editing.id ? { ...c, aula_experimental_usada: false } : c));
                    }}
                  >
                    Liberar
                  </Button>
                </div>
              </div>
              {featMensalistas && (
              <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                <Label className="text-xs font-semibold">Aluno mensalista</Label>
                <p className="text-[11px] text-muted-foreground">
                  Mensalistas têm prioridade nas <strong>vagas reservadas</strong> de cada aula
                  (configurado em <em>Minha arena</em>). Avulsos só pegam essas vagas perto do horário.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button" size="sm"
                    variant={editing.mensalista ? "default" : "outline"}
                    onClick={() => setEditing({ ...editing, mensalista: true })}
                  >
                    Mensalista
                  </Button>
                  <Button
                    type="button" size="sm"
                    variant={!editing.mensalista ? "default" : "outline"}
                    onClick={() => setEditing({ ...editing, mensalista: false })}
                  >
                    Avulso
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Lembre de clicar em <strong>Salvar</strong> embaixo.</p>
              </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Parceiro fitness</Label>
                  <Select value={editing.parceiro ?? "none"} onValueChange={(v) => setEditing({ ...editing, parceiro: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      <SelectItem value="wellhub">Gympass / Wellhub</SelectItem>
                      <SelectItem value="totalpass">TotalPass</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ID do parceiro</Label>
                  <Input value={editing.parceiro_id ?? ""} onChange={(e) => setEditing({ ...editing, parceiro_id: e.target.value })} placeholder="Carteirinha" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={salvarPerfil} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!novo} onOpenChange={(o) => !o && setNovo(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
          {novo && (
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>E-mail</Label><Input type="email" value={novo.email ?? ""} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></div>
                <div><Label>Telefone</Label><Input value={novo.telefone ?? ""} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>CPF</Label><Input value={novo.cpf ?? ""} onChange={(e) => setNovo({ ...novo, cpf: e.target.value })} /></div>
                <div><Label>Nascimento</Label><Input type="date" value={novo.data_nascimento ?? ""} onChange={(e) => setNovo({ ...novo, data_nascimento: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Gênero</Label>
                  <Select value={novo.genero ?? ""} onValueChange={(v) => setNovo({ ...novo, genero: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nível</Label>
                  <Select value={novo.nivel ?? ""} onValueChange={(v) => setNovo({ ...novo, nivel: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="iniciante">Iniciante</SelectItem>
                      <SelectItem value="intermediario">Intermediário</SelectItem>
                      <SelectItem value="avancado">Avançado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Observações</Label><Input value={novo.observacoes ?? ""} onChange={(e) => setNovo({ ...novo, observacoes: e.target.value })} /></div>
              <p className="text-[11px] text-muted-foreground">
                Cliente manual: sem acesso ao app. Para liberar login, envie um convite pela tela de Permissões.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(null)}>Cancelar</Button>
            <Button onClick={criarCliente} disabled={saving}>{saving ? "Salvando…" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!convidando} onOpenChange={(o) => { if (!o) { setConvidando(null); setConviteLink(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Convidar {convidando?.nome}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Gere um link de convite e envie por WhatsApp ou e-mail. O cliente cria a senha e passa a acessar o app.
            </p>
            {gerandoConvite && <p className="text-sm">Gerando link…</p>}
            {conviteLink && (
              <div className="space-y-2">
                <Label>Link do convite</Label>
                <div className="flex gap-2">
                  <Input readOnly value={conviteLink} className="text-xs" />
                  <Button size="icon" variant="outline" onClick={copiarLink} title="Copiar">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button onClick={enviarWhatsApp} disabled={!convidando?.telefone} className="bg-green-600 hover:bg-green-700 text-white">
                    <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                  </Button>
                  <Button onClick={enviarEmail} disabled={!convidando?.email} variant="outline">
                    <Mail className="h-4 w-4 mr-1" /> E-mail
                  </Button>
                </div>
                {!convidando?.telefone && <p className="text-[11px] text-muted-foreground">Sem telefone cadastrado para WhatsApp.</p>}
                {!convidando?.email && <p className="text-[11px] text-muted-foreground">Sem e-mail cadastrado.</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConvidando(null); setConviteLink(""); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {historicoCli && arenaId && (
        <ClienteHistoricoDialog
          open={!!historicoCli}
          onClose={() => setHistoricoCli(null)}
          clienteId={historicoCli.id}
          clienteNome={historicoCli.nome}
          arenaId={arenaId}
        />
      )}

      <Dialog open={!!pwReset} onOpenChange={(o) => !o && setPwReset(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Trocar senha</DialogTitle></DialogHeader>
          {pwReset && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Definindo nova senha para <b>{pwReset.nome}</b>. Avise o aluno após salvar.
              </p>
              <div className="space-y-1.5">
                <Label>Nova senha (mín. 6)</Label>
                <div className="relative">
                  <Input type={pwShow ? "text" : "password"} value={pwValue}
                    onChange={(e) => setPwValue(e.target.value)} minLength={6} className="pr-10" />
                  <button type="button" onClick={() => setPwShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {pwShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwReset(null)}>Cancelar</Button>
            <Button disabled={pwSaving || pwValue.length < 6} onClick={async () => {
              if (!pwReset) return;
              setPwSaving(true);
              try {
                await resetPassword({ data: { userId: pwReset.id, newPassword: pwValue } });
                toast.success("Senha atualizada");
                setPwReset(null); setPwValue("");
              } catch (e: any) { toast.error(e?.message || "Erro"); }
              setPwSaving(false);
            }}>
              {pwSaving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!nivelTarget} onOpenChange={(o) => !o && setNivelTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Alterar categoria</DialogTitle></DialogHeader>
          {nivelTarget && (
            <div className="space-y-3">
              <p className="text-sm">
                Mudando <b>{nivelTarget.cliente.nome}</b> de{" "}
                <span className="uppercase text-xs">{nivelTarget.cliente.categoria_arena ?? "—"}</span> para{" "}
                <span className="uppercase text-xs font-semibold">{nivelTarget.novoNivel}</span>.
              </p>
              <div>
                <Label>Motivo *</Label>
                <Input
                  value={motivoNivel}
                  onChange={(e) => setMotivoNivel(e.target.value)}
                  placeholder="Ex.: evoluiu na avaliação técnica"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Essa alteração ficará registrada no log de mudanças.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNivelTarget(null)}>Cancelar</Button>
            <Button onClick={confirmarAlteracaoNivel} disabled={salvandoNivel}>
              {salvandoNivel ? "Salvando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!planoTarget} onOpenChange={(o) => !o && setPlanoTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Plano de {planoTarget?.nome}</DialogTitle>
          </DialogHeader>
          {planoTarget && (
            <div className="space-y-3">
              {contratoAtivo ? (
                <p className="text-xs text-muted-foreground">
                  Editando plano ativo. As alterações afetam imediatamente os check-ins do aluno.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Atribuindo um novo plano a este aluno.
                </p>
              )}
              <div>
                <Label>Plano *</Label>
                <Select value={planoForm.plano_id} onValueChange={selecionarPlano}>
                  <SelectTrigger><SelectValue placeholder="Escolha um plano" /></SelectTrigger>
                  <SelectContent>
                    {planosArena.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} {p.qtd_checkins ? `· ${p.qtd_checkins} check-ins` : "· ilimitado"} · {p.duracao_dias}d
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Início</Label>
                  <Input type="date" value={planoForm.inicio} onChange={(e) => setPlanoForm({ ...planoForm, inicio: e.target.value })} />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input type="date" value={planoForm.fim} onChange={(e) => setPlanoForm({ ...planoForm, fim: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Check-ins usados</Label>
                  <Input
                    type="number"
                    min={0}
                    value={planoForm.checkins_usados}
                    onChange={(e) => setPlanoForm({ ...planoForm, checkins_usados: Number(e.target.value) })}
                  />
                  {planoSelecionado?.qtd_checkins != null && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Restantes: {Math.max(0, planoSelecionado.qtd_checkins - (Number(planoForm.checkins_usados) || 0))} / {planoSelecionado.qtd_checkins}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Valor pago (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={planoForm.preco_pago}
                    onChange={(e) => setPlanoForm({ ...planoForm, preco_pago: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Desconto (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={planoForm.desconto}
                    onChange={(e) => {
                      const d = Math.max(0, Number(e.target.value) || 0);
                      const base = Number(planoSelecionado?.preco ?? planoForm.preco_pago + planoForm.desconto);
                      setPlanoForm({ ...planoForm, desconto: d, preco_pago: Math.max(base - d, 0) });
                    }}
                  />
                </div>
                {planoSelecionado && (
                  <div className="flex items-end">
                    <p className="text-[11px] text-muted-foreground">
                      Valor cheio: R$ {Number(planoSelecionado.preco).toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                )}
              </div>
              {planosArena.length === 0 && (
                <p className="text-[11px] text-destructive">
                  Nenhum plano ativo na arena. Cadastre planos em "Planos" antes.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {contratoAtivo && (
              <Button variant="destructive" onClick={removerPlano} className="sm:mr-auto">
                Cancelar plano
              </Button>
            )}
            <Button variant="outline" onClick={() => setPlanoTarget(null)}>Fechar</Button>
            <Button onClick={salvarPlano} disabled={salvandoPlano || planosArena.length === 0}>
              {salvandoPlano ? "Salvando…" : contratoAtivo ? "Atualizar plano" : "Atribuir plano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
