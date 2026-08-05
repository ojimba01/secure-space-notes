import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight, HelpCircle, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useBilling, BillingClient } from '@/hooks/useBilling';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { BillingCycle } from '@/lib/billing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const fmt = (d?: string | null) => d ? format(parseISO(d), 'MMM d, yyyy') : '—';
const complete = (c: BillingClient) => c.status === 'active' && c.hsp_submitted && !!c.auth_150_start && ['Low','Low Level','High','High Level'].includes(c.level_of_need ?? '');
const blocker = (c: BillingClient) => !c.first_name || !c.last_name || !c.level_of_need ? 'Missing information' : !c.hsp_submitted ? 'HSP not submitted' : !c.auth_150_start ? 'Waiting for HSP approval' : 'Missing information';
const in48 = (d: string) => differenceInCalendarDays(parseISO(d), new Date()) <= 2;
const attention = (c: BillingCycle) => c.billing_status === 'Ready to Bill' || (c.billing_status !== 'Submitted' && in48(c.cycle_end));

const Editable = ({ value, type='text', onSave, className='' }: { value: string | null; type?: string; onSave:(v:string)=>void; className?:string }) => {
  const [v,setV]=useState(value ?? '');
  return <Input type={type} value={v} className={`h-9 min-w-32 border-transparent bg-transparent hover:border-input focus:bg-white ${className}`} onChange={e=>setV(e.target.value)} onBlur={()=>v !== (value ?? '') && onSave(v)} />;
};

function Tutorial({ close, finish }: { close:()=>void; finish:()=>void }) {
  const steps = [
    ['Start with Current Billing deadlines','This page shows only work that is due soon, overdue, or ready to bill. Clients with missing setup information do not appear here.'],
    ['Open a client','Press the highlighted client row. You will see all of that client’s 30-day cycles without opening a separate spreadsheet.'],
    ['Understand the 150-day authorization','The first five cycles are 30 days each. Together, they cover the 150-day authorization.'],
    ['Understand the 180-day extension','When an extension is approved, six more 30-day cycles appear. They continue directly after Cycle 5.'],
    ['Update client setup','Open Add or update clients. Needs Setup contains only clients whose billing dates cannot be calculated yet.'],
    ['Read the reason','Each incomplete row says what is blocking billing: missing information, HSP not submitted, or waiting for HSP approval.'],
    ['Save partial information','You can enter what you know now. The client stays out of deadlines until all required billing information is present.'],
    ['Finish setup','Mark HSP submitted, choose the Level of Need, and add the HSP approval start date. Five cycles are then created automatically.'],
    ['Record the extension','Turn on the 180-day extension only after it is approved. Six more cycles are created automatically.'],
    ['You are ready','Use Current Billing deadlines for daily work and Add or update clients when new information arrives. Tutorial practice never changes a real client.'],
  ];
  const actions = ['Open the practice client','Show the practice cycles','Highlight Cycles 1–5','Add the practice extension','Open practice setup','Show Denise’s reason','Save a practice phone number','Complete the practice setup','Approve the practice extension','Finish tutorial'];
  const [n,setN]=useState(0);
  return <div className="fixed inset-0 z-50 bg-slate-950/55 grid place-items-center p-4"><Card className="w-full max-w-xl p-6 shadow-2xl"><div className="flex justify-between"><span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800">Practice tutorial · {n+1} of {steps.length}</span><Button variant="ghost" size="icon" onClick={close}><X className="h-4 w-4" /></Button></div><h2 className="mt-5 text-xl font-bold">{steps[n][0]}</h2><p className="mt-3 text-base leading-7 text-slate-600">{steps[n][1]}</p><div className="mt-5 rounded-lg border-2 border-blue-500 bg-blue-50 p-4"><p className="mb-3 text-sm text-blue-900">Practice mode uses sample information. Press this button to try the action. It will not change a real client.</p><Button className="w-full" onClick={()=>n===steps.length-1?finish():setN(n+1)}>{actions[n]}</Button></div><div className="mt-5 flex justify-between"><Button variant="outline" disabled={!n} onClick={()=>setN(n-1)}>Back</Button><Button variant="ghost" onClick={close}>Exit practice</Button></div></Card></div>;
}

export function BillingWorkspace() {
  const { user } = useAuth();
  const { loading, clients, cycles, updateClient, addClient, updateCycle } = useBilling();
  const [section,setSection]=useState<'deadlines'|'setup'>('deadlines');
  const [filter,setFilter]=useState<'attention'|'all'>('attention');
  const [stage,setStage]=useState<'setup'|'150'|'180'>('setup');
  const [open,setOpen]=useState<string|null>(null);
  const [tutorial,setTutorial]=useState(false);
  const finishTutorial=async()=>{ if(user) await supabase.from('user_tutorial_progress').upsert({user_id:user.id,current_step:10,completed:true,completed_at:new Date().toISOString()},{onConflict:'user_id'}); setTutorial(false); toast.success('Billing tutorial completed.'); };
  const cycleByClient = useMemo(()=>new Map(clients.map(c=>[c.id, cycles.filter(x=>x.client_id===c.id)])),[clients,cycles]);
  const eligible=clients.filter(complete), setup=clients.filter(c=>c.status==='active'&&!complete(c));
  const visibleCycles=cycles.filter(c=>filter==='all'||attention(c));
  const visibleClients=eligible.filter(c=>(cycleByClient.get(c.id)??[]).some(x=>visibleCycles.includes(x)));
  const saveClient=(id:string,p:Partial<BillingClient>)=>updateClient(id,p).then(()=>toast.success('Saved. Billing has been updated.')).catch(e=>toast.error(e.message));
  if (loading) return <Card className="p-8 text-muted-foreground">Loading billing information…</Card>;
  return <div className="space-y-4">
    {tutorial && <Tutorial close={()=>setTutorial(false)} finish={finishTutorial} />}
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-lg border bg-white p-1"><Button variant={section==='deadlines'?'default':'ghost'} onClick={()=>setSection('deadlines')}>Current Billing deadlines</Button><Button variant={section==='setup'?'default':'ghost'} onClick={()=>setSection('setup')}>Add or update clients</Button></div><Button variant="outline" onClick={()=>setTutorial(true)}><HelpCircle className="mr-2 h-4 w-4"/>Show me how Billing works</Button></div>
    {section==='deadlines' ? <>
      <Card className="p-5"><h2 className="font-semibold">Start here</h2><p className="mt-1 text-sm text-muted-foreground">Open the first client below and complete the action shown. Clients with missing information are kept in Add or update clients until their billing dates can be calculated.</p></Card>
      <div className="flex gap-2"><Button variant={filter==='attention'?'default':'outline'} onClick={()=>setFilter('attention')}>Needs Attention ({cycles.filter(attention).length})</Button><Button variant={filter==='all'?'default':'outline'} onClick={()=>setFilter('all')}>All clients and cycles</Button></div>
      {visibleClients.length===0 ? <Card className="p-10 text-center"><h3 className="font-semibold">Nothing needs attention right now</h3><p className="mt-1 text-sm text-muted-foreground">Billing will place a client here when a cycle is due soon or ready to submit.</p></Card> : <div className="space-y-3">{visibleClients.map(c=>{const cc=(cycleByClient.get(c.id)??[]).filter(x=>filter==='all'||attention(x));return <Card key={c.id} className="overflow-hidden"><button className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50" onClick={()=>setOpen(open===c.id?null:c.id)}>{open===c.id?<ChevronDown/>:<ChevronRight/>}<div className="flex-1"><b>{c.first_name} {c.last_name}</b><div className="text-sm text-muted-foreground">{c.level_of_need?.replace(' Level','')} level · {c.auth_180_approved?'180-day extension':'150-day authorization'}</div></div><div className="text-right"><b>{cc.length} cycle{cc.length===1?'':'s'}</b><div className="text-sm text-muted-foreground">Open to review</div></div></button>{open===c.id&&<CycleGrid cycles={cycleByClient.get(c.id)??[]} updateCycle={updateCycle}/>}</Card>})}</div>}
    </> : <>
      <Card className="p-5"><h2 className="font-semibold">Add information as you receive it</h2><p className="mt-1 text-sm text-muted-foreground">Needs Setup is separate because these clients do not yet have enough information to calculate billing. Partial information is saved without creating overdue warnings.</p></Card>
      <div className="flex flex-wrap gap-2"><Button variant={stage==='setup'?'default':'outline'} onClick={()=>setStage('setup')}>Needs Setup ({setup.length})</Button><Button variant={stage==='150'?'default':'outline'} onClick={()=>setStage('150')}>150-Day Authorization ({eligible.filter(c=>!c.auth_180_approved).length})</Button><Button variant={stage==='180'?'default':'outline'} onClick={()=>setStage('180')}>180-Day Extension ({eligible.filter(c=>c.auth_180_approved).length})</Button></div>
      <ClientGrid clients={stage==='setup'?setup:eligible.filter(c=>stage==='180'?c.auth_180_approved:!c.auth_180_approved)} save={saveClient} showBlocker={stage==='setup'} />
      <Button variant="outline" onClick={()=>addClient().then(()=>toast.success('New client row added.')).catch(e=>toast.error(e.message))}><Plus className="mr-2 h-4 w-4"/>Add client row</Button>
    </>}
  </div>;
}

function ClientGrid({clients,save,showBlocker}:{clients:BillingClient[];save:(id:string,p:Partial<BillingClient>)=>void;showBlocker:boolean}){
  return <Card className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-slate-100 text-left"><tr>{['Client','Member ID','MCO','Level of Need','HSP submitted','HSP approval start','180-day extension',showBlocker?'Why not in Billing':'Billing stage'].map(x=><th key={x} className="p-3 font-semibold">{x}</th>)}</tr></thead><tbody>{clients.map(c=><tr key={c.id} className="border-t"><td className="p-2"><div className="flex gap-1"><Editable value={c.first_name} onSave={v=>save(c.id,{first_name:v})}/><Editable value={c.last_name} onSave={v=>save(c.id,{last_name:v})}/></div></td><td className="p-2"><Editable value={c.member_id} onSave={v=>save(c.id,{member_id:v||null})}/></td><td className="p-2"><Editable value={c.insurance} onSave={v=>save(c.id,{insurance:v||null})}/></td><td className="p-2"><Select value={c.level_of_need??''} onValueChange={v=>save(c.id,{level_of_need:v})}><SelectTrigger className="w-36"><SelectValue placeholder="Choose"/></SelectTrigger><SelectContent><SelectItem value="Low">Low</SelectItem><SelectItem value="High">High</SelectItem></SelectContent></Select></td><td className="p-2"><Select value={c.hsp_submitted?'yes':'no'} onValueChange={v=>save(c.id,{hsp_submitted:v==='yes'})}><SelectTrigger className="w-28"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent></Select></td><td className="p-2"><Editable type="date" value={c.auth_150_start} onSave={v=>save(c.id,{auth_150_start:v||null})}/></td><td className="p-2"><Select value={c.auth_180_approved?'yes':'no'} onValueChange={v=>save(c.id,{auth_180_approved:v==='yes'})}><SelectTrigger className="w-28"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Approved</SelectItem></SelectContent></Select></td><td className="p-3"><span className={`rounded-full px-3 py-1 font-medium ${showBlocker?'bg-amber-100 text-amber-900':'bg-green-100 text-green-900'}`}>{showBlocker?blocker(c):(c.auth_180_approved?'180-Day Extension':'150-Day Authorization')}</span></td></tr>)}</tbody></table></Card>;
}

function CycleGrid({cycles,updateCycle}:{cycles:BillingCycle[];updateCycle:(id:string,p:Partial<BillingCycle>)=>Promise<void>}){
  return <div className="border-t bg-white p-4"><div className="mb-3 text-sm"><b>How to read this:</b> Cycles 1–5 are the 150-day authorization. Cycles 6–11 are the 180-day extension.</div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="bg-slate-100">{['Cycle','Authorization','Dates','Billing status','Payment status','Claim number'].map(x=><th key={x} className="p-3 text-left">{x}</th>)}</tr></thead><tbody>{cycles.map(c=><tr key={c.id} className="border-t"><td className="p-3 font-semibold">Cycle {c.cycle_number}</td><td className="p-3">{c.cycle_number<=5?'150-day authorization':'180-day extension'}</td><td className="p-3">{fmt(c.cycle_start)} – {fmt(c.cycle_end)}</td><td className="p-3"><Select value={c.billing_status} onValueChange={v=>updateCycle(c.id,{billing_status:v as BillingCycle['billing_status']}).then(()=>toast.success('Billing status saved.'))}><SelectTrigger className="w-36"><SelectValue/></SelectTrigger><SelectContent>{['Not Billed','Ready to Bill','Submitted','Denied'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></td><td className="p-3"><Select value={c.payment_status} onValueChange={v=>updateCycle(c.id,{payment_status:v as BillingCycle['payment_status']}).then(()=>toast.success('Payment status saved.'))}><SelectTrigger className="w-28"><SelectValue/></SelectTrigger><SelectContent>{['Unpaid','Partial','Paid'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></td><td className="p-3"><Editable value={c.claim_number} onSave={v=>updateCycle(c.id,{claim_number:v||null})}/></td></tr>)}</tbody></table></div></div>;
}
