import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight, HelpCircle, Plus, Search, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { useBilling, BillingClient } from '@/hooks/useBilling';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { BillingCycle, APPROVAL_STATES, ApprovalState, isDeadlineAtRisk, isCycleResolved, finalDeadlineFor, deadlineLabel, hspDueDateFor, DEADLINE_WARNING_DAYS } from '@/lib/billing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientProfileDialog } from '@/components/billing/ClientProfileDialog';
import { BillingTutorial, BillingTutorialStep } from '@/components/billing/BillingTutorial';

const fmt = (d?: string | null) => d ? format(parseISO(d), 'MMM d, yyyy') : '—';
const complete = (c: BillingClient) => c.status === 'active' && c.hsp_submitted && !!c.auth_150_start && ['Low','Low Level','High','High Level'].includes(c.level_of_need ?? '');
const blocker = (c: BillingClient) => !c.first_name || !c.last_name || !c.level_of_need ? 'Missing information' : !c.hsp_submitted ? 'HSP not submitted' : !c.auth_150_start ? 'Waiting for HSP approval' : 'Missing information';

// Needs attention = an ended cycle whose 6-month final submission deadline is
// two weeks or less away (or already passed) and that is not approved or closed.
const attention = (c: BillingCycle) => isDeadlineAtRisk(c);
const matches = (c: BillingClient, q: string) => {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase().includes(t) || (c.member_id ?? '').toLowerCase().includes(t) || (c.insurance ?? '').toLowerCase().includes(t);
};

const Editable = ({ value, type='text', onSave, className='' }: { value: string | null; type?: string; onSave:(v:string)=>void; className?:string }) => {
  const [v,setV]=useState(value ?? '');
  return <Input type={type} value={v} className={`h-9 min-w-32 border-transparent bg-transparent hover:border-input focus:bg-white ${className}`} onChange={e=>setV(e.target.value)} onBlur={()=>v !== (value ?? '') && onSave(v)} />;
};

export function BillingWorkspace() {
  const { user } = useAuth();
  const { loading, clients, cycles, updateClient, addClient, updateCycle } = useBilling();
  const [section,setSection]=useState<'deadlines'|'setup'>('deadlines');
  const [filter,setFilter]=useState<'attention'|'all'>('attention');
  const [stage,setStage]=useState<'setup'|'150'|'180'>('setup');
  const [open,setOpen]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [profileId,setProfileId]=useState<string|null>(null);
  const [tutorial,setTutorial]=useState(false);

  const finishTutorial=async()=>{ if(user) await supabase.from('user_tutorial_progress').upsert({user_id:user.id,current_step:10,completed:true,completed_at:new Date().toISOString()},{onConflict:'user_id'}); setTutorial(false); toast.success('Billing walkthrough completed.'); };

  const cycleByClient = useMemo(()=>new Map(clients.map(c=>[c.id, cycles.filter(x=>x.client_id===c.id)])),[clients,cycles]);
  const eligible=clients.filter(complete), setup=clients.filter(c=>c.status==='active'&&!complete(c));
  const attentionCount=cycles.filter(attention).length;
  const visibleCycles=cycles.filter(c=>filter==='all'||attention(c));
  const visibleClients=eligible.filter(c=>matches(c,query)&&(cycleByClient.get(c.id)??[]).some(x=>visibleCycles.includes(x)));
  const searchResults = query.trim() ? clients.filter(c=>matches(c,query)).slice(0,8) : [];
  const saveClient=(id:string,p:Partial<BillingClient>)=>updateClient(id,p).then(()=>toast.success('Saved. Billing has been updated.')).catch(e=>toast.error(e.message));

  const tutorialSteps: BillingTutorialStep[] = useMemo(()=>[
    { title:'Two views, two jobs', body:'“Current billing deadlines” is the daily work list. “Add or update clients” is where you fill in missing billing information. Press the highlighted button to stay on the deadlines view.', cta:'Open current billing deadlines', selector:'[data-tour="section-deadlines"]', before:()=>{setSection('deadlines');setQuery('');} },
    { title:'Search for a client', body:'Type any name, member ID, or MCO here to jump straight to a client. Results appear underneath and open the client profile.', cta:'Next', selector:'[data-tour="search"]' },
    { title:'Needs attention', body:'This red button shows only cycles that are ready to bill, due within 48 hours, or already past due. It is the shortest list of work you must act on today.', cta:'Show needs attention', selector:'[data-tour="filter-attention"]', before:()=>setFilter('attention') },
    { title:'All clients and cycles', body:'This shows every 30-day cycle for every billable client, including cycles that are far in the future or already submitted. Use it for review, not for daily work.', cta:'Show all clients and cycles', selector:'[data-tour="filter-all"]', before:()=>setFilter('all') },
    { title:'Open a client row', body:'Press a client row to expand every one of their 30-day cycles. Cycles 1–5 cover the 150-day authorization; cycles 6–11 appear when the 180-day extension is approved.', cta:'Expand the first client', selector:'[data-tour="client-row"]', before:()=>{const first=eligible.find(c=>(cycleByClient.get(c.id)??[]).length); if(first) setOpen(first.id);} },
    { title:'Open the client profile card', body:'The profile button on each row opens the full client card over this page. Close it with the X and you return exactly where you were.', cta:'Next', selector:'[data-tour="profile-btn"]' },
    { title:'Update statuses in place', body:'Change billing status, payment status, and claim number directly in the cycle table. Each change saves immediately.', cta:'Next', selector:'[data-tour="cycle-table"]' },
    { title:'Fix missing setup', body:'Switch to “Add or update clients” when a client cannot be billed yet.', cta:'Open add or update clients', selector:'[data-tour="section-setup"]', before:()=>setSection('setup') },
    { title:'Needs set-up is red for a reason', body:'These clients are blocked. Each row states what is missing: information, HSP submission, or HSP approval. Fill it in and cycles are created automatically.', cta:'Show needs set-up', selector:'[data-tour="stage-setup"]', before:()=>{setSection('setup');setStage('setup');} },
    { title:'Add a client row', body:'The green button adds a blank client row you can fill in immediately. That is the whole billing workflow.', cta:'Finish walkthrough', selector:'[data-tour="add-client"]', before:()=>setSection('setup') },
  ],[eligible,cycleByClient]);

  useEffect(()=>{ if(!tutorial) return; document.body.style.overflow='hidden'; return ()=>{document.body.style.overflow='';}; },[tutorial]);

  if (loading) return <Card className="p-8 text-muted-foreground">Loading billing information…</Card>;

  return <div className="space-y-4">
    {tutorial && <BillingTutorial steps={tutorialSteps} onClose={()=>setTutorial(false)} onFinish={finishTutorial} />}
    <ClientProfileDialog clientId={profileId} onClose={()=>setProfileId(null)} />

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex rounded-lg border bg-white p-1">
        <Button data-tour="section-deadlines" variant={section==='deadlines'?'default':'ghost'} onClick={()=>setSection('deadlines')}>Current billing deadlines</Button>
        <Button data-tour="section-setup" variant={section==='setup'?'default':'ghost'} onClick={()=>setSection('setup')}>Add or update clients</Button>
      </div>
      <Button variant="outline" onClick={()=>setTutorial(true)}><HelpCircle className="mr-2 h-4 w-4"/>Show me how billing works</Button>
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
          <span className="flex items-center gap-1 text-xs font-medium text-primary"><UserRound className="h-3.5 w-3.5"/>Open profile</span>
        </button>)}
      </div>}
    </Card>

    {section==='deadlines' ? <>
      <Card className="p-5">
        <h2 className="font-semibold">What am I looking at?</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li><b className="text-red-600">Needs attention</b> — cycles that have already ended, are not yet approved or closed, and whose final submission deadline is {DEADLINE_WARNING_DAYS} days or less away. The final deadline is 6 months after the cycle end date, so these are the claims you can still lose money on.</li>
          <li><b className="text-foreground">All clients and cycles</b> — every 30-day cycle for every billable client, including future cycles and cycles already approved or closed. Use it to review history, not for daily work.</li>
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">Clients with missing information never appear here. They stay in “Add or update clients” until their billing dates can be calculated.</p>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button data-tour="filter-attention" onClick={()=>setFilter('attention')} className={filter==='attention'?'bg-red-600 text-white hover:bg-red-700':'border border-red-300 bg-white text-red-700 hover:bg-red-50'}>Needs attention ({attentionCount})</Button>
        <Button data-tour="filter-all" variant={filter==='all'?'default':'outline'} onClick={()=>setFilter('all')}>All clients and cycles ({cycles.length})</Button>
      </div>
      {visibleClients.length===0 ? <Card className="p-10 text-center"><h3 className="font-semibold">{query.trim()?'No billable clients match that search':'Nothing needs attention right now'}</h3><p className="mt-1 text-sm text-muted-foreground">{query.trim()?'Try a different name or member ID, or clear the search.':'A client appears here when a finished cycle is within two weeks of its final submission deadline.'}</p></Card>
      : <div className="space-y-3">{visibleClients.map((c,i)=>{
        const all=cycleByClient.get(c.id)??[];
        const cc=all.filter(x=>filter==='all'||attention(x));
        const atRisk=all.filter(attention).length;
        const allResolved=all.length>0&&all.every(isCycleResolved);
        return <Card key={c.id} className={`overflow-hidden ${atRisk?'border-red-400':''}`} data-tour={i===0?'client-row':undefined}>
        <div className="flex items-center gap-2 pr-4">
          <button className="flex flex-1 items-center gap-3 p-4 text-left hover:bg-slate-50" onClick={()=>setOpen(open===c.id?null:c.id)}>
            {open===c.id?<ChevronDown/>:<ChevronRight/>}
            <div className="flex-1"><b>{c.first_name} {c.last_name}</b><div className="text-sm text-muted-foreground">{c.level_of_need?.replace(' Level','')} level · {c.auth_180_approved?'180-day extension':'150-day authorization'}</div></div>
            <div className="text-right">
              <b>{cc.length} cycle{cc.length===1?'':'s'}</b>
              <div className={`text-sm ${atRisk?'font-medium text-red-600':allResolved?'font-medium text-green-700':'text-muted-foreground'}`}>{atRisk?`${atRisk} near final deadline`:allResolved?'All cycles approved or closed':'Open to review'}</div>
            </div>
          </button>
          <Button variant="outline" size="sm" data-tour={i===0?'profile-btn':undefined} onClick={()=>setProfileId(c.id)}><UserRound className="mr-2 h-4 w-4"/>Client profile</Button>
        </div>
        {open===c.id&&<CycleGrid client={c} cycles={all} updateCycle={updateCycle} tour={i===0}/>}
      </Card>})}</div>}

    </> : <>
      <Card className="p-5"><h2 className="font-semibold">Add information as you receive it</h2><p className="mt-1 text-sm text-muted-foreground">Needs set-up is separate because these clients do not yet have enough information to calculate billing. Partial information is saved without creating overdue warnings.</p></Card>
      <div className="flex flex-wrap gap-2">
        <Button data-tour="stage-setup" onClick={()=>setStage('setup')} className={stage==='setup'?'bg-red-600 text-white hover:bg-red-700':'border border-red-300 bg-white text-red-700 hover:bg-red-50'}>Needs set-up ({setup.length})</Button>
        <Button variant={stage==='150'?'default':'outline'} onClick={()=>setStage('150')}>150-day authorization ({eligible.filter(c=>!c.auth_180_approved).length})</Button>
        <Button variant={stage==='180'?'default':'outline'} onClick={()=>setStage('180')}>180-day extension ({eligible.filter(c=>c.auth_180_approved).length})</Button>
        <Button data-tour="add-client" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={()=>addClient().then(()=>toast.success('New client row added.')).catch(e=>toast.error(e.message))}><Plus className="mr-2 h-4 w-4"/>Add client row</Button>
      </div>
      <ClientGrid clients={(stage==='setup'?setup:eligible.filter(c=>stage==='180'?c.auth_180_approved:!c.auth_180_approved)).filter(c=>matches(c,query))} save={saveClient} showBlocker={stage==='setup'} openProfile={setProfileId} />
    </>}
  </div>;
}

function ClientGrid({clients,save,showBlocker,openProfile}:{clients:BillingClient[];save:(id:string,p:Partial<BillingClient>)=>void;showBlocker:boolean;openProfile:(id:string)=>void}){
  return <Card className="overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead className="bg-slate-100 text-left"><tr>{['Client','Member ID','MCO','Level of Need','HSP submitted','HSP approval start','180-day extension',showBlocker?'Why not in billing':'Billing stage','Profile'].map(x=><th key={x} className="p-3 font-semibold">{x}</th>)}</tr></thead><tbody>{clients.map(c=><tr key={c.id} className="border-t"><td className="p-2"><div className="flex gap-1"><Editable value={c.first_name} onSave={v=>save(c.id,{first_name:v})}/><Editable value={c.last_name} onSave={v=>save(c.id,{last_name:v})}/></div></td><td className="p-2"><Editable value={c.member_id} onSave={v=>save(c.id,{member_id:v||null})}/></td><td className="p-2"><Editable value={c.insurance} onSave={v=>save(c.id,{insurance:v||null})}/></td><td className="p-2"><Select value={c.level_of_need??''} onValueChange={v=>save(c.id,{level_of_need:v})}><SelectTrigger className="w-36"><SelectValue placeholder="Choose"/></SelectTrigger><SelectContent><SelectItem value="Low">Low</SelectItem><SelectItem value="High">High</SelectItem></SelectContent></Select></td><td className="p-2"><Select value={c.hsp_submitted?'yes':'no'} onValueChange={v=>save(c.id,{hsp_submitted:v==='yes'})}><SelectTrigger className="w-28"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent></Select></td><td className="p-2"><Editable type="date" value={c.auth_150_start} onSave={v=>save(c.id,{auth_150_start:v||null})}/></td><td className="p-2"><Select value={c.auth_180_approved?'yes':'no'} onValueChange={v=>save(c.id,{auth_180_approved:v==='yes'})}><SelectTrigger className="w-28"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Approved</SelectItem></SelectContent></Select></td><td className="p-3"><span className={`rounded-full px-3 py-1 font-medium ${showBlocker?'bg-red-100 text-red-800':'bg-green-100 text-green-900'}`}>{showBlocker?blocker(c):(c.auth_180_approved?'180-day extension':'150-day authorization')}</span></td><td className="p-2"><Button variant="outline" size="sm" onClick={()=>openProfile(c.id)}><UserRound className="mr-2 h-4 w-4"/>Open</Button></td></tr>)}</tbody></table></Card>;
}

function CycleGrid({client,cycles,updateCycle,tour}:{client:BillingClient;cycles:BillingCycle[];updateCycle:(id:string,p:Partial<BillingCycle>)=>Promise<void>;tour?:boolean}){
  const hspDue = client.hsp_due_date ?? hspDueDateFor(client.auth_30_start);
  const allResolved = cycles.length>0 && cycles.every(isCycleResolved);
  return <div className="border-t bg-white p-4" data-tour={tour?'cycle-table':undefined}>
    <div className="mb-3 text-sm"><b>How to read this:</b> the 30-day HSP window comes first and is not billable. Cycles 1–5 are the 150-day authorization. Cycles 6–11 are the 180-day extension. A claim must be submitted within 6 months of a cycle end date — that is the final deadline.</div>
    <div className="mb-3 rounded-md border bg-slate-50 p-3 text-sm">
      <b>30-day HSP window (not billable)</b>
      <div className="text-muted-foreground">{fmt(client.auth_30_start)} – {fmt(hspDue)} · HSP due date: <b className="text-foreground">{fmt(hspDue)}</b> · Auth number: {client.auth_30_number ?? '—'}</div>
      <div className="text-muted-foreground">Billing starts once the HSP is approved{client.auth_150_start?` on ${fmt(client.auth_150_start)}`:''}. Add these dates and numbers from the client profile.</div>
    </div>
    {allResolved && <div className="mb-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-800">Every cycle is approved or closed. Nothing else is outstanding for this client.</div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead><tr className="bg-slate-100">{['Cycle','Authorization','Dates','Final deadline','Approved?','Billing status','Payment status','Claim number'].map(x=><th key={x} className="p-3 text-left">{x}</th>)}</tr></thead><tbody>{cycles.map(c=>{
      const risk=isDeadlineAtRisk(c);
      return <tr key={c.id} className={`border-t ${risk?'bg-red-50':''}`}>
        <td className={`p-3 font-semibold ${risk?'text-red-700':''}`}>Cycle {c.cycle_number}</td>
        <td className="p-3">{c.cycle_number<=5?'150-day authorization':'180-day extension'}</td>
        <td className="p-3">{fmt(c.cycle_start)} – {fmt(c.cycle_end)}</td>
        <td className={`p-3 ${risk?'font-semibold text-red-700':''}`}>{fmt(finalDeadlineFor(c))}<div className="text-xs font-normal text-muted-foreground">{deadlineLabel(c)}</div></td>
        <td className="p-3"><Select value={c.approval_state ?? 'none'} onValueChange={v=>updateCycle(c.id,{approval_state:v==='none'?null:v as ApprovalState}).then(()=>toast.success('Cycle approval saved.'))}><SelectTrigger className="w-48"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Not decided</SelectItem>{APPROVAL_STATES.map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></td>
        <td className="p-3"><Select value={c.billing_status} onValueChange={v=>updateCycle(c.id,{billing_status:v as BillingCycle['billing_status']}).then(()=>toast.success('Billing status saved.'))}><SelectTrigger className="w-36"><SelectValue/></SelectTrigger><SelectContent>{['Not Billed','Ready to Bill','Submitted','Denied'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></td>
        <td className="p-3"><Select value={c.payment_status} onValueChange={v=>updateCycle(c.id,{payment_status:v as BillingCycle['payment_status']}).then(()=>toast.success('Payment status saved.'))}><SelectTrigger className="w-28"><SelectValue/></SelectTrigger><SelectContent>{['Unpaid','Partial','Paid'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></td>
        <td className="p-3"><Editable value={c.claim_number} onSave={v=>updateCycle(c.id,{claim_number:v||null})}/></td>
      </tr>;
    })}</tbody></table></div></div>;
}

