// Uses a disposable database and upload directory; never touches project data.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
const dir = await mkdtemp(join(tmpdir(), 'gbrent-smoke-'));
const port = 3197;
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: 'production', DATABASE_URL: `file:${dir}/test.db`, UPLOAD_DIR: `${dir}/uploads`, NEXTAUTH_SECRET: 'isolated-smoke-test-secret-with-32-plus-characters', NEXTAUTH_URL: base, HOSTNAME: '127.0.0.1', PORT: String(port), AI_SERVICE_URL: 'http://127.0.0.1:3003' };
const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
let web, ai;
let output = '';
const start = () => {
  web = spawn(process.execPath, ['.next/standalone/server.js'], { env, stdio: ['ignore','pipe','pipe'] });
  web.stdout.on('data', b => { output += b; });
  web.stderr.on('data', b => { output += b; });
};
const stop = async (p) => { if (p && p.exitCode === null) { const done = once(p, 'exit'); p.kill('SIGTERM'); await done; } };
const ready = async (url) => { for (let n=0;n<120;n++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise(r => setTimeout(r,250)); } throw new Error('Server failed to start: '+url); };
function client() {
 const cookies = new Map();
 return async (path, options={}) => {
   const res = await fetch(base+path, { ...options, redirect:'manual', headers:{ ...options.headers, cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ') } });
   for (const c of res.headers.getSetCookie()) { const part=c.split(';')[0]; const i=part.indexOf('='); cookies.set(part.slice(0,i),part.slice(i+1)); }
   return res;
 };
}
const json = (body, method='POST') => ({ method, headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
const signIn = async (c,email,password) => {
 const csrf = await (await c('/api/auth/csrf')).json();
 const res = await c('/api/auth/callback/credentials', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({csrfToken:csrf.csrfToken,email,password,json:'true',callbackUrl:base}) });
 assert.equal(res.status,200);
 const session = await (await c('/api/auth/session')).json();
 assert.equal(session.user.email,email);
 return session.user;
};
const pass = m => console.log('PASS '+m);
try {
 execFileSync(process.execPath,['scripts/prepare-db.mjs'],{env,stdio:'pipe'});
 execFileSync(process.execPath,['node_modules/prisma/build/index.js','db','push','--skip-generate'],{env,stdio:'pipe'});
 execFileSync('bun',['scripts/seed.ts'],{env,stdio:'pipe'});
 assert.equal(await db.user.count(),4);
 const ids = (await db.user.findMany()).map(u=>u.id).sort();
 // A DB with no approved listings is NOT empty. Reseeding must preserve users.
 await db.property.updateMany({data:{status:'PENDING'}});
 execFileSync('bun',['scripts/seed.ts'],{env,stdio:'pipe'});
 assert.deepEqual((await db.user.findMany()).map(u=>u.id).sort(),ids);
 await db.property.updateMany({data:{status:'APPROVED'}});
 pass('seeding preserves existing records even with zero approved listings');
 start();
 ai = spawn('bun',['mini-services/ai-service/index.ts'],{env,stdio:'ignore'});
 await ready(base+'/api/health'); await ready('http://127.0.0.1:3003/api/health');
 const guest=client(), owner=client(), other=client(), admin=client();
 assert.equal((await guest('/')).status,200);
 assert.equal((await guest('/api/properties')).status,200);
 assert.equal((await guest('/api/seed',json({confirm:true}))).status,404);
 assert.equal(await db.user.count(),4);
 assert.equal((await guest('/api/admin/users')).status,401);
 assert.equal((await guest('/api/upload',{method:'POST'})).status,401);
 pass('homepage, browse, and unauthenticated access boundaries');
 assert.equal((await guest('/api/auth/register',json({name:'Smoke User',email:'smoke@example.test',password:'smoke-password-123'}))).status,201);
 assert.equal((await guest('/api/auth/register',json({name:'Smoke User',email:'smoke@example.test',password:'smoke-password-123'}))).status,409);
 await signIn(owner,'smoke@example.test','smoke-password-123');
 await signIn(other,'ali@gbrent.pk','user123');
 await signIn(admin,'admin@gbrent.pk','admin123');
 assert.equal((await owner('/api/admin/users')).status,403);
 pass('registration, duplicate-email rejection, login, admin authorization');
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
 const form=new FormData();form.set('file',new File([image],'sample.png',{type:'image/png'}));
 const uploaded=await owner('/api/upload',{method:'POST',body:form});assert.equal(uploaded.status,201,await uploaded.clone().text());
 const {url}=await uploaded.json();
 assert.equal((await guest(url)).status,200);
 const badForm=new FormData();badForm.set('file',new File(['<script>alert(1)</script>'],'fake.png',{type:'image/png'}));
 assert.equal((await owner('/api/upload',{method:'POST',body:badForm})).status,400);
 pass('new photo upload, immediate production retrieval, invalid-image rejection');
 const body={title:'Smoke test listing',type:'HOUSE',address:'Test street',area:'Jutial',cityZone:'Gilgit',price:10000,rooms:2,size:500,amenities:['WATER'],description:'Integration test property',images:[url]};
 assert.equal((await owner('/api/properties',json({...body,size:1.5}))).status,400);
 assert.equal((await owner('/api/properties',json({...body,rooms:1.5}))).status,400);
 assert.equal((await owner('/api/properties',json({...body,images:['https://example.test/remote.svg']}))).status,400);
 const created=await owner('/api/properties',json(body));assert.equal(created.status,201,await created.clone().text());
 const property=await created.json();assert.equal(property.status,'PENDING');
 assert.equal((await guest('/api/properties/'+property.id)).status,404);
 assert.equal((await other('/api/favorites',json({propertyId:property.id}))).status,404);
 assert.equal((await other('/api/properties/'+property.id,json({title:'Unauthorised edit'},'PUT'))).status,404);
 const changed=await owner('/api/properties/'+property.id,json({...body,title:'Edited listing'},'PUT'));assert.equal(changed.status,200);
 assert.equal((await admin('/api/admin/properties/'+property.id,json({status:'APPROVED'},'PATCH'))).status,200);
 assert.equal((await guest('/api/properties/'+property.id)).status,200);
 pass('listing creation/edit/approval, integer validation, ownership checks');
 const saved=await other('/api/favorites',json({propertyId:property.id}));assert.equal(saved.status,201);
 assert.equal((await other('/api/inquiries',json({propertyId:property.id,message:'Can I visit?',phone:'03001234567'}))).status,201);
 const inquiries=await (await owner('/api/inquiries')).json();assert.equal(inquiries.length,1);
 assert.equal((await owner('/api/inquiries/mark-read',json({}))).status,200);
 const predict=await owner('/api/ai/predict-price',json({type:'HOUSE',cityZone:'Gilgit',area:'Jutial',rooms:2,size:500,amenities:['WATER']}));assert.equal(predict.status,200,await predict.clone().text());
 assert.equal((await guest('/api/properties/'+property.id+'/similar')).status,200);
 pass('favorites, inquiry delivery/read status, AI prediction and similar listings');
 await owner('/api/properties/'+property.id,json({title:'Needs review'},'PUT'));
 const favorites=await (await other('/api/favorites')).json();assert.ok(!favorites.some(f=>f.property.id===property.id));
 pass('favorites cannot leak a listing after it becomes private');
 await stop(web);start();await ready(base+'/api/health');
 assert.equal((await guest(url)).status,200);assert.ok(await db.property.findUnique({where:{id:property.id}}));
 await signIn(owner,'smoke@example.test','smoke-password-123');
 assert.equal((await owner('/api/properties/'+property.id,{method:'DELETE'})).status,204);
 assert.equal(await db.inquiry.count({where:{propertyId:property.id}}),0);
 pass('restart preserves records/photos; deletion cascades correctly');
} catch(e) { console.error(output);throw e; }
finally { await stop(web);await stop(ai);await db.$disconnect();await rm(dir,{recursive:true,force:true}); }
