import { createFileRoute, Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useArenaCategorias } from "@/lib/use-arena-categorias";
import { supabase } from "@/integrations/supabase/client";
import { NotificationsBell } from "@/components/notifications-bell";
import { ArenaSwitcher } from "@/components/arena-switcher";
import { AulaRatingDialog } from "@/components/aula-rating-dialog";
import {
  Calendar, Users, Trophy, ShoppingBag, CreditCard, DollarSign,
  UserPlus, GraduationCap, Megaphone, ClipboardList, Plug, Ticket, Timer, Award, Flame,
  Medal, MapPin, CalendarRange, History, Dumbbell, Wallet, Receipt, Upload, Star,
  CheckCircle2, Settings, Building2, Shield, LifeBuoy, Crown, Search,
} from "lucide-react";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Início · ArenaPro" }] }),
  component: HomePage,
});

type ModuleItem = {
  to?: "/app/clientes" | "/app/leads" | "/app/financeiro" | "/app/agenda" | "/app/planos" | "/app/meu-plano" | "/app/avisos" | "/app/integracoes" | "/app/relatorios" | "/app/torneios" | "/app/professores" | "/app/loja" | "/app/ranking" | "/app/buscar" | "/app/reservar" | "/app/minhas-reservas" | "/app/alugueis" | "/app/pagamentos" | "/app/historico" | "/app/brindes" | "/app/pontos" | "/app/instrutor" | "/app/minha-folha" | "/app/folha-pagamento" | "/app/importar-alunos" | "/app/checkins-parceiros" | "/app/minha-arena" | "/app/minhas-arenas" | "/app/configuracoes" | "/app/permissoes" | "/app/logs" | "/app/perfil" | "/app/assinatura" | "/app/suporte";
  label: string;
  icon: typeof Calendar;
  roles: Array<"aluno" | "professor" | "admin">;
};
const modules: ModuleItem[] = [
  { to: "/app/agenda", label: "Agenda", icon: Calendar, roles: ["aluno", "professor", "admin"] },
  { to: "/app/meu-plano", label: "Meu plano", icon: CreditCard, roles: ["aluno"] },
  { to: "/app/pagamentos", label: "Mensalidades", icon: Receipt, roles: ["aluno"] },
  { to: "/app/reservar", label: "Reservar", icon: CalendarRange, roles: ["aluno"] },
  { to: "/app/minhas-reservas", label: "Minhas reservas", icon: MapPin, roles: ["aluno"] },
  { to: "/app/avisos", label: "Avisos", icon: Megaphone, roles: ["aluno", "professor", "admin"] },
  { to: "/app/buscar", label: "Buscar perfis", icon: Search, roles: ["aluno", "professor", "admin"] },
  { to: "/app/ranking", label: "Ranking", icon: Medal, roles: ["aluno", "professor", "admin"] },
  { to: "/app/torneios", label: "Torneios", icon: Trophy, roles: ["aluno", "professor", "admin"] },
  { to: "/app/brindes", label: "Brindes", icon: Trophy, roles: ["aluno", "professor", "admin"] },
  { to: "/app/pontos", label: "Pontos", icon: Award, roles: ["aluno", "professor", "admin"] },
  { to: "/app/historico", label: "Histórico", icon: History, roles: ["aluno", "professor", "admin"] },
  { to: "/app/loja", label: "Loja", icon: ShoppingBag, roles: ["aluno", "professor", "admin"] },
  { to: "/app/instrutor", label: "Minhas aulas", icon: Dumbbell, roles: ["professor", "admin"] },
  { to: "/app/minha-folha", label: "Minha folha", icon: Wallet, roles: ["professor"] },
  { to: "/app/clientes", label: "Clientes", icon: Users, roles: ["professor", "admin"] },
  { to: "/app/leads", label: "Leads", icon: UserPlus, roles: ["admin"] },
  { to: "/app/planos", label: "Planos", icon: CreditCard, roles: ["admin"] },
  { to: "/app/alugueis", label: "Aluguéis", icon: MapPin, roles: ["admin"] },
  { to: "/app/financeiro", label: "Financeiro", icon: DollarSign, roles: ["admin"] },
  { to: "/app/professores", label: "Professores", icon: GraduationCap, roles: ["admin"] },
  { to: "/app/folha-pagamento", label: "Folha pgto.", icon: Receipt, roles: ["admin"] },
  { to: "/app/importar-alunos", label: "Importar", icon: Upload, roles: ["admin"] },
  { to: "/app/checkins-parceiros", label: "Parceiros", icon: CheckCircle2, roles: ["admin"] },
  { to: "/app/integracoes", label: "Integrações", icon: Plug, roles: ["admin"] },
  { to: "/app/relatorios", label: "Relatórios", icon: ClipboardList, roles: ["admin"] },
  { to: "/app/minha-arena", label: "Minha arena", icon: Building2, roles: ["professor", "admin"] },
  { to: "/app/minhas-arenas", label: "Minhas arenas", icon: Building2, roles: ["aluno", "professor", "admin"] },
  { to: "/app/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] },
  { to: "/app/permissoes", label: "Permissões", icon: Shield, roles: ["admin"] },
  { to: "/app/logs", label: "Logs", icon: ClipboardList, roles: ["admin"] },
  { to: "/app/assinatura", label: "Assinatura", icon: Crown, roles: ["admin"] },
  { to: "/app/perfil", label: "Meu perfil", icon: Settings, roles: ["aluno", "professor", "admin"] },
  { to: "/app/suporte", label: "Suporte", icon: LifeBuoy, roles: ["aluno", "professor", "admin"] },
];

function HomePage() {
  const [arenaNome, setArenaNome] = useState("");
  const [arenaId, setArenaId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [role, setRole] = useState<"aluno" | "professor" | "admin">("aluno");
  const [loading, setLoading] = useState(true);
  const [categoriaAluno, setCategoriaAluno] = useState<string | null>(null);
  const [colegasCategoria, setColegasCategoria] = useState<number>(0);
  const [aulasFeitas, setAulasFeitas] = useState<number>(0);
  const categoriasArena = useArenaCategorias(arenaId);
  const [aulasHoje, setAulasHoje] = useState(0);
  const [checkinsHoje, setCheckinsHoje] = useState(0);
  const [receitaMes, setReceitaMes] = useState(0);
  const [minhasAulasHoje, setMinhasAulasHoje] = useState(0);
  const [minhasAulasSemana, setMinhasAulasSemana] = useState(0);
  const [meusAlunosSemana, setMeusAlunosSemana] = useState(0);
  const [pontos, setPontos] = useState<number | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [planoInfo, setPlanoInfo] = useState<{
    nome: string;
    restantes: number;
    total: number;
    expiraEm: string;
  } | null>(null);
  const [pendentesAvaliacao, setPendentesAvaliacao] = useState<
    Array<{ id: string; arena_id: string; professor_id: string | null; categoria: string | null; data: string }>
  >([]);
  const [avaliando, setAvaliando] = useState<{ id: string; arena_id: string; professor_id: string | null; categoria: string | null } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);
      const { data: p } = await supabase.from("profiles").select("nome, arena_id, categoria_arena").eq("id", u.user.id).maybeSingle();
      setNome(p?.nome ?? "");
      setCategoriaAluno(((p as any)?.categoria_arena as string | null) ?? null);
      if (p?.arena_id) {
        setArenaId(p.arena_id);
        const { data: a } = await supabase.from("arenas").select("nome").eq("id", p.arena_id).maybeSingle();
        setArenaNome(a?.nome ?? "");
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", u.user.id)
          .eq("arena_id", p.arena_id);
        const rs = (roles ?? []).map((r) => r.role);
        if (rs.includes("arena_admin") || rs.includes("super_admin")) setRole("admin");
        else if (rs.includes("professor")) setRole("professor");
        else setRole("aluno");

        const hoje = new Date().toISOString().slice(0, 10);
        const mesIni = hoje.slice(0, 7) + "-01";
        const mesFimD = new Date();
        mesFimD.setMonth(mesFimD.getMonth() + 1);
        mesFimD.setDate(0);
        const mesFim = mesFimD.toISOString().slice(0, 10);
        const seteFrente = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

        const [aulasRes, checkinsRes, cobrancasRes] = await Promise.all([
          supabase.from("aulas").select("id", { count: "exact", head: true }).eq("arena_id", p.arena_id).eq("data", hoje),
          supabase
            .from("agendamentos")
            .select("id, aulas!inner(data)", { count: "exact", head: true })
            .eq("arena_id", p.arena_id)
            .eq("status", "checkin")
            .eq("aulas.data", hoje),
          supabase
            .from("cobrancas")
            .select("valor")
            .eq("arena_id", p.arena_id)
            .eq("status", "paga")
            .gte("vencimento", mesIni)
            .lte("vencimento", mesFim),
        ]);
        setAulasHoje(aulasRes.count ?? 0);
        setCheckinsHoje(checkinsRes.count ?? 0);
        setReceitaMes(((cobrancasRes.data as Array<{ valor: number }> | null) ?? []).reduce((s, r) => s + Number(r.valor), 0));

        // Métricas do professor (aulas que ele dá)
        if (rs.includes("professor") && !rs.includes("arena_admin") && !rs.includes("super_admin")) {
          const [hojeRes, semRes, alunosRes] = await Promise.all([
            supabase.from("aulas").select("id", { count: "exact", head: true })
              .eq("arena_id", p.arena_id).eq("professor_id", u.user.id).eq("data", hoje),
            supabase.from("aulas").select("id", { count: "exact", head: true })
              .eq("arena_id", p.arena_id).eq("professor_id", u.user.id)
              .gte("data", hoje).lte("data", seteFrente),
            supabase.from("agendamentos")
              .select("id, aulas!inner(data, professor_id)", { count: "exact", head: true })
              .eq("arena_id", p.arena_id)
              .eq("aulas.professor_id", u.user.id)
              .gte("aulas.data", hoje).lte("aulas.data", seteFrente),
          ]);
          setMinhasAulasHoje(hojeRes.count ?? 0);
          setMinhasAulasSemana(semRes.count ?? 0);
          setMeusAlunosSemana(alunosRes.count ?? 0);
        }

        // Buscar plano ativo do aluno
        const { data: contratoData } = await supabase
          .from("contratos")
          .select("id, checkins_usados, fim, plano_id, planos(nome, qtd_checkins)")
          .eq("aluno_id", u.user.id)
          .eq("arena_id", p.arena_id)
          .eq("status", "ativo")
          .gte("fim", new Date().toISOString().slice(0, 10))
          .order("fim", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (contratoData) {
          const plano = (contratoData as any).planos;
          const qtd = plano?.qtd_checkins ?? 0;
          const usados = (contratoData as any).checkins_usados ?? 0;
          setPlanoInfo({
            nome: plano?.nome ?? "Plano",
            restantes: Math.max(0, qtd - usados),
            total: qtd,
            expiraEm: (contratoData as any).fim,
          });
        }

        // Pontos + streak (qualquer role)
        const [{ data: pts }, { data: stk }] = await Promise.all([
          supabase.rpc("aluno_pontos_saldo", { _user: u.user.id, _arena: p.arena_id }),
          supabase.rpc("aluno_streak", { _user: u.user.id, _arena: p.arena_id }),
        ]);
        setPontos((pts as number | null) ?? 0);
        setStreak((stk as number | null) ?? 0);

        // Métricas por categoria do aluno
        const minhaCat = ((p as any)?.categoria_arena as string | null) ?? null;
        if (minhaCat) {
          const { count: colegasCount } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("arena_id", p.arena_id)
            .eq("categoria_arena", minhaCat)
            .neq("id", u.user.id);
          setColegasCategoria(colegasCount ?? 0);
        }
        const { count: feitas } = await supabase
          .from("agendamentos")
          .select("id", { count: "exact", head: true })
          .eq("aluno_id", u.user.id)
          .eq("arena_id", p.arena_id)
          .eq("status", "checkin");
        setAulasFeitas(feitas ?? 0);

        // Aulas com check-in pendentes de avaliação (últimos 7 dias, somente da arena atual)
        const seteDiasAtras = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const { data: pendAg } = await supabase
          .from("agendamentos")
          .select("aula_id, aulas!inner(id, arena_id, professor_id, categoria, data)")
          .eq("aluno_id", u.user.id)
          .eq("arena_id", p.arena_id)
          .eq("status", "checkin")
          .gte("aulas.data", seteDiasAtras)
          .lte("aulas.data", hoje);
        const aulaIds = ((pendAg ?? []) as Array<{ aula_id: string }>).map((a) => a.aula_id);
        if (aulaIds.length > 0) {
          const { data: jaAval } = await supabase
            .from("aula_avaliacoes")
            .select("aula_id")
            .eq("aluno_id", u.user.id)
            .in("aula_id", aulaIds);
          const avaliadas = new Set((jaAval ?? []).map((x: { aula_id: string }) => x.aula_id));
          const pendentes = ((pendAg ?? []) as Array<{ aulas: { id: string; arena_id: string; professor_id: string | null; categoria: string | null; data: string } }>)
            .map((r) => r.aulas)
            .filter((a) => !avaliadas.has(a.id))
            .sort((a, b) => b.data.localeCompare(a.data))
            .slice(0, 5);
          setPendentesAvaliacao(pendentes);
        }
      }
      setLoading(false);
    })();
  }, []);

  const visibleModules = modules.filter((m) => m.roles.includes(role));

  const initials = (nome || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="bg-background min-h-screen">
      {/* HERO HUD — gradient + decorative grid */}
      <header className="relative overflow-hidden bg-gradient-hero text-primary-foreground px-5 pt-12 pb-20 rounded-b-[2rem] shadow-elevated">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
        <div aria-hidden className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-primary-foreground/5 blur-3xl" />

        <div className="relative flex justify-between items-start">
          <div className="min-w-0">
            <p className="text-white/70 text-[11px] font-semibold uppercase tracking-[0.18em]">Bem-vindo</p>
            <h1 className="font-display text-white text-[26px] font-bold mt-1 leading-tight truncate">
              {nome || "Aluno"}
            </h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <ArenaSwitcher />
              <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold uppercase tracking-wider">
                {role}
              </span>
            </div>
          </div>
          <div className="relative flex items-center gap-2 shrink-0">
            <NotificationsBell />
            <Link to="/app/perfil" className="w-11 h-11 rounded-full ring-2 ring-white/30 bg-white/10 flex items-center justify-center active:scale-95 transition">
              <div className="w-8 h-8 rounded-full bg-[#0D0D0D] flex items-center justify-center">
                <span className="text-white text-[11px] font-bold">{initials}</span>
              </div>
            </Link>
          </div>
        </div>
      </header>

      {/* BENTO HUD — métricas + atalhos */}
      <div className="px-4 -mt-14 relative z-10 space-y-3">
        {loading ? (
          <div className="grid grid-cols-6 gap-3">
            <Skeleton className="col-span-6 h-28 rounded-3xl" />
            <Skeleton className="col-span-3 h-24 rounded-2xl" />
            <Skeleton className="col-span-3 h-24 rounded-2xl" />
          </div>
        ) : (
          <>
            {/* Card destaque — plano (aluno) ou receita do mês (admin/prof). Aluno NUNCA vê receita. */}
            {role === "aluno" && planoInfo ? (
              <Link to="/app/meu-plano" className="block">
                <div className="relative overflow-hidden bg-card rounded-3xl shadow-card border border-border p-5 active:scale-[0.99] transition">
                  <div aria-hidden className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-gradient-primary opacity-10 blur-2xl" />
                  <div className="relative flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-xl bg-gradient-primary shadow-glow flex items-center justify-center">
                        <Ticket className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Seu plano</p>
                        <span className="text-sm font-bold font-display text-foreground">{planoInfo.nome}</span>
                      </div>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${planoInfo.restantes > 3 ? "bg-emerald-100 text-emerald-700" : planoInfo.restantes > 0 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                      {planoInfo.restantes}/{planoInfo.total}
                    </span>
                  </div>
                  <div className="relative w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${planoInfo.restantes > 3 ? "bg-emerald-500" : planoInfo.restantes > 0 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${planoInfo.total > 0 ? ((planoInfo.total - planoInfo.restantes) / planoInfo.total) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="relative flex items-center gap-2 mt-3 text-muted-foreground">
                    <Timer className="h-3.5 w-3.5" />
                    <span className="text-[11px]">
                      Expira em <span className="font-semibold text-foreground">{new Date(planoInfo.expiraEm + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                    </span>
                  </div>
                </div>
              </Link>
            ) : role === "aluno" ? (
              <Link to="/app/planos" className="block">
                <div className="relative overflow-hidden bg-card rounded-3xl shadow-card border border-border p-5 active:scale-[0.99] transition">
                  <div aria-hidden className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-gradient-primary opacity-10 blur-2xl" />
                  <div className="relative flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Ticket className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Comece agora</p>
                      <p className="text-sm font-semibold">Escolha um plano e reserve sua primeira aula.</p>
                    </div>
                  </div>
                </div>
              </Link>
            ) : role === "professor" ? (
              <Link to="/app/instrutor" className="block">
                <div className="grid grid-cols-6 gap-3">
                  <div className="col-span-6 relative overflow-hidden bg-gradient-primary rounded-3xl shadow-glow p-5 text-primary-foreground active:scale-[0.99] transition">
                    <div aria-hidden className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/70">Aulas pra dar hoje</p>
                    <p className="font-display text-3xl font-extrabold mt-1">
                      {minhasAulasHoje}
                      <span className="text-base font-bold text-white/80 ml-2">aula{minhasAulasHoje === 1 ? "" : "s"}</span>
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-white/85">
                      <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {minhasAulasSemana} nos próximos 7 dias</span>
                      <span className="w-1 h-1 rounded-full bg-white/40" />
                      <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {meusAlunosSemana} alunos agendados</span>
                    </div>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="grid grid-cols-6 gap-3">
                {/* Receita do mês — destaque grande */}
                <div className="col-span-6 relative overflow-hidden bg-gradient-primary rounded-3xl shadow-glow p-5 text-primary-foreground">
                  <div aria-hidden className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/70">Receita do mês</p>
                  <p className="font-display text-3xl font-extrabold mt-1">
                    R$ {receitaMes.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-white/85">
                    <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {aulasHoje} aulas hoje</span>
                    <span className="w-1 h-1 rounded-full bg-white/40" />
                    <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {checkinsHoje} check-ins</span>
                  </div>
                </div>
              </div>
            )}

            {/* Pontos + streak — sempre */}
            {(pontos !== null || streak !== null) && (
              <div className="grid grid-cols-2 gap-3">
                <Link to="/app/pontos" className="group relative overflow-hidden bg-card rounded-2xl shadow-card border border-border p-4 active:scale-[0.98] transition">
                  <div aria-hidden className="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-primary/15 blur-xl" />
                  <div className="relative flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Award className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Pontos</p>
                      <p className="font-display text-xl font-bold leading-tight">{pontos ?? 0}</p>
                    </div>
                  </div>
                </Link>
                <div className="relative overflow-hidden bg-card rounded-2xl shadow-card border border-border p-4">
                  <div aria-hidden className="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-orange-500/15 blur-xl" />
                  <div className="relative flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${(streak ?? 0) > 0 ? "bg-orange-500/15" : "bg-muted"}`}>
                      <Flame className={`h-5 w-5 ${(streak ?? 0) > 0 ? "text-orange-500" : "text-muted-foreground/50"}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Streak</p>
                      <p className="font-display text-xl font-bold leading-tight">
                        {streak ?? 0}<span className="text-xs text-muted-foreground font-normal ml-1">dias</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Categoria do aluno — card destacado */}
      {role === "aluno" && !loading && (
        <section className="px-4 pt-4">
          {categoriaAluno && categoriasArena.includes(categoriaAluno) ? (
            <Link to="/app/ranking" className="block">
              <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-card active:scale-[0.99] transition">
                <div aria-hidden className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-gradient-primary opacity-10 blur-2xl" />
                <div className="relative flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-gradient-primary shadow-glow flex items-center justify-center">
                    <Trophy className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Sua categoria</p>
                    <p className="font-display text-lg font-bold leading-tight truncate">{categoriaAluno}</p>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                    Ver ranking
                  </span>
                </div>
                <div className="relative mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-muted/40 p-3">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Colegas na categoria</p>
                    <p className="font-display text-xl font-bold leading-tight mt-0.5">{colegasCategoria}</p>
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-3">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Aulas feitas</p>
                    <p className="font-display text-xl font-bold leading-tight mt-0.5">{aulasFeitas}</p>
                  </div>
                </div>
                {categoriasArena.length > 1 && (
                  <div className="relative mt-4 flex flex-wrap gap-1.5">
                    {categoriasArena.map((c) => (
                      <span
                        key={c}
                        className={`text-[10px] font-bold px-2 py-1 rounded-full border ${c === categoriaAluno ? "bg-primary text-primary-foreground border-primary shadow-glow" : "bg-card text-muted-foreground border-border"}`}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ) : (
            <Link to="/app/perfil" className="block">
              <div className="relative overflow-hidden rounded-3xl border border-dashed border-border bg-card p-5 active:scale-[0.99] transition">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center">
                    <Trophy className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Defina sua categoria</p>
                    <p className="text-sm font-semibold">Toque aqui para escolher sua categoria na arena.</p>
                  </div>
                </div>
              </div>
            </Link>
          )}
        </section>
      )}



      {/* Avaliações pendentes — aluno */}
      {role === "aluno" && pendentesAvaliacao.length > 0 && (
        <section className="px-4 pt-4 space-y-2">
          <h2 className="font-display text-foreground text-sm font-bold uppercase tracking-[0.18em] flex items-center gap-1.5">
            <Star className="h-4 w-4 text-amber-500" /> Avalie suas aulas
          </h2>
          {pendentesAvaliacao.map((a) => (
            <button
              key={a.id}
              onClick={() => setAvaliando(a)}
              className="w-full text-left rounded-2xl p-4 bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-glow active:scale-[0.99] transition flex items-center gap-3"
            >
              <div className="h-11 w-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Star className="h-5 w-5 fill-white text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base leading-tight">{a.categoria ?? "Aula"}</p>
                <p className="text-[11px] text-white/85">{new Date(a.data + "T00:00").toLocaleDateString("pt-BR")} · Avalie e ganhe +5 pontos</p>
              </div>
              <span className="text-[11px] font-bold bg-white/20 px-2.5 py-1 rounded-full">Avaliar</span>
            </button>
          ))}
        </section>
      )}

      {/* MÓDULOS — bento grid */}
      <section className="px-4 pt-7 pb-32">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-foreground text-sm font-bold uppercase tracking-[0.18em]">Módulos</h2>
          <div className="h-px flex-1 bg-border ml-4" />
          <span className="ml-3 text-[10px] text-muted-foreground font-semibold">{visibleModules.length}</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {visibleModules.map((m, idx) => {
              const Icon = m.icon;
              // Primeiro módulo destacado em fundo gradiente
              const featured = idx === 0;
              const inner = (
                <div
                  className={`relative h-full overflow-hidden rounded-2xl p-3.5 border transition active:scale-[0.97] flex flex-col items-start justify-between min-h-[88px] ${
                    featured
                      ? "bg-gradient-primary border-transparent shadow-glow text-primary-foreground"
                      : "bg-card border-border shadow-card hover:border-primary/40"
                  }`}
                >
                  {featured && (
                    <div aria-hidden className="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-white/15 blur-xl" />
                  )}
                  <div
                    className={`relative h-9 w-9 rounded-xl flex items-center justify-center ${
                      featured ? "bg-white/20" : "bg-primary/10"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${featured ? "text-primary-foreground" : "text-primary"}`}
                      strokeWidth={2.2}
                    />
                  </div>
                  <span
                    className={`relative text-[12px] font-bold font-display leading-tight mt-3 ${
                      featured ? "text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {m.label}
                  </span>
                </div>
              );
              return m.to ? (
                <Link key={m.label} to={m.to} className="group">
                  {inner}
                </Link>
              ) : (
                <button key={m.label} type="button" onClick={() => toast("Em breve")} className="text-left group">
                  {inner}
                </button>
              );
            })}
          </div>
        )}
      </section>
      {avaliando && userId && (
        <AulaRatingDialog
          open={!!avaliando}
          onOpenChange={(o) => !o && setAvaliando(null)}
          aula={{ id: avaliando.id, arena_id: avaliando.arena_id, professor_id: avaliando.professor_id, categoria: avaliando.categoria }}
          alunoId={userId}
          onDone={() => {
            setPendentesAvaliacao((cur) => cur.filter((x) => x.id !== avaliando.id));
            setAvaliando(null);
          }}
        />
      )}
    </div>
  );
}
