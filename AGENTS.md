<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- App is built in TanStack Start SPA mode (static `.output/public`, `.htaccess` fallback) — no createServerFn or server routes; all logic and data access must run client-side, because it is hosted on Hostinger without a server.
- Modo demo: `VITE_DEMO=1 bun run build` (o `VITE_DEMO=1 bun run dev`) usa datos de ejemplo en memoria sin Supabase, para previsualizar y probar la interfaz. El deploy a Hostinger NO lleva esa variable.
- Asistente IA: `supabase/functions/asistente/index.ts` (Edge Function, secreto `ANTHROPIC_API_KEY`). La web la llama con `supabase.functions.invoke("asistente")`.
