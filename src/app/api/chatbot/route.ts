import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cleanFilters, parsePropertyChat, describeFilters } from '@/lib/property-chat';
import type { ChatReply, ChatProperty } from '@/lib/property-chat';
import { estimateRent } from '@/lib/rent-estimate';
import { AMENITIES } from '@/lib/constants';
import type { CityZone, PropertyType, AmenityKey } from '@/lib/constants';
import type { Prisma } from '@prisma/client';
export const dynamic='force-dynamic';
const reply=(data:ChatReply)=>NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){
 try {
  const reader=req.body?.getReader();if(!reader) return NextResponse.json({error:'Message required'},{status:400});
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>8192){await reader.cancel();return NextResponse.json({error:'Message too long'},{status:413});}chunks.push(value);}
  let body:Record<string,unknown>;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{return NextResponse.json({error:'Invalid request'},{status:400});}
  if(!body || typeof body.message!=='string'||!body.message.trim()||body.message.length>1000) return NextResponse.json({error:'Enter a message of 1–1000 characters'},{status:400});
  const previous=cleanFilters(body.filters);
  const {filters,price,search,invalid}=parsePropertyChat(body.message,previous);
  if(invalid)return reply({message:'Please enter a valid budget range, with the minimum below the maximum.',filters:previous,properties:[]});
  if(price && typeof body.propertyId==='string'){
    const target=await db.property.findFirst({where:{id:body.propertyId,status:'APPROVED'}});
    if(!target)return reply({message:'That property is unavailable or not approved. Search for an approved listing to compare its rent.',filters,properties:[]});
    const candidates=await db.property.findMany({where:{status:'APPROVED',cityZone:target.cityZone,type:target.type,id:{not:target.id},NOT:{images:{some:{url:{startsWith:'/uploads/seed-'}}}}},include:{images:{select:{url:true}}}});
    let amenities:AmenityKey[]=[];try{const a=JSON.parse(target.amenities);if(Array.isArray(a))amenities=AMENITIES.filter(x=>a.includes(x.key)).map(x=>x.key);}catch{}
    const estimate=estimateRent({propertyId:target.id,type:target.type as PropertyType,cityZone:target.cityZone as CityZone,area:target.area,rooms:target.rooms,size:target.size,amenities},candidates);
    return reply({message:estimate.available?`${target.title}: estimated asking rent PKR ${estimate.predictedPrice.toLocaleString()}/month. Listed at PKR ${target.price.toLocaleString()}. ${estimate.explanation}`:`${target.title}: ${estimate.explanation}`,filters,estimate,properties:[]});
  }
  if(!search && !price)return reply({message:'I can find approved rentals and compare asking rents. Try “houses in Gilgit under 25k”, “2 bedroom houses in Hunza”, or open a listing and ask “is this rent fair?”. I support these focused searches without an external AI service.',filters,properties:[]});
  const where:Prisma.PropertyWhereInput={status:'APPROVED'};
  if(filters.cityZone)where.cityZone=filters.cityZone;if(filters.type)where.type=filters.type;
  if(filters.rooms!==undefined)where.rooms=filters.rooms;
  if(filters.minPrice!==undefined||filters.maxPrice!==undefined)where.price={gte:filters.minPrice,lte:filters.maxPrice};
  if(filters.area)where.OR=['area','address','description','title'].map(k=>({[k]:{contains:filters.area}}));
  const [total,rows]=await Promise.all([db.property.count({where}),db.property.findMany({where,orderBy:[{price:'asc'},{id:'asc'}],take:6,select:{id:true,title:true,cityZone:true,area:true,type:true,price:true,rooms:true,images:{take:1,orderBy:{position:'asc'},select:{url:true}}}})]);
  const properties:ChatProperty[]=rows.map(({images,...p})=>({...p,image:images[0]?.url||null}));
  return reply({message:total?`${price?'Choose “Compare rent” on a property below. ':''}Found ${total} approved listing${total===1?'':'s'} for ${describeFilters(filters)}.${total>6?' Showing the 6 lowest asking rents.':''}`:`No approved listings match ${describeFilters(filters)}. Try another district, a higher budget, or “clear filters”.`,filters,properties});
 } catch(e){console.error('[property-chat]',e);return NextResponse.json({error:'Unable to search properties right now. Please retry.'},{status:500});}
}
