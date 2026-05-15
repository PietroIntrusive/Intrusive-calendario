/*
   ═══════════════════════════════════════════════════════════════════════════
   INTRUSIVE — SUPABASE CONFIG
   ═══════════════════════════════════════════════════════════════════════════

   PREENCHA com as credenciais do projeto Supabase antes de subir / rodar.

   Onde encontrar:
     Supabase Dashboard → Project Settings → API
       • SUPABASE_URL      = "Project URL"
       • SUPABASE_ANON_KEY = "anon public" key (segura pra client-side)

   IMPORTANTE: a anon key é pública por design. NÃO use a "service_role" key
   aqui — essa é secreta e nunca deve ir pro front-end.
   ═══════════════════════════════════════════════════════════════════════════
*/

const SUPABASE_URL      = 'https://xebtpqjcpeatxkxmijgw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYnRwcWpjcGVhdHhreG1pamd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTUzNjAsImV4cCI6MjA5NDE3MTM2MH0.c1hQNNwtRFF3q3WEM3lSunupoeKFx02bhO4kZPnb_GY';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
