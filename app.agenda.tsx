import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { comprarCheckinAvulsoMP } from "@/lib/mercadopago.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useArenaCategorias } from "@/lib/use-arena-categorias";
import { Calendar, Clock, MapPin, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Copy, ChevronRight as ChevRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ProfessorMiniCard } from "@/components/professor-mini-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/app/agenda")({
  head: () => ({ meta: [{ title: "Agenda · ArenaPro" }] }),
  component: AgendaPage,
});

type Aula = {
  id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  categoria: string;
  categorias_extras: string[] | null;
  nivel: string | null;
  vagas: number;
  quadra: string | null;
  serie_id: string | null;
  concluida_em?: string | null;
  professor_id?: string | null;
};

type AulaForm = {
  id?: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  categoria: string;
  categorias_extras: string[];
  nivel: string;
  vagas: number;
  vagas_mensalistas: number | null;
  quadra: string;
  professor_id: string;
  wellhub_id: string;
  totalpass_id: string;
};

const EMPTY_AULA: AulaForm = {
  data: "", hora_inicio: "", hora_fim: "", categoria: "", categorias_extras: [],
  nivel: "iniciante", vagas: 12, vagas_mensalistas: null, quadra: "", professor_id: "",
  wellhub_id: "", totalpass_id: "",
};

type AulaFormExt = AulaForm & { repetir_semanas: number; dias_semana: number[] };

type EditScope = "uma" | "serie";
type DeleteTarget = { id: string; serie_id: string | null } | null;

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TOLERANCIA_AGENDAMENTO_MIN = 10;
const ANTECEDENCIA_CHECKIN_MIN = 30;
const CANCEL_LIMITE_MIN = 30; // cancelamento permitido até 30 min antes
const JANELA_AGENDA_DIAS = 7; // mostra a semana inteira na tira de dias
const JANELA_RESERVA_DIAS = 4; // alunos só podem reservar dentro dos próximos 4 dias (a partir de hoje)

function diasAteAula(dataAula: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataAula + "T00:00");
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function aulaDateTime(data: string, hora: string) {
  return new Date(`${data}T${hora.slice(0, 5)}`);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function buildDays(offsetSemanas = 0, n = JANELA_AGENDA_DIAS): string[] {
  const out: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + offsetSemanas * n);
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function AgendaPage() {
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [meus, setMeus] = useState<Set<string>>(new Set());
  const [meusCheckins, setMeusCheckins] = useState<Set<string>>(new Set());
  const [minhaFila, setMinhaFila] = useState<Set<string>>(new Set());
  const [filaCount, setFilaCount] = useState<Record<string, number>>({});
  const [participantes, setParticipantes] = useState<Record<string, { id: string; agendamentoId: string; nome: string; origem: string; checkinEm: string | null }[]>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [arenaId, setArenaId] = useState<string | null>(null);
  const categoriasArena = useArenaCategorias(arenaId);
  const [meuProfessorId, setMeuProfessorId] = useState<string | null>(null);
  const [professores, setProfessores] = useState<{ id: string; nome: string }[]>([]);
  const [editing, setEditing] = useState<AulaFormExt | null>(null);
  const [editScope, setEditScope] = useState<EditScope>("uma");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleteScope, setDeleteScope] = useState<EditScope>("uma");
  const [saving, setSaving] = useState(false);
  const [offsetSemanas, setOffsetSemanas] = useState(0);
  const [diaSel, setDiaSel] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const dias = buildDays(offsetSemanas, JANELA_AGENDA_DIAS);
  const [finalizando, setFinalizando] = useState<Aula | null>(null);
  const [finalAba, setFinalAba] = useState("presenca");
  const [presentes, setPresentes] = useState<Set<string>>(new Set());
  const [statusAg, setStatusAg] = useState<Record<string, string>>({});
  const [fotoQuadra, setFotoQuadra] = useState<File | null>(null);
  const [fotoBolas, setFotoBolas] = useState<File | null>(null);
  const [qtdBolas, setQtdBolas] = useState<string>("");
  const [obsFinal, setObsFinal] = useState("");
  const [salvandoFinal, setSalvandoFinal] = useState(false);
  const [checkinsInfo, setCheckinsInfo] = useState<{
    restantes: number;
    total: number;
    temPlano: boolean;
    ilimitado?: boolean;
    expiraEm: string;
  } | null>(null);
  const [experimentalDisponivel, setExperimentalDisponivel] = useState(false);
  const [parceirosArena, setParceirosArena] = useState<{ wellhub: boolean; totalpass: boolean }>({ wellhub: false, totalpass: false });
  const [reservaParceiro, setReservaParceiro] = useState<{ aulaId: string; arenaId: string } | null>(null);
  const [meuParceiro, setMeuParceiro] = useState<"wellhub" | "totalpass" | null>(null);
  const [horaAbertura, setHoraAbertura] = useState("06:00");
  const [horaFechamento, setHoraFechamento] = useState("23:00");
  const [featMensalistas, setFeatMensalistas] = useState(false);
  const [avulsoTarget, setAvulsoTarget] = useState<Aula | null>(null);
  const [avulsoForm, setAvulsoForm] = useState<{ preco: string; desconto: string; gerarCobranca: boolean; buscaAluno: string; alunoId: string | null; alunoNome: string }>({ preco: "", desconto: "0", gerarCobranca: true, buscaAluno: "", alunoId: null, alunoNome: "" });
  const [avulsoAlunos, setAvulsoAlunos] = useState<{ id: string; nome: string; email: string | null }[]>([]);
  const [salvandoAvulso, setSalvandoAvulso] = useState(false);
  const [planoAvulsaInfo, setPlanoAvulsaInfo] = useState<{ id: string; nome: string; preco: number } | null>(null);
  const [avulsoSelf, setAvulsoSelf] = useState<{ preco: number; mpAtivo: boolean } | null>(null);
  const [comprandoAvulso, setComprandoAvulso] = useState<string | null>(null);
  const comprarAvulsoFn = useServerFn(comprarCheckinAvulsoMP);

  async function comprarAvulsoSelf(aulaId: string) {
    if (comprandoAvulso) return;
    setComprandoAvulso(aulaId);
    try {
      const r = await comprarAvulsoFn({ data: { aulaId } });
      if (r?.initPoint) {
        window.open(r.initPoint, "_blank", "noopener");
        toast.success("Abrindo Mercado Pago — sua vaga será confirmada após o pagamento.");
      } else {
        toast.error("Não foi possível gerar o link de pagamento");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setComprandoAvulso(null);
    }
  }

  async function abrirAvulso(a: Aula) {
    if (!arenaId) return;
    setAvulsoTarget(a);
    const { data: pl } = await (supabase.from("planos") as any)
      .select("id, nome, preco")
      .eq("arena_id", arenaId).eq("ativo", true).eq("tipo", "avulsa").maybeSingle();
    setPlanoAvulsaInfo(pl ?? null);
    setAvulsoForm({
      preco: pl ? String(Number(pl.preco)) : "",
      desconto: "0",
      gerarCobranca: true,
      buscaAluno: "",
      alunoId: null,
      alunoNome: "",
    });
    setAvulsoAlunos([]);
  }

  async function buscarAlunoAvulso(q: string) {
    setAvulsoForm((f) => ({ ...f, buscaAluno: q, alunoId: null, alunoNome: "" }));
    if (!arenaId || q.trim().length < 2) { setAvulsoAlunos([]); return; }
    const { data } = await supabase
      .from("profiles").select("id, nome, email")
      .eq("arena_id", arenaId)
      .ilike("nome", `%${q.trim()}%`)
      .limit(8);
    setAvulsoAlunos((data as { id: string; nome: string; email: string | null }[]) ?? []);
  }

  async function salvarAvulso() {
    if (!avulsoTarget) return;
    if (!avulsoForm.alunoId) return toast.error("Escolha um aluno");
    const preco = Number(avulsoForm.preco) || 0;
    const desc = Math.max(0, Number(avulsoForm.desconto) || 0);
    setSalvandoAvulso(true);
    const { error } = await (supabase.rpc as any)("criar_agendamento_avulso", {
      _aula_id: avulsoTarget.id, _aluno_id: avulsoForm.alunoId,
      _preco: preco, _desconto: desc, _gerar_cobranca: avulsoForm.gerarCobranca,
    });
    setSalvandoAvulso(false);
    if (error) return toast.error(error.message);
    toast.success("Aluno avulso adicionado");
    setAvulsoTarget(null);
    load();
  }

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    setUserId(u.user?.id ?? null);
    let arenaFiltro: string | null = null;
    if (u.user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("arena_id, aula_experimental_usada, parceiro")
        .eq("id", u.user.id)
        .maybeSingle();
      setArenaId(prof?.arena_id ?? null);
      arenaFiltro = prof?.arena_id ?? null;
      if (prof?.arena_id) {
        const { data: ar } = await supabase
          .from("arenas").select("hora_abertura, hora_fechamento, feature_mensalistas, mp_ativo").eq("id", prof.arena_id).maybeSingle();
        if (ar) {
          setHoraAbertura((ar.hora_abertura ?? "06:00:00").slice(0, 5));
          setHoraFechamento((ar.hora_fechamento ?? "23:00:00").slice(0, 5));
          setFeatMensalistas(!!(ar as { feature_mensalistas?: boolean }).feature_mensalistas);
          // Verifica se a arena tem plano avulso + MP ativo (pra exibir "Comprar avulso" pro aluno)
          const mpAtivo = !!(ar as { mp_ativo?: boolean }).mp_ativo;
          const { data: plAvulso } = await supabase
            .from("planos")
            .select("preco")
            .eq("arena_id", prof.arena_id)
            .eq("ativo", true)
            .eq("tipo", "avulsa")
            .maybeSingle();
          if (mpAtivo && plAvulso) {
            setAvulsoSelf({ preco: Number(plAvulso.preco) || 0, mpAtivo: true });
          } else {
            setAvulsoSelf(null);
          }
        }
      }
      setExperimentalDisponivel(!(prof as { aula_experimental_usada?: boolean } | null)?.aula_experimental_usada);
      const pParc = (prof as { parceiro?: string | null } | null)?.parceiro ?? null;
      setMeuParceiro(pParc === "wellhub" || pParc === "totalpass" ? pParc : null);
      // Quais parceiros (Gympass/TotalPass) a arena tem ativos
      if (prof?.arena_id) {
        const { data: ints } = await supabase
          .from("integracoes_parceiros")
          .select("parceiro, ativo")
          .eq("arena_id", prof.arena_id)
          .eq("ativo", true);
        const map = { wellhub: false, totalpass: false };
        (ints ?? []).forEach((i: { parceiro: string }) => {
          if (i.parceiro === "wellhub") map.wellhub = true;
          if (i.parceiro === "totalpass") map.totalpass = true;
        });
        setParceirosArena(map);
      }
      // Importante: filtrar por arena_id para não vazar papel de admin de outra arena
      const { data: roles } = arenaFiltro
        ? await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("arena_id", arenaFiltro)
        : { data: [] as { role: string }[] };
      setIsAdmin((roles ?? []).some((r) => r.role === "arena_admin"));
      // Identifica se este usuário é professor (registro em `professores`)
      // Pode haver múltiplos registros (várias arenas) — filtra pela arena atual quando disponível.
      let qMeuProf = supabase
        .from("professores")
        .select("id")
        .eq("profile_id", u.user.id)
        .eq("ativo", true);
      if (prof?.arena_id) qMeuProf = qMeuProf.eq("arena_id", prof.arena_id);
      const { data: meuProfList } = await qMeuProf.limit(1);
      setMeuProfessorId(meuProfList?.[0]?.id ?? null);
      // Lista de professores da arena para o select
      if (prof?.arena_id) {
        const { data: profs } = await supabase
          .from("professores")
          .select("id, profiles:profile_id(nome)")
          .eq("arena_id", prof.arena_id)
          .eq("ativo", true);
        setProfessores(
          (profs ?? []).map((p: any) => ({ id: p.id, nome: p.profiles?.nome ?? "Sem nome" }))
        );
      }
      // Busca plano ativo do aluno
      const hoje = new Date().toISOString().slice(0, 10);
      const { data: contrato } = arenaFiltro ? await supabase
        .from("contratos")
        .select("id, checkins_usados, fim, planos(qtd_checkins)")
        .eq("aluno_id", u.user.id)
        .eq("arena_id", arenaFiltro)
        .eq("status", "ativo")
        .lte("inicio", hoje)
        .gte("fim", hoje)
        .order("fim", { ascending: false })
        .limit(1)
        .maybeSingle() : { data: null };
      if (contrato && contrato.planos) {
        const plano = contrato.planos as { qtd_checkins: number | null };
        const ilimitado = plano.qtd_checkins === null;
        const total = plano.qtd_checkins ?? 0;
        const usados = contrato.checkins_usados ?? 0;
        setCheckinsInfo({
          restantes: ilimitado ? 9999 : Math.max(0, total - usados),
          total,
          temPlano: true,
          ilimitado,
          expiraEm: contrato.fim,
        });
      } else {
        setCheckinsInfo({ restantes: 0, total: 0, temPlano: false, expiraEm: "" });
      }
    } else {
      setCheckinsInfo(null);
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const fimJanela = dias[dias.length - 1] ?? hoje;
    const inicioJanela = dias[0] ?? hoje;
    if (!arenaFiltro) {
      setAulas([]); setParticipantes({}); setLoading(false); return;
    }
    const { data: a } = await supabase
      .from("aulas")
      .select("id, data, hora_inicio, hora_fim, categoria, categorias_extras, nivel, vagas, quadra, serie_id, concluida_em, professor_id")
      .eq("arena_id", arenaFiltro)
      .gte("data", inicioJanela)
      .lte("data", fimJanela)
      .order("data")
      .order("hora_inicio");
    const aulasArr = (a as Aula[]) ?? [];
    setAulas(aulasArr);
    // Carrega participantes das aulas visíveis
    const aulaIds = aulasArr.map((x) => x.id);
    if (aulaIds.length > 0) {
      const { data: ags } = await supabase
        .from("agendamentos")
        .select("id, aula_id, aluno_id, aluno_nome_externo, origem, checkin_em, profiles:aluno_id(id, nome)")
        .eq("arena_id", arenaFiltro)
        .in("aula_id", aulaIds);
      const map: Record<string, { id: string; agendamentoId: string; nome: string; origem: string; checkinEm: string | null }[]> = {};
      (ags ?? []).forEach((row: any) => {
        const nome = row.profiles?.nome ?? row.aluno_nome_externo ?? "Convidado";
        const id = row.aluno_id ?? `ext-${row.id}`;
        (map[row.aula_id] ||= []).push({ id, agendamentoId: row.id, nome, origem: row.origem ?? "app", checkinEm: row.checkin_em ?? null });
      });
      setParticipantes(map);
    } else {
      setParticipantes({});
    }
    if (u.user) {
      const { data: ags } = await supabase
        .from("agendamentos")
        .select("aula_id, checkin_em")
        .eq("aluno_id", u.user.id);
      setMeus(new Set((ags ?? []).map((x: { aula_id: string }) => x.aula_id)));
      setMeusCheckins(new Set(
        (ags ?? [])
          .filter((x: { checkin_em: string | null }) => !!x.checkin_em)
          .map((x: { aula_id: string }) => x.aula_id)
      ));
      const { data: filas } = await supabase
        .from("lista_espera")
        .select("aula_id")
        .eq("aluno_id", u.user.id);
      setMinhaFila(new Set((filas ?? []).map((x: { aula_id: string }) => x.aula_id)));
    }
    if (aulaIds.length > 0) {
      const { data: todasFilas } = await supabase
        .from("lista_espera")
        .select("aula_id")
        .in("aula_id", aulaIds);
      const counts: Record<string, number> = {};
      (todasFilas ?? []).forEach((f: { aula_id: string }) => {
        counts[f.aula_id] = (counts[f.aula_id] ?? 0) + 1;
      });
      setFilaCount(counts);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [offsetSemanas]);

  const agendar = async (aulaId: string, origemEscolhida: "app" | "wellhub" | "totalpass" = "app") => {
    if (!userId) return;
    const viaParceiro = origemEscolhida !== "app";
    const aulaLocalCheck = aulas.find((x) => x.id === aulaId);
    if (aulaLocalCheck) {
      const agoraD = new Date();
      const inicioD = aulaDateTime(aulaLocalCheck.data, aulaLocalCheck.hora_inicio);
      const fimD = aulaDateTime(aulaLocalCheck.data, aulaLocalCheck.hora_fim);
      const limiteAgendamentoD = addMinutes(inicioD, TOLERANCIA_AGENDAMENTO_MIN);
      if (aulaLocalCheck.concluida_em) {
        return toast.error("Esta aula já foi finalizada pelo professor.");
      }
      if (agoraD >= fimD) {
        return toast.error("Esta aula já encerrou.");
      }
      if (agoraD > limiteAgendamentoD) {
        return toast.error("Reservas encerradas — tolerância de 10 min após o início da aula.");
      }
    }
    // Verifica check-ins disponíveis (plano OU aula experimental gratuita)
    const usarExperimental = checkinsInfo
      ? !viaParceiro && !checkinsInfo.temPlano && experimentalDisponivel
      : false;
    if (!viaParceiro && checkinsInfo && !checkinsInfo.temPlano && !experimentalDisponivel) {
      return toast.error("Você não tem um plano ativo. Escolha um plano para começar.", {
        action: { label: "Ver planos", onClick: () => window.location.href = "/app/planos" },
      });
    }
    if (!viaParceiro && checkinsInfo && checkinsInfo.temPlano && !checkinsInfo.ilimitado && checkinsInfo.restantes <= 0) {
      return toast.error("Seus check-ins acabaram! Renove seu plano para continuar agendando.", {
        action: { label: "Renovar plano", onClick: () => window.location.href = "/app/planos" },
      });
    }
    const { data: aulaFull } = await supabase.from("aulas").select("arena_id").eq("id", aulaId).single();
    if (!aulaFull) return toast.error("Aula não encontrada");
    const aulaLocal = aulas.find((x) => x.id === aulaId);
    const ocup = (participantes[aulaId] ?? []).length;
    if (aulaLocal && ocup >= aulaLocal.vagas) {
      return entrarFila(aulaId, aulaFull.arena_id);
    }
    const { error } = await supabase.from("agendamentos").insert({
      aula_id: aulaId,
      aluno_id: userId,
      arena_id: aulaFull.arena_id,
      experimental: usarExperimental,
      origem: origemEscolhida,
    });
    if (error) {
      const msg = error.message.includes("iniciante") || error.message.includes("intermediário") || error.message.includes("avançado")
        ? error.message
        : error.message;
      return toast.error(msg);
    }
    if (viaParceiro) {
      toast.success(`Vaga reservada via ${origemEscolhida === "wellhub" ? "Gympass" : "TotalPass"}! 🎉 Faça check-in na hora da aula.`);
    } else if (usarExperimental) {
      await supabase.from("profiles").update({ aula_experimental_usada: true }).eq("id", userId);
      setExperimentalDisponivel(false);
      toast.success("Vaga reservada com sua aula experimental gratuita! 🎉");
    } else {
      toast.success("Vaga reservada!");
    }
    setReservaParceiro(null);
    load();
  };

  const entrarFila = async (aulaId: string, arenaId: string) => {
    if (!userId) return;
    const { error } = await supabase.from("lista_espera").insert({
      aula_id: aulaId, aluno_id: userId, arena_id: arenaId,
    });
    if (error) return toast.error(error.message);
    toast.success("Você entrou na lista de espera. Avisaremos se vagar.");
    load();
  };

  const sairFila = async (aulaId: string) => {
    if (!userId) return;
    const { error } = await supabase.from("lista_espera").delete()
      .eq("aula_id", aulaId).eq("aluno_id", userId);
    if (error) return toast.error(error.message);
    toast.success("Você saiu da lista de espera");
    load();
  };

  const fazerCheckin = async (aulaId: string) => {
    if (!userId) return;
    const aula = aulas.find((x) => x.id === aulaId);
    if (!aula) return toast.error("Aula não encontrada");
    const agora = new Date();
    const inicio = aulaDateTime(aula.data, aula.hora_inicio);
    const fim = aulaDateTime(aula.data, aula.hora_fim);
    const abreEm = addMinutes(inicio, -ANTECEDENCIA_CHECKIN_MIN);
    if (agora < abreEm) {
      return toast.error("Check-in libera 30 min antes da aula começar.");
    }
    if (agora > fim) {
      return toast.error("Check-in encerrado — a aula já terminou.");
    }
    // Descobre origem do agendamento (plano interno vs parceiro)
    const { data: ag } = await supabase
      .from("agendamentos")
      .select("id, arena_id, origem")
      .eq("aula_id", aulaId)
      .eq("aluno_id", userId)
      .maybeSingle();
    const origem = (ag as { origem?: string } | null)?.origem ?? "app";
    const { error } = await supabase
      .from("agendamentos")
      .update({ status: "checkin", checkin_em: agora.toISOString() })
      .eq("aula_id", aulaId)
      .eq("aluno_id", userId);
    if (error) return toast.error(error.message);
    // Se é parceiro, registra check-in em checkins_parceiros
    if (ag && (origem === "wellhub" || origem === "totalpass")) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("nome, email")
        .eq("id", userId)
        .maybeSingle();
      await supabase.from("checkins_parceiros").insert({
        arena_id: ag.arena_id,
        parceiro: origem,
        agendamento_id: ag.id,
        user_nome: prof?.nome ?? null,
        user_email: prof?.email ?? null,
        external_class_id: aulaId,
        status: "confirmado",
        payload: { source: "app", aula_id: aulaId, checkin_em: agora.toISOString() },
      });
      const nomeParc = origem === "wellhub" ? "Gympass" : "TotalPass";
      toast.success(`Check-in confirmado via ${nomeParc}! Bom treino 🎾`);
      load();
      return;
    }
    // Mostra saldo de check-ins restante no plano ativo
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: contrato } = await supabase
      .from("contratos")
      .select("checkins_usados, planos(qtd_checkins)")
      .eq("aluno_id", userId)
      .eq("status", "ativo")
      .lte("inicio", hoje)
      .gte("fim", hoje)
      .order("fim", { ascending: false })
      .limit(1)
      .maybeSingle();
    const qtd = (contrato?.planos as { qtd_checkins: number | null } | null)?.qtd_checkins ?? null;
    const usados = contrato?.checkins_usados ?? 0;
    if (qtd != null) {
      const restantes = Math.max(qtd - usados, 0);
      toast.success(`Check-in confirmado! Bom treino 🎾 — restam ${restantes} de ${qtd} check-ins.`);
    } else {
      toast.success("Check-in confirmado! Bom treino 🎾");
    }
    load();
  };

  const cancelar = async (aulaId: string) => {
    if (!userId) return;
    // Descobre se essa reserva consumiu a aula experimental
    const { data: agExistente } = await supabase
      .from("agendamentos")
      .select("experimental")
      .eq("aula_id", aulaId)
      .eq("aluno_id", userId)
      .maybeSingle();
    const eraExperimental = (agExistente as { experimental?: boolean } | null)?.experimental === true;
    const { error } = await supabase.from("agendamentos").delete()
      .eq("aula_id", aulaId).eq("aluno_id", userId);
    if (error) return toast.error(error.message);
    if (eraExperimental) {
      await supabase.from("profiles").update({ aula_experimental_usada: false }).eq("id", userId);
      setExperimentalDisponivel(true);
      toast.success("Agendamento cancelado. Sua aula experimental foi devolvida.");
      load();
      return;
    }
    // Consulta saldo de check-ins restante no plano ativo do aluno
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: contrato } = await supabase
      .from("contratos")
      .select("checkins_usados, planos(qtd_checkins)")
      .eq("aluno_id", userId)
      .eq("status", "ativo")
      .lte("inicio", hoje)
      .gte("fim", hoje)
      .order("fim", { ascending: false })
      .limit(1)
      .maybeSingle();
    const qtd = (contrato?.planos as { qtd_checkins: number | null } | null)?.qtd_checkins ?? null;
    const usados = contrato?.checkins_usados ?? 0;
    if (qtd != null) {
      const restantes = Math.max(qtd - usados, 0);
      toast.success(`Agendamento cancelado. Você tem ${restantes} check-in${restantes === 1 ? "" : "s"} disponível${restantes === 1 ? "" : "is"}.`);
    } else {
      toast.success("Agendamento cancelado");
    }
    load();
  };

  const abrirNova = () => setEditing({ ...EMPTY_AULA, data: diaSel, repetir_semanas: 1, dias_semana: [] });
  const abrirEditar = async (a: Aula) => {
    setEditScope("uma");
    const { data: maps } = await supabase
      .from("aulas_parceiros")
      .select("parceiro, external_id")
      .eq("aula_id", a.id);
    const wh = (maps ?? []).find((m) => m.parceiro === "wellhub")?.external_id ?? "";
    const tp = (maps ?? []).find((m) => m.parceiro === "totalpass")?.external_id ?? "";
    setEditing({
      id: a.id, data: a.data, hora_inicio: a.hora_inicio.slice(0, 5), hora_fim: a.hora_fim.slice(0, 5),
      categoria: a.categoria, categorias_extras: a.categorias_extras ?? [],
      nivel: a.nivel ?? "iniciante", vagas: a.vagas,
      vagas_mensalistas: (a as Aula & { vagas_mensalistas?: number | null }).vagas_mensalistas ?? null,
      quadra: a.quadra ?? "",
      professor_id: a.professor_id ?? "",
      repetir_semanas: 1, dias_semana: [], wellhub_id: wh, totalpass_id: tp,
    });
  };
  const duplicarAula = (a: Aula) => {
    setEditScope("uma");
    setEditing({
      data: diaSel,
      hora_inicio: a.hora_inicio.slice(0, 5),
      hora_fim: a.hora_fim.slice(0, 5),
      categoria: a.categoria,
      categorias_extras: a.categorias_extras ?? [],
      nivel: a.nivel ?? "iniciante",
      vagas: a.vagas,
      vagas_mensalistas: (a as Aula & { vagas_mensalistas?: number | null }).vagas_mensalistas ?? null,
      quadra: a.quadra ?? "",
      professor_id: a.professor_id ?? "",
      repetir_semanas: 1, dias_semana: [], wellhub_id: "", totalpass_id: "",
    });
  };
  const editingSerieId = aulas.find((x) => x.id === editing?.id)?.serie_id ?? null;

  const salvarAula = async () => {
    if (!editing || !arenaId) return;
    if (!editing.categoria.trim() || !editing.data || !editing.hora_inicio || !editing.hora_fim) {
      return toast.error("Preencha categoria, data e horários");
    }
    setSaving(true);
    if (editing.hora_fim <= editing.hora_inicio) {
      setSaving(false);
      return toast.error("Horário final deve ser maior que o inicial");
    }
    if (editing.hora_inicio < horaAbertura || editing.hora_fim > horaFechamento) {
      setSaving(false);
      return toast.error(`Horário fora do funcionamento da arena (${horaAbertura} às ${horaFechamento}). Ajuste em Minha arena.`);
    }
    // Checa conflitos: mesma arena + mesma quadra + sobreposição de horário
    const quadraNorm = editing.quadra.trim() || null;
    const datasParaChecar: string[] = [];
    if (editing.id) {
      datasParaChecar.push(editing.data);
    } else {
      const semanas = Math.max(1, Math.min(52, Number(editing.repetir_semanas) || 1));
      const baseDate = new Date(editing.data + "T00:00");
      const diasSel = (editing.dias_semana && editing.dias_semana.length > 0)
        ? Array.from(new Set(editing.dias_semana)).sort()
        : [baseDate.getDay()];
      const set = new Set<string>();
      // início da semana (domingo) da data base
      const inicioSemana = new Date(baseDate);
      inicioSemana.setDate(baseDate.getDate() - baseDate.getDay());
      for (let w = 0; w < semanas; w++) {
        for (const dia of diasSel) {
          const d = new Date(inicioSemana);
          d.setDate(inicioSemana.getDate() + w * 7 + dia);
          if (d < baseDate) continue; // não cria antes da data base
          set.add(d.toISOString().slice(0, 10));
        }
      }
      datasParaChecar.push(...set);
    }
    let conflitoQuery = supabase
      .from("aulas")
      .select("id, data, hora_inicio, hora_fim, quadra")
      .eq("arena_id", arenaId)
      .in("data", datasParaChecar)
      .lt("hora_inicio", editing.hora_fim)
      .gt("hora_fim", editing.hora_inicio);
    if (quadraNorm === null) {
      conflitoQuery = conflitoQuery.is("quadra", null);
    } else {
      conflitoQuery = conflitoQuery.eq("quadra", quadraNorm);
    }
    if (editing.id) conflitoQuery = conflitoQuery.neq("id", editing.id);
    const { data: conflitos, error: errConf } = await conflitoQuery;
    if (errConf) {
      setSaving(false);
      return toast.error(errConf.message);
    }
    if (conflitos && conflitos.length > 0) {
      setSaving(false);
      const c = conflitos[0];
      const dataFmt = new Date(c.data + "T00:00").toLocaleDateString("pt-BR");
      const local = c.quadra ?? "sem quadra definida";
      const extra = conflitos.length > 1 ? ` (e mais ${conflitos.length - 1})` : "";
      return toast.error(
        `Conflito de horário em ${dataFmt} ${c.hora_inicio.slice(0,5)}–${c.hora_fim.slice(0,5)} · ${local}${extra}`
      );
    }
    const base = {
      arena_id: arenaId,
      categoria: editing.categoria.trim(),
      categorias_extras: editing.categorias_extras
        .map((s) => s.trim()).filter((s) => s.length > 0),
      hora_inicio: editing.hora_inicio,
      hora_fim: editing.hora_fim,
      nivel: (() => {
        const c = editing.categoria.trim().toLowerCase();
        if (c === "intermediário" || c === "intermediario") return "intermediario" as const;
        if (c === "avançado" || c === "avancado") return "avancado" as const;
        return "iniciante" as const;
      })(),
      vagas: Number(editing.vagas) || 12,
      vagas_mensalistas: editing.vagas_mensalistas == null || Number.isNaN(Number(editing.vagas_mensalistas))
        ? null
        : Math.max(0, Math.floor(Number(editing.vagas_mensalistas))),
      quadra: editing.quadra.trim() || null,
      professor_id: editing.professor_id || null,
    };
    let error: { message: string } | null = null;
    let aulaIdsAfetadas: string[] = [];
    if (editing.id) {
      if (editScope === "serie" && editingSerieId) {
        // Atualiza atributos da série inteira (mantém data individual de cada aula)
        const { data: _data, ...semData } = { ...base, data: editing.data };
        void _data;
        const r = await supabase.from("aulas").update(semData).eq("serie_id", editingSerieId);
        error = r.error;
        if (!error) {
          const { data: serieAulas } = await supabase.from("aulas").select("id").eq("serie_id", editingSerieId);
          aulaIdsAfetadas = (serieAulas ?? []).map((x) => x.id);
        }
      } else {
        const r = await supabase.from("aulas").update({ ...base, data: editing.data }).eq("id", editing.id);
        error = r.error;
        if (!error) aulaIdsAfetadas = [editing.id];
      }
    } else {
      const datasOrdenadas = [...datasParaChecar].sort();
      const serieId = datasOrdenadas.length > 1 ? (crypto.randomUUID?.() ?? null) : null;
      const rows = datasOrdenadas.map((d) => ({ ...base, data: d, serie_id: serieId }));
      const r = await supabase.from("aulas").insert(rows).select("id");
      error = r.error;
      if (!error) aulaIdsAfetadas = (r.data ?? []).map((x: { id: string }) => x.id);
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    // Persiste IDs externos parceiros (somente quando 1 aula afetada — evitar duplicar IDs em série)
    if (aulaIdsAfetadas.length === 1) {
      const aid = aulaIdsAfetadas[0];
      for (const [parc, val] of [["wellhub", editing.wellhub_id.trim()], ["totalpass", editing.totalpass_id.trim()]] as const) {
        if (val) {
          await supabase.from("aulas_parceiros").upsert(
            { aula_id: aid, arena_id: arenaId, parceiro: parc, external_id: val },
            { onConflict: "aula_id,parceiro" }
          );
        } else {
          await supabase.from("aulas_parceiros").delete().eq("aula_id", aid).eq("parceiro", parc);
        }
      }
    }
    toast.success(editing.id ? "Aula atualizada" : "Aula criada");
    setEditing(null);
    load();
  };

  const excluirAula = async () => {
    if (!deleteTarget) return;
    const q = supabase.from("aulas").delete();
    const { error } = deleteScope === "serie" && deleteTarget.serie_id
      ? await q.eq("serie_id", deleteTarget.serie_id)
      : await q.eq("id", deleteTarget.id);
    if (error) return toast.error(error.message);
    toast.success(deleteScope === "serie" ? "Série excluída" : "Aula excluída");
    setDeleteTarget(null);
    setDeleteScope("uma");
    load();
  };

  const abrirFinalizar = async (a: Aula) => {
    setFinalizando(a);
    setFinalAba("presenca");
    setFotoQuadra(null);
    setFotoBolas(null);
    // Recarrega status atualizado direto do banco (presença/falta marcadas na tela da aula)
    const parts = participantes[a.id] ?? [];
    const { data: statusRows } = await supabase
      .from("agendamentos")
      .select("id, status, checkin_em")
      .eq("aula_id", a.id);
    const rows = (statusRows ?? []) as { id: string; status: string; checkin_em: string | null }[];
    const byAg = new Map<string, string>(rows.map((r) => [r.id, r.status]));
    const checkinByAg = new Map<string, string | null>(rows.map((r) => [r.id, r.checkin_em]));
    setStatusAg(Object.fromEntries(byAg));
    setPresentes(new Set(
      parts
        .filter((p) => checkinByAg.get(p.agendamentoId) || byAg.get(p.agendamentoId) === "checkin")
        .map((p) => p.id),
    ));
    // Carrega finalização existente, se houver
    const { data: fin } = await supabase
      .from("aula_finalizacoes")
      .select("qtd_bolas, observacoes")
      .eq("aula_id", a.id)
      .maybeSingle();
    setQtdBolas(fin?.qtd_bolas != null ? String(fin.qtd_bolas) : "");
    setObsFinal(fin?.observacoes ?? "");
  };

  const uploadFoto = async (file: File, aulaId: string, tipo: string): Promise<string | null> => {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${arenaId}/${aulaId}/${tipo}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("aula-finalizacoes").upload(path, file, { upsert: true });
    if (error) {
      toast.error(`Erro no upload (${tipo}): ${error.message}`);
      return null;
    }
    return supabase.storage.from("aula-finalizacoes").getPublicUrl(path).data.publicUrl;
  };

  const salvarFinalizacao = async () => {
    if (!finalizando || !arenaId || !userId) return;
    setSalvandoFinal(true);
    try {
      // Carrega status atual para preservar "falta" e "cancelado"
      const parts = participantes[finalizando.id] ?? [];
      const { data: statusRows } = await supabase
        .from("agendamentos")
        .select("id, status")
        .eq("aula_id", finalizando.id);
      const byAg = new Map<string, string>(
        ((statusRows ?? []) as { id: string; status: string }[]).map((r) => [r.id, r.status]),
      );
      const agora = new Date().toISOString();
      for (const p of parts) {
        const presente = presentes.has(p.id);
        const statusAtual = byAg.get(p.agendamentoId);
        // Preserva quem já está como falta ou cancelado e não foi marcado presente agora
        if (!presente && (statusAtual === "falta" || statusAtual === "cancelado")) continue;
        await supabase
          .from("agendamentos")
          .update({
            checkin_em: presente ? agora : null,
            status: presente ? "checkin" : "falta",
            presenca_marcada_por: userId,
            presenca_marcada_em: agora,
          })
          .eq("id", p.agendamentoId);
      }

      const quadraUrl = fotoQuadra ? await uploadFoto(fotoQuadra, finalizando.id, "quadra") : null;
      const bolasUrl = fotoBolas ? await uploadFoto(fotoBolas, finalizando.id, "bolas") : null;

      const payload = {
        aula_id: finalizando.id,
        arena_id: arenaId,
        finalizado_por: userId,
        qtd_bolas: qtdBolas ? Number(qtdBolas) : null,
        observacoes: obsFinal.trim() || null,
        ...(quadraUrl ? { foto_quadra_url: quadraUrl } : {}),
        ...(bolasUrl ? { foto_bolas_url: bolasUrl } : {}),
      };

      const { error: errFin } = await supabase
        .from("aula_finalizacoes")
        .upsert(payload, { onConflict: "aula_id" });
      if (errFin) throw new Error(errFin.message);

      const { error: errAula } = await supabase
        .from("aulas")
        .update({ concluida_em: agora })
        .eq("id", finalizando.id);
      if (errAula) throw new Error(errAula.message);

      toast.success("Aula finalizada!");
      await load();
      // Reabre o checklist com os dados recalculados (presenças/faltas atualizadas)
      const recarregada: Aula = { ...finalizando, concluida_em: agora };
      await abrirFinalizar(recarregada);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao finalizar");
    } finally {
      setSalvandoFinal(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
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
        <div aria-hidden className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-primary-foreground/5 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white/70 text-[11px] font-semibold uppercase tracking-[0.18em]">Sua semana</p>
            <h1 className="font-display text-white text-[28px] mt-1 leading-tight">Agenda</h1>
            <p className="text-white/70 text-xs mt-1">
              {isAdmin ? "Gerencie as aulas da arena." : meuProfessorId ? "Suas aulas e chamadas." : "Reserve sua vaga nas próximas aulas."}
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={abrirNova} className="rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur shrink-0">
              <Plus className="h-4 w-4 mr-1" /> Nova
            </Button>
          )}
        </div>
      </header>

      <div className="px-4 -mt-14 relative z-10 space-y-3">

      {!isAdmin && !meuProfessorId && checkinsInfo && !checkinsInfo.ilimitado && checkinsInfo.restantes === 0 && (
        <Card className="p-4 rounded-2xl border-amber-300 bg-amber-50 dark:bg-amber-950/20 shadow-card">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                {checkinsInfo.temPlano
                  ? "Seus check-ins acabaram!"
                  : "Você não tem um plano ativo"}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                {checkinsInfo.temPlano
                  ? `Renove seu plano para continuar agendando aulas. Seu plano expirou em ${new Date(checkinsInfo.expiraEm + "T00:00").toLocaleDateString("pt-BR")}.`
                  : "Escolha um plano para começar a reservar suas aulas."}
              </p>
              <Button size="sm" variant="outline" className="mt-2 text-xs" asChild>
                <Link to="/app/planos">{checkinsInfo.temPlano ? "Renovar plano" : "Ver planos disponíveis"}</Link>
              </Button>
              {!checkinsInfo.temPlano && avulsoSelf && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2">
                  Ou compre um <strong>check-in avulso</strong> direto na aula que quiser entrar (R$ {avulsoSelf.preco.toFixed(2).replace(".", ",")}).
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {!isAdmin && !meuProfessorId && checkinsInfo && checkinsInfo.temPlano && (checkinsInfo.ilimitado || checkinsInfo.restantes > 0) && (
        <div className="relative overflow-hidden bg-card rounded-2xl shadow-card border border-border p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              {checkinsInfo.ilimitado ? "Plano ilimitado" : "Check-ins restantes"}
            </p>
            <p className="font-display text-base leading-tight">
              {checkinsInfo.ilimitado ? "∞" : checkinsInfo.restantes}
              <span className="text-xs text-muted-foreground font-sans"> · expira {new Date(checkinsInfo.expiraEm + "T00:00").toLocaleDateString("pt-BR")}</span>
            </p>
          </div>
        </div>
      )}

      <Card className="p-3 rounded-3xl border-border/60 shadow-card bg-card">
        <div className="flex items-center gap-2 px-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full"
            onClick={() => {
              const novo = offsetSemanas - 1;
              setOffsetSemanas(novo);
              const novosDias = buildDays(novo, JANELA_AGENDA_DIAS);
              if (!novosDias.includes(diaSel)) setDiaSel(novosDias[0]);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex-1 text-center">
            {(() => {
              const inicio = new Date(dias[0] + "T00:00");
              const fim = new Date(dias[dias.length - 1] + "T00:00");
              return `${inicio.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — ${fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
            })()}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full"
            onClick={() => {
              const novo = offsetSemanas + 1;
              setOffsetSemanas(novo);
              const novosDias = buildDays(novo, JANELA_AGENDA_DIAS);
              if (!novosDias.includes(diaSel)) setDiaSel(novosDias[0]);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="-mx-3 px-3 mt-2 overflow-x-auto">
          <div className="flex gap-2 pb-1">
            {dias.map((d) => {
              const dt = new Date(d + "T00:00");
              const sel = d === diaSel;
              const count = aulas.filter((a) => a.data === d).length;
              const hoje = new Date().toISOString().slice(0, 10) === d;
              return (
                <button
                  key={d}
                  onClick={() => setDiaSel(d)}
                  className={`relative shrink-0 w-14 rounded-2xl px-2 py-2.5 text-center transition active:scale-95 ${
                    sel
                      ? "bg-gradient-primary text-primary-foreground shadow-glow"
                      : "bg-muted/40 hover:bg-muted text-foreground"
                  }`}
                >
                  {hoje && !sel && (
                    <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                  <div className={`text-[10px] uppercase font-bold tracking-wider ${sel ? "text-white/80" : "text-muted-foreground"}`}>
                    {DIAS_SEMANA[dt.getDay()]}
                  </div>
                  <div className="font-display text-xl leading-tight mt-0.5">{dt.getDate()}</div>
                  {count > 0 && (
                    <div className={`text-[10px] mt-1 font-semibold ${sel ? "text-white/90" : "text-primary"}`}>
                      {count}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-6 rounded-2xl text-sm text-muted-foreground">Carregando…</Card>
      ) : (() => {
        const aulasDoDia = aulas.filter((a) => a.data === diaSel);
        if (aulasDoDia.length === 0) {
          return (
            <Card className="p-10 rounded-3xl text-center bg-card border-dashed">
              <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-60" />
              <p className="text-sm text-muted-foreground">Nenhuma aula neste dia.</p>
            </Card>
          );
        }
        return (
        <div className="space-y-3">
          {aulasDoDia.map((a) => {
            const reservada = meus.has(a.id);
            const parts = participantes[a.id] ?? [];
            const concluida = !!a.concluida_em;
            return (
              <Card key={a.id} className="p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/app/aula/$aulaId"
                      params={{ aulaId: a.id }}
                      className="font-semibold inline-flex items-center gap-1 hover:underline"
                    >
                      {a.categoria}{a.nivel ? ` · ${a.nivel}` : ""}
                      <ChevRight className="h-4 w-4 opacity-60" />
                    </Link>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      <span>{new Date(a.data + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", weekday: "short" })}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{a.hora_inicio.slice(0,5)}–{a.hora_fim.slice(0,5)}</span>
                      {a.quadra && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{a.quadra}</span>}
                      {a.professor_id && (
                        <span>Prof.: {professores.find((p) => p.id === a.professor_id)?.nome ?? "—"}</span>
                      )}
                    </p>
                    {a.categorias_extras && a.categorias_extras.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {a.categorias_extras.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px] rounded-full">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {concluida ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Concluída</Badge>
                    ) : (
                      <Badge variant="secondary">{parts.length}/{a.vagas}</Badge>
                    )}
                    {isAdmin && (
                      <div className="flex items-center gap-0.5 border-l pl-2 border-border">
                        <Button size="sm" variant="ghost" className="h-7 w-7 px-0" onClick={() => duplicarAula(a)} title="Duplicar"><Copy className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 px-0" onClick={() => abrirEditar(a)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 px-0" onClick={() => abrirAvulso(a)} title="Adicionar avulso"><Plus className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 px-0 text-destructive" onClick={() => { setDeleteScope("uma"); setDeleteTarget({ id: a.id, serie_id: a.serie_id }); }} title="Excluir"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>
                </div>
                {parts.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                    {parts.slice(0, 3).map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-sm">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px]">{p.nome.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="truncate flex-1">{p.nome}</span>
                        {p.origem === "wellhub" && <Badge variant="outline" className="text-[9px] h-4 px-1">Wellhub</Badge>}
                        {p.origem === "totalpass" && <Badge variant="outline" className="text-[9px] h-4 px-1">TotalPass</Badge>}
                      </div>
                    ))}
                    {parts.length > 3 && (
                      <p className="text-xs text-muted-foreground pl-8">+{parts.length - 3} participantes</p>
                    )}
                  </div>
                )}
                {a.professor_id && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <ProfessorMiniCard professorId={a.professor_id} compact />
                  </div>
                )}
                <div className="mt-3">
                  {(isAdmin || (meuProfessorId && a.professor_id === meuProfessorId)) ? (
                    concluida ? (
                      <Button size="sm" variant="outline" className="w-full" onClick={() => abrirFinalizar(a)}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Ver checklist
                      </Button>
                    ) : (
                      <Button size="sm" className="w-full" onClick={() => abrirFinalizar(a)}>
                        Fazer chamada / Finalizar
                      </Button>
                    )
                  ) : reservada ? (
                    (() => {
                      const jaFezCheckin = meusCheckins.has(a.id);
                      const agora = new Date();
                      const inicio = aulaDateTime(a.data, a.hora_inicio);
                      const fim = aulaDateTime(a.data, a.hora_fim);
                      const abreEm = addMinutes(inicio, -ANTECEDENCIA_CHECKIN_MIN);
                      const janelaAberta = agora >= abreEm && agora <= fim;
                      const limiteCancelar = new Date(inicio.getTime() - CANCEL_LIMITE_MIN * 60 * 1000);
                      const podeCancelar = agora < limiteCancelar;
                      return (
                        <div className="flex gap-2">
                          {jaFezCheckin ? (
                            <Button size="sm" variant="outline" className="flex-1" disabled>
                              <CheckCircle2 className="h-4 w-4 mr-1 text-emerald-600" /> Check-in feito
                            </Button>
                          ) : janelaAberta ? (
                            <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => fazerCheckin(a.id)}>
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Fazer check-in
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!podeCancelar}
                            className={jaFezCheckin || janelaAberta ? "" : "w-full flex-1"}
                            title={podeCancelar ? "Cancelar reserva" : `Cancelamento permitido apenas até ${CANCEL_LIMITE_MIN} min antes do início`}
                            onClick={() => cancelar(a.id)}
                          >
                            {podeCancelar ? "Cancelar" : "Cancela. encerrado"}
                          </Button>
                        </div>
                      );
                    })()
                  ) : minhaFila.has(a.id) ? (
                    <Button size="sm" variant="outline" className="w-full" onClick={() => sairFila(a.id)}>
                      Sair da fila ({filaCount[a.id] ?? 1}ª posição)
                    </Button>
                  ) : (() => {
                    const agoraR = new Date();
                    const inicioR = aulaDateTime(a.data, a.hora_inicio);
                    const fimR = aulaDateTime(a.data, a.hora_fim);
                    const limiteAgendamentoR = addMinutes(inicioR, TOLERANCIA_AGENDAMENTO_MIN);
                    const encerrada = !!a.concluida_em || agoraR >= fimR;
                    const agendamentoEncerrado = agoraR > limiteAgendamentoR;
                    const diff = diasAteAula(a.data);
                    const foraJanelaReserva = !isAdmin && !meuProfessorId && diff > JANELA_RESERVA_DIAS;
                    if (foraJanelaReserva) {
                      const abreEm = diff - JANELA_RESERVA_DIAS;
                      return (
                        <Button size="sm" variant="outline" className="w-full" disabled>
                          <Clock className="h-4 w-4 mr-1 opacity-70" />
                          Reservas abrem em {abreEm} {abreEm === 1 ? "dia" : "dias"}
                        </Button>
                      );
                    }
                    if (encerrada) {
                      return (
                        <Button size="sm" variant="outline" className="w-full" disabled>
                          {a.concluida_em ? "Aula finalizada" : "Aula encerrada"}
                        </Button>
                      );
                    }
                    if (agendamentoEncerrado) {
                      return (
                        <Button size="sm" variant="outline" className="w-full" disabled>
                          Reserva encerrada
                        </Button>
                      );
                    }
                    if (parts.length >= a.vagas) {
                      return (
                    <Button size="sm" variant="secondary" className="w-full" onClick={() => agendar(a.id)}>
                      Lotada · Entrar na lista de espera{filaCount[a.id] ? ` (${filaCount[a.id]})` : ""}
                    </Button>
                      );
                    }
                    return (parceirosArena.wellhub || parceirosArena.totalpass || meuParceiro) ? (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={async () => {
                          const { data: aulaFull } = await supabase.from("aulas").select("arena_id").eq("id", a.id).single();
                          if (aulaFull) setReservaParceiro({ aulaId: a.id, arenaId: aulaFull.arena_id });
                        }}
                      >
                        Reservar vaga
                      </Button>
                    ) : (!isAdmin && !meuProfessorId && checkinsInfo && !checkinsInfo.temPlano && avulsoSelf) ? (
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={comprandoAvulso === a.id}
                        onClick={() => comprarAvulsoSelf(a.id)}
                      >
                        {comprandoAvulso === a.id
                          ? "Abrindo Mercado Pago…"
                          : `Comprar avulso · R$ ${avulsoSelf.preco.toFixed(2).replace(".", ",")}`}
                      </Button>
                    ) : (
                      <Button size="sm" className="w-full" onClick={() => agendar(a.id)}>Reservar vaga</Button>
                    );
                  })()}
                </div>
              </Card>
            );
          })}
        </div>
        );
      })()}

      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar aula" : "Nova aula"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              {editing.id && editingSerieId && (
                <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
                  <Label>Aplicar alterações a</Label>
                  <Select value={editScope} onValueChange={(v) => setEditScope(v as EditScope)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uma">Apenas esta aula</SelectItem>
                      <SelectItem value="serie">Toda a série semanal</SelectItem>
                    </SelectContent>
                  </Select>
                  {editScope === "serie" && (
                    <p className="text-xs text-muted-foreground">A data individual de cada aula será mantida; apenas categoria, horários, nível, vagas e quadra serão aplicados a toda a série.</p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Categoria *</Label>
                <Select value={editing.categoria} onValueChange={(v) => setEditing({ ...editing, categoria: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                  <SelectContent>
                    {categoriasArena.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Categorias gerenciadas em Minha arena › Categorias. A ordem define a hierarquia.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input type="date" value={editing.data} onChange={(e) => setEditing({ ...editing, data: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Início *</Label>
                  <Input type="time" min={horaAbertura} max={horaFechamento} value={editing.hora_inicio} onChange={(e) => setEditing({ ...editing, hora_inicio: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fim *</Label>
                  <Input type="time" min={horaAbertura} max={horaFechamento} value={editing.hora_fim} onChange={(e) => setEditing({ ...editing, hora_fim: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Vagas</Label>
                <Input type="number" min={1} value={editing.vagas} onChange={(e) => setEditing({ ...editing, vagas: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Quadra</Label>
                <Input value={editing.quadra} onChange={(e) => setEditing({ ...editing, quadra: e.target.value })} placeholder="Quadra 1" />
              </div>
              <div className="space-y-1.5">
                <Label>Professor</Label>
                <Select
                  value={editing.professor_id || "__none__"}
                  onValueChange={(v) => setEditing({ ...editing, professor_id: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione um professor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem professor definido</SelectItem>
                    {professores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {professores.length === 0 && (
                  <p className="text-xs text-muted-foreground">Cadastre professores em Menu › Professores.</p>
                )}
              </div>
              <Collapsible className="border rounded-lg bg-muted/20">
                <CollapsibleTrigger className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-muted/40 rounded-lg transition group">
                  <span>Opções avançadas {(editing.categorias_extras.length > 0 || editing.vagas_mensalistas != null || editing.wellhub_id || editing.totalpass_id || (!editing.id && editing.repetir_semanas > 1)) && <span className="ml-1 text-[10px] text-primary">●</span>}</span>
                  <ChevronDown className="h-4 w-4 transition group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tags adicionais <span className="text-muted-foreground font-normal">(ex: Feminino, Sub-18)</span></Label>
                    <Input
                      value={editing.categorias_extras.join(", ")}
                      onChange={(e) => setEditing({
                        ...editing,
                        categorias_extras: e.target.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
                      })}
                      placeholder="Separe por vírgula"
                    />
                  </div>
                  {featMensalistas && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Vagas reservadas a mensalistas</Label>
                      <Input
                        type="number" min={0} max={editing.vagas}
                        value={editing.vagas_mensalistas ?? ""}
                        onChange={(e) => setEditing({ ...editing, vagas_mensalistas: e.target.value === "" ? null : Number(e.target.value) })}
                        placeholder="usa padrão da arena"
                      />
                    </div>
                  )}
                  {editing.id && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">IDs de parceiros (Wellhub/TotalPass)</Label>
                      <Input value={editing.wellhub_id} onChange={(e) => setEditing({ ...editing, wellhub_id: e.target.value })} placeholder="ID da aula no Wellhub" />
                      <Input value={editing.totalpass_id} onChange={(e) => setEditing({ ...editing, totalpass_id: e.target.value })} placeholder="ID da aula no TotalPass" />
                    </div>
                  )}
                  {!editing.id && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Repetir semanalmente</Label>
                      <Select value={String(editing.repetir_semanas)} onValueChange={(v) => setEditing({ ...editing, repetir_semanas: Number(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Não repetir</SelectItem>
                          <SelectItem value="4">Por 4 semanas</SelectItem>
                          <SelectItem value="8">Por 8 semanas</SelectItem>
                          <SelectItem value="12">Por 12 semanas</SelectItem>
                          <SelectItem value="24">Por 24 semanas</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="pt-2 space-y-1.5">
                        <Label className="text-xs">Dias da semana</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {DIAS_SEMANA.map((d, idx) => {
                            const baseDia = editing.data ? new Date(editing.data + "T00:00").getDay() : -1;
                            const sel = editing.dias_semana.includes(idx) || (editing.dias_semana.length === 0 && idx === baseDia);
                            return (
                              <button type="button" key={idx}
                                onClick={() => {
                                  const atual = editing.dias_semana.length === 0 && baseDia >= 0 ? [baseDia] : [...editing.dias_semana];
                                  const novo = atual.includes(idx) ? atual.filter((x) => x !== idx) : [...atual, idx];
                                  setEditing({ ...editing, dias_semana: novo });
                                }}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${sel ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>
                                {d}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={salvarAula} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!finalizando} onOpenChange={(o) => !o && setFinalizando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {finalizando?.concluida_em ? "Checklist da aula" : "Finalizar aula"}
            </DialogTitle>
          </DialogHeader>
          {finalizando && (
            <Tabs value={finalAba} onValueChange={setFinalAba}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="presenca">Presença</TabsTrigger>
                <TabsTrigger value="quadra">Quadra</TabsTrigger>
                <TabsTrigger value="bolas">Bolas</TabsTrigger>
                <TabsTrigger value="obs">Obs.</TabsTrigger>
              </TabsList>
              <TabsContent value="presenca" className="space-y-2 mt-3 max-h-72 overflow-y-auto">
                {(() => {
                  const lista = participantes[finalizando.id] ?? [];
                  const totalP = lista.length;
                  const pres = lista.filter((p) => presentes.has(p.id)).length;
                  const faltas = lista.filter(
                    (p) => !presentes.has(p.id) && statusAg[p.agendamentoId] === "falta",
                  ).length;
                  const cancel = lista.filter((p) => statusAg[p.agendamentoId] === "cancelado").length;
                  const semMarcar = totalP - pres - faltas - cancel;
                  return (
                    <div className="flex flex-wrap gap-2 text-xs sticky top-0 bg-background py-1 z-10 border-b mb-1">
                      <Badge className="bg-green-600 hover:bg-green-600 text-white">Presenças: {pres}</Badge>
                      <Badge className="bg-red-600 hover:bg-red-600 text-white">Faltas: {faltas}</Badge>
                      {cancel > 0 && <Badge variant="secondary">Cancelados: {cancel}</Badge>}
                      {semMarcar > 0 && <Badge variant="outline">Sem marcar: {semMarcar}</Badge>}
                      <Badge variant="outline">Total: {totalP}</Badge>
                    </div>
                  );
                })()}
                {(participantes[finalizando.id] ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum aluno agendado.</p>
                ) : (
                  (participantes[finalizando.id] ?? []).map((p) => (
                    <label key={p.id} className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50">
                      <Checkbox
                        checked={presentes.has(p.id)}
                        onCheckedChange={(v) => {
                          setPresentes((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(p.id); else next.delete(p.id);
                            return next;
                          });
                        }}
                      />
                      <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">{p.nome.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</AvatarFallback></Avatar>
                      <span className="text-sm flex-1">{p.nome}</span>
                      {p.origem === "wellhub" ? (
                        <Badge className="text-[9px] h-4 px-1 bg-orange-500 hover:bg-orange-500 text-white">Wellhub</Badge>
                      ) : p.origem === "totalpass" ? (
                        <Badge className="text-[9px] h-4 px-1 bg-blue-600 hover:bg-blue-600 text-white">TotalPass</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">Plano</Badge>
                      )}
                      {presentes.has(p.id) ? (
                        <Badge className="text-[9px] h-4 px-1 bg-green-600 hover:bg-green-600 text-white">Presente</Badge>
                      ) : statusAg[p.agendamentoId] === "falta" ? (
                        <Badge className="text-[9px] h-4 px-1 bg-red-600 hover:bg-red-600 text-white">Falta</Badge>
                      ) : statusAg[p.agendamentoId] === "cancelado" ? (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">Cancelado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground">Sem marcar</Badge>
                      )}
                    </label>
                  ))
                )}
              </TabsContent>
              <TabsContent value="quadra" className="space-y-2 mt-3">
                <Label>Foto da quadra ao final</Label>
                <Input type="file" accept="image/*" onChange={(e) => setFotoQuadra(e.target.files?.[0] ?? null)} />
                <p className="text-[11px] text-muted-foreground mt-1">Você pode tirar uma foto agora ou escolher da galeria.</p>
                {fotoQuadra && <p className="text-xs text-muted-foreground">Selecionado: {fotoQuadra.name}</p>}
              </TabsContent>
              <TabsContent value="bolas" className="space-y-3 mt-3">
                <div className="space-y-1.5">
                  <Label>Foto das bolas</Label>
                  <Input type="file" accept="image/*" onChange={(e) => setFotoBolas(e.target.files?.[0] ?? null)} />
                  <p className="text-[11px] text-muted-foreground mt-1">Você pode tirar uma foto agora ou escolher da galeria.</p>
                  {fotoBolas && <p className="text-xs text-muted-foreground">Selecionado: {fotoBolas.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Quantidade de bolas</Label>
                  <Input type="number" min={0} value={qtdBolas} onChange={(e) => setQtdBolas(e.target.value)} placeholder="Ex.: 24" />
                </div>
              </TabsContent>
              <TabsContent value="obs" className="space-y-2 mt-3">
                <Label>Observações da aula</Label>
                <Textarea value={obsFinal} onChange={(e) => setObsFinal(e.target.value)} rows={5} placeholder="Anote ocorrências, materiais danificados, alunos destaque…" />
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizando(null)}>Cancelar</Button>
            <Button onClick={salvarFinalizacao} disabled={salvandoFinal}>
              {salvandoFinal ? "Salvando…" : finalizando?.concluida_em ? "Atualizar" : "Finalizar aula"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aula?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Agendamentos vinculados também serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteTarget?.serie_id && (
            <div className="space-y-1.5">
              <Label>O que excluir</Label>
              <Select value={deleteScope} onValueChange={(v) => setDeleteScope(v as EditScope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="uma">Apenas esta aula</SelectItem>
                  <SelectItem value="serie">Toda a série semanal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirAula}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!reservaParceiro} onOpenChange={(o) => !o && setReservaParceiro(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Como você quer reservar?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Button
              className="w-full justify-start h-auto py-3"
              variant="outline"
              onClick={() => reservaParceiro && agendar(reservaParceiro.aulaId, "app")}
            >
              <div className="text-left">
                <div className="font-medium">Plano da arena</div>
                <div className="text-xs text-muted-foreground">
                  {checkinsInfo?.temPlano
                    ? `Restam ${checkinsInfo.restantes} de ${checkinsInfo.total} check-ins`
                    : experimentalDisponivel
                      ? "Usar aula experimental gratuita"
                      : "Sem plano ativo"}
                </div>
              </div>
            </Button>
            {(parceirosArena.wellhub || meuParceiro === "wellhub") && (
              <Button
                className="w-full justify-start h-auto py-3 bg-orange-500 hover:bg-orange-600"
                onClick={() => reservaParceiro && agendar(reservaParceiro.aulaId, "wellhub")}
              >
                <div className="text-left">
                  <div className="font-medium">Gympass / Wellhub</div>
                  <div className="text-xs opacity-90">Não desconta do plano da arena</div>
                </div>
              </Button>
            )}
            {(parceirosArena.totalpass || meuParceiro === "totalpass") && (
              <Button
                className="w-full justify-start h-auto py-3 bg-blue-600 hover:bg-blue-700"
                onClick={() => reservaParceiro && agendar(reservaParceiro.aulaId, "totalpass")}
              >
                <div className="text-left">
                  <div className="font-medium">TotalPass</div>
                  <div className="text-xs opacity-90">Não desconta do plano da arena</div>
                </div>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!avulsoTarget} onOpenChange={(o) => !o && setAvulsoTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar aluno avulso</DialogTitle></DialogHeader>
          {avulsoTarget && (
            <div className="space-y-3">
              {!planoAvulsaInfo && (
                <p className="text-xs text-destructive">
                  Nenhum plano avulso cadastrado nesta arena. Vá em Planos e crie um plano com tipo "Avulsa".
                </p>
              )}
              <div>
                <Label>Buscar aluno</Label>
                <Input
                  value={avulsoForm.alunoId ? avulsoForm.alunoNome : avulsoForm.buscaAluno}
                  onChange={(e) => buscarAlunoAvulso(e.target.value)}
                  placeholder="Digite o nome (mín. 2 letras)"
                />
                {avulsoAlunos.length > 0 && !avulsoForm.alunoId && (
                  <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                    {avulsoAlunos.map((al) => (
                      <button
                        key={al.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => setAvulsoForm((f) => ({ ...f, alunoId: al.id, alunoNome: al.nome, buscaAluno: al.nome }))}
                      >
                        {al.nome} {al.email && <span className="text-xs text-muted-foreground">· {al.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Preço (R$)</Label>
                  <Input type="number" step="0.01" min={0} value={avulsoForm.preco}
                    onChange={(e) => setAvulsoForm({ ...avulsoForm, preco: e.target.value })} />
                </div>
                <div>
                  <Label>Desconto (R$)</Label>
                  <Input type="number" step="0.01" min={0} value={avulsoForm.desconto}
                    onChange={(e) => setAvulsoForm({ ...avulsoForm, desconto: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Valor final: R$ {Math.max(Number(avulsoForm.preco || 0) - Number(avulsoForm.desconto || 0), 0).toFixed(2).replace(".", ",")}
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={avulsoForm.gerarCobranca}
                  onChange={(e) => setAvulsoForm({ ...avulsoForm, gerarCobranca: e.target.checked })} />
                Gerar cobrança no financeiro
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvulsoTarget(null)}>Cancelar</Button>
            <Button onClick={salvarAvulso} disabled={salvandoAvulso || !planoAvulsaInfo}>
              {salvandoAvulso ? "Salvando…" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}