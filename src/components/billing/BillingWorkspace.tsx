import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, HelpCircle, Pencil, Plus, Search, Undo2, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { useBilling, BillingClient, RECOVERY_WINDOW_DAYS } from '@/hooks/useBilling';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { BillingCycle, APPROVAL_STATES, ApprovalState, MCO_OPTIONS, isDeadlineAtRisk, isDeadlinePassed, continuationOverlapsInitial, isCycleResolved, finalDeadlineFor, deadlineLabel, daysToFinalDeadline, normalizeLevel, findPossibleDuplicates, needsExtensionReview, daysUntil150End, projected180Start, addDays, todayAgency } from '@/lib/billing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { InfoHint } from '@/components/InfoHint';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { ClientProfileDialog } from '@/components/billing/ClientProfileDialog';
import { RevenueTab } from '@/components/billing/RevenueTab';
import { BillingTutorial, BillingTutorialStep } from '@/components/billing/BillingTutorial';
import { ProviderSetup } from '@/components/billing/ProviderSetup';
import { SubmittedClaims } from '@/components/billing/SubmittedClaims';
import { AddTouchpointDialog, type TouchpointContext } from '@/components/AddTouchpointDialog';
import { AvailityPanel } from '@/components/billing/AvailityPanel';


const fmt = (d?: string | null) => d ? format(parseISO(d), 'MMM d, yyyy') : '—';
// A level of need is not needed to build cycles, only to price them.
const complete = (c: BillingClient) => c.status === 'active' && (!!c.auth_30_start || !!c.auth_150_start);

// Long lists are shown ten at a time so the page stays readable.
const PAGE_SIZE = 10;
function Pager({page,setPage,total,label}:{page:number;setPage:(n:number)=>void;total:number;label:string}){
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  if(total<=PAGE_SIZE) return null;
  const from=page*PAGE_SIZE+1, to=Math.min(total,(page+1)*PAGE_SIZE);
  return <div className="flex flex-wrap items-center justify-between gap-3 py-1">
    <span className="text-sm text-muted-foreground">Showing {from}–{to} of {total} {label}</span>
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={page===0} onClick={()=>setPage(page-1)}><ChevronLeft className="h-4 w-4"/></Button>
      <span className="text-sm text-muted-foreground">Page {page+1} of {pages}</span>
      <Button size="sm" variant="outline" disabled={page>=pages-1} onClick={()=>setPage(page+1)}><ChevronRight className="h-4 w-4"/></Button>
    </div>
  </div>;
}

type Blocker = 'Missing client name' | 'No authorization start date' | 'Missing level of need';
// Cycles are built from an authorization start date — the initial 30-day one or
// the 150-day one. The level of need only prices them.
const blocker = (c: BillingClient): Blocker =>
  !c.first_name?.trim() || !c.last_name?.trim() ? 'Missing client name'
  : !c.auth_30_start && !c.auth_150_start ? 'No authorization start date'
  : 'Missing level of need';
const blockerClass = (label: Blocker) =>
  label === 'No authorization start date' ? 'bg-orange-100 text-orange-900'
  : label === 'Missing level of need' ? 'bg-red-100 text-red-800'
  : 'bg-rose-200 text-rose-900';

// Selected dropdown values get their own colour so the grid is readable at a glance.
const MCO_COLORS: Record<string, string> = {
  Aetna: 'border-blue-300 bg-blue-100 text-blue-900',
  Horizon: 'border-sky-300 bg-sky-100 text-sky-900',
  Wellpoint: 'border-violet-300 bg-violet-100 text-violet-900',
  UnitedHealthcare: 'border-teal-300 bg-teal-100 text-teal-900',
  Fidelis: 'border-orange-300 bg-orange-100 text-orange-900',
};
const mcoClass = (v?: string | null) => (v ? MCO_COLORS[v] ?? 'border-slate-300 bg-slate-100 text-slate-900' : 'bg-white');
const lonClass = (v: string) => (v === 'Low' ? 'border-emerald-300 bg-emerald-100 text-emerald-900' : v === 'High' ? 'border-purple-300 bg-purple-100 text-purple-900' : 'bg-white');
const yesNoClass = (v: boolean | null | undefined) => (v === true ? 'border-green-300 bg-green-100 text-green-900' : v === false ? 'border-slate-300 bg-slate-100 text-slate-800' : 'bg-white');
const boolValue = (v: boolean | null | undefined) => (v === true ? 'yes' : v === false ? 'no' : undefined);

const HOW_TO_READ = 'Cycle 1 is the initial 30-day authorization and is billable. The 150-day authorization follows it, then the 180-day extension. Each cycle shows which authorization it belongs to. A claim must be submitted within 6 months of a cycle end date — that is the final deadline.';

// Needs attention = an ended cycle whose 6-month final submission deadline is
// four weeks or less away and that is not approved or closed. Once that window
// has closed the money cannot be claimed at all, so it is no longer work: those
// cycles move to their own list rather than sitting in a queue asking for action.
/** The four steps of billing, in the order they are done. */
type Section = 'bill' | 'submitted' | 'revenue' | 'data';

/** How close a cycle is to the last day it can be filed. */
type Band = 'overdue' | 'week' | 'month' | 'later';
const bandOf = (days: number): Band =>
  days < 0 ? 'overdue' : days <= 7 ? 'week' : days <= 30 ? 'month' : 'later';

const BANDS: { key: Band; heading: string; note: string; tone: string; dot: string }[] = [
  { key:'overdue', heading:'Past the submission deadline', note:'The six-month window has closed. These claims can no longer be submitted.', tone:'border-red-300 bg-red-50 text-red-900',      dot:'bg-red-600' },
  { key:'week',    heading:'Due this week',                note:'Submit these first.',                                                       tone:'border-amber-300 bg-amber-50 text-amber-900', dot:'bg-amber-500' },
  { key:'month',   heading:'Due this month',               note:'',                                                                          tone:'border-blue-300 bg-blue-50 text-blue-900',    dot:'bg-blue-600' },
  { key:'later',   heading:'Not yet due',                  note:'',                                                                          tone:'border-slate-300 bg-white text-slate-700',    dot:'bg-slate-400' },
];

const attention = (c: BillingCycle) => isDeadlineAtRisk(c) && !isDeadlinePassed(c);
const matches = (c: BillingClient, q: string) => {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase().includes(t) || (c.member_id ?? '').toLowerCase().includes(t) || (c.insurance ?? '').toLowerCase().includes(t);
};

const Editable = ({ value, type='text', onSave, className='', placeholder }: { value: string | null; type?: string; onSave:(v:string)=>void; className?:string; placeholder?:string }) => {
  const [v,setV]=useState(value ?? '');
  useEffect(()=>{setV(value ?? '');},[value]);
  return <Input type={type} value={v} placeholder={placeholder} className={`h-9 min-w-28 border-indigo-200 bg-white shadow-sm focus:ring-2 focus:ring-ring ${className}`} onChange={e=>setV(e.target.value)} onBlur={()=>v !== (value ?? '') && onSave(v)} />;
};

// Client names are piped in from the client record. They read as plain text and
// only become an input once pressed, so edits stay deliberate.
const EditableText = ({ value, onSave, placeholder }: { value: string | null; onSave:(v:string)=>void; placeholder?:string }) => {
  const [editing,setEditing]=useState(false);
  const [v,setV]=useState(value ?? '');
  useEffect(()=>{setV(value ?? '');},[value]);
  if (!editing) return <button type="button" title="Press to rename" className="rounded px-1 py-0.5 text-left font-medium hover:bg-indigo-100" onClick={()=>setEditing(true)}>{value?.trim() || <span className="text-muted-foreground">{placeholder ?? 'Add name'}</span>}</button>;
  return <Input autoFocus value={v} className="h-9 w-28 border-indigo-300 bg-white" onChange={e=>setV(e.target.value)} onBlur={()=>{setEditing(false); if(v !== (value ?? '')) onSave(v);}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}} />;
};

// Shows the cycle end date; press to reveal the start date.
const DateCell = ({ start, end }: { start: string | null; end: string | null }) => {
  const [show,setShow]=useState(false);
  return <button type="button" className="text-left underline decoration-dotted underline-offset-2" onClick={()=>setShow(s=>!s)}>
    {fmt(end)}
    {show && <div className="text-xs text-muted-foreground">Starts {fmt(start)}</div>}
  </button>;
};

const ProfileIconButton = ({ onClick, tour }: { onClick:()=>void; tour?:boolean }) => (
  <Button variant="outline" size="icon" aria-label="View profile" title="View profile" data-tour={tour?'profile-btn':undefined} className="h-7 w-7 shrink-0 rounded-full border-primary/40 text-primary hover:bg-primary/10" onClick={(e)=>{e.stopPropagation();onClick();}}>
    <UserRound className="h-4 w-4" />
  </Button>
);

// ---- Billing tutorial practice data -------------------------------------
// The tutorial never touches real records. While it runs, the workspace shows a
// single practice client with practice cycles, and every change stays in memory.
const PRACTICE_CLIENT_ID = 'practice-client';
const PRACTICE_NAME = { first: 'Practice', last: 'Client' };
/** One numbered step in the billing nav. The number is the whole point: these
 *  are done in order, not picked between. */
const StepButton = ({ step, label, count, active, onClick, tour }: {
  step: number; label: string; count?: number; active: boolean; onClick: () => void; tour?: string;
}) => (
  <Button
    data-tour={tour}
    variant={active ? 'default' : 'ghost'}
    className="gap-2"
    onClick={onClick}
  >
    <span className={`grid h-5 w-5 place-items-center rounded-full text-xs font-semibold ${active ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>{step}</span>
    {label}
    {count !== undefined && count > 0 && (
      <span className={`rounded-full px-1.5 text-xs font-semibold ${active ? 'bg-white/25' : 'bg-slate-200 text-slate-700'}`}>{count}</span>
    )}
  </Button>
);

function buildPractice(): { clients: BillingClient[]; cycles: BillingCycle[] } {
  const start = addDays(todayAgency(), -100);
  const client: BillingClient = {
    id: PRACTICE_CLIENT_ID, first_name: PRACTICE_NAME.first, last_name: PRACTICE_NAME.last,
    insurance: 'Aetna', member_id: 'PRACTICE-001', level_of_need: 'Low Level', status: 'active',
    hsp_submitted: true, auth_150_start: start, auth_150_end: addDays(start, 150),
    auth_180_approved: false, auth_180_start: null, auth_180_end: null,
    assigned_employee_id: null, assigned_staff_name: 'Practice staff',
    billing_tracking_start: start, auth_30_start: addDays(start, -30), auth_30_end: start,
    hsp_due_date: start, auth_30_number: 'P-30', auth_150_number: 'P-150', auth_180_number: null,
    created_at: new Date().toISOString(), deleted_at: null,
  };
  const cycles: BillingCycle[] = [1,2,3,4,5].map(num=>{
    const cs = addDays(start, (num-1)*30);
    return {
      id: `practice-cycle-${num}`, client_id: PRACTICE_CLIENT_ID, cycle_number: num,
      phase: '150-day authorization', cycle_start: cs, cycle_end: addDays(cs, 29),
      billed_amount: null, paid_amount: 0, billing_status: 'Not Billed', payment_status: 'Unpaid',
      claim_number: null, submitted_date: null, paid_date: null, is_auto_generated: true, notes: null,
      approval_state: null, is_active: true,
    };
  });
  return { clients: [client], cycles };
}

export function BillingWorkspace() {
  const { user } = useAuth();
  const { isSuperadmin } = useIsSuperadmin();

  const { loading, clients: realClients, deletedClients: realDeleted, cycles: realCycles, updateClient, addClient: addRealClient, deleteClient, restoreClient, updateCycle: updateRealCycle } = useBilling();
  const [section,setSection]=useState<Section>('bill');
  // The client whose Availity boxes are open. Null means the list is showing.
  const [billingClientId,setBillingClientId]=useState<string|null>(null);
  const [showLater,setShowLater]=useState(false);
  // The agency's own boxes are the same every time, so they start folded away.
  const [agencyOpen,setAgencyOpen]=useState(false);
  // The editable data grid is the only home for hsp_submitted and Add client
  // row, so it stays reachable behind a toggle rather than being deleted.
  const [editData,setEditData]=useState(false);
  // Raised after a cycle is marked billed, to ask about the touchpoint.
  const [billedPrompt,setBilledPrompt]=useState<TouchpointContext|null>(null);
  const [touchpointFor,setTouchpointFor]=useState<TouchpointContext|null>(null);
  const [setupReason,setSetupReason]=useState<'all'|'start'|'lon'>('all');
  const [open,setOpen]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [profileId,setProfileId]=useState<string|null>(null);
  const [tutorial,setTutorial]=useState(false);
  const [practice,setPractice]=useState<{ clients: BillingClient[]; cycles: BillingCycle[] }|null>(null);
  const [practiceRevenueView,setPracticeRevenueView]=useState<'projection'|'recovery'>('projection');
  const [deleteTarget,setDeleteTarget]=useState<BillingClient|null>(null);
  const [duplicate,setDuplicate]=useState<{ row: BillingClient; match: BillingClient }|null>(null);
  const [newRowIds,setNewRowIds]=useState<string[]>([]);

  // Practice data replaces the live lists while the tutorial is running.
  const clients = practice ? practice.clients : realClients;
  const cycles = practice ? practice.cycles : realCycles;
  const deletedClients = practice ? [] : realDeleted;
  const practiceClient = practice?.clients.find(c=>c.id===PRACTICE_CLIENT_ID) ?? null;
  const practiceCycle = practice?.cycles[0] ?? null;

  const startTutorial=()=>{
    setPractice(buildPractice());
    setPracticeRevenueView('projection');
    setSection('bill'); setBillingClientId(null); setShowLater(false); setSetupReason('all');
    setQuery(''); setOpen(null); setNewRowIds([]);
    setTutorial(true);
  };
  const stopTutorial=()=>{
    setTutorial(false); setPractice(null); setNewRowIds([]);
    setSection('bill'); setBillingClientId(null); setSetupReason('all'); setQuery(''); setOpen(null);
  };
  const finishTutorial=async()=>{ if(user) await supabase.from('user_tutorial_progress').upsert({user_id:user.id,current_step:10,completed:true,completed_at:new Date().toISOString()},{onConflict:'user_id'}); stopTutorial(); toast.success('Billing tutorial complete.'); };

  // Practice-only writers. Nothing reaches the database.
  const practiceUpdateClient=async(id:string,patch:Partial<BillingClient>)=>{
    setPractice(p=>p?{...p,clients:p.clients.map(c=>c.id===id?{...c,...patch}:c)}:p);
  };
  const practiceUpdateCycle=async(id:string,patch:Partial<BillingCycle>)=>{
    setPractice(p=>p?{...p,cycles:p.cycles.map(c=>c.id===id?{...c,...patch}:c)}:p);
  };
  const practiceAddClient=async()=>{
    const id=`practice-new-${Date.now()}`;
    setPractice(p=>p?{...p,clients:[{...buildPractice().clients[0],id,first_name:'',last_name:'',member_id:null,insurance:null,level_of_need:null,hsp_submitted:null,auth_150_start:null,auth_150_end:null,auth_30_number:null,auth_150_number:null,created_at:new Date().toISOString()},...p.clients]}:p);
    return id;
  };


  const cycleByClient = useMemo(()=>new Map(clients.map(c=>[c.id, cycles.filter(x=>x.client_id===c.id)])),[clients,cycles]);
  const eligible=clients.filter(complete), setup=clients.filter(c=>c.status==='active'&&!complete(c));
  const extensionClients=useMemo(()=>eligible.filter(c=>needsExtensionReview(c)).sort((a,b)=>(daysUntil150End(a)??999)-(daysUntil150End(b)??999)),[eligible]);
  // Clients ready for billing except for the level of need. They can be finished
  // here and move straight into the lists above once the level is saved.
  const lonAll=useMemo(()=>clients.filter(c=>c.status==='active'&&(!!c.auth_30_start||!!c.auth_150_start)&&!normalizeLevel(c.level_of_need)),[clients]);
  const lonPending=useMemo(()=>lonAll.filter(c=>matches(c,query)),[lonAll,query]);
  // Cycles still waiting to be billed: not approved, not closed, not already
  // filed. A cycle marked billed leaves this list and shows up in Revenue.
  const toBillOf=(c:BillingClient)=>(cycleByClient.get(c.id)??[])
    .filter(x=>!isCycleResolved(x)&&x.billing_status!=='Submitted');

  // Every client with something left to bill, most urgent first. There is one
  // ordering rather than four filters, because the deadline is the only thing
  // that decides what to do next.
  const queue=useMemo(()=>eligible
      .filter(c=>matches(c,query)&&toBillOf(c).length>0)
      .map(c=>{
        const open=toBillOf(c);
        const days=Math.min(...open.map(x=>daysToFinalDeadline(x)));
        return { client:c, cycles:open, days, band:bandOf(days) };
      })
      .sort((a,b)=>a.days-b.days),
  [eligible,query,cycleByClient]);

  const byBand=useMemo(()=>{
    const out:Record<Band,typeof queue>={overdue:[],week:[],month:[],later:[]};
    queue.forEach(r=>out[r.band].push(r));
    return out;
  },[queue]);

  // The clients to bill now: their soonest cycle passes its six-month filing
  // deadline within the month, so leaving it loses the money outright.
  const urgent=useMemo(()=>queue.filter(r=>r.band!=='later'),[queue]);

  // How much of this month's filing is already done. Counted from the cycles
  // themselves rather than kept in state, so it survives a reload.
  const filedToday=useMemo(()=>cycles.filter(c=>c.submitted_date===todayAgency()).length,[cycles]);

  // Marking a cycle billed moves straight on to the next client whose window
  // closes soonest, so the month can be cleared in one sitting.
  const advanceToNext=(fromClientId:string)=>{
    const next=urgent.find(r=>r.client.id!==fromClientId);
    setBillingClientId(next?.client.id ?? null);
    if(next) toast.success(`Next: ${next.client.first_name} ${next.client.last_name}`);
    else toast.success('All claims due this month have been submitted.');
  };

  const [page,setPage]=useState(0);
  useEffect(()=>{setPage(0);},[query]);
  const laterPaged=byBand.later.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);

  const searchResults = query.trim() ? clients.filter(c=>matches(c,query)).slice(0,8) : [];

  const runDuplicateCheck=(id:string)=>{
    const row=clients.find(c=>c.id===id);
    if(!row) return;
    const match=findPossibleDuplicates(row,clients)[0];
    if(match) setDuplicate({ row, match });
  };
  // While the tutorial runs, every writer points at practice data only.
  const clientWriter = practice ? practiceUpdateClient : updateClient;
  const cycleWriter = practice ? practiceUpdateCycle : updateRealCycle;
  const clientAdder = practice ? practiceAddClient : addRealClient;
  const saveClient=(id:string,p:Partial<BillingClient>)=>clientWriter(id,p)
    .then(()=>{toast.success(practice?'Saved to practice data only.':'Saved. Billing has been updated.'); if(!practice) runDuplicateCheck(id);})
    .catch(e=>toast.error(e.message));

  // Billing a cycle is only half the month's work: the touchpoints have to be
  // entered in NJHMIS too, and the two are easy to separate by accident. So the
  // question is asked straight after, while the client is still in mind.
  const handleBilled=(clientId:string)=>{
    const c=clients.find(x=>x.id===clientId);
    if(!c) return;
    setBilledPrompt({
      clientId,
      clientName:`${c.first_name} ${c.last_name}`,
      levelOfNeed:normalizeLevel(c.level_of_need)||null,
      locked:true,
    });
  };

  // One row in the list of clients to bill.
  const clientRow=(row:{client:BillingClient;cycles:BillingCycle[];days:number;band:Band},tour:boolean)=>{
    const c=row.client;
    const all=cycleByClient.get(c.id)??[];
    const level=normalizeLevel(c.level_of_need);
    return <Card key={c.id} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 pr-4" data-tour={tour?'client-row':undefined}>
        <button className="flex min-w-[18rem] flex-1 items-center gap-3 p-4 text-left hover:bg-slate-50" onClick={()=>setOpen(open===c.id?null:c.id)}>
          {open===c.id?<ChevronDown className="h-4 w-4 shrink-0"/>:<ChevronRight className="h-4 w-4 shrink-0"/>}
          <div className="min-w-0 flex-1">
            <span className="flex items-center gap-2"><b>{c.first_name} {c.last_name}</b><InfoHint text={HOW_TO_READ}/></span>
            <div className="truncate text-sm text-muted-foreground">
              {c.insurance ?? 'No MCO'} · {level?`${level} level`:'Level of need needed'} · {c.auth_180_approved?'180-day extension':'150-day authorization'}
            </div>
          </div>
          <div className="text-right">
            <b>{row.cycles.length} cycle{row.cycles.length===1?'':'s'} to bill</b>
            <div className="text-sm text-muted-foreground">
              {row.days<0?`Window closed ${Math.abs(row.days)} days ago`:row.days===0?'Last day to file':`${row.days} days left to file`}
            </div>
          </div>
        </button>
        <Button onClick={()=>{setBillingClientId(c.id);window.scrollTo({top:0,behavior:'smooth'});}}>Add billing</Button>
        <ProfileIconButton onClick={()=>setProfileId(c.id)} tour={tour}/>
      </div>
      {open===c.id&&<CycleGrid client={c} cycles={all} updateCycle={cycleWriter} tour={tour} practice={!!practice}/>}
    </Card>;
  };

  const reasonOf: Record<'start'|'lon', Blocker> = { start:'No authorization start date', lon:'Missing level of need' };
  const setupRows=useMemo(()=>{
    const rows=clients.filter(c=>c.status==='active').filter(c=>setupReason==='all'||(!complete(c)&&blocker(c)===reasonOf[setupReason]));
    // Newly added rows always sit at the top so they are easy to fill in.
    return rows.sort((a,b)=>{
      const an=newRowIds.indexOf(a.id), bn=newRowIds.indexOf(b.id);
      if(an!==bn) return (an===-1?1:0)-(bn===-1?1:0) || an-bn;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });
  },[clients,setupReason,newRowIds]);
  const countBlocked=(k:'start'|'lon')=>setup.filter(c=>blocker(c)===reasonOf[k]).length;

  const practiceFullName=`${PRACTICE_NAME.first} ${PRACTICE_NAME.last}`;
  const resetPracticeCycles=()=>setPractice(p=>p?{...p,cycles:p.cycles.map(c=>({...c,billing_status:'Not Billed' as const}))}:p);
  const removePracticeRows=()=>setPractice(p=>p?{...p,clients:p.clients.filter(c=>c.id===PRACTICE_CLIENT_ID)}:p);

  const tutorialSteps: BillingTutorialStep[] = useMemo(()=>{
    const sectionsList = isSuperadmin
      ? 'Billing runs in order.\n\nBilling Details holds the agency\u2019s own information, added once.\n\nClients To Bill lists who to file for, soonest deadline first.\n\nRevenue shows what has been billed and collected.\n\nClient Information is where you add or correct the client details used to build billing cycles.'
      : 'Billing runs in order.\n\nBilling Details holds the agency\u2019s own information, added once.\n\nClients To Bill lists who to file for, soonest deadline first.\n\nClient Information is where you add or correct the client details used to build billing cycles.';

    const steps: BillingTutorialStep[] = [
      {
        title: isSuperadmin ? 'Understand the three Billing sections' : 'Understand the two Billing sections',
        body: sectionsList,
        selector:'[data-tour="sections"]',
        before:()=>{setSection('bill');setQuery('');setOpen(null);setBillingClientId(null);},
      },
      {
        title:'Find a client',
        body:`Use the search box to find a specific client. You can search using the client’s name, member ID, or MCO. Only matching clients will appear below the search box.\n\n**Enter ${practiceFullName} in the search box, then press Continue.**`,
        selector:'[data-tour="search"]',
        gate: !!query.trim() && !!practiceClient && matches(practiceClient, query),
        before:()=>{setSection('bill');setQuery('');},
      },
      {
        title:'Read the list',
        body:'There is one list, ordered by the last day each claim can be filed.\n\nDue This Week comes first, then Due This Month, then Later. Overdue means the six-month window has closed and the claim can no longer be filed.\n\nThe number beside each heading is how many clients are in it.',
        selector:'[data-tour="filters"]',
        before:()=>{setSection('bill');setQuery('');setOpen(null);},
      },
      {
        title:'Open a client’s billing cycles',
        body:'Press a client’s row to see all of that client’s 30-day billing cycles.\n\nThe first five cycles belong to the client’s 150-day authorization. Claims from these cycles can be submitted until the final day of the full 150-day authorization period.\n\nIf a 180-day extension is approved, six additional 30-day billing cycles will appear.',
        selector:'[data-tour="client-row"]',
        done: open===PRACTICE_CLIENT_ID,
        hint:'**Press the highlighted practice client row to continue.**',
        before:()=>{setSection('bill');setQuery('');setOpen(null);},
      },
      {
        title:'Update a billing cycle',
        body:'Use the billing-cycle table to record the claim status, payment status, and claim number.\n\nChange the claim status when a claim is submitted. Enter the claim number when it is available. Change the payment status when the claim is paid or denied. **Changes save automatically.**',
        selector:'[data-tour="claim-status"]',
        done: practiceCycle?.billing_status==='Submitted',
        hint:'**Open the highlighted claim status dropdown and select Submitted to continue.**',
        before:()=>{setSection('bill');setOpen(PRACTICE_CLIENT_ID);resetPracticeCycles();},
      },
    ];

    if (isSuperadmin) {
      steps.push(
        {
          title:'Open Revenue',
          body:'Use Revenue to review the amount the agency may bill, the amount already submitted, the amount awaiting payment, and the amount collected.\n\nOnly superadmins can view this section.',
          selector:'[data-tour="sections"]',
          done: section==='revenue',
          hint:'**Press Revenue to continue.**',
          before:()=>{setSection('bill');setPracticeRevenueView('projection');},
        },
        {
          title:'Understand the Revenue section',
          body:'The Revenue section shows revenue for the current month and the next five months.\n\nPotential 6 Month Revenue is the amount the agency may bill during this period.\n\nSubmitted is the value of claims that have been submitted.\n\nPending is the value of submitted claims for which payment has not been recorded as received.\n\nCollected is the amount recorded as paid.\n\nThe table shows these amounts by month. If a client’s level of need is missing, the system shows a range using both the Low and High billing rates.\n\nUse Analyze Lost and Pending Income to review billing cycles that have ended but were not submitted.',
          followUp:'Pending Income shows claims that have not been submitted but can still be submitted before the final authorization deadline.\n\nLost Income shows claims that were not submitted before the final authorization deadline and can no longer be billed.',
          selector:'[data-tour="revenue-section"]',
          done: practiceRevenueView==='recovery',
          hint:'**Press Analyze Lost and Pending Income to continue.**',
          before:()=>{setSection('revenue');setPracticeRevenueView('projection');},
        },
      );
    }

    steps.push(
      {
        title:'Open the client billing setup section',
        body: isSuperadmin
          ? 'You have finished reviewing Revenue. Use Add or Set Up Client Billing to add a client or correct the information used to create billing cycles.\n\nYou can save the information you have even when some information is still missing.'
          : 'You have finished reviewing Current Billing Deadlines. Use Add or Set Up Client Billing to add a client or correct the information used to create billing cycles.\n\nYou can save the information you have even when some information is still missing.',
        selector:'[data-tour="sections"]',
        done: section==='data',
        hint:'**Press Add or Set Up Client Billing to continue.**',
        before:()=>{setSection(isSuperadmin?'revenue':'bill');},
      },
      {
        title:'Review the client setup groups',
        body:'These buttons organize clients by their current place in the billing setup process.\n\nNeeds Setup includes clients whose billing cycles cannot be created because required information or an action is still missing. The available filters explain what is needed, including No Authorization Start Date.\n\nThe 150-Day Authorization group shows clients whose initial authorization information has been completed.\n\nThe 180-Day Extension group shows clients whose extension information has been completed or needs to be reviewed.\n\nThe number in parentheses shows how many clients are in each group.',
        selector:'[data-tour="stage-setup"]',
        done: setupReason==='start',
        hint:'**Press No Authorization Start Date to continue.**',
        before:()=>{setSection('data');setSetupReason('all');setQuery('');},
      },
      {
        title:'Add a client',
        body:'Add Client Row creates a blank row at the top of the table. Enter the information you currently have, then press Save. You can complete the remaining information later.\n\nA partially completed client remains saved in the appropriate setup group. The client must not appear under Current Billing Deadlines until the information required to calculate billing cycles has been entered.\n\nWhen an authorization start date is entered, the system creates the billing cycles: the initial 30-day authorization first, then the 150-day authorization. If a 180-day extension is approved later, the system adds the extension cycles. The level of need is only needed to price them.',
        selector:'[data-tour="add-client"]',
        done: (practice?.clients.length ?? 0) > 1,
        hint:'**Press Add Client Row to complete the tutorial.**',
        before:()=>{setSection('data');setSetupReason('start');setQuery('');removePracticeRows();},
      },
    );
    return steps;
  },[isSuperadmin,section,setupReason,open,query,practice,practiceClient,practiceCycle,practiceRevenueView]);

  const completionBody = isSuperadmin
    ? ['You have completed the Billing tutorial.','Add the agency details once under Billing Details. Work through Clients To Bill from the top. Use Revenue to review what has been billed and collected, and Client Information to add or correct client details.','You can restart this at any time by pressing How Billing Works.']
    : ['You have completed the Billing tutorial.','Add the agency details once under Billing Details. Work through Clients To Bill from the top. Use Client Information to add or correct client details.','You can restart this at any time by pressing How Billing Works.'];

  if (loading) return <Card className="p-8 text-muted-foreground">Loading billing information…</Card>;

  return <div className="space-y-4">
    {tutorial && <BillingTutorial steps={tutorialSteps} completionBody={completionBody} onClose={stopTutorial} onFinish={finishTutorial} />}

    <ClientProfileDialog clientId={practice?null:profileId} onClose={()=>setProfileId(null)} />

    <Dialog open={!!deleteTarget} onOpenChange={(o)=>!o&&setDeleteTarget(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete {deleteTarget?.first_name} {deleteTarget?.last_name}?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This client will be removed from billing and the client list. You can recover them from Recently deleted for {RECOVERY_WINDOW_DAYS} days.</p>
        <DialogFooter>
          <Button variant="outline" onClick={()=>setDeleteTarget(null)}>Keep client</Button>
          <Button className="bg-red-600 text-white hover:bg-red-700" onClick={()=>{const t=deleteTarget; setDeleteTarget(null); if(!t) return; if(practice){ setPractice(p=>p?{...p,clients:p.clients.filter(c=>c.id!==t.id)}:p); toast.success('Practice row removed.'); return; } deleteClient(t.id).then(()=>toast.success('Client deleted. You can recover them for 30 days.')).catch(e=>toast.error(e.message));}}>Delete client</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!duplicate} onOpenChange={(o)=>!o&&setDuplicate(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>This client may already exist</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {duplicate?.match.first_name} {duplicate?.match.last_name} is already in the system with a matching member ID or authorization number
          {duplicate?.match.member_id ? ` (${duplicate.match.member_id})` : ''}. Did you mean that client?
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={()=>setDuplicate(null)}>No, keep the new client</Button>
          <Button onClick={()=>{const id=duplicate?.match.id; setDuplicate(null); if(id) setProfileId(id);}}>Go to that client</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Asked straight after a cycle is billed: the NJHMIS entry is the other
        half of the same month's work, and is easy to forget once the claim is
        filed. Answering No opens the touchpoint form for this client, which is
        where the NJHMIS note is written and copied. */}
    <Dialog open={!!billedPrompt} onOpenChange={(o)=>!o&&setBilledPrompt(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Touchpoints for {billedPrompt?.clientName}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          The cycle is marked as billed. Have this client's touchpoints been entered in NJHMIS for it?
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={()=>{const id=billedPrompt?.clientId;setBilledPrompt(null);if(id)advanceToNext(id);}}>Yes, already entered</Button>
          <Button onClick={()=>{setTouchpointFor(billedPrompt);setBilledPrompt(null);}}>No, add a touchpoint now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AddTouchpointDialog
      open={!!touchpointFor}
      onOpenChange={(o)=>!o&&setTouchpointFor(null)}
      context={touchpointFor}
      onSaved={()=>{const id=touchpointFor?.clientId;setTouchpointFor(null);if(id)advanceToNext(id);}}
    />

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-white p-1" data-tour="sections">
        <StepButton step={1} label="Clients to bill" active={section==='bill'} onClick={()=>setSection('bill')} tour="section-bill"/>
        <StepButton step={2} label="Submitted claims" active={section==='submitted'} onClick={()=>setSection('submitted')} tour="section-submitted"/>
        {isSuperadmin && <StepButton step={3} label="Revenue" active={section==='revenue'} onClick={()=>setSection('revenue')} tour="section-revenue"/>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button data-tour="section-setup" variant="outline" className={section==='data'?'border-indigo-400 bg-indigo-50 text-indigo-900 hover:bg-indigo-100':''} onClick={()=>setSection('data')}><Pencil className="mr-2 h-4 w-4"/>Client information</Button>
        <Button variant="ghost" onClick={startTutorial}><HelpCircle className="mr-2 h-4 w-4"/>How billing works</Button>
      </div>
    </div>

    {section==='data' && <Card className="p-4" data-tour="search">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search clients by name, member ID, or MCO…" value={query} onChange={e=>setQuery(e.target.value)} />
        {query && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={()=>setQuery('')}><X className="h-4 w-4"/></button>}
      </div>
      {searchResults.length>0 && <div className="mt-3 divide-y rounded-md border">
        {searchResults.map(c=><button key={c.id} className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-slate-50" onClick={()=>setProfileId(c.id)}>
          <span><b>{c.first_name} {c.last_name}</b><span className="text-muted-foreground"> · {c.member_id ?? 'No member ID'} · {c.insurance ?? 'No MCO'}</span></span>
          <span className="flex items-center gap-1 text-xs font-medium text-primary"><UserRound className="h-3.5 w-3.5"/>View profile</span>
        </button>)}
      </div>}
    </Card>}

    {section==='revenue' ? <RevenueTab clients={clients} cycles={cycles} viewOverride={practice?practiceRevenueView:undefined} onViewChange={practice?setPracticeRevenueView:undefined}/>
    : section==='submitted' ? <SubmittedClaims clients={clients} cycles={cycles} updateCycle={cycleWriter}/>
    : section==='bill' ? <>
      {/* Filing a claim and the Availity boxes are the same job, so they are one
          step: the clients whose window closes this month, then the form. */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={()=>setAgencyOpen(v=>!v)}>
          <Pencil className="mr-2 h-4 w-4"/>{agencyOpen?'Hide agency details':'Edit agency details'}
        </Button>
      </div>
      {agencyOpen && <ProviderSetup/>}

      {(urgent.length>0||filedToday>0) && <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <b>{filedToday} submitted today</b>
          <span className="text-muted-foreground"> · {urgent.length} remaining this month</span>
        </div>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-emerald-500" style={{width:`${Math.round((filedToday/Math.max(filedToday+urgent.length,1))*100)}%`}}/>
        </div>
      </Card>}

      <AvailityPanel
        clients={clients}
        cycles={cycles}
        updateCycle={cycleWriter}
        initialClientId={billingClientId}
        onBilled={handleBilled}
        shortlist={urgent.map(r=>({ id:r.client.id, label:`${r.client.first_name} ${r.client.last_name}`, note:r.days<0?'window closed':`${r.days}d`, urgent:r.band!=='month' }))}
      />


    </>
    : <>
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Billing cycles due</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ordered by submission deadline, soonest first. Select a client to view their cycles.</p>
          </div>
          <Button variant="outline" size="sm" onClick={()=>setEditData(v=>!v)}>
            <Pencil className="mr-2 h-4 w-4"/>{editData?'Hide client data':'Edit client data'}
          </Button>
        </div>
      </Card>

      {!editData && <>
        {queue.length===0 && <Card className="p-10 text-center">
          <h3 className="font-semibold">{query.trim()?'No clients match that search':'No claims are outstanding'}</h3>
        </Card>}

        {BANDS.filter(b=>b.key!=='later').map(b=>byBand[b.key].length>0?<section key={b.key} className="space-y-3">
          <div>
            <h3 className="font-semibold">{b.heading} ({byBand[b.key].length})</h3>
            {b.note && <p className="text-sm text-muted-foreground">{b.note}</p>}
          </div>
          {byBand[b.key].map(row=>clientRow(row,false))}
        </section>:null)}

        {byBand.later.length>0 && <section className="space-y-3">
          <button className="flex w-full items-center justify-between rounded-md border bg-white p-3 text-left text-sm hover:bg-slate-50" onClick={()=>setShowLater(v=>!v)}>
            <span><b>Not yet due ({byBand.later.length})</b></span>
            {showLater?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}
          </button>
          {showLater && <div className="space-y-3">
            <Pager page={page} setPage={setPage} total={byBand.later.length} label="clients"/>
            {laterPaged.map(row=>clientRow(row,false))}
            <Pager page={page} setPage={setPage} total={byBand.later.length} label="clients"/>
          </div>}
        </section>}

        {lonPending.length>0 && <LonQueue clients={lonPending} save={saveClient} openProfile={setProfileId}/>}
        {extensionClients.length>0 && <ExtensionQueue clients={extensionClients} save={saveClient} openProfile={setProfileId}/>}
      </>}

      {editData && <div className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-indigo-900"><Pencil className="h-4 w-4"/>Edit mode — add or set up client billing</h2>
          <p className="mt-1 text-sm text-indigo-900/70">Everything on this screen is editable and saves as you go. Partial information is kept without creating overdue warnings.</p>
        </div>
        <Button data-tour="add-client" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={()=>clientAdder().then(id=>{setSetupReason('all');setNewRowIds(x=>[id,...x]);toast.success(practice?'Practice row added at the top.':'New client row added at the top.');}).catch(e=>toast.error(e.message))}><Plus className="mr-2 h-4 w-4"/>Add client row</Button>
      </div>

      <div className="flex flex-wrap gap-2" data-tour="stage-setup">
        <Button size="sm" variant={setupReason==='all'?'secondary':'outline'} className={setupReason!=='all'?'bg-white':''} onClick={()=>setSetupReason('all')}>All clients ({clients.filter(c=>c.status==='active').length})</Button>
        <Button size="sm" onClick={()=>setSetupReason('start')} className={setupReason==='start'?'bg-orange-600 text-white hover:bg-orange-700':'border border-orange-300 bg-white text-orange-800 hover:bg-orange-50'}>No authorization start date ({countBlocked('start')})</Button>
        <Button size="sm" onClick={()=>setSetupReason('lon')} className={setupReason==='lon'?'bg-red-600 text-white hover:bg-red-700':'border border-red-300 bg-white text-red-700 hover:bg-red-50'}>Missing level of need ({countBlocked('lon')})</Button>
      </div>

      <ClientGrid clients={setupRows.filter(c=>matches(c,query))} save={saveClient} openProfile={setProfileId} onDelete={setDeleteTarget}/>


      {deletedClients.length>0 && <Card className="p-4">
        <h3 className="font-semibold">Recently deleted</h3>
        <p className="mt-1 text-sm text-muted-foreground">Deleted clients can be recovered for {RECOVERY_WINDOW_DAYS} days.</p>
        <div className="mt-3 divide-y rounded-md border">
          {deletedClients.map(c=><div key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <span><b>{c.first_name} {c.last_name}</b><span className="text-muted-foreground"> · deleted {c.deleted_at?format(new Date(c.deleted_at),'MMM d, yyyy'):'—'}</span></span>
            <Button size="sm" variant="outline" onClick={()=>restoreClient(c.id).then(()=>toast.success('Client recovered.')).catch(e=>toast.error(e.message))}><Undo2 className="mr-2 h-4 w-4"/>Recover</Button>
          </div>)}
        </div>
      </Card>}
    </div>}
    </>}
  </div>;
}

// Clients with an HSP approval start date but no level of need. Saving the level
// here creates their billing cycles, which moves them into the lists above.
function LonQueue({clients,save,openProfile}:{clients:BillingClient[];save:(id:string,p:Partial<BillingClient>)=>void;openProfile:(id:string)=>void}){
  const [picked,setPicked]=useState<Record<string,string>>({});
  const [page,setPage]=useState(0);
  const pages=Math.max(1,Math.ceil(clients.length/PAGE_SIZE));
  useEffect(()=>{ if(page>pages-1) setPage(pages-1); },[page,pages]);
  const rows=clients.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  return <Card className="overflow-hidden border-amber-300">
    <div className="border-b bg-amber-50 p-4">
      <h3 className="font-semibold text-amber-900">Add a level of need ({clients.length})</h3>
      <p className="mt-1 text-sm text-amber-900/80">These clients have an HSP approval start date but no level of need, so their billing cycles cannot be created yet. Choose the level of need and press Save. They join the list above right away.</p>
    </div>
    <div className="divide-y">{rows.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
      <div className="flex items-center gap-2">
        <ProfileIconButton onClick={()=>openProfile(c.id)}/>
        <b>{c.first_name} {c.last_name}</b>
        <span className="text-muted-foreground">· HSP approval start {fmt(c.auth_150_start)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Select value={picked[c.id]} onValueChange={v=>setPicked(p=>({...p,[c.id]:v}))}>
          <SelectTrigger className={`h-9 w-32 font-medium ${lonClass(picked[c.id] ?? '')}`}><SelectValue placeholder="Level of need"/></SelectTrigger>
          <SelectContent><SelectItem value="Low">Low</SelectItem><SelectItem value="High">High</SelectItem></SelectContent>
        </Select>
        <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700" disabled={!picked[c.id]} onClick={()=>save(c.id,{level_of_need:picked[c.id]})}>Save</Button>
      </div>
    </div>)}</div>
    <div className="border-t px-3"><Pager page={page} setPage={setPage} total={clients.length} label="clients"/></div>
  </Card>;
}



// Clients whose 150-day authorization ends soon and still need a decision on
// the 180-day extension.
function ExtensionQueue({clients,save,openProfile}:{clients:BillingClient[];save:(id:string,p:Partial<BillingClient>)=>void;openProfile:(id:string)=>void}){
  const [numbers,setNumbers]=useState<Record<string,string>>({});
  if(!clients.length) return <Card className="p-10 text-center"><h3 className="font-semibold">No extensions are coming up</h3><p className="mt-1 text-sm text-muted-foreground">A client appears here when their 150-day authorization ends within 30 days and the 180-day extension has not been confirmed.</p></Card>;
  return <Card className="overflow-x-auto">
    <div className="border-b bg-amber-50 p-4">
      <h3 className="font-semibold text-amber-900">Confirm a 180-day extension ({clients.length})</h3>
      <p className="mt-1 text-sm text-amber-900/80">Confirm the 180-day extension before the 150-day authorization ends, so billing continues without a gap. The 180-day start date is worked out for you.</p>
    </div>
    <table className="w-full min-w-[1000px] text-sm"><thead className="bg-slate-100 text-left"><tr>{['Client','150-day end date','Time left','180-day start (calculated)','180-day auth number','Confirm'].map(x=><th key={x} className="p-3 font-semibold">{x}</th>)}</tr></thead>
    <tbody>{clients.map(c=>{
      const days=daysUntil150End(c)??0;
      const start=projected180Start(c.auth_150_start);
      return <tr key={c.id} className="border-t">
        <td className="p-2"><div className="flex items-center gap-2"><ProfileIconButton onClick={()=>openProfile(c.id)}/><b>{c.first_name} {c.last_name}</b></div></td>
        <td className="p-3">{fmt(c.auth_150_end)}</td>
        <td className={`p-3 font-medium ${days<0?'text-red-700':days<=14?'text-amber-700':''}`}>{days<0?`${Math.abs(days)} day${Math.abs(days)===1?'':'s'} past`:days===0?'Ends today':`${days} day${days===1?'':'s'} left`}</td>
        <td className="p-3">{fmt(start)}</td>
        <td className="p-2"><Input className="h-9 w-40 bg-white" placeholder="Enter auth number" value={numbers[c.id] ?? c.auth_180_number ?? ''} onChange={e=>setNumbers(n=>({...n,[c.id]:e.target.value}))}/></td>
        <td className="p-2"><Button className="bg-emerald-600 text-white hover:bg-emerald-700" size="sm" onClick={()=>save(c.id,{auth_180_approved:true,auth_180_number:(numbers[c.id] ?? c.auth_180_number ?? '')||null})}>Approved</Button></td>
      </tr>;
    })}</tbody></table>
  </Card>;
}

const BLOCKERS: Blocker[] = ['No authorization start date','Missing level of need','Missing client name'];

// Column filter: the header shows a small caret; the options only appear once it is pressed.
function ColumnFilter({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:string[]}){
  return <div className="font-semibold text-indigo-900">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Filter ${label}`} className="flex items-center gap-1 text-left hover:underline">
          {label}<ChevronDown className="h-3.5 w-3.5"/>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="bg-white">
        <DropdownMenuItem onClick={()=>onChange('all')}>All</DropdownMenuItem>
        {options.map(o=><DropdownMenuItem key={o} onClick={()=>onChange(o)}>{o}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    {value!=='all' && <div className="text-xs font-normal text-indigo-900/70">{value}</div>}
  </div>;
}


function ClientGrid({clients,save,openProfile,onDelete}:{clients:BillingClient[];save:(id:string,p:Partial<BillingClient>)=>void;openProfile:(id:string)=>void;onDelete:(c:BillingClient)=>void}){
  const [sort,setSort]=useState<{key:'name'|'start';dir:'asc'|'desc'}|null>(null);
  const [fMco,setFMco]=useState('all');
  const [fLon,setFLon]=useState('all');
  const [fHsp,setFHsp]=useState('all');
  const [fExt,setFExt]=useState('all');
  const [fWhy,setFWhy]=useState('all');
  const toggle=(key:'name'|'start')=>setSort(s=>s?.key===key?(s.dir==='asc'?{key,dir:'desc'}:null):{key,dir:'asc'});

  const rows=useMemo(()=>{
    const filtered=clients.filter(c=>
      (fMco==='all'||(c.insurance ?? '')===fMco)
      &&(fLon==='all'||normalizeLevel(c.level_of_need)===fLon)
      &&(fHsp==='all'||(fHsp==='Yes'?c.hsp_submitted===true:fHsp==='No'?c.hsp_submitted===false:c.hsp_submitted==null))
      &&(fExt==='all'||(fExt==='Approved'?c.auth_180_approved===true:fExt==='N/A'?c.auth_180_approved===false:c.auth_180_approved==null))
      &&(fWhy==='all'||(fWhy==='In billing'?complete(c):!complete(c)&&blocker(c)===fWhy)));
    if(!sort) return filtered;
    const dir=sort.dir==='asc'?1:-1;
    return [...filtered].sort((a,b)=>sort.key==='name'
      ? dir*`${a.last_name ?? ''} ${a.first_name ?? ''}`.trim().localeCompare(`${b.last_name ?? ''} ${b.first_name ?? ''}`.trim())
      : dir*((a.auth_150_start ?? '9999').localeCompare(b.auth_150_start ?? '9999')));
  },[clients,sort,fMco,fLon,fHsp,fExt,fWhy]);

  const SortHeader=({label,keyName,asc,desc}:{label:string;keyName:'name'|'start';asc:string;desc:string})=>(
    <button type="button" onClick={()=>toggle(keyName)} className="flex items-center gap-1 font-semibold text-indigo-900 hover:underline">
      {label}<ArrowUpDown className="h-3.5 w-3.5"/>
      {sort?.key===keyName && <span className="text-xs font-normal">{sort.dir==='asc'?asc:desc}</span>}
    </button>
  );

  return <Card className="overflow-x-auto border-indigo-200">
    <table className="w-full min-w-[1850px] text-sm"><thead className="bg-indigo-100 text-left"><tr className="align-top">
      <th className="p-3"><SortHeader label="Client" keyName="name" asc="A–Z" desc="Z–A"/></th>
      <th className="p-3 font-semibold text-indigo-900">Member ID</th>
      <th className="p-3"><ColumnFilter label="MCO" value={fMco} onChange={setFMco} options={[...MCO_OPTIONS]}/></th>
      <th className="p-3"><ColumnFilter label="Level of Need" value={fLon} onChange={setFLon} options={['Low','High']}/></th>
      <th className="p-3"><ColumnFilter label="HSP submitted" value={fHsp} onChange={setFHsp} options={['Yes','No','Blanks']}/></th>
      <th className="p-3"><SortHeader label="HSP approval start" keyName="start" asc="Earliest first" desc="Latest first"/></th>
      <th className="p-3"><ColumnFilter label="180-day extension" value={fExt} onChange={setFExt} options={['Approved','N/A','Blanks']}/></th>
      <th className="p-3 font-semibold text-indigo-900">30-day auth #</th>
      <th className="p-3 font-semibold text-indigo-900">150-day auth #</th>
      <th className="p-3 font-semibold text-indigo-900">180-day auth #</th>
      <th className="p-3"><ColumnFilter label="Reason billing is incomplete" value={fWhy} onChange={setFWhy} options={['In billing',...BLOCKERS]}/></th>

      <th className="p-3 font-semibold text-indigo-900">Save</th>
      <th className="p-3 font-semibold text-indigo-900">Delete</th>
    </tr></thead>
    <tbody>{rows.map(c=><tr key={c.id} className="border-t border-indigo-100 hover:bg-indigo-50/50">
      <td className="p-2"><div className="flex items-center gap-1"><ProfileIconButton onClick={()=>openProfile(c.id)}/><EditableText value={c.first_name} placeholder="First name" onSave={v=>save(c.id,{first_name:v})}/><EditableText value={c.last_name} placeholder="Last name" onSave={v=>save(c.id,{last_name:v})}/></div></td>
      <td className="p-2"><Editable value={c.member_id} placeholder="Member ID" onSave={v=>save(c.id,{member_id:v||null})}/></td>
      <td className="p-2"><Select value={c.insurance ?? undefined} onValueChange={v=>save(c.id,{insurance:v})}><SelectTrigger className={`w-40 font-medium ${mcoClass(c.insurance)}`}><SelectValue placeholder=""/></SelectTrigger><SelectContent>{Array.from(new Set([...MCO_OPTIONS, ...(c.insurance?[c.insurance]:[])])).map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></td>
      <td className="p-2"><Select value={normalizeLevel(c.level_of_need) || undefined} onValueChange={v=>save(c.id,{level_of_need:v})}><SelectTrigger className={`w-32 font-medium ${lonClass(normalizeLevel(c.level_of_need))}`}><SelectValue placeholder=""/></SelectTrigger><SelectContent><SelectItem value="Low">Low</SelectItem><SelectItem value="High">High</SelectItem></SelectContent></Select></td>
      <td className="p-2"><Select value={boolValue(c.hsp_submitted)} onValueChange={v=>save(c.id,{hsp_submitted:v==='yes'})}><SelectTrigger className={`w-24 font-medium ${yesNoClass(c.hsp_submitted)}`}><SelectValue placeholder=""/></SelectTrigger><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent></Select></td>
      <td className="p-2"><Editable type="date" value={c.auth_150_start} onSave={v=>save(c.id,{auth_150_start:v||null})}/></td>
      <td className="p-2"><Select value={boolValue(c.auth_180_approved)} onValueChange={v=>save(c.id,{auth_180_approved:v==='yes'})}><SelectTrigger className={`w-28 font-medium ${yesNoClass(c.auth_180_approved)}`}><SelectValue placeholder=""/></SelectTrigger><SelectContent><SelectItem value="no">N/A</SelectItem><SelectItem value="yes">Approved</SelectItem></SelectContent></Select></td>
      <td className="p-2"><Editable value={c.auth_30_number} placeholder="30-day" onSave={v=>save(c.id,{auth_30_number:v||null})}/></td>
      <td className="p-2"><Editable value={c.auth_150_number} placeholder="150-day" onSave={v=>save(c.id,{auth_150_number:v||null})}/></td>
      <td className="p-2"><Editable value={c.auth_180_number} placeholder="180-day" onSave={v=>save(c.id,{auth_180_number:v||null})}/></td>
      <td className="p-3">{!complete(c)?<span className={`whitespace-nowrap rounded-full px-3 py-1 font-medium ${blockerClass(blocker(c))}`}>{blocker(c)}</span>:<span className="whitespace-nowrap rounded-full bg-green-100 px-3 py-1 font-medium text-green-900">In billing · {c.auth_180_approved?'180-day extension':'150-day authorization'}</span>}</td>
      <td className="p-2"><Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={()=>openProfile(c.id)}>Save</Button></td>
      <td className="p-2"><Button size="icon" variant="ghost" aria-label="Delete client" title="Delete client" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={()=>onDelete(c)}><X className="h-4 w-4"/></Button></td>
    </tr>)}</tbody></table>
    {rows.length===0 && <div className="p-8 text-center text-sm text-muted-foreground">No clients match these filters. Press Add client row to create one.</div>}
  </Card>;
}


// Final deadline cell: shows only the time left; once passed the date is revealed on press.
function DeadlineCell({cycle}:{cycle:BillingCycle}){
  const [show,setShow]=useState(false);
  const passed=isDeadlinePassed(cycle);
  const label=deadlineLabel(cycle);
  return <button type="button" className={`text-left underline decoration-dotted underline-offset-2 ${passed?'text-muted-foreground':isDeadlineAtRisk(cycle)?'font-semibold text-red-700':''}`} onClick={()=>setShow(s=>!s)}>
    {label}
    {show && <div className="text-xs font-normal text-muted-foreground">{passed?'Deadline was ':'Deadline '}{fmt(finalDeadlineFor(cycle))}</div>}
  </button>;
}

function CycleGrid({client,cycles,updateCycle,tour,practice}:{client:BillingClient;cycles:BillingCycle[];updateCycle:(id:string,p:Partial<BillingCycle>)=>Promise<void>;tour?:boolean;practice?:boolean}){
  const savedMsg=(what:string)=>practice?'Practice only — nothing was saved.':what;
  const allResolved = cycles.length>0 && cycles.every(isCycleResolved);
  const sorted = [...cycles].sort((a,b)=>a.cycle_number-b.cycle_number);
  return <div className="border-t bg-white p-4" data-tour={tour?'cycle-table':undefined}>
    {allResolved && <div className="mb-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-800">Every cycle is approved or closed. Nothing else is outstanding for this client.</div>}
    {continuationOverlapsInitial(client.auth_30_start, client.auth_150_start) && <div className="mb-3 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">These dates look wrong.</p>
      <p className="mt-1">The 150-day authorization starts on {client.auth_150_start}, before the initial 30-day period that began {client.auth_30_start} has finished. Every cycle below is built from that date, so they are all shifted. The usual cause is the continuation start being entered as the date the initial period <i>ended</i> rather than the date it began.</p>
      <p className="mt-1">Correct the 150-day authorization start under Add or set up client billing. The cycles rebuild from it automatically.</p>
    </div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="bg-slate-100">{['Cycle','Authorization','End date','Final deadline','Approved?','Billing status','Payment status','Claim number'].map(x=><th key={x} className="p-3 text-left">{x}</th>)}</tr></thead><tbody>
      {sorted.map((c,i)=>{
      const risk=isDeadlineAtRisk(c);
      const passed=isDeadlinePassed(c);
      return <tr key={c.id} className={`border-t ${passed?'bg-slate-100 text-muted-foreground':risk?'bg-red-50':''}`}>
        <td className={`p-3 font-semibold ${risk&&!passed?'text-red-700':''}`}>Cycle {c.cycle_number}</td>
        <td className="p-3">{c.phase==='Initial 30-Day'?'Initial 30-day authorization':c.phase==='150-Day'?'150-day authorization':'180-day extension'}</td>
        <td className="p-3"><DateCell start={c.cycle_start} end={c.cycle_end}/></td>
        <td className="p-3"><DeadlineCell cycle={c}/></td>
        <td className="p-3"><Select value={c.approval_state ?? 'none'} onValueChange={v=>updateCycle(c.id,{approval_state:v==='none'?null:v as ApprovalState}).then(()=>toast.success(savedMsg('Cycle approval saved.')))}><SelectTrigger className="w-48"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Not decided</SelectItem>{APPROVAL_STATES.map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></td>
        <td className="p-3"><Select value={c.billing_status} onValueChange={v=>updateCycle(c.id,{billing_status:v as BillingCycle['billing_status']}).then(()=>toast.success(savedMsg('Billing status saved.')))}><SelectTrigger className="w-36" data-tour={tour&&i===0?'claim-status':undefined}><SelectValue/></SelectTrigger><SelectContent>{['Not Billed','Ready to Bill','Submitted','Denied'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></td>
        <td className="p-3"><Select value={c.payment_status} onValueChange={v=>updateCycle(c.id,{payment_status:v as BillingCycle['payment_status']}).then(()=>toast.success(savedMsg('Payment status saved.')))}><SelectTrigger className="w-28"><SelectValue/></SelectTrigger><SelectContent>{['Unpaid','Partial','Paid'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></td>
        <td className="p-3"><Editable value={c.claim_number} placeholder="Enter claim number" onSave={v=>updateCycle(c.id,{claim_number:v||null})}/></td>
      </tr>;
    })}</tbody></table></div></div>;
}
