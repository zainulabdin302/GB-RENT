"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type PaymentInfo = { paymentStatus: string; amount: number; jazzCashAccount: string; easypaisaAccount: string; receiptUrl: string | null; reference: string | null };

export function ListingPaymentPanel({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const info = useQuery<PaymentInfo>({ queryKey: ["listing-payment", propertyId], queryFn: () => apiFetch("/api/payments/" + propertyId) });
  const submit = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Please select your payment receipt image");
      const form = new FormData(); form.append("file", file);
      const upload = await fetch("/api/upload", { method: "POST", body: form });
      const uploaded = await upload.json();
      if (!upload.ok || !uploaded.url) throw new Error(uploaded.error || "Receipt upload failed");
      return apiFetch("/api/payments/" + propertyId, { method: "POST", body: JSON.stringify({ receiptUrl: uploaded.url, reference }) });
    },
    onSuccess: () => { toast.success("Receipt submitted. Your listing will be published after admin verification."); setFile(null); qc.invalidateQueries({ queryKey: ["listing-payment", propertyId] }); qc.invalidateQueries({ queryKey: ["mine-properties"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit receipt")
  });
  if (info.isLoading || !info.data) return null;
  const p = info.data;
  if (p.paymentStatus === "VERIFIED") return null;
  return <Card className="mx-4 mb-4 border-primary/20 bg-muted/20"><CardContent className="space-y-3 p-4">
    <div><div className="font-semibold">Listing payment · PKR {p.amount.toLocaleString("en-PK")}</div><p className="text-sm text-muted-foreground">Pay the listing fee and upload your receipt now. Your property will remain pending until an admin verifies the payment and separately approves the listing.</p></div>
    <div className="grid gap-2 text-sm sm:grid-cols-2">
      <div><span className="font-medium">JazzCash:</span> {p.jazzCashAccount || "Not configured yet"}</div>
      <div><span className="font-medium">Easypaisa:</span> {p.easypaisaAccount || "Not configured yet"}</div>
    </div>
    {p.paymentStatus === "PENDING_VERIFICATION" ? <p className="text-sm font-medium text-amber-700">Receipt submitted — waiting for admin verification.</p> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Transaction ID / reference</Label><Input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Enter transaction reference" /></div>
        <div className="space-y-1"><Label>Payment receipt image</Label><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setFile(e.target.files?.[0] ?? null)} /></div>
      </div>
      <Button size="sm" onClick={()=>submit.mutate()} disabled={submit.isPending || !reference.trim() || !file}>{submit.isPending ? "Uploading…" : "Submit payment receipt"}</Button>
    </>}
  </CardContent></Card>;
}
