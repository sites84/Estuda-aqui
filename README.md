# Estuda

PWA educacional em React + TypeScript + Vite, com Supabase Auth, PostgreSQL, Storage e Edge Functions.

## Estado atual

- Frontend PWA responsivo.
- Autenticação por e-mail e senha.
- Upload privado de materiais.
- Extração local de TXT, PDF, DOCX e PPTX.
- Resumo e cinco níveis de simulado pelo fallback determinístico atual.
- 20 questões por nível.
- Liberação progressiva com mínimo de 70%.
- Correção server-side com gabarito fora do schema público.
- Recuperação dos erros.
- Histórico de desempenho.
- Deploy preparado para GitHub Pages.

O projeto Supabase conectado é o projeto Estuda. A chave usada no frontend é apenas a publishable key; nenhuma service role key ou chave Gemini é enviada ao navegador.

## Teste local

```bash
npm install
npm run build
npm run dev
```

## Deploy

O workflow `.github/workflows/deploy-pages.yml` publica automaticamente o frontend no GitHub Pages a cada push em `main`.

URL esperada:

`https://sites84.github.io/Estuda-aqui/`

## Limitações atuais

A geração de questões ainda é determinística e baseada no texto extraído. Ela ainda não representa geração cognitiva avançada por IA.

PDFs digitalizados sem camada de texto exigem OCR, que ainda não está implementado.

As Edge Functions já estão implantadas no Supabase: `process-material`, `grade-quiz` e `create-recovery-quiz`.

## Segurança

- Storage privado.
- RLS nas tabelas de dados.
- Gabaritos no schema privado.
- Correção feita no servidor.
- Publishable key somente no cliente.
- Sem fallback automático para serviços pagos.
