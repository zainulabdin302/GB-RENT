import { CITY_ZONES, PROPERTY_TYPES } from '@/lib/constants';
import type { CityZone, PropertyType } from '@/lib/constants';
export interface ChatFilters { cityZone?: CityZone; type?: PropertyType; minPrice?: number; maxPrice?: number; rooms?: number; area?: string }
export interface ChatProperty { id:string; title:string; cityZone:string; area:string; type:string; price:number; rooms:number; image:string|null }
export interface ChatReply { message:string; filters:ChatFilters; properties:ChatProperty[]; estimate?:import('@/types').PricePredictionResponse }
export function cleanFilters(raw: unknown): ChatFilters {
  if (!raw || typeof raw !== 'object') return {};
  const x=raw as Record<string,unknown>, out:ChatFilters={};
  if (CITY_ZONES.includes(x.cityZone as CityZone)) out.cityZone=x.cityZone as CityZone;
  if (PROPERTY_TYPES.includes(x.type as PropertyType)) out.type=x.type as PropertyType;
  for(const k of ['minPrice','maxPrice','rooms'] as const) if (typeof x[k]==='number' && Number.isSafeInteger(x[k]) && x[k]>=0 && x[k]<=2147483647) out[k]=x[k];
  if(typeof x.area==='string' && x.area.length<=80) out.area=x.area.trim();
  return out;
}
const amount = (v:string,unit?:string) => Math.round(Number(v.replace(/,/g,'')) * (/^k$/i.test(unit||'')?1000:/^(lakh|lac)$/i.test(unit||'')?100000:1));
const money='([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(k|lakh|lac)?';
export function parsePropertyChat(message:string, previous:ChatFilters={}) {
  const m=message.trim().toLowerCase();
  const reset=/\b(reset|start over|clear filters)\b/.test(m);
  const filters:ChatFilters=reset?{}:{...previous};
  const city=CITY_ZONES.find(c=>new RegExp(`\\b${c.toLowerCase()}\\b`).test(m));
  if(city){ if(city!==filters.cityZone) delete filters.area; filters.cityZone=city; }
  const types:[RegExp,PropertyType][]=[[/\b(houses?|homes?)\b/,'HOUSE'],[/\bshops?\b/,'SHOP'],[/\bhostels?\b/,'HOSTEL'],[/\brooms?\b/,'ROOM']];
  const rooms=m.match(/\b(\d+)\s*[- ]?\s*(?:bedrooms?|beds?|rooms?)\b/);
  const type=types.find(([re,t])=>re.test(m) && !(t==='ROOM' && rooms));
  if(type) filters.type=type[1];
  if(rooms) filters.rooms=Number(rooms[1]);
  const range=m.match(new RegExp('(?:between|from)\\s*(?:pkr\\s*)?'+money+'\\s*(?:and|to|-)\\s*(?:pkr\\s*)?'+money));
  const upper=m.match(new RegExp('(?:under|below|up to|upto|maximum|max|budget(?: is| of)?|less than)\\s*(?:pkr\\s*|rs\\.?\\s*)?'+money));
  const lower=m.match(new RegExp('(?:above|over|at least|minimum|min)\\s*(?:pkr\\s*|rs\\.?\\s*)?'+money));
  if(range){filters.minPrice=amount(range[1],range[2]||range[4]);filters.maxPrice=amount(range[3],range[4]);}
  else {if(upper) filters.maxPrice=amount(upper[1],upper[2]);if(lower) filters.minPrice=amount(lower[1],lower[2]);}
  if(/\b(any budget|no budget|remove budget)\b/.test(m)){delete filters.minPrice;delete filters.maxPrice;}
  if(/\b(any type|all types)\b/.test(m)) delete filters.type;
  if(/\b(any rooms|any room count)\b/.test(m)) delete filters.rooms;
  if(/\b(any area|all areas)\b/.test(m)) delete filters.area;
  const area=m.match(/\b(jutial|danyore|konodas|karimabad|aliabad|kiu)\b/);
  if(area) filters.area=area[1];
  const price=/\b(fair|estimate|compare|worth|reasonable|overpriced)\b/.test(m);
  const search=!!(city||type||rooms||range||upper||lower||area||reset||/\b(properties|rentals|listings|available|cheaper|any budget|no budget|all types|any type|all areas|any area)\b/.test(m));
  const invalid=(filters.minPrice!==undefined && filters.maxPrice!==undefined && filters.minPrice>filters.maxPrice)||Object.values(filters).some(v=>typeof v==='number'&&(!Number.isSafeInteger(v)||v>2147483647));
  return {filters,price,search,invalid};
}
export function describeFilters(f:ChatFilters):string {
 return [f.type?.toLowerCase(),f.cityZone,f.area,f.rooms!==undefined?`${f.rooms} rooms`:null,f.minPrice!==undefined?`from PKR ${f.minPrice.toLocaleString()}`:null,f.maxPrice!==undefined?`up to PKR ${f.maxPrice.toLocaleString()}`:null].filter(Boolean).join(' · ') || 'all approved listings';
}
