import type { PricePredictionRequest, PricePredictionResponse } from "@/types";
export interface RentalCandidate {
  id: string; userId: string; title: string; type: string; cityZone: string;
  area: string; price: number; rooms: number; size: number | null;
  amenities: string; status: string; images: { url: string }[];
}
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
/** Similarity-weighted mean of real asking rents; never mixes districts or types.
 * No claimed statistical confidence: small/non-independent samples are labelled limited.
 */
export function estimateRent(target: PricePredictionRequest, candidates: RentalCandidate[]): PricePredictionResponse {
  const scored = candidates.filter(p =>
    p.id !== target.propertyId && p.status === "APPROVED" &&
    norm(p.cityZone) === norm(target.cityZone) && p.type === target.type &&
    Number.isFinite(p.price) && p.price > 0 &&
    !p.images.some(i => i.url.startsWith("/uploads/seed-")) &&
    Math.abs(p.rooms - target.rooms) <= Math.max(1, Math.floor(target.rooms * 0.3)) &&
    !(target.size && p.size && (p.size / target.size < 0.5 || p.size / target.size > 2))
  ).map(p => {
    let amenities: string[] = [];
    try { const a = JSON.parse(p.amenities); if (Array.isArray(a)) amenities = a.filter(x => typeof x === "string"); } catch {}
    const union = new Set([...amenities, ...target.amenities]);
    const overlap = union.size ? target.amenities.filter(a => amenities.includes(a)).length / union.size : 1;
    const rooms = 1 / (1 + Math.abs(p.rooms - target.rooms));
    const size = p.size && target.size ? Math.min(p.size, target.size) / Math.max(p.size, target.size) : 0.5;
    const area = norm(p.area) === norm(target.area) ? 1 : 0;
    return { p, weight: 0.4 * rooms + 0.25 * size + 0.2 * area + 0.15 * overlap, area };
  }).sort((a,b) => b.weight-a.weight || a.p.id.localeCompare(b.p.id));
  // Prefer the same neighbourhood when at least two suitable listings exist.
  const local = scored.filter(x => x.area === 1);
  const selected = (local.length >= 2 ? local : scored).slice(0,10);
  const comparables = selected.map(({p}) => ({ id:p.id,title:p.title,cityZone:p.cityZone,area:p.area,price:p.price,rooms:p.rooms,size:p.size }));
  if (selected.length < 2) return {
    available:false,predictedPrice:null,low:null,high:null,evidence:"insufficient",method:"similar-listings",comparables,
    explanation:`Not enough similar approved listings in ${target.cityZone}. Found ${selected.length}; at least 2 other listings of the same type and similar room count/size are needed. This listing and demo data are excluded.`
  };
  const sum = selected.reduce((n,x)=>n+x.weight,0);
  const predictedPrice = Math.round(selected.reduce((n,x)=>n+x.p.price*x.weight,0)/sum);
  const low = Math.min(...selected.map(x=>x.p.price));
  const high = Math.max(...selected.map(x=>x.p.price));
  const owners = new Set(selected.map(x=>x.p.userId)).size;
  const evidence = selected.length >= 5 && owners >= 3 && high / low <= 2 && selected.every(x => x.p.size && target.size) ? "moderate" : "limited";
  return { available:true,predictedPrice,low,high,evidence,method:"similar-listings",comparables,
    explanation:`Based on ${selected.length} similar approved listings in ${target.cityZone}${local.length >= 2 ? `, ${target.area}` : " (neighbourhoods shown below)"}, from ${owners} account(s). Their asking rents range from PKR ${low.toLocaleString("en-PK")} to PKR ${high.toLocaleString("en-PK")}. Similar room counts, sizes and amenities receive more weight. ${evidence === "limited" ? "Limited evidence: treat this as a rough comparison. " : ""}These are advertised rents, not confirmed rental agreements.`
  };
}
