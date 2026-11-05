export type Subject = {
  id: string
  name: string
  description: string | null
  color: string | null
}

export type Material = {
  id: string
  title: string
  status: 'uploaded' | 'processing' | 'ready' | 'failed'
  created_at: string
}

export type StudyStage = 'materials' | 'summary' | 'quiz' | 'report'