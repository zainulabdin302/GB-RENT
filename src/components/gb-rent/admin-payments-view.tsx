"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Settings = { listingFee: number; jazzCashAccount: string; easypaisaAccount: string };
type Payment = { id: string; title: string; listingFeeSnapshot: number; paymentReference: string | null; paymentReceiptUrl: string | null; user: { name: string; email: string } };

export function AdminPaymentsView() {
  const qc = useQueryClient();
  const settings = useQuery<Settings>({ queryKey: ["admin-payment-settings"], queryFn: () => apiFetch("/api/admin/payment-settings") });
  const payments = useQuery<Payment[]>({ queryKey: ["admin-payments"], queryFn: () => apiFetch("/api/admin/payments") });
  const [fee, setFee] = useState("");
  const [jazz, setJazz] = useState("");
  const [easy, setEasy] = useState("");
  const save = useMutation({
    mutationFn: () => apiFetch("/api/admin/payment-settings", { method: "PATCH", body: JSON.stringify({
      listingFee: Number(fee || settings.data?.listingFee || 200),
      jazzCashAccount: jazz || settings.data?.jazzCashAccount || "",
      easypaisaAccount: easy || settings.data?.easypaisaAccount || ""
    }) }),
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["admin-payment-settings"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save settings")
  });
  const review = useMutation({
    mutationFn: (v: { id: string; action: "VERIFY" | "REJECT" }) => apiFetch("/api/admin/payments/" + v.id, { method: "PATCH", body: JSON.stringify({ action: v.action }) }),
    onSuccess: () => { toast.success("Payment updated"); qc.invalidateQueries({ queryKey: ["admin-payments"] }); qc.invalidateQueries({ queryKey: ["properties"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update payment")
  });
  return <div className="flex flex-col gap-6">
    <Card><CardHeader><CardTitle>Listing payment settings</CardTitle><CardDescription>New approvals use this fee. Existing payment requests keep their saved amount.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Listing fee (PKR)</Label><Input type="number" min="0" value={fee || settings.data?.listingFee || ""} onChange={e => setFee(e.target.value)} /></div>
        <div className="space-y-2"><Label>JazzCash account / number</Label><Input value={jazz || settings.data?.jazzCashAccount || ""} onChange={e => setJazz(e.target.value)} /></div>
        <div className="space-y-2"><Label>Easypaisa account / number</Label><Input value={easy || settings.data?.easypaisaAccount || ""} onChange={e => setEasy(e.target.value)} /></div>
        <div className="flex items-end"><Button onClick={() => save.mutate()} disabled={save.isPending}>Save settings</Button></div>
      </CardContent>
    </Card>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Payments awaiting verification</h2>
      {payments.isLoading ? <p>Loading…</p> : (payments.data || []).length === 0 ? <p className="text-sm text-muted-foreground">No payment submissions awaiting review.</p> : payments.data?.map(p => <Card key={p.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><div className="font-semibold">{p.title}</div><div className="text-sm text-muted-foreground">{p.user.name} · {p.user.email}</div><div className="text-sm">PKR {p.listingFeeSnapshot} · Ref: {p.paymentReference || "—"}</div>{p.paymentReceiptUrl && <a href={p.paymentReceiptUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">View receipt</a>}</div>
        <div className="flex gap-2"><Button size="sm" onClick={() => review.mutate({id:p.id,action:"VERIFY"})}>Verify</Button><Button size="sm" variant="outline" onClick={() => review.mutate({id:p.id,action:"REJECT"})}>Reject</Button></div>
      </CardContent></Card>)}
    </section>
  </div>;
}
