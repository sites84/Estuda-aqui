import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const clean=(s:string)=>s.replace(/\u0000/g," ").replace(/\s+/g," ").trim();
const facts=(text:string)=>{const base=text.split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(x=>x.length>=35);const pieces:string[]=[];for(const s of base){pieces.push(s);if(s.length>180)for(const p of s.split(/[;:]/).map(x=>x.trim()).filter(x=>x.length>=45))pieces.push(p)}return [...new Set(pieces)]};
const templates=["Qual alternativa apresenta corretamente uma informação presente no material?","Qual alternativa melhor representa uma informação central do conteúdo estudado?","Considerando o conteúdo do material, qual alternativa apresenta uma aplicação correta?","Qual alternativa estabelece corretamente uma relação sustentada pelo material?","Qual alternativa integra corretamente informações do conteúdo estudado?"];
const skills=["reconhecimento","compreensão","aplicação","análise","integração"];
Deno.serve(async(req)=>{
if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
if(req.method!=="POST")return json({error:"Método não permitido."},405);
const h=req.headers.get("Authorization");if(!h)return json({error:"Não autenticado."},401);
const u=Deno.env.get("SUPABASE_URL")!,a=Deno.env.get("SUPABASE_ANON_KEY")!,s=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const uc=createClient(u,a,{global:{headers:{Authorization:h}}}),db=createClient(u,s),au=await uc.auth.getUser();if(au.error||!au.data.user)return json({error:"Sessão inválida."},401);
let b:any;try{b=await req.json()}catch{return json({error:"JSON inválido."},400)}
const items=Array.isArray(b.items)?b.items.filter((x:any)=>x?.material_id&&typeof x.text==="string"&&x.text.trim().length>=50):[];
if(!items.length)return json({error:"Nenhum material com texto extraído foi enviado."},400);
const ids=[...new Set(items.map((x:any)=>x.material_id))];
const mr=await db.from("materials").select("id,user_id,title,subject_id").eq("user_id",au.data.user.id).in("id",ids);if(mr.error||!mr.data||mr.data.length!==ids.length)return json({error:"Um ou mais materiais não pertencem à sua conta."},403);
const mm=new Map(mr.data.map((m:any)=>[m.id,m])),all:any[]=[];for(const x of items){const m=mm.get(x.material_id);if(m)for(const f of facts(clean(x.text)))all.push({text:f,materialId:m.id,materialTitle:m.title})}
const skill=["reconhecimento","compreensão","aplicação","análise","integração"];
const pool=[...new Map(all.map(x=>[x.text.toLowerCase(),x])).values()];if(pool.length<20)return json({error:`Foi extraído pouco conteúdo: ${pool.length} unidades distintas. Verifique se o arquivo possui texto selecionável ou precisa de OCR.`},400);
const title=mr.data.length===1?mr.data[0].title:`${mr.data.length} materiais — ${mr.data.slice(0,3).map((m:any)=>m.title).join(", ")}${mr.data.length>3?"…":""}`;
const br=await db.from("study_batches").insert({user_id:au.data.user.id,title,material_ids:ids}).select("id").single();if(br.error||!br.data)return json({error:"Não foi possível criar o conjunto de estudo."},500);
const content=mr.data.map((m:any)=>`## ${m.title}\n\n${pool.filter(x=>x.materialId===m.id).slice(0,80).map(x=>x.text).join("\n\n")}`).join("\n\n");
const sr=await db.from("summaries").insert({user_id:au.data.user.id,material_id:mr.data[0].id,study_batch_id:br.data.id,title:mr.data.length===1?`Resumo — ${mr.data[0].title}`:`Resumo integrado — ${mr.data.length} materiais`,content,version:1}).select("id").single();if(sr.error||!sr.data)return json({error:"Não foi possível criar o resumo."},500);
const qids:any[]=[];
for(let l=1;l<=5;l++){const qr=await db.from("quizzes").insert({user_id:au.data.user.id,material_id:null,subject_id:mr.data[0].subject_id,summary_id:sr.data.id,study_batch_id:br.data.id,title:`Nível ${l} — ${title}`,description:`Conjunto: ${title}. Nível ${l} de 5, 20 questões.`,difficulty:l,level:l,quiz_type:"main",question_count:20}).select("id").single();if(qr.error||!qr.data)throw qr.error;qids.push(qr.data.id);
for(let i=0;i<20;i++){const ai=(i*3+(l-1)*7)%pool.length,bi=(ai+Math.max(3,Math.floor(pool.length/3)))%pool.length,A=pool[ai],B=pool[bi];let st=l===1?`Qual informação sobre “${A.text.slice(0,120)}” está de acordo com o material?`:l===2?`Qual alternativa explica corretamente este trecho?\n\n“${A.text.slice(0,230)}”`:l===3?`Considerando os dois pontos abaixo, qual alternativa aplica corretamente o conteúdo?\n\nA) ${A.text.slice(0,140)}\nB) ${B.text.slice(0,140)}`:l===4?`Qual relação entre estas informações é sustentada pelo material?\n\nA) ${A.text.slice(0,150)}\nB) ${B.text.slice(0,150)}`:`Qual conclusão integra corretamente estas informações sem contradizer o conteúdo?\n\n• ${A.text.slice(0,150)}\n• ${B.text.slice(0,150)}`;const cor=A.text,opts=[cor,pool[(ai+1)%pool.length].text,pool[(ai+5)%pool.length].text,pool[(ai+11)%pool.length].text],r=(i+l)%4,rot=opts.slice(r).concat(opts.slice(0,r));
const q=await db.from("questions").insert({quiz_id:qr.data.id,question_number:i+1,statement:st,explanation:`A resposta é sustentada pelo conteúdo do material; habilidade: ${skill[l-1]}.`,difficulty:l,cognitive_skill:skill[l-1],source_index:ai,fingerprint:`batch:${br.data.id}:l:${l}:i:${i+1}`}).select("id").single();if(q.error||!q.data)throw q.error;
const ar=await db.from("alternatives").insert(rot.map((text,pos)=>({question_id:q.data.id,letter:String.fromCharCode(65+pos),text,position:pos}))).select("id,text");if(ar.error||!ar.data)throw ar.error;const ca=ar.data.find((x:any)=>x.text===cor);if(!ca)throw new Error("Gabarito não encontrado.");const kr=await db.rpc("store_question_answer_key",{p_question_id:q.data.id,p_correct_alternative_id:ca.id});if(kr.error)throw kr.error;
}}
await db.from("materials").update({status:"ready",error_message:null}).in("id",ids);return json({ok:true,study_batch_id:br.data.id,summary_id:sr.data.id,quiz_id:qids[0],quiz_ids:qids,levels:5,questions:100,materials:mr.data.length,provider:"local-adaptive-v4"});
});