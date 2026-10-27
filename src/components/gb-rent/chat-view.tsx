"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Send, Loader2, MapPin } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useUI } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

type ConversationRow = {
  id: string;
  unreadCount: number;
  property: { id: string; title: string; price: number; cityZone: string; area: string };
  otherUser: { id: string; name: string };
  lastMessage: { content: string; createdAt: string; senderId: string } | null;
};
type ChatMessage = {
  id: string; content: string; senderId: string; createdAt: string;
  sender: { id: string; name: string };
};
type ConversationDetail = {
  conversation: {
    id: string; renterId: string; ownerId: string;
    property: { id: string; title: string; price: number; cityZone: string; area: string };
    renter: { id: string; name: string }; owner: { id: string; name: string };
  };
  messages: ChatMessage[];
};
const money = (n: number) => "PKR " + n.toLocaleString("en-PK");

export function ChatView({ conversationId }: { conversationId?: string }) {
  const { data: session, status } = useSession();
  const openAuth = useUI((s) => s.openAuth);
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState(conversationId ?? "");
  const [draft, setDraft] = useState("");
  useEffect(() => { if (conversationId) setActiveId(conversationId); }, [conversationId]);

  const list = useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiFetch<ConversationRow[]>("/api/conversations"),
    enabled: status === "authenticated",
    refetchInterval: 10000,
  });
  const detail = useQuery({
    queryKey: ["conversation", activeId],
    queryFn: () => apiFetch<ConversationDetail>(`/api/conversations/${encodeURIComponent(activeId)}/messages`),
    enabled: status === "authenticated" && !!activeId,
    refetchInterval: 3000,
  });
  const send = useMutation({
    mutationFn: (content: string) => apiFetch<{ message: ChatMessage }>(
      `/api/conversations/${encodeURIComponent(activeId)}/messages`,
      { method: "POST", body: JSON.stringify({ content }) }
    ),
    onSuccess: async () => {
      setDraft("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["conversation", activeId] }),
        qc.invalidateQueries({ queryKey: ["conversations"] }),
        qc.invalidateQueries({ queryKey: ["chat-unread-count"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't send message"),
  });

  if (status === "loading") return <div className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted-foreground">Loading your messages…</div>;
  if (status !== "authenticated") return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <MessageCircle className="mx-auto size-10 text-primary" />
      <h1 className="mt-4 text-2xl font-semibold">Your messages</h1>
      <p className="mt-2 text-muted-foreground">Sign in to chat with property owners and renters.</p>
      <Button className="mt-5" onClick={() => openAuth("login")}>Sign in</Button>
    </div>
  );

  const active = list.data?.find((c) => c.id === activeId);
  const data = detail.data;
  const me = session.user.id;
  return (
    <section className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">Private conversations about GB-RENT properties.</p>
      </div>
      {list.isError ? <Card><CardContent className="p-6 text-sm">Couldn’t load conversations. <Button variant="outline" size="sm" onClick={() => list.refetch()}>Retry</Button></CardContent></Card> : (
        <div className="grid min-h-[560px] overflow-hidden rounded-2xl border bg-card md:grid-cols-[320px_1fr]">
          <aside className={`border-b md:border-b-0 md:border-r ${activeId ? "hidden md:block" : "block"}`}>
            <div className="border-b p-4 font-semibold">Inbox ({list.data?.length ?? 0})</div>
            {!list.data?.length && !list.isLoading && <div className="p-6 text-sm text-muted-foreground">No conversations yet. Open an approved property listing and choose “Chat with owner” to start.</div>}
            {list.data?.map((c) => (
              <button key={c.id} onClick={() => setActiveId(c.id)} className={`w-full border-b p-4 text-left transition hover:bg-muted/60 ${activeId === c.id ? "bg-muted" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{c.otherUser.name.slice(0,1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{c.otherUser.name}</span>{c.unreadCount > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{c.unreadCount}</span>}</div>
                    <p className="truncate text-xs text-muted-foreground">{c.property.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{c.lastMessage?.content ?? "Conversation started"}</p>
                  </div>
                </div>
              </button>
            ))}
          </aside>
          <div className={`${activeId ? "flex" : "hidden md:flex"} min-w-0 flex-col`}>
            {!activeId ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground"><MessageCircle className="size-12 opacity-40"/><p className="mt-3 font-medium">Select a conversation</p><p className="mt-1 text-sm">Property details and messages appear here.</p></div> : <>
              <div className="flex items-center gap-3 border-b p-4">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setActiveId("")} aria-label="Back to inbox"><ArrowLeft className="size-4"/></Button>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPin className="size-5"/></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{data?.conversation.property.title ?? active?.property.title ?? "Property conversation"}</p>
                  <p className="truncate text-xs text-muted-foreground">{data?.conversation.property.cityZone ?? active?.property.cityZone} · {money(data?.conversation.property.price ?? active?.property.price ?? 0)}/month</p>
                  <p className="text-xs text-muted-foreground">Chatting with {active?.otherUser.name ?? "participant"}</p>
                </div>
              </div>
              <div className="border-b bg-muted/30 px-4 py-3"><p className="text-sm font-medium">{data?.conversation.property.area ?? active?.property.area}, {data?.conversation.property.cityZone ?? active?.property.cityZone}</p><p className="text-xs text-muted-foreground">Property context stays visible while discussing the rental.</p></div>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
                {detail.isLoading && <div className="text-sm text-muted-foreground">Loading messages…</div>}
                {data?.messages.map((m) => {
                  const mine = m.senderId === me;
                  return <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 sm:max-w-[70%] ${mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"}`}>
                      {!mine && <p className="mb-1 text-[11px] font-semibold opacity-75">{m.sender.name}</p>}
                      <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
                      <p className={`mt-1 text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{new Date(m.createdAt).toLocaleString()}</p>
                    </div>
                  </div>;
                })}
                {data && data.messages.length === 0 && <p className="m-auto text-center text-sm text-muted-foreground">Say hello and ask about this property.</p>}
                {detail.isError && <p className="text-sm text-destructive">Couldn’t load messages. Select the conversation again to retry.</p>}
              </div>
              <form className="flex gap-2 border-t p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !send.isPending) send.mutate(draft.trim()); }}>
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} placeholder="Write a message…" aria-label="Message" disabled={send.isPending}/>
                <Button type="submit" disabled={!draft.trim() || send.isPending} aria-label="Send message">{send.isPending ? <Loader2 className="size-4 animate-spin"/> : <Send className="size-4"/>}</Button>
              </form>
            </>}
          </div>
        </div>
      )}
    </section>
  );
}
