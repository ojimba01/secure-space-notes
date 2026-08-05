import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowUpDown, ChevronDown, ChevronRight, HelpCircle, Pencil, Plus, Search, Undo2, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { useBilling, BillingClient, RECOVERY_WINDOW_DAYS } from '@/hooks/useBilling';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { BillingCycle, APPROVAL_STATES, ApprovalState, MCO_OPTIONS, isDeadlineAtRisk, isDeadlinePassed, isCycleResolved, finalDeadlineFor, deadlineLabel, hspDueDateFor, daysToFinalDeadline, normalizeLevel, findPossibleDuplicates, needsExtensionReview, daysUntil150End, projected180Start } from '@/lib/billing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { InfoHint } from '@/components/InfoHint';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientProfileDialog } from '@/components/billing/ClientProfileDialog';
import { BillingTutorial, BillingTutorialStep } from '@/components/billing/BillingTutorial';

const fmt = (d?: string | null) => d ? format(parseISO(d), 'MMM d, yyyy') : '—';
const complete = (c: BillingClient) => c.status === 'active' && c.hsp_submitted && !!c.auth_150_start && !!normalizeLevel(c.level_of_need);

type Blocker = 'Missing client name' | 'HSP not submitted' | 'Missing HSP approval start date' | 'Missing level of need';
const blocker = (c: BillingClient): Blocker =>
  !c.first_name?.trim() || !c.last_name?.trim() ? 'Missing client name'
  : !c.hsp_submitted ? 'HSP not submitted'
  : !c.auth_150_start ? 'Missing HSP approval start date'
  : 'Missing level of need';
const blockerClass = (label: Blocker) =>
  label === 'HSP not submitted' ? 'bg-amber-100 text-amber-900'
  : label === 'Missing HSP approval start date' ? 'bg-orange-100 text-orange-900'
  : label === 'Missing level of need' ? 'bg-red-100 text-red-800'
  : 'bg-rose-200 text-rose-900';

// Selected dropdown values get their own colour so the grid is readable at a glance.
const MCO_COLORS: Record<string, string> = {
  Aetna: 'border-blue-300 bg-blue-100 text-blue-900',
  Horizon: 'border-sky-300 bg-sky-100 text-sky-900',
  Wellpoint: 'border-violet-300 bg-violet-100 text-violet-900',
  'United Health': 'border-teal-300 bg-teal-100 text-teal-900',
  Fidelis: 'border-orange-300 bg-orange-100 text-orange-900',
};
const mcoClass = (v?: string | null) => (v ? MCO_COLORS[v] ?? 'border-slate-300 bg-slate-100 text-slate-900' : 'bg-white');
const lonClass = (v: string) => (v === 'Low' ? 'border-emerald-300 bg-emerald-100 text-emerald-900' : v === 'High' ? 'border-purple-300 bg-purple-100 text-purple-900' : 'bg-white');
const yesNoClass = (v: boolean | null | undefined) => (v === true ? 'border-green-300 bg-green-100 text-green-900' : v === false ? 'border-slate-300 bg-slate-100 text-slate-800' : 'bg-white');
const boolValue = (v: boolean | null | undefined) => (v === true ? 'yes' : v === false ? 'no' : undefined);

const HOW_TO_READ = 'The 30-day HSP window (Cycle 0) comes first and is not billable. Cycles 1–5 are the 150-day authorization. Cycles 6–11 are the 180-day extension. A claim must be submitted within 6 months of a cycle end date — that is the final deadline.';

// Needs attention = an ended cycle whose 6-month final submission deadline is
// four weeks or less away (or already passed) and that is not approved or closed.
const attention = (c: BillingCycle) => isDeadlineAtRisk(c);
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

export function BillingWorkspace() {
  const { user } = useAuth();
  const { loading, clients, deletedClients, cycles, updateClient, addClient, deleteClient, restoreClient, updateCycle } = useBilling();
  const [section,setSection]=useState<'deadlines'|'setup'>('deadlines');
  const [filter,setFilter]=useState<'attention'|'all'|'extensions'>('attention');
  const [phaseTab,setPhaseTab]=useState<'both'|'150'|'180'>('both');
  const [setupReason,setSetupReason]=useState<'all'|'hsp'|'start'|'lon'>('all');
  const [open,setOpen]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [profileId,setProfileId]=useState<string|null>(null);
  const [tutorial,setTutorial]=useState(false);
  const [deleteTarget,setDeleteTarget]=useState<BillingClient|null>(null);
  const [duplicate,setDuplicate]=useState<{ row: BillingClient; match: BillingClient }|null>(null);
  const [newRowIds,setNewRowIds]=useState<string[]>([]);

  const finishTutorial=async()=>{ if(user) await supabase.from('user_tutorial_progress').upsert({user_id:user.id,current_step:10,completed:true,completed_at:new Date().toISOString()},{onConflict:'user_id'}); setTutorial(false); toast.success('Billing tutorial completed.'); };

  const cycleByClient = useMemo(()=>new Map(clients.map(c=>[c.id, cycles.filter(x=>x.client_id===c.id)])),[clients,cycles]);
  const eligible=clients.filter(complete), setup=clients.filter(c=>c.status==='active'&&!complete(c));
  const attentionCount=cycles.filter(attention).length;
  const extensionClients=useMemo(()=>eligible.filter(c=>needsExtensionReview(c)).sort((a,b)=>(daysUntil150End(a)??999)-(daysUntil150End(b)??999)),[eligible]);

  // Nearest unresolved final deadline, used to order the full cycle list.
  const nearestDeadline=(c:BillingClient)=>{
    const list=(cycleByClient.get(c.id)??[]).filter(x=>!isCycleResolved(x));
    if(!list.length) return Number.MAX_SAFE_INTEGER;
    return Math.min(...list.map(x=>{const d=daysToFinalDeadline(x); return d<0?d+100000:d;}));
  };
  const visibleCycles=cycles.filter(c=>filter!=='attention'||attention(c));
  const visibleClients=useMemo(()=>eligible
    .filter(c=>filter!=='all'||phaseTab==='both'||(phaseTab==='180'?!!c.auth_180_approved:!c.auth_180_approved))
    .filter(c=>matches(c,query)&&(cycleByClient.get(c.id)??[]).some(x=>visibleCycles.includes(x)))
    .sort((a,b)=>nearestDeadline(a)-nearestDeadline(b)),[eligible,query,cycleByClient,visibleCycles,filter,phaseTab]);
  const searchResults = query.trim() ? clients.filter(c=>matches(c,query)).slice(0,8) : [];

  const runDuplicateCheck=(id:string)=>{
    const row=clients.find(c=>c.id===id);
    if(!row) return;
    const match=findPossibleDuplicates(row,clients)[0];
    if(match) setDuplicate({ row, match });
  };
  const saveClient=(id:string,p:Partial<BillingClient>)=>updateClient(id,p)
    .then(()=>{toast.success('Saved. Billing has been updated.'); runDuplicateCheck(id);})
    .catch(e=>toast.error(e.message));

  const reasonOf: Record<'hsp'|'start'|'lon', Blocker> = { hsp:'HSP not submitted', start:'Missing HSP approval start date', lon:'Missing level of need' };
  const setupRows=useMemo(()=>{
    const rows=clients.filter(c=>c.status==='active').filter(c=>setupReason==='all'||(!complete(c)&&blocker(c)===reasonOf[setupReason]));
    // Newly added rows always sit at the top so they are easy to fill in.
    return rows.sort((a,b)=>{
      const an=newRowIds.indexOf(a.id), bn=newRowIds.indexOf(b.id);
      if(an!==bn) return (an===-1?1:0)-(bn===-1?1:0) || an-bn;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });
  },[clients,setupReason,newRowIds]);
  const countBlocked=(k:'hsp'|'start'|'lon')=>setup.filter(c=>blocker(c)===reasonOf[k]).length;

  const tutorialSteps: BillingTutorialStep[] = useMemo(()=>[
    { title:'Understand the two Billing sections', body:'Billing has two main sections. Current billing deadlines shows the billing work that needs your attention. Add or set up client billing is where you enter or correct the information used to create billing cycles.', cta:'Press Current billing deadlines to continue.', selector:'[data-tour="section-deadlines"]', requireClick:true, before:()=>{setSection('deadlines');setQuery('');} },
    { title:'Find a client', body:'Use the search box to find a specific client. You can search using the client’s name, member ID, or MCO. Only matching clients will appear below the search box.\n\nPress the search box and enter a client’s name, then press Continue.', cta:'Continue', selector:'[data-tour="search"]' },
    { title:'Review Needs attention', body:'Needs attention shows clients with billing work that requires action. It includes clients whose 30-day cycle end dates are now four weeks away from the final deadline for submitting claims from the full authorization period.\n\nThe number in parentheses shows how many clients currently need attention.', cta:'Press Needs attention to continue.', selector:'[data-tour="filter-attention"]', requireClick:true, before:()=>{setSection('deadlines');setQuery('');} },
    { title:'View all active billing cycles', body:'All active billing cycles shows every active 30-day cycle in the system, ordered so the cycle with the closest final deadline appears first.', cta:'Press All active billing cycles to continue.', selector:'[data-tour="filter-all"]', requireClick:true },
    { title:'Watch for upcoming extensions', body:'Upcoming extensions lists clients whose 150-day authorization ends within 30 days. Confirm the 180-day extension and enter its authorization number so billing continues without a gap.', cta:'Press Upcoming extensions to continue.', selector:'[data-tour="filter-extensions"]', requireClick:true },
    { title:'Open a client’s billing cycles', body:'Press a client’s row to see all of that client’s 30-day billing cycles.\n\nThe first five cycles belong to the client’s 150-day authorization. If a 180-day extension is approved, six additional 30-day cycles will appear.', cta:'Press the highlighted client row to continue.', selector:'[data-tour="client-row"]', requireClick:true, before:()=>{setFilter('all');setOpen(null);} },
    { title:'Update a billing cycle', body:'Use the billing-cycle table to record the claim status, payment status, and claim number.\n\nUpdate the claim status when a claim is submitted. Add the claim number when one is available. Update the payment status when the claim is paid or denied. Your changes save automatically.', cta:'Press the highlighted claim-status field, then select Submitted to continue.', selector:'[data-tour="claim-status"]', requireClick:true, before:()=>{const first=eligible.find(c=>(cycleByClient.get(c.id)??[]).length); if(first) setOpen(first.id);} },
    { title:'Open Add or set up client billing', body:'Use Add or set up client billing to add a client or correct information used to create billing cycles. This section is an editing space, so it looks different from Current billing deadlines.', cta:'Press Add or set up client billing to continue.', selector:'[data-tour="section-setup"]', requireClick:true },
    { title:'Review clients who need setup', body:'Use the filter buttons to see clients whose billing cycles cannot be created yet: the HSP has not been submitted, the HSP approval start date is missing, or the level of need is missing.', cta:'Press HSP not submitted to continue.', selector:'[data-tour="stage-setup"]', requireClick:true, before:()=>{setSection('setup');} },
    { title:'Add a client', body:'Use Add client row to create a blank row at the top of the table. Enter the information you have, then press Save to open the client profile and finish filling it out.', cta:'Press Add client row to complete the tutorial.', selector:'[data-tour="add-client"]', requireClick:true, before:()=>{setSection('setup');setSetupReason('all');} },
  ],[eligible,cycleByClient]);

  useEffect(()=>{ if(!tutorial) return; document.body.style.overflow='hidden'; return ()=>{document.body.style.overflow='';}; },[tutorial]);

  if (loading) return <Card className="p-8 text-muted-foreground">Loading billing information…</Card>;

  return <div className="space-y-4">
    {tutorial && <BillingTutorial steps={tutorialSteps} onClose={()=>setTutorial(false)} onFinish={finishTutorial} />}
    <ClientProfileDialog clientId={profileId} onClose={()=>setProfileId(null)} />

    <Dialog open={!!deleteTarget} onOpenChange={(o)=>!o&&setDeleteTarget(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete {deleteTarget?.first_name} {deleteTarget?.last_name}?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This client will be removed from billing and the client list. You can recover them from Recently deleted for {RECOVERY_WINDOW_DAYS} days.</p>
        <DialogFooter>
          <Button variant="outline" onClick={()=>setDeleteTarget(null)}>Keep client</Button>
          <Button className="bg-red-600 text-white hover:bg-red-700" onClick={()=>{const t=deleteTarget; setDeleteTarget(null); if(t) deleteClient(t.id).then(()=>toast.success('Client deleted. You can recover them for 30 days.')).catch(e=>toast.error(e.message));}}>Delete client</Button>
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

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex rounded-lg border bg-white p-1" data-tour="sections">
        <Button data-tour="section-deadlines" variant={section==='deadlines'?'default':'ghost'} onClick={()=>setSection('deadlines')}>Current billing deadlines</Button>
        <Button data-tour="section-setup" variant={section==='setup'?'default':'ghost'} className={section==='setup'?'bg-indigo-600 text-white hover:bg-indigo-700':''} onClick={()=>setSection('setup')}><Pencil className="mr-2 h-4 w-4"/>Add or set up client billing</Button>
      </div>
      <Button variant="outline" onClick={()=>setTutorial(true)}><HelpCircle className="mr-2 h-4 w-4"/>Learn how to use Billing</Button>
    </div>

    <Card className="p-4" data-tour="search">
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
    </Card>

    {section==='deadlines' ? <>
      <div className="flex flex-wrap gap-2">
        <Button data-tour="filter-all" variant={filter==='all'?'default':'outline'} onClick={()=>setFilter('all')}>All active billing cycles ({cycles.length})</Button>
        <Button data-tour="filter-attention" onClick={()=>setFilter('attention')} className={filter==='attention'?'bg-red-600 text-white hover:bg-red-700':'border border-red-300 bg-white text-red-700 hover:bg-red-50'}>Needs attention ({attentionCount})</Button>
        <button data-tour="filter-extensions" onClick={()=>setFilter('extensions')} className={`inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 ${filter==='extensions'?'bg-amber-600 text-white hover:bg-amber-700':'border border-amber-300 bg-white text-amber-800 hover:bg-amber-50'}`}>Upcoming 180-day extensions ({extensionClients.length})</button>
      </div>


      {filter==='all' && <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={phaseTab==='both'?'secondary':'outline'} className={`h-8 text-sm ${phaseTab!=='both'?'bg-white':''}`} onClick={()=>setPhaseTab('both')}>All authorizations ({eligible.length})</Button>
        <Button size="sm" variant={phaseTab==='150'?'default':'outline'} className={`h-8 text-sm ${phaseTab!=='150'?'bg-white':''}`} onClick={()=>setPhaseTab('150')}>150-day authorization ({eligible.filter(c=>!c.auth_180_approved).length})</Button>
        <Button size="sm" variant={phaseTab==='180'?'default':'outline'} className={`h-8 text-sm ${phaseTab!=='180'?'bg-white':''}`} onClick={()=>setPhaseTab('180')}>180-day extension ({eligible.filter(c=>c.auth_180_approved).length})</Button>
      </div>}


      {filter==='extensions' ? <ExtensionQueue clients={extensionClients} save={saveClient} openProfile={setProfileId}/>
      : visibleClients.length===0 ? <Card className="p-10 text-center"><h3 className="font-semibold">{query.trim()?'No billable clients match that search':'Nothing needs attention right now'}</h3><p className="mt-1 text-sm text-muted-foreground">{query.trim()?'Try a different name or member ID, or clear the search.':'A client appears here when a finished cycle is within four weeks of its final submission deadline.'}</p></Card>
      : <div className="space-y-3">{visibleClients.map((c,i)=>{
        const all=cycleByClient.get(c.id)??[];
        const cc=all.filter(x=>filter==='all'||attention(x));
        const atRisk=all.filter(attention).length;
        const allResolved=all.length>0&&all.every(isCycleResolved);
        return <Card key={c.id} className={`overflow-hidden ${atRisk?'border-red-400':''}`}>
        <div className="flex items-center gap-2 pr-4">
          <button className="flex flex-1 items-center gap-3 p-4 text-left hover:bg-slate-50" data-tour={i===0?'client-row':undefined} onClick={()=>setOpen(open===c.id?null:c.id)}>
            {open===c.id?<ChevronDown/>:<ChevronRight/>}
            <div className="flex-1">
              <span className="flex items-center gap-2"><b>{c.first_name} {c.last_name}</b><InfoHint text={HOW_TO_READ}/></span>
              <div className="text-sm text-muted-foreground">{normalizeLevel(c.level_of_need)} level · {c.auth_180_approved?'180-day extension':'150-day authorization'}</div>
            </div>
            <div className="text-right">
              <b>{cc.length} cycle{cc.length===1?'':'s'}</b>
              <div className={`text-sm ${atRisk?'font-medium text-red-600':allResolved?'font-medium text-green-700':'text-muted-foreground'}`}>{atRisk?`${atRisk} cycle(s) near final deadline`:allResolved?'All cycles approved or closed':'Open to review'}</div>
            </div>
          </button>
          <ProfileIconButton onClick={()=>setProfileId(c.id)} tour={i===0}/>
        </div>
        {open===c.id&&<CycleGrid client={c} cycles={all} updateCycle={updateCycle} tour={i===0}/>}
      </Card>})}</div>}

    </> : <div className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-indigo-900"><Pencil className="h-4 w-4"/>Edit mode — add or set up client billing</h2>
          <p className="mt-1 text-sm text-indigo-900/70">Everything on this screen is editable and saves as you go. Partial information is kept without creating overdue warnings.</p>
        </div>
        <Button data-tour="add-client" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={()=>addClient().then(id=>{setSetupReason('all');setNewRowIds(x=>[id,...x]);toast.success('New client row added at the top.');}).catch(e=>toast.error(e.message))}><Plus className="mr-2 h-4 w-4"/>Add client row</Button>
      </div>

      <div className="flex flex-wrap gap-2" data-tour="stage-setup">
        <Button size="sm" variant={setupReason==='all'?'secondary':'outline'} className={setupReason!=='all'?'bg-white':''} onClick={()=>setSetupReason('all')}>All clients ({clients.filter(c=>c.status==='active').length})</Button>
        <Button size="sm" onClick={()=>setSetupReason('hsp')} className={setupReason==='hsp'?'bg-amber-600 text-white hover:bg-amber-700':'border border-amber-300 bg-white text-amber-800 hover:bg-amber-50'}>HSP not submitted ({countBlocked('hsp')})</Button>
        <Button size="sm" onClick={()=>setSetupReason('start')} className={setupReason==='start'?'bg-orange-600 text-white hover:bg-orange-700':'border border-orange-300 bg-white text-orange-800 hover:bg-orange-50'}>Missing HSP approval start date ({countBlocked('start')})</Button>
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
  </div>;
}

// Clients whose 150-day authorization ends soon and still need a decision on
// the 180-day extension.
function ExtensionQueue({clients,save,openProfile}:{clients:BillingClient[];save:(id:string,p:Partial<BillingClient>)=>void;openProfile:(id:string)=>void}){
  const [numbers,setNumbers]=useState<Record<string,string>>({});
  if(!clients.length) return <Card className="p-10 text-center"><h3 className="font-semibold">No extensions are coming up</h3><p className="mt-1 text-sm text-muted-foreground">A client appears here when their 150-day authorization ends within 30 days and the 180-day extension has not been confirmed.</p></Card>;
  return <Card className="overflow-x-auto">
    <div className="border-b bg-amber-50 p-4 text-sm text-amber-900">Confirm the 180-day extension before the 150-day authorization ends so billing continues without a gap. The 180-day start date is calculated for you.</div>
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

const BLOCKERS: Blocker[] = ['HSP not submitted','Missing HSP approval start date','Missing level of need','Missing client name'];

function FilterSelect({value,onChange,options,width='w-36'}:{value:string;onChange:(v:string)=>void;options:string[];width?:string}){
  return <Select value={value} onValueChange={onChange}>
    <SelectTrigger className={`mt-1 h-7 ${width} bg-white text-xs font-normal`}><SelectValue/></SelectTrigger>
    <SelectContent><SelectItem value="all">All</SelectItem>{options.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
  </Select>;
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
      &&(fExt==='all'||(fExt==='Approved'?c.auth_180_approved===true:fExt==='Not approved'?c.auth_180_approved===false:c.auth_180_approved==null))
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
      <th className="p-3 font-semibold text-indigo-900">MCO<FilterSelect value={fMco} onChange={setFMco} options={[...MCO_OPTIONS]} width="w-36"/></th>
      <th className="p-3 font-semibold text-indigo-900">Level of Need<FilterSelect value={fLon} onChange={setFLon} options={['Low','High']} width="w-28"/></th>
      <th className="p-3 font-semibold text-indigo-900">HSP submitted<FilterSelect value={fHsp} onChange={setFHsp} options={['Yes','No','Not answered']} width="w-32"/></th>
      <th className="p-3"><SortHeader label="HSP approval start" keyName="start" asc="Earliest first" desc="Latest first"/></th>
      <th className="p-3 font-semibold text-indigo-900">180-day extension<FilterSelect value={fExt} onChange={setFExt} options={['Approved','Not approved','Not answered']} width="w-36"/></th>
      <th className="p-3 font-semibold text-indigo-900">30-day auth no.</th>
      <th className="p-3 font-semibold text-indigo-900">150-day auth no.</th>
      <th className="p-3 font-semibold text-indigo-900">180-day auth no.</th>
      <th className="p-3 font-semibold text-indigo-900 whitespace-pre-line">Reason billing is incomplete{"\n"}<FilterSelect value={fWhy} onChange={setFWhy} options={['In billing',...BLOCKERS]} width="w-52"/></th>
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
      <td className="p-2"><Select value={boolValue(c.auth_180_approved)} onValueChange={v=>save(c.id,{auth_180_approved:v==='yes'})}><SelectTrigger className={`w-28 font-medium ${yesNoClass(c.auth_180_approved)}`}><SelectValue placeholder=""/></SelectTrigger><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Approved</SelectItem></SelectContent></Select></td>
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

function CycleGrid({client,cycles,updateCycle,tour}:{client:BillingClient;cycles:BillingCycle[];updateCycle:(id:string,p:Partial<BillingCycle>)=>Promise<void>;tour?:boolean}){
  const hspDue = client.hsp_due_date ?? hspDueDateFor(client.auth_30_start);
  const allResolved = cycles.length>0 && cycles.every(isCycleResolved);
  const sorted = [...cycles].sort((a,b)=>a.cycle_number-b.cycle_number);
  return <div className="border-t bg-white p-4" data-tour={tour?'cycle-table':undefined}>
    {allResolved && <div className="mb-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-800">Every cycle is approved or closed. Nothing else is outstanding for this client.</div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="bg-slate-100">{['Cycle','Authorization','End date','Final deadline','Approved?','Billing status','Payment status','Claim number'].map(x=><th key={x} className="p-3 text-left">{x}</th>)}</tr></thead><tbody>
      <tr className="border-t bg-slate-50/60 text-muted-foreground">
        <td className="p-3 font-semibold">Cycle 0</td>
        <td className="p-3">30-day HSP window</td>
        <td className="p-3"><DateCell start={client.auth_30_start} end={hspDue}/></td>
        <td className="p-3"></td><td className="p-3"></td><td className="p-3"></td><td className="p-3"></td><td className="p-3"></td>
      </tr>
      {sorted.map((c,i)=>{
      const risk=isDeadlineAtRisk(c);
      const passed=isDeadlinePassed(c);
      return <tr key={c.id} className={`border-t ${passed?'bg-slate-100 text-muted-foreground':risk?'bg-red-50':''}`}>
        <td className={`p-3 font-semibold ${risk&&!passed?'text-red-700':''}`}>Cycle {c.cycle_number}</td>
        <td className="p-3">{c.cycle_number<=5?'150-day authorization':'180-day extension'}</td>
        <td className="p-3"><DateCell start={c.cycle_start} end={c.cycle_end}/></td>
        <td className="p-3"><DeadlineCell cycle={c}/></td>
        <td className="p-3"><Select value={c.approval_state ?? 'none'} onValueChange={v=>updateCycle(c.id,{approval_state:v==='none'?null:v as ApprovalState}).then(()=>toast.success('Cycle approval saved.'))}><SelectTrigger className="w-48"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Not decided</SelectItem>{APPROVAL_STATES.map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></td>
        <td className="p-3"><Select value={c.billing_status} onValueChange={v=>updateCycle(c.id,{billing_status:v as BillingCycle['billing_status']}).then(()=>toast.success('Billing status saved.'))}><SelectTrigger className="w-36" data-tour={tour&&i===0?'claim-status':undefined}><SelectValue/></SelectTrigger><SelectContent>{['Not Billed','Ready to Bill','Submitted','Denied'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></td>
        <td className="p-3"><Select value={c.payment_status} onValueChange={v=>updateCycle(c.id,{payment_status:v as BillingCycle['payment_status']}).then(()=>toast.success('Payment status saved.'))}><SelectTrigger className="w-28"><SelectValue/></SelectTrigger><SelectContent>{['Unpaid','Partial','Paid'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></td>
        <td className="p-3"><Editable value={c.claim_number} placeholder="Enter claim number" onSave={v=>updateCycle(c.id,{claim_number:v||null})}/></td>
      </tr>;
    })}</tbody></table></div></div>;
}
