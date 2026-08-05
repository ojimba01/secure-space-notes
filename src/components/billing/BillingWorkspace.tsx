import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight, HelpCircle, Plus, Search, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { useBilling, BillingClient } from '@/hooks/useBilling';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { BillingCycle, APPROVAL_STATES, ApprovalState, isDeadlineAtRisk, isDeadlinePassed, isCycleResolved, finalDeadlineFor, deadlineLabel, hspDueDateFor } from '@/lib/billing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { InfoHint } from '@/components/InfoHint';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientProfileDialog } from '@/components/billing/ClientProfileDialog';
import { BillingTutorial, BillingTutorialStep } from '@/components/billing/BillingTutorial';

const fmt = (d?: string | null) => d ? format(parseISO(d), 'MMM d, yyyy') : '—';
const complete = (c: BillingClient) => c.status === 'active' && c.hsp_submitted && !!c.auth_150_start && ['Low','Low Level','High','High Level'].includes(c.level_of_need ?? '');
const blocker = (c: BillingClient) => !c.first_name || !c.last_name || !c.level_of_need ? 'Missing information' : !c.hsp_submitted ? 'HSP not submitted' : !c.auth_150_start ? 'Waiting for HSP approval' : 'Missing information';
const blockerClass = (label: string) => label === 'HSP not submitted' ? 'bg-amber-100 text-amber-900'
  : label === 'Waiting for HSP approval' ? 'bg-sky-100 text-sky-900'
  : 'bg-red-100 text-red-800';

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
  return <Input type={type} value={v} placeholder={placeholder} className={`h-9 min-w-32 border-input bg-white shadow-sm focus:ring-2 focus:ring-ring ${className}`} onChange={e=>setV(e.target.value)} onBlur={()=>v !== (value ?? '') && onSave(v)} />;
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
  const { loading, clients, cycles, updateClient, addClient, updateCycle } = useBilling();
  const [section,setSection]=useState<'deadlines'|'setup'>('deadlines');
  const [filter,setFilter]=useState<'attention'|'all'>('attention');
  const [stage,setStage]=useState<'setup'|'150'|'180'>('setup');
  const [open,setOpen]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [profileId,setProfileId]=useState<string|null>(null);
  const [tutorial,setTutorial]=useState(false);

  const finishTutorial=async()=>{ if(user) await supabase.from('user_tutorial_progress').upsert({user_id:user.id,current_step:10,completed:true,completed_at:new Date().toISOString()},{onConflict:'user_id'}); setTutorial(false); toast.success('Billing tutorial completed.'); };

  const cycleByClient = useMemo(()=>new Map(clients.map(c=>[c.id, cycles.filter(x=>x.client_id===c.id)])),[clients,cycles]);
  const eligible=clients.filter(complete), setup=clients.filter(c=>c.status==='active'&&!complete(c));
  const attentionCount=cycles.filter(attention).length;
  const visibleCycles=cycles.filter(c=>filter==='all'||attention(c));
  const visibleClients=eligible.filter(c=>matches(c,query)&&(cycleByClient.get(c.id)??[]).some(x=>visibleCycles.includes(x)));
  const searchResults = query.trim() ? clients.filter(c=>matches(c,query)).slice(0,8) : [];
  const saveClient=(id:string,p:Partial<BillingClient>)=>updateClient(id,p).then(()=>toast.success('Saved. Billing has been updated.')).catch(e=>toast.error(e.message));

  const tutorialSteps: BillingTutorialStep[] = useMemo(()=>[
    { title:'Understand the two Billing sections', body:'Billing has two main sections. Current billing deadlines shows the billing work that needs your attention. Add or set up client billing is where you enter or correct the information used to create billing cycles.', cta:'Press Current billing deadlines to continue.', selector:'[data-tour="section-deadlines"]', requireClick:true, before:()=>{setSection('deadlines');setQuery('');} },
    { title:'Find a client', body:'Use the search box to find a specific client. You can search using the client’s name, member ID, or MCO. Only matching clients will appear below the search box.\n\nPress the search box and enter a client’s name, then press Continue.', cta:'Continue', selector:'[data-tour="search"]' },
    { title:'Review Needs attention', body:'Needs attention shows clients with billing work that requires action. It includes clients whose 30-day cycle end dates are now four weeks away from the final deadline for submitting claims from the full authorization period.\n\nThe number in parentheses shows how many clients currently need attention.', cta:'Press Needs attention to continue.', selector:'[data-tour="filter-attention"]', requireClick:true, before:()=>{setSection('deadlines');setQuery('');} },
    { title:'View all clients and billing cycles', body:'All clients and cycles shows every billing cycle in the system. This includes completed cycles, current cycles, and future cycles.', cta:'Press All clients and cycles to continue.', selector:'[data-tour="filter-all"]', requireClick:true },
    { title:'Open a client’s billing cycles', body:'Press a client’s row to see all of that client’s 30-day billing cycles.\n\nThe first five cycles belong to the client’s 150-day authorization. Claims from these cycles may be submitted until the final day of the full 150-day authorization period.\n\nIf a 180-day extension is approved, six additional 30-day cycles will appear.', cta:'Press the highlighted client row to continue.', selector:'[data-tour="client-row"]', requireClick:true, before:()=>{setFilter('all');setOpen(null);} },
    { title:'Open the client profile', body:'The client profile contains additional information about the client.', cta:'Press View profile to continue.', selector:'[data-tour="profile-btn"]', requireClick:true },
    { title:'Update a billing cycle', body:'Use the billing-cycle table to record the claim status, payment status, and claim number.\n\nUpdate the claim status when a claim is submitted. Add the claim number when one is available. Update the payment status when the claim is paid or denied. Your changes save automatically.', cta:'Press the highlighted claim-status field, then select Submitted to continue.', selector:'[data-tour="claim-status"]', requireClick:true, before:()=>{const first=eligible.find(c=>(cycleByClient.get(c.id)??[]).length); if(first) setOpen(first.id);} },
    { title:'Open Add or set up client billing', body:'Use Add or set up client billing to add a client or correct information used to create billing cycles.\n\nYou can save a client even when some information is not available. The client will not appear under Current billing deadlines until all required billing information has been entered.', cta:'Press Add or set up client billing to continue.', selector:'[data-tour="section-setup"]', requireClick:true },
    { title:'Review clients who need setup', body:'Needs set-up includes clients whose billing cycles cannot be created yet. Each row explains what information or action is still needed.\n\nA client may appear here because required client information is missing, the HSP has not been submitted, the HSP was submitted but the approval date has not been entered, or the client’s level of need has not been entered.\n\nThese clients are saved in the system but do not appear under Current billing deadlines. Once the required information is entered, the system creates their billing cycles automatically.', cta:'Press Needs set-up to continue.', selector:'[data-tour="stage-setup"]', requireClick:true, before:()=>{setSection('setup');} },
    { title:'Add a client', body:'Use Add client row to create a blank row. Enter the information you currently have. You can save the client even if some information is still missing.\n\nWhen the HSP approval start date and level of need are entered, the system creates the client’s 150-day authorization and five 30-day billing cycles. If a 180-day extension is approved later, the system adds six more billing cycles.', cta:'Press Add client row to complete the tutorial.', selector:'[data-tour="add-client"]', requireClick:true, before:()=>{setSection('setup');setStage('setup');} },
  ],[eligible,cycleByClient]);

  useEffect(()=>{ if(!tutorial) return; document.body.style.overflow='hidden'; return ()=>{document.body.style.overflow='';}; },[tutorial]);

  if (loading) return <Card className="p-8 text-muted-foreground">Loading billing information…</Card>;

  return <div className="space-y-4">
    {tutorial && <BillingTutorial steps={tutorialSteps} onClose={()=>setTutorial(false)} onFinish={finishTutorial} />}
    <ClientProfileDialog clientId={profileId} onClose={()=>setProfileId(null)} />

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex rounded-lg border bg-white p-1">
        <Button data-tour="section-deadlines" variant={section==='deadlines'?'default':'ghost'} onClick={()=>setSection('deadlines')}>Current billing deadlines</Button>
        <Button data-tour="section-setup" variant={section==='setup'?'default':'ghost'} onClick={()=>setSection('setup')}>Add or set up client billing</Button>
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
        <Button data-tour="filter-attention" onClick={()=>setFilter('attention')} className={filter==='attention'?'bg-red-600 text-white hover:bg-red-700':'border border-red-300 bg-white text-red-700 hover:bg-red-50'}>Needs attention ({attentionCount})</Button>
        <Button data-tour="filter-all" variant={filter==='all'?'default':'outline'} onClick={()=>setFilter('all')}>All clients and cycles ({cycles.length})</Button>
      </div>
      {visibleClients.length===0 ? <Card className="p-10 text-center"><h3 className="font-semibold">{query.trim()?'No billable clients match that search':'Nothing needs attention right now'}</h3><p className="mt-1 text-sm text-muted-foreground">{query.trim()?'Try a different name or member ID, or clear the search.':'A client appears here when a finished cycle is within four weeks of its final submission deadline.'}</p></Card>
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
              <div className="text-sm text-muted-foreground">{c.level_of_need?.replace(' Level','')} level · {c.auth_180_approved?'180-day extension':'150-day authorization'}</div>
            </div>
            <div className="text-right">
              <b>{cc.length} cycle{cc.length===1?'':'s'}</b>
              <div className={`text-sm ${atRisk?'font-medium text-red-600':allResolved?'font-medium text-green-700':'text-muted-foreground'}`}>{atRisk?`${atRisk} near final deadline`:allResolved?'All cycles approved or closed':'Open to review'}</div>
            </div>
          </button>
          <ProfileIconButton onClick={()=>setProfileId(c.id)} tour={i===0}/>
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
  return <Card className="overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead className="bg-slate-100 text-left"><tr>{['Client','Member ID','MCO','Level of Need','HSP submitted','HSP approval start','180-day extension',showBlocker?'Why not in billing':'Billing stage'].map(x=><th key={x} className="p-3 font-semibold">{x}</th>)}</tr></thead><tbody>{clients.map(c=><tr key={c.id} className="border-t"><td className="p-2"><div className="flex items-center gap-1"><ProfileIconButton onClick={()=>openProfile(c.id)}/><Editable value={c.first_name} onSave={v=>save(c.id,{first_name:v})}/><Editable value={c.last_name} onSave={v=>save(c.id,{last_name:v})}/></div></td><td className="p-2"><Editable value={c.member_id} onSave={v=>save(c.id,{member_id:v||null})}/></td><td className="p-2"><Editable value={c.insurance} onSave={v=>save(c.id,{insurance:v||null})}/></td><td className="p-2"><Select value={c.level_of_need??''} onValueChange={v=>save(c.id,{level_of_need:v})}><SelectTrigger className="w-36"><SelectValue placeholder="Choose"/></SelectTrigger><SelectContent><SelectItem value="Low">Low</SelectItem><SelectItem value="High">High</SelectItem></SelectContent></Select></td><td className="p-2"><Select value={c.hsp_submitted?'yes':'no'} onValueChange={v=>save(c.id,{hsp_submitted:v==='yes'})}><SelectTrigger className="w-28"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent></Select></td><td className="p-2"><Editable type="date" value={c.auth_150_start} onSave={v=>save(c.id,{auth_150_start:v||null})}/></td><td className="p-2"><Select value={c.auth_180_approved?'yes':'no'} onValueChange={v=>save(c.id,{auth_180_approved:v==='yes'})}><SelectTrigger className="w-28"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Approved</SelectItem></SelectContent></Select></td><td className="p-3">{showBlocker?<span className={`rounded-full px-3 py-1 font-medium ${blockerClass(blocker(c))}`}>{blocker(c)}</span>:<span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-900">{c.auth_180_approved?'180-day extension':'150-day authorization'}</span>}</td></tr>)}</tbody></table></Card>;
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
  return <div className="border-t bg-white p-4" data-tour={tour?'cycle-table':undefined}>
    {allResolved && <div className="mb-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-800">Every cycle is approved or closed. Nothing else is outstanding for this client.</div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="bg-slate-100">{['Cycle','Authorization','End date','Final deadline','Approved?','Billing status','Payment status','Claim number'].map(x=><th key={x} className="p-3 text-left">{x}</th>)}</tr></thead><tbody>
      <tr className="border-t bg-slate-50/60 text-muted-foreground">
        <td className="p-3 font-semibold">Cycle 0</td>
        <td className="p-3">30-day HSP window</td>
        <td className="p-3"><DateCell start={client.auth_30_start} end={hspDue}/></td>
        <td className="p-3"></td><td className="p-3"></td><td className="p-3"></td><td className="p-3"></td><td className="p-3"></td>
      </tr>
      {cycles.map((c,i)=>{
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
