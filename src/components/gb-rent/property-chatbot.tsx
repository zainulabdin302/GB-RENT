'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useView } from '@/stores/view-store';
import type { ChatFilters, ChatReply } from '@/lib/property-chat';
type Message={id:number;role:'user'|'assistant';text:string;reply?:ChatReply};
const greeting:Message={id:0,role:'assistant',text:'Hi! I can find properties and compare asking rents using GB RENT listings. Tell me your district, property type and budget.'};
export function PropertyChatbot(){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[messages,setMessages]=useState<Message[]>([greeting]);
 const [filters,setFilters]=useState<ChatFilters>({}),[busy,setBusy]=useState(false);
 const [floatingPosition,setFloatingPosition]=useState<{left:number;top:number}|null>(null);
 const dragStart=useRef<{pointerX:number;pointerY:number;left:number;top:number}|null>(null);
 const dragged=useRef(false);
 const current=useView(s=>s.current),go=useView(s=>s.go);
 const listRef=useRef<HTMLDivElement>(null),inputRef=useRef<HTMLInputElement>(null),buttonRef=useRef<HTMLButtonElement>(null);
 const inflight=useRef(false),controller=useRef<AbortController|null>(null),sequence=useRef(0);
 useEffect(()=>{if(open){listRef.current?.scrollTo({top:listRef.current.scrollHeight});if(!busy)inputRef.current?.focus();}},[messages,open,busy]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{try{const saved=localStorage.getItem('gb-rent-assistant-position');if(saved){const p=JSON.parse(saved);if(Number.isFinite(p.left)&&Number.isFinite(p.top))setFloatingPosition({left:p.left,top:p.top});}}catch{}},[]);
 useEffect(()=>{if(floatingPosition)try{localStorage.setItem('gb-rent-assistant-position',JSON.stringify(floatingPosition));}catch{}},[floatingPosition]);
 function startDrag(e:React.PointerEvent<HTMLButtonElement>){if(e.button!==0)return;const r=e.currentTarget.getBoundingClientRect();dragStart.current={pointerX:e.clientX,pointerY:e.clientY,left:r.left,top:r.top};dragged.current=false;e.currentTarget.setPointerCapture(e.pointerId);}
 function moveDrag(e:React.PointerEvent<HTMLButtonElement>){const start=dragStart.current;if(!start)return;const dx=e.clientX-start.pointerX,dy=e.clientY-start.pointerY;if(Math.abs(dx)>4||Math.abs(dy)>4)dragged.current=true;if(!dragged.current)return;const left=Math.max(8,Math.min(window.innerWidth-e.currentTarget.offsetWidth-8,start.left+dx));const top=Math.max(8,Math.min(window.innerHeight-e.currentTarget.offsetHeight-8,start.top+dy));setFloatingPosition({left,top});}
 function endDrag(e:React.PointerEvent<HTMLButtonElement>){dragStart.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
 function close(){setOpen(false);buttonRef.current?.focus();}
 async function send(text:string,propertyId?:string){
  if(!text.trim()||inflight.current)return;
  inflight.current=true;setBusy(true);setDraft('');
  setMessages(m=>[...m,{id:++sequence.current,role:'user',text:text.trim()}]);
  const abort=new AbortController();controller.current=abort;
  const timer=setTimeout(()=>abort.abort(),15000);
  try{
   const res=await fetch('/api/chatbot',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({message:text.trim(),filters,propertyId:propertyId||(current.name==='detail'?current.propertyId:undefined)})});
   const data=await res.json();if(!res.ok)throw new Error(data.error||'Request failed');
   setFilters(data.filters);
   setMessages(m=>[...m,{id:++sequence.current,role:'assistant',text:data.message,reply:data}]);
  }catch(e){setMessages(m=>[...m,{id:++sequence.current,role:'assistant',text:e instanceof Error&&e.name!=='AbortError'?e.message:'The search timed out. Please try again.'}]);}
  finally{clearTimeout(timer);inflight.current=false;setBusy(false);controller.current=null;}
 }
 return <>
  {!open&&<Button ref={buttonRef} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={()=>{if(dragged.current){dragged.current=false;return;}setOpen(true);}} style={floatingPosition?{left:floatingPosition.left,top:floatingPosition.top,right:"auto",bottom:"auto",touchAction:"none"}:{touchAction:"none"}} className={`fixed z-50 gap-2 rounded-full shadow-lg ${floatingPosition?"":"bottom-6 right-4"}`} aria-expanded={false} aria-controls="property-assistant" aria-label="Drag to move property assistant, or tap to open"><MessageCircle className="size-5"/>Property assistant</Button>}
  {open&&<section id="property-assistant" role="dialog" aria-modal="false" aria-label="Property assistant" onKeyDown={e=>{if(e.key==='Escape')close();}} className="fixed bottom-3 right-3 z-50 flex h-[min(620px,85dvh)] w-[min(390px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border bg-background text-foreground shadow-2xl">
   <header className="flex items-center justify-between border-b bg-primary/5 p-3"><div><h2 className="font-semibold">Property assistant</h2><p className="text-xs text-muted-foreground">Find rentals · Compare asking rents</p></div><div className="flex"><Button variant="ghost" size="icon" aria-label="Clear chat and filters" disabled={busy} onClick={()=>{setMessages([greeting]);setFilters({});setDraft('');}}><RotateCcw className="size-4"/></Button><Button variant="ghost" size="icon" aria-label="Close assistant" onClick={close}><X className="size-4"/></Button></div></header>
   <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" role="log" aria-live="polite">
    {messages.map(m=><div key={m.id} className={m.role==='user'?'ml-8 rounded-xl bg-primary p-3 text-sm text-primary-foreground':'mr-2 rounded-xl bg-muted/60 p-3 text-sm'}>
      <p className="whitespace-pre-wrap break-words">{m.text}</p>
      {m.reply?.properties.map(p=><article key={p.id} className="mt-3 rounded-lg border bg-background p-2 text-foreground">
       <div className="flex gap-2">{p.image&&<img src={p.image} alt="" className="size-14 rounded-md object-cover"/>}<div><p className="font-medium">{p.title}</p><p className="text-xs text-muted-foreground">{p.area}, {p.cityZone} · {p.rooms} rooms</p><p className="font-semibold">PKR {p.price.toLocaleString()}/mo</p></div></div>
       <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={()=>{go({name:'detail',propertyId:p.id});close();}}>View property</Button><Button size="sm" variant="secondary" disabled={busy} onClick={()=>send('Compare the rent for this property',p.id)}>Compare rent</Button></div>
      </article>)}
      {m.reply?.estimate?.available&&<div className="mt-3 border-t pt-2"><p className="font-medium">Evidence: {m.reply.estimate.evidence}</p><p className="mt-1 text-xs">Listings used:</p>{m.reply.estimate.comparables.map(p=><button key={p.id} className="mt-1 block text-left text-xs underline underline-offset-2" onClick={()=>{go({name:'detail',propertyId:p.id});close();}}>{p.title} · {p.area} · PKR {p.price.toLocaleString()}</button>)}</div>}
    </div>)}
    {busy&&<p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin"/>Checking listings…</p>}
   </div>
   <div className="flex flex-wrap gap-1 border-t px-3 pt-2">{['Houses in Gilgit under 25k','Rooms in Hunza','Is this rent fair?'].map(t=><button key={t} disabled={busy} onClick={()=>send(t)} className="rounded-full border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">{t}</button>)}</div>
   <form className="flex gap-2 p-3" onSubmit={e=>{e.preventDefault();void send(draft);}}><input ref={inputRef} aria-label="Ask about a property" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={1000} placeholder="Find a house in Gilgit…" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"/><Button type="submit" size="icon" disabled={busy||!draft.trim()} aria-label="Send message"><Send className="size-4"/></Button></form>
   <p className="px-3 pb-2 text-[10px] text-muted-foreground">Uses approved listings. Asking-rent comparisons are not verified valuations.</p>
  </section>}
 </>;
}
