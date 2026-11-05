import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const prompts=["Qual alternativa corrige corretamente o erro identificado?","Qual alternativa apresenta a informação correta que deve ser recuperada?","Qual alternativa está de acordo com o conteúdo estudado?"];
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return out({error:"Método não permitido."},405);
  const ah=req.headers.get("Authorization");if(!ah)return out({error:"Não autenticado."},401);
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const uc=createClient(url,anon,{global:{headers:{Authorization:ah}}}),admin=createClient(url,service);
  const {data:u,error:ue}=await uc.auth.getUser();if(ue||!u.user)return out({error:"Sessão inválida."},401);
  let body:{quiz_id?:string;question_ids?:string[]};try{body=await req.json()}catch{return out({error:"JSON inválido."},400)}
  if(!body.quiz_id||!Array.isArray(body.question_ids)||!body.question_ids.length)return out({error:"Informe o simulado e as questões erradas."},400);
  const {data:quiz,error:qe}=await admin.from("quizzes").select("id,user_id,material_id,subject_id,summary_id,level,title").eq("id",body.quiz_id).eq("user_id",u.user.id).single();
  if(qe||!quiz)return out({error:"Simulado não encontrado."},404);
  const ids=body.question_ids.slice(0,20);
  const {data:qs,error:qse}=await admin.from("questions").select("id,statement,explanation,topic_id,difficulty").in("id",ids).eq("quiz_id",quiz.id);if(qse) return out({error:qse.message},500);
  if(!qs?.length)return out({error:"Nenhuma questão válida para recuperação."},400);
  const {data:newQuiz,error:nqe}=await admin.from("quizzes").insert({user_id:u.user.id,material_id:quiz.material_id,subject_id:quiz.subject_id,summary_id:quiz.summary_id,title:`Recuperação — ${quiz.title}`,description:"Questões refeitas a partir dos erros do nível anterior.",difficulty:quiz.level,level:quiz.level,quiz_type:"recovery",question_count:qs.length}).select("id").single();if(nqe)return out({error:nqe.message},500);
  for(let i=0;i<qs.length;i++){
    const q=qs[i];const {data:correctId,error:ke}=await admin.rpc("get_question_answer_key",{p_question_id:q.id});if(ke||!correctId)continue;
    const {data:alts,error:ae}=await admin.from("alternatives").select("id,text").eq("question_id",q.id);if(ae)throw ae;
    const correct=alts?.find(a=>a.id===correctId);if(!correct)continue;
    const distractors=(alts??[]).filter(a=>a.id!==correctId).map(a=>a.text);
    const rotated=[correct.text,...distractors].slice((i+1)%4).concat([correct.text,...distractors].slice(0,(i+1)%4));
    const {data:nq,error:nqe2}=await admin.from("questions").insert({quiz_id:newQuiz.id,question_number:i+1,statement:prompts[i%prompts.length],explanation:"Recuperação baseada na questão original. Revise a informação correta e compare-a com os distratores.",difficulty:quiz.level,cognitive_skill:"recuperação",topic_id:q.topic_id,fingerprint:`recovery:${q.id}:${Date.now()}:${i}`}).select("id").single();if(nqe2)throw nqe2;
    const rows=rotated.map((text,idx)=>({question_id:nq.id,letter:String.fromCharCode(65+idx),text,position:idx}));
    const {data:nas,error:nae}=await admin.from("alternatives").insert(rows).select("id,text");if(nae)throw nae;
    const ca=nas?.find(a=>a.text===correct.text);if(!ca)throw new Error("Gabarito da recuperação não encontrado.");
    const {error:storeError}=await admin.rpc("store_question_answer_key",{p_question_id:nq.id,p_correct_alternative_id:ca.id});if(storeError)throw storeError;
  }
  return out({ok:true,quiz_id:newQuiz.id,questions:qs.length});
});