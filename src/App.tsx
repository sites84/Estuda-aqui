import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen, Brain, ChartNoAxesCombined, ClipboardCheck, CloudUpload,
  FileText, GraduationCap, LayoutDashboard, Library, LogOut, Menu,
  Plus, Settings, Sparkles, Target, X, ChevronRight, CheckCircle2
} from 'lucide-react'
import { supabase, supabaseConfigured } from './lib/supabase'
import { extractDocument, normalizeExtractedText } from './lib/extract'
import type { User } from '@supabase/supabase-js'

type Page = 'inicio' | 'materiais' | 'resumos' | 'simulados' | 'desempenho'
type Material = { id:string; title:string; original_filename:string; status:string; created_at:string; subject_id:string|null }
type Subject = { id:string; name:string; description:string|null }
type Summary = { id:string; title:string; content:string; material_id:string; created_at:string }
type Quiz = { id:string; title:string; description:string|null; difficulty:number; level:number|null; question_count:number; material_id:string|null; summary_id:string|null; quiz_type?:string }
type Question = { id:string; question_number:number; statement:string; explanation:string|null; alternatives:{id:string; letter:string; text:string}[] }

const nav: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'inicio', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'materiais', label: 'Meus materiais', icon: Library },
  { id: 'resumos', label: 'Resumos', icon: BookOpen },
  { id: 'simulados', label: 'Simulados', icon: ClipboardCheck },
  { id: 'desempenho', label: 'Desempenho', icon: ChartNoAxesCombined },
]

function friendlyError(error: unknown) {
  if (!error) return ''
  const message = error instanceof Error ? error.message : String(error)
  if (/invalid login credentials/i.test(message)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(message)) return 'Confirme seu e-mail antes de entrar.'
  if (/password.*characters/i.test(message)) return 'A senha precisa ter pelo menos 6 caracteres.'
  return message
}

export default function App() {
  const [page, setPage] = useState<Page>('inicio')
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState<'login'|'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [selectedSummary, setSelectedSummary] = useState('')
  const [selectedQuiz, setSelectedQuiz] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string,string>>({})
  const [quizResult, setQuizResult] = useState<any>(null)
  const [attempts, setAttempts] = useState<{id:string; quiz_id:string; score:number|null; correct_count:number; total_questions:number; completed_at:string|null}[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState('')

  const title = nav.find(n => n.id === page)?.label ?? 'Visão geral'
  const userName = useMemo(() => displayName || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Aluno', [displayName, user])

  async function loadData(currentUser = user) {
    if (!supabase || !currentUser) return
    setLoadingData(true)
    const [{ data: subjectData }, { data: materialData }, { data: summaryData }, { data: quizData }, { data: attemptData }] = await Promise.all([
      supabase.from('subjects').select('id,name,description').order('created_at', { ascending: true }),
      supabase.from('materials').select('id,title,original_filename,status,created_at,subject_id').order('created_at', { ascending: false }),
      supabase.from('summaries').select('id,title,content,material_id,created_at').order('created_at', { ascending: false }),
      supabase.from('quizzes').select('id,title,description,difficulty,level,question_count,material_id,summary_id,quiz_type').order('created_at', { ascending: false }),
      supabase.from('quiz_attempts').select('id,quiz_id,score,correct_count,total_questions,completed_at').order('completed_at', { ascending: false }),
    ])
    setSubjects(subjectData ?? [])
    setMaterials(materialData ?? [])
    setSummaries(summaryData ?? [])
    setQuizzes(quizData ?? [])
    setAttempts((attemptData ?? []) as any)
    if (!selectedSummary && summaryData?.[0]) setSelectedSummary(summaryData[0].id)
    if (!selectedQuiz && quizData?.[0]) setSelectedQuiz(quizData[0].id)
    if (!selectedSubject && subjectData?.[0]) setSelectedSubject(subjectData[0].id)
    setLoadingData(false)
  }

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getUser().then(({ data }) => { if (active) setUser(data.user) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadData(session.user)
      else { setMaterials([]); setSubjects([]); setSummaries([]); setQuizzes([]); setAttempts([]) }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  async function signIn() {
    if (!supabase) return setAuthMessage('Supabase não está configurado neste build.')
    setAuthMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setAuthMessage(friendlyError(error) || 'Login realizado.')
    if (!error) { setShowAuth(false); await loadData() }
  }

  async function signUp() {
    if (!supabase) return setAuthMessage('Supabase não está configurado neste build.')
    if (password.length < 6) return setAuthMessage('A senha precisa ter pelo menos 6 caracteres.')
    setAuthMessage('')
    const redirectTo = new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString()
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: {
        data: { display_name: displayName.trim() || undefined },
        emailRedirectTo: redirectTo,
      }
    })
    if (error) return setAuthMessage(friendlyError(error))
    if (data.session) {
      setShowAuth(false)
      setAuthMessage('')
    } else {
      setAuthMessage('Cadastro criado. Verifique o e-mail para confirmar a conta.')
    }
  }

  async function resendConfirmation() {
    if (!supabase) return setAuthMessage('Supabase não está configurado neste build.')
    if (!email.trim()) return setAuthMessage('Informe seu e-mail para reenviar a confirmação.')
    const redirectTo = new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    })
    setAuthMessage(error ? friendlyError(error) : 'Novo e-mail de confirmação enviado.')
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    setUser(null); setShowAuth(false); setPage('inicio')
  }

  async function createSubject() {
    if (!supabase || !user) { setShowAuth(true); return }
    const name = window.prompt('Nome da disciplina')?.trim()
    if (!name) return
    const { data, error } = await supabase.from('subjects').insert({ user_id: user.id, name }).select('id,name,description').single()
    if (error) return window.alert(friendlyError(error))
    setSubjects(prev => [...prev, data])
    setSelectedSubject(data.id)
  }

  async function uploadMaterial(file: File) {
    if (!supabase || !user) { setShowAuth(true); return }
    if (file.size > 20 * 1024 * 1024) return window.alert('O limite inicial é de 20 MB por arquivo.')
    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const path = `${user.id}/${crypto.randomUUID()}-${safeName}`
    const { error: uploadError } = await supabase.storage.from('study-materials').upload(path, file, {
      cacheControl: '3600', upsert: false, contentType: file.type || undefined,
    })
    if (uploadError) { setUploading(false); return window.alert(`Falha no upload: ${uploadError.message}`) }
    const { data, error } = await supabase.from('materials').insert({
      user_id: user.id, subject_id: selectedSubject || null, title: file.name.replace(/\.[^.]+$/, ''),
      original_filename: file.name, storage_path: path, mime_type: file.type || null, file_size: file.size, status: 'uploaded'
    }).select('id,title,original_filename,status,created_at,subject_id').single()
    if (error) {
      await supabase.storage.from('study-materials').remove([path])
      setUploading(false)
      return window.alert(`O arquivo foi enviado, mas o registro não pôde ser criado: ${error.message}`)
    }
    setMaterials(prev => [data, ...prev])
    setUploading(false)
    try {
      const extracted = normalizeExtractedText((await extractDocument(file)).text)
      if (extracted.length < 50) throw new Error('Não foi possível extrair texto suficiente do arquivo. Arquivos digitalizados sem texto precisam de OCR.')
      const { data: result, error: processError } = await supabase.functions.invoke('process-material', { body: { material_id: data.id, text: extracted } })
      if (processError || result?.error) throw new Error(processError?.message || result?.error)
      await loadData(user)
      setSelectedSummary(result.summary_id)
      setSelectedQuiz(result.quiz_id)
      window.alert(`Material processado: ${result.questions} questões criadas.`)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await supabase.from('materials').update({ status: 'error', error_message: message }).eq('id', data.id)
      setMaterials(prev => prev.map(m => m.id === data.id ? { ...m, status: 'error' } : m))
      window.alert(`O arquivo foi enviado, mas o processamento falhou: ${message}`)
    }
    setPage('materiais')
  }

  async function openQuiz(id: string) {
    if (!supabase || !user) { setShowAuth(true); return }
    const quiz = quizzes.find(q => q.id === id)
    if (!quiz) return
    const level = quiz.level ?? quiz.difficulty ?? 1
    if (level > 1) {
      const previous = quizzes.find(q => q.material_id === quiz.material_id && (q.level ?? q.difficulty) === level - 1 && q.quiz_type !== 'recovery')
      const previousAttempt = previous ? attempts.find(a => a.quiz_id === previous.id && Number(a.score ?? 0) >= 70) : null
      if (!previousAttempt) {
        const previousTitle = previous ? `Nível ${level - 1}` : 'o nível anterior'
        window.alert(`Conclua ${previousTitle} com pelo menos 70% para liberar este nível.`)
        return
      }
    }
    if (quiz.summary_id) {
      const { data: read } = await supabase.from('summary_reads').select('id,completed_at').eq('summary_id', quiz.summary_id).eq('user_id', user.id).maybeSingle()
      if (!read?.completed_at) {
        setSelectedSummary(quiz.summary_id)
        setPage('resumos')
        window.alert('Leia o resumo antes de iniciar o simulado.')
        return
      }
    }
    setSelectedQuiz(id); setQuizResult(null); setAnswers({})
    const { data, error } = await supabase.from('questions').select('id,question_number,statement,explanation,alternatives(id,letter,text)').eq('quiz_id', id).order('question_number')
    if (error) return window.alert(friendlyError(error))
    setQuestions((data ?? []) as unknown as Question[])
  }

  async function completeSummary(summaryId: string) {
    if (!supabase || !user) return
    const { error } = await supabase.from('summary_reads').upsert({ user_id: user.id, summary_id: summaryId, started_at: new Date().toISOString(), completed_at: new Date().toISOString() }, { onConflict: 'user_id,summary_id' })
    if (error) return window.alert(friendlyError(error))
    const summary = summaries.find(s => s.id === summaryId)
    const q = quizzes.find(x => x.material_id === summary?.material_id)
    if (q) { setSelectedQuiz(q.id); setPage('simulados'); await openQuiz(q.id) }
  }

  async function submitQuiz() {
    if (!supabase || !selectedQuiz) return
    const payload = questions.map(q => ({ question_id: q.id, selected_alternative_id: answers[q.id] ?? null }))
    const { data, error } = await supabase.functions.invoke('grade-quiz', { body: { quiz_id: selectedQuiz, answers: payload } })
    if (error || data?.error) return window.alert(error?.message || data?.error)
    setQuizResult(data)
    await loadData(user)
  }

  async function createRecoveryQuiz() {
    if (!supabase || !selectedQuiz || !quizResult) return
    const wrong = quizResult.details?.filter((d:any) => !d.correct).map((d:any) => d.question_id) ?? []
    if (!wrong.length) return window.alert('Não há erros para recuperar neste nível.')
    const { data, error } = await supabase.functions.invoke('create-recovery-quiz', { body: { quiz_id: selectedQuiz, question_ids: wrong } })
    if (error || data?.error) return window.alert(error?.message || data?.error)
    await loadData(user)
    setSelectedQuiz(data.quiz_id)
    setQuizResult(null); setAnswers({})
    await openQuiz(data.quiz_id)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark"><GraduationCap size={22}/></div><span>estuda<span className="brand-dot">.</span></span><button className="mobile-close" onClick={() => setMenuOpen(false)}><X size={18}/></button></div>
        <div className="workspace-label">ESPAÇO DE ESTUDO</div>
        <nav>{nav.map(item => { const Icon = item.icon; return <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => { setPage(item.id); setMenuOpen(false) }}><Icon size={18}/><span>{item.label}</span></button> })}</nav>
        <div className="sidebar-bottom">
          <div className="plan-card"><div className="plan-icon"><Sparkles size={17}/></div><strong>Aprenda no seu ritmo</strong><p>Leia, pratique e acompanhe sua evolução.</p></div>
          <button className="nav-item" onClick={() => setShowAuth(true)}><Settings size={18}/><span>Conta e configurações</span></button>
          <div className="profile"><div className="avatar">{userName.slice(0,1).toUpperCase()}</div><div><strong>{userName}</strong><small>{user ? 'Conta conectada' : 'Modo demonstração'}</small></div>{user && <LogOut size={16} className="profile-exit" onClick={signOut}/>}</div>
        </div>
      </aside>
      {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"/>}
      <main className="main">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)}><Menu size={21}/></button><div className="breadcrumb">Estuda <ChevronRight size={14}/> <strong>{title}</strong></div><div className="top-actions"><div className="status-pill"><span/> {user ? 'Conta conectada' : supabaseConfigured ? 'Supabase pronto' : 'Modo demonstração'}</div><button className="avatar top-avatar" onClick={() => setShowAuth(true)}>{userName.slice(0,1).toUpperCase()}</button></div></header>

        {page === 'inicio' && <section className="content">
          <div className="welcome-row"><div><div className="eyebrow">ESPAÇO DE ESTUDO</div><h1>{user ? `Olá, ${userName}.` : 'Vamos avançar nos estudos.'}</h1><p className="muted">Organize seus materiais, leia os resumos e teste o que aprendeu.</p></div><button className="primary-btn" onClick={() => setPage('materiais')}><Plus size={17}/> Adicionar material</button></div>
          <div className="hero-card"><div className="hero-copy"><span className="hero-tag"><Sparkles size={14}/> SEU MÉTODO DE ESTUDO</span><h2>Primeiro compreenda.<br/><em>Depois pratique.</em></h2><p>Transforme seus documentos em resumos didáticos e avaliações que acompanham sua evolução.</p><button className="hero-btn" onClick={() => setPage('materiais')}>Começar agora <ChevronRight size={17}/></button></div><div className="hero-graphic"><div className="orb orb-one"/><div className="orb orb-two"/><div className="book-illustration"><BookOpen size={78} strokeWidth={1.15}/><Sparkles className="sparkle s1"/><Sparkles className="sparkle s2"/></div><div className="floating-note note-one"><CheckCircle2 size={15}/> Resumo pronto</div><div className="floating-note note-two"><Brain size={15}/> Aprendizagem ativa</div></div></div>
          <div className="section-heading"><div><h3>Seu painel</h3><p className="muted">Dados reais da sua conta.</p></div></div>
          <div className="stats-grid"><Stat icon={<BookOpen/>} label="Materiais" value={String(materials.length)} note={materials.length ? 'Arquivos na biblioteca' : 'Nenhum arquivo enviado'}/><Stat icon={<ClipboardCheck/>} label="Questões respondidas" value={String(attempts.reduce((a,x)=>a+(x.total_questions||0),0))} note={attempts.length ? 'Histórico real dos simulados' : 'Seu histórico começa aqui'}/><Stat icon={<Target/>} label="Aproveitamento" value={attempts.length ? `${Math.round(attempts.reduce((a,x)=>a+(Number(x.score)||0),0)/attempts.length)}%` : '—'} note={attempts.length ? 'Média das tentativas' : 'Disponível após o primeiro simulado'}/><Stat icon={<ChartNoAxesCombined/>} label="Simulados" value={String(attempts.length)} note={attempts.length ? 'Tentativas concluídas' : 'Ainda não há tentativas'}/></div>
          <div className="lower-grid"><div className="panel"><div className="panel-head"><div><h3>Comece por aqui</h3><p className="muted">O caminho recomendado para estudar.</p></div><span className="step-count">4 ETAPAS</span></div><div className="steps"><Step n="01" icon={<CloudUpload/>} title="Envie seu material" desc="Adicione PDFs, apresentações ou documentos." done={materials.length > 0}/><Step n="02" icon={<FileText/>} title="Leia o resumo" desc="Estude os pontos essenciais antes da avaliação." done={summaries.length > 0}/><Step n="03" icon={<Brain/>} title="Responda às questões" desc="Pratique com dificuldade progressiva." done={attempts.length > 0}/><Step n="04" icon={<ChartNoAxesCombined/>} title="Revise suas dificuldades" desc="Receba um plano de reforço personalizado." done={attempts.length > 0}/></div></div>
          <div className="panel side-panel"><div className="panel-head"><div><h3>Disciplinas</h3><p className="muted">{subjects.length ? `${subjects.length} disciplina(s)` : 'Sua biblioteca começa vazia.'}</p></div><button className="icon-btn" onClick={createSubject}><Plus size={17}/></button></div>{subjects.length ? <div className="steps">{subjects.map(s => <div className="step" key={s.id}><div className="step-icon"><BookOpen size={17}/></div><div className="step-copy"><strong>{s.name}</strong><small>{materials.filter(m => m.subject_id === s.id).length} material(is)</small></div></div>)}</div> : <div className="empty-state"><div className="empty-icon"><Library size={23}/></div><strong>Nenhuma disciplina ainda</strong><p>Crie uma disciplina para organizar os materiais.</p><button className="text-btn" onClick={createSubject}>Criar disciplina <ChevronRight size={15}/></button></div>}</div></div>
        </section>}

        {page === 'materiais' && <section className="content">
          <div className="page-title-row"><div><div className="eyebrow">BIBLIOTECA PESSOAL</div><h1>Meus materiais</h1><p className="muted">Arquivos armazenados na sua conta Supabase.</p></div><button className="primary-btn" disabled={uploading} onClick={() => document.getElementById('file-input')?.click()}><Plus size={17}/> {uploading ? 'Enviando...' : 'Enviar arquivo'}</button></div>
          <input id="file-input" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt" hidden onChange={e => { const file=e.target.files?.[0]; if(file) uploadMaterial(file); e.currentTarget.value='' }}/>
          {!user ? <div className="upload-zone"><div className="upload-icon"><CloudUpload size={30}/></div><h3>Entre para enviar materiais</h3><p>O armazenamento é privado e vinculado à sua conta.</p><button className="secondary-btn" onClick={() => setShowAuth(true)}>Entrar ou criar conta</button></div> : <>
            <div className="panel" style={{marginTop:25}}><div className="panel-head"><div><h3>Disciplina do novo material</h3><p className="muted">Opcional. Você pode criar uma disciplina pelo botão +.</p></div><button className="icon-btn" onClick={createSubject}><Plus size={17}/></button></div><select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} style={{marginTop:15,width:'100%',padding:11,border:'1px solid #dfe5e2',borderRadius:8}}><option value="">Sem disciplina</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="upload-zone"><div className="upload-icon"><CloudUpload size={30}/></div><h3>Adicione seu próximo material</h3><p>PDF, DOCX, PPTX ou TXT. O arquivo será enviado ao bucket privado <strong>study-materials</strong>.</p><button className="secondary-btn" disabled={uploading} onClick={() => document.getElementById('file-input')?.click()}>{uploading ? 'Enviando...' : 'Selecionar arquivo'}</button><small>Limite inicial: 20 MB por arquivo.</small></div>
          </>}
          <div className="notice"><Sparkles size={18}/><div><strong>Processamento automático</strong><p>Após o upload, o Estuda extrai o texto, salva os blocos, gera o resumo e cria o primeiro simulado. O processamento atual usa um fallback local determinístico; a camada Gemini será adicionada como provedor opcional depois.</p></div></div>
          {loadingData ? <p className="muted" style={{marginTop:20}}>Carregando biblioteca...</p> : materials.length > 0 && <div className="panel" style={{marginTop:17}}><div className="panel-head"><div><h3>Arquivos enviados</h3><p className="muted">{materials.length} material(is).</p></div></div><div className="steps">{materials.map(m => <div className="step" key={m.id}><div className="step-icon"><FileText size={17}/></div><div className="step-copy"><strong>{m.title}</strong><small>{m.original_filename} · {m.status === 'uploaded' ? 'enviado' : m.status}</small></div><span className="level-status">{new Date(m.created_at).toLocaleDateString('pt-BR')}</span></div>)}</div></div>}
        </section>}

        {page === 'resumos' && <section className="content"><div className="eyebrow">LEITURA ANTES DA AVALIAÇÃO</div><h1>Resumos de estudo</h1><p className="muted">O simulado só é liberado depois da leitura registrada.</p>{!user ? <div className="study-card"><h2>Entre para acessar seus resumos</h2><button className="primary-btn" onClick={() => setShowAuth(true)}>Entrar</button></div> : summaries.length === 0 ? <div className="study-card"><h2>Nenhum resumo ainda</h2><p className="muted">Envie um material para gerar o primeiro resumo.</p></div> : <div className="study-card"><select value={selectedSummary} onChange={e => setSelectedSummary(e.target.value)}>{summaries.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>{selectedSummary && <div className="summary-block"><h2>{summaries.find(s => s.id === selectedSummary)?.title}</h2><div className="summary-content">{summaries.find(s => s.id === selectedSummary)?.content.split('\n').map((line,i)=><p key={i}>{line || ' '}</p>)}</div><button className="primary-btn" onClick={() => completeSummary(selectedSummary)}>Concluir leitura e ir para o simulado <ChevronRight size={17}/></button></div>}</div>}</section>}
        {page === 'simulados' && <section className="content"><div className="eyebrow">AVALIAÇÃO PROGRESSIVA</div><h1>Simulado adaptativo</h1><p className="muted">5 níveis, 20 questões por nível. O próximo nível exige pelo menos 70% no anterior.</p>{!user ? <div className="study-card"><h2>Entre para responder</h2><button className="primary-btn" onClick={() => setShowAuth(true)}>Entrar</button></div> : quizzes.length === 0 ? <div className="study-card"><h2>Nenhum simulado ainda</h2><p className="muted">Envie e processe um material primeiro.</p></div> : <><div className="panel"><div className="panel-head"><div><h3>Escolha o nível</h3><p className="muted">Níveis bloqueados exigem aprovação no anterior.</p></div></div><select value={selectedQuiz} onChange={e => openQuiz(e.target.value)} style={{width:'100%',padding:11,border:'1px solid #dfe5e2',borderRadius:8}}>{quizzes.filter(q => q.quiz_type !== 'recovery').map(q => <option key={q.id} value={q.id}>Nível {q.level ?? q.difficulty} — {q.question_count} questões</option>)}</select></div>{questions.length === 0 ? <div className="study-card"><p className="muted">Selecione um nível e comece.</p><button className="primary-btn" onClick={() => openQuiz(selectedQuiz)}>Começar nível</button></div> : <div className="quiz-list">{questions.map(q => { const detail = quizResult?.details?.find((d:any) => d.question_id === q.id); return <div className={`panel quiz-question ${detail ? (detail.correct ? 'answered-correct' : 'answered-wrong') : ''}`} key={q.id}><div className="eyebrow">QUESTÃO {q.question_number}</div><h3>{q.statement}</h3>{q.alternatives.map(a => <label className={`alternative ${detail?.correct_alternative_id === a.id ? 'correct-option' : detail && answers[q.id] === a.id && !detail.correct ? 'wrong-option' : ''}`} key={a.id}><input type="radio" name={q.id} checked={answers[q.id]===a.id} disabled={!!quizResult} onChange={()=>setAnswers({...answers,[q.id]:a.id})}/><strong>{a.letter}.</strong> {a.text}</label>)}{detail && <p className="quiz-feedback">{detail.correct ? 'Resposta correta.' : 'Resposta incorreta. A alternativa correta está destacada.'} {q.explanation || ''}</p>}</div>})}{!quizResult ? <button className="primary-btn" onClick={submitQuiz}>Finalizar nível</button> : <><div className="notice"><CheckCircle2 size={20}/><div><strong>Resultado do nível: {quizResult.score}%</strong><p>{quizResult.correct} de {quizResult.total} respostas corretas. {quizResult.can_advance ? 'Próximo nível liberado.' : (quizResult.level < 5 ? 'É necessário alcançar 70% para avançar.' : 'Você concluiu os 5 níveis.')}</p></div></div><div className="auth-actions"><button className="secondary-btn" onClick={createRecoveryQuiz}>Treinar meus erros</button><button className="secondary-btn" onClick={() => { setQuizResult(null); setAnswers({}); window.scrollTo({top:0,behavior:'smooth'}) }}>Tentar novamente</button>{quizResult.can_advance && quizResult.next_quiz_id && <button className="primary-btn" onClick={() => openQuiz(quizResult.next_quiz_id)}>Avançar para o nível {Number(quizResult.level)+1}</button>}</div></>}</div>}</>}</section>}
        {page === 'desempenho' && <section className="content"><div className="eyebrow">ACOMPANHAMENTO</div><h1>Desempenho</h1><p className="muted">Resultados registrados nos seus simulados.</p>{attempts.length === 0 ? <div className="panel performance-empty"><ChartNoAxesCombined size={34}/><h3>Ainda não há dados</h3><p>Conclua um simulado para começar a construir seu histórico.</p></div> : <><div className="stats-grid"><Stat icon={<ClipboardCheck/>} label="Simulados" value={String(attempts.length)} note="Tentativas concluídas"/><Stat icon={<Target/>} label="Aproveitamento" value={`${Math.round(attempts.reduce((a,x)=>a+(Number(x.score)||0),0)/attempts.length)}%`} note="Média das tentativas"/><Stat icon={<Brain/>} label="Questões" value={String(attempts.reduce((a,x)=>a+(x.total_questions||0),0))} note="Questões avaliadas"/><Stat icon={<CheckCircle2/>} label="Acertos" value={String(attempts.reduce((a,x)=>a+(x.correct_count||0),0))} note="Respostas corretas"/></div><div className="panel" style={{marginTop:18}}><div className="panel-head"><div><h3>Histórico</h3><p className="muted">Mais recente primeiro.</p></div></div><div className="steps">{attempts.map(a => <div className="step" key={a.id}><div className="step-icon"><ClipboardCheck size={17}/></div><div className="step-copy"><strong>{quizzes.find(q=>q.id===a.quiz_id)?.title || 'Simulado'}</strong><small>{a.correct_count}/{a.total_questions} acertos · {a.completed_at ? new Date(a.completed_at).toLocaleString('pt-BR') : ''}</small></div><span className="level-status">{Number(a.score || 0).toFixed(0)}%</span></div>)}</div></div></>}</section>}
      </main>

      {showAuth && <div className="modal-backdrop" onMouseDown={e => {if(e.target===e.currentTarget)setShowAuth(false)}}><div className="auth-modal"><button className="modal-close" onClick={() => setShowAuth(false)}><X size={18}/></button><div className="brand-mark"><GraduationCap size={22}/></div><h2>{authMode === 'login' ? 'Entrar no Estuda' : 'Criar sua conta'}</h2><p className="muted">{authMode === 'login' ? 'Acesse seus materiais e progresso.' : 'Sua conta será vinculada ao banco privado do Estuda.'}</p>{authMode==='signup' && <><label>Nome<label><input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Seu nome"/></label></label></>}<label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@exemplo.com" autoComplete="email"/></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 6 caracteres" autoComplete={authMode==='login'?'current-password':'new-password'}/></label>{authMessage && <div className="auth-message" style={{marginTop:14,fontSize:11}}>{authMessage}</div>}<div className="auth-actions"><button className="primary-btn" onClick={authMode==='login'?signIn:signUp}>{authMode==='login'?'Entrar':'Criar conta'}</button><button className="secondary-btn" onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthMessage('')}}>{authMode==='login'?'Criar conta':'Já tenho conta'}</button>{authMode==='signup' && <button className="text-btn" onClick={resendConfirmation}>Reenviar confirmação</button>}</div>{user && <button className="text-btn" style={{marginTop:15}} onClick={signOut}>Sair da conta</button>}<small>Autenticação por e-mail e senha via Supabase Auth.</small></div></div>}
    </div>
  )
}

function Stat({icon,label,value,note}:{icon:React.ReactNode;label:string;value:string;note:string}) { return <div className="stat-card"><div className="stat-top"><div className="stat-icon">{icon}</div><span className="stat-label">{label}</span></div><strong className="stat-value">{value}</strong><small>{note}</small></div> }
function Step({n,icon,title,desc,done}:{n:string;icon:React.ReactNode;title:string;desc:string;done:boolean}) { return <div className="step"><span className="step-n">{n}</span><div className="step-icon">{icon}</div><div className="step-copy"><strong>{title}</strong><small>{desc}</small></div><CheckCircle2 size={17} className="step-check" style={{color:done?'#4d9b76':undefined}}/></div> }