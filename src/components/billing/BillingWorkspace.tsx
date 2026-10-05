import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Check, ChevronLeft, ChevronRight, Pencil, Undo2, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { useBilling, BillingClient, RECOVERY_WINDOW_DAYS } from '@/hooks/useBilling';
import { BillingCycle, isCycleResolved, daysToFinalDeadline, normalizeLevel, findPossibleDuplicates, needsExtensionReview, daysUntil150End, projected180Start, todayAgency } from '@/lib/billing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { ClientProfileDialog } from '@/components/billing/ClientProfileDialog';
import { CloseCaseDialog } from '@/components/CloseCaseDialog';
import { RevenueTab } from '@/components/billing/RevenueTab';
import { ProviderSetup } from '@/components/billing/ProviderSetup';
import { SubmittedClaims } from '@/components/billing/SubmittedClaims';
import { AddTouchpointDialog, type TouchpointContext } from '@/components/AddTouchpointDialog';
import { AvailityPanel } from '@/components/billing/AvailityPanel';
import { ToBillSections } from '@/components/billing/ToBillSections';


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

// Cycles are built from an authorization start date — the initial 30-day one or
// the 150-day one. The level of need only prices them.

// Selected dropdown values get their own colour so the grid is readable at a glance.
const lonClass = (v: string) => (v === 'Low' ? 'border-emerald-300 bg-emerald-100 text-emerald-900' : v === 'High' ? 'border-purple-300 bg-purple-100 text-purple-900' : 'bg-white');


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




// Client names are piped in from the client record. They read as plain text and
// only become an input once pressed, so edits stay deliberate.

// Shows the cycle end date; press to reveal the start date.

const ProfileIconButton = ({ onClick, tour }: { onClick:()=>void; tour?:boolean }) => (
  <Button variant="outline" size="icon" aria-label="View profile" title="View profile" data-tour={tour?'profile-btn':undefined} className="h-7 w-7 shrink-0 rounded-full border-primary/40 text-primary hover:bg-primary/10" onClick={(e)=>{e.stopPropagation();onClick();}}>
    <UserRound className="h-4 w-4" />
  </Button>
);

// ---- Billing tutorial practice data -------------------------------------
// The tutorial never touches real records. While it runs, the workspace shows a
// single practice client with practice cycles, and every change stays in memory.
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


export function BillingWorkspace() {
  const { isSuperadmin } = useIsSuperadmin();

  const { loading, refresh: refreshBilling, clients: realClients, deletedClients: realDeleted, cycles: realCycles, updateClient, deleteClient, restoreClient, updateCycle: updateRealCycle } = useBilling();
  const [section,setSection]=useState<Section>('bill');
  // The client whose Availity boxes are open. Null means the list is showing.
  const [billingClientId,setBillingClientId]=useState<string|null>(null);
  // A row on To bill asking for its claim fields, on a particular cycle.
  const [claimRequest,setClaimRequest]=useState<{clientId:string;cycleId:string}|null>(null);
  const [closing,setClosing]=useState<{id:string;name:string}|null>(null);
  // The agency's own boxes are the same every time, so they start folded away.
  const [agencyOpen,setAgencyOpen]=useState(false);
  // Raised after a cycle is marked billed, to ask about the touchpoint.
  const [billedPrompt,setBilledPrompt]=useState<TouchpointContext|null>(null);
  const [touchpointFor,setTouchpointFor]=useState<TouchpointContext|null>(null);
  const [profileId,setProfileId]=useState<string|null>(null);
  const [practice,setPractice]=useState<{ clients: BillingClient[]; cycles: BillingCycle[] }|null>(null);
  const [practiceRevenueView,setPracticeRevenueView]=useState<'projection'|'recovery'>('projection');
  const [deleteTarget,setDeleteTarget]=useState<BillingClient|null>(null);
  const [duplicate,setDuplicate]=useState<{ row: BillingClient; match: BillingClient }|null>(null);

  // Practice data replaces the live lists while the tutorial is running.
  const clients = practice ? practice.clients : realClients;
  const cycles = practice ? practice.cycles : realCycles;
  const deletedClients = practice ? [] : realDeleted;

  // Practice-only writers. Nothing reaches the database.
  const practiceUpdateClient=async(id:string,patch:Partial<BillingClient>)=>{
    setPractice(p=>p?{...p,clients:p.clients.map(c=>c.id===id?{...c,...patch}:c)}:p);
  };
  const practiceUpdateCycle=async(id:string,patch:Partial<BillingCycle>)=>{
    setPractice(p=>p?{...p,cycles:p.cycles.map(c=>c.id===id?{...c,...patch}:c)}:p);
  };


  const cycleByClient = useMemo(()=>new Map(clients.map(c=>[c.id, cycles.filter(x=>x.client_id===c.id)])),[clients,cycles]);
  const eligible=clients.filter(complete);
  const extensionClients=useMemo(()=>eligible.filter(c=>needsExtensionReview(c)).sort((a,b)=>(daysUntil150End(a)??999)-(daysUntil150End(b)??999)),[eligible]);
  // Clients ready for billing except for the level of need. They can be finished
  // here and move straight into the lists above once the level is saved.
  const lonPending=useMemo(()=>clients.filter(c=>c.status==='active'&&(!!c.auth_30_start||!!c.auth_150_start)&&!normalizeLevel(c.level_of_need)),[clients]);
  // Cycles still waiting to be billed: not approved, not closed, not already
  // filed. A cycle marked billed leaves this list and shows up in Revenue.
  const toBillOf=(c:BillingClient)=>(cycleByClient.get(c.id)??[])
    .filter(x=>!isCycleResolved(x)&&x.billing_status!=='Submitted');

  // Every client with something left to bill, most urgent first. There is one
  // ordering rather than four filters, because the deadline is the only thing
  // that decides what to do next.
  //
  // A client's expired cycles and their live ones are two rows, not one. The
  // row used to take the client's most overdue cycle as its deadline, so one
  // cycle past its window put the whole client under Missed deadlines — and
  // with them a later cycle days from its own deadline, which then appeared in
  // no list of work at all and could expire unseen too.
  const queue=useMemo(()=>eligible
      .filter(c=>toBillOf(c).length>0)
      .flatMap(c=>{
        const open=toBillOf(c);
        const expired=open.filter(x=>daysToFinalDeadline(x)<0);
        const live=open.filter(x=>daysToFinalDeadline(x)>=0);
        return [expired,live].filter(set=>set.length>0).map(set=>{
          const days=Math.min(...set.map(x=>daysToFinalDeadline(x)));
          return { client:c, cycles:set, days, band:bandOf(days) };
        });
      })
      .sort((a,b)=>a.days-b.days),
  [eligible,cycleByClient]);


  // The clients to bill now: their soonest cycle passes its six-month filing
  // deadline within the month, so leaving it loses the money outright.
  //
  // A client whose windows have all closed is not one of them. Nothing can be
  // filed for them, so putting them in a list of work to do only makes the
  // list longer and the real work harder to find. They are listed separately,
  // below, where they can still be seen and dealt with.
  const urgent=useMemo(()=>queue.filter(r=>r.band==='week'||r.band==='month'),[queue]);

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



  const runDuplicateCheck=(id:string)=>{
    const row=clients.find(c=>c.id===id);
    if(!row) return;
    const match=findPossibleDuplicates(row,clients)[0];
    if(match) setDuplicate({ row, match });
  };
  // While the tutorial runs, every writer points at practice data only.
  const clientWriter = practice ? practiceUpdateClient : updateClient;
  const cycleWriter = practice ? practiceUpdateCycle : updateRealCycle;
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




  if (loading) return <Card className="p-8 text-muted-foreground">Loading billing information…</Card>;

  return <div className="space-y-4">


    <ClientProfileDialog clientId={practice?null:profileId} onClose={()=>setProfileId(null)} />

    {closing && <CloseCaseDialog
      open
      onOpenChange={(o)=>{ if(!o) setClosing(null); }}
      clientId={closing.id}
      clientName={closing.name}
      onClosed={()=>{ setClosing(null); refreshBilling(); }}
    />}

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
        <StepButton step={1} label="To bill" active={section==='bill'} onClick={()=>setSection('bill')} tour="section-bill"/>
        <StepButton step={2} label="Filed claims" active={section==='submitted'} onClick={()=>setSection('submitted')} tour="section-submitted"/>
        {isSuperadmin && <StepButton step={3} label="Revenue" active={section==='revenue'} onClick={()=>setSection('revenue')} tour="section-revenue"/>}
      </div>
    </div>


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
        openRequest={claimRequest}
      />

      <ToBillSections
        clients={clients}
        cycles={cycles}
        onOpenClaim={(clientId,cycleId)=>setClaimRequest({clientId,cycleId})}
      />

      {lonPending.length>0 && <LonQueue clients={lonPending} save={saveClient} openProfile={setProfileId}/>}
      {extensionClients.length>0 && <ExtensionQueue clients={extensionClients} save={saveClient} openProfile={setProfileId}/>}
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
    </>
    : null}
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
  return <Card className="overflow-hidden">
    <div className="border-b bg-amber-50 p-4">
      <h3 className="font-semibold text-amber-900">Confirm a 180-day extension ({clients.length})</h3>
      <p className="mt-1 text-sm text-amber-900/80">Confirm the 180-day extension before the 150-day authorization ends, so billing continues without a gap. Select ✓ if it was approved or ✗ if it was not. The 180-day start date is worked out for you.</p>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-100 text-left"><tr>{['Client','150-day end date','Time left','180-day start (calculated)','180-day auth number','Confirm'].map(x=><th key={x} className="p-3 font-semibold">{x}</th>)}</tr></thead>
    <tbody>{clients.map(c=>{
      const days=daysUntil150End(c)??0;
      const start=projected180Start(c.auth_150_start);
      return <tr key={c.id} className="border-t">
        <td className="p-2"><div className="flex items-center gap-2"><ProfileIconButton onClick={()=>openProfile(c.id)}/><b>{c.first_name} {c.last_name}</b></div></td>
        <td className="p-3">{fmt(c.auth_150_end)}</td>
        <td className={`p-3 font-medium ${days<0?'text-red-700':days<=14?'text-amber-700':''}`}>{days<0?`${Math.abs(days)} day${Math.abs(days)===1?'':'s'} past`:days===0?'Ends today':`${days} day${days===1?'':'s'} left`}</td>
        <td className="p-3">{fmt(start)}</td>
        <td className="p-2"><Input className="h-9 w-40 bg-white" placeholder="Enter auth number" value={numbers[c.id] ?? c.auth_180_number ?? ''} onChange={e=>setNumbers(n=>({...n,[c.id]:e.target.value}))}/></td>
        <td className="p-2"><div className="flex items-center gap-2">
          <Button size="icon" className="h-9 w-9 bg-emerald-600 text-white hover:bg-emerald-700" title="Approved" aria-label={`180-day extension approved for ${c.first_name} ${c.last_name}`} onClick={()=>save(c.id,{auth_180_approved:true,auth_180_number:(numbers[c.id] ?? c.auth_180_number ?? '')||null})}><Check className="h-5 w-5"/></Button>
          <Button size="icon" className="h-9 w-9 bg-red-600 text-white hover:bg-red-700" title="Not approved" aria-label={`180-day extension not approved for ${c.first_name} ${c.last_name}`} onClick={()=>save(c.id,{auth_180_approved:false})}><X className="h-5 w-5"/></Button>
        </div></td>
      </tr>;
    })}</tbody></table></div>
  </Card>;
}


// Column filter: the header shows a small caret; the options only appear once it is pressed.



