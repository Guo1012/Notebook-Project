<script lang="ts">
  import { goto } from '$app/navigation';
  import Brand from '$lib/components/Brand.svelte';
  import { login } from '$lib/api/auth';

  let username = $state('');
  let password = $state('');
  let submitting = $state(false);
  let error = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    submitting = true; error = '';
    try { await login(username, password); await goto('/'); }
    catch (reason) { error = reason instanceof Error ? reason.message : '登录失败'; }
    finally { submitting = false; }
  }
</script>

<svelte:head><title>登录 · Lumen</title></svelte:head>
<main class="login-shell">
  <section>
    <Brand />
    <h1>登录实验工作台</h1>
    <p>使用分配给你的账号继续。</p>
    <form onsubmit={submit}>
      <label>用户名<input bind:value={username} autocomplete="username" required /></label>
      <label>密码<input bind:value={password} type="password" autocomplete="current-password" required /></label>
      {#if error}<div class="error">{error}</div>{/if}
      <button disabled={submitting}>{submitting ? '登录中…' : '登录'}</button>
    </form>
  </section>
</main>

<style>
  .login-shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--paper); color: var(--ink); }
  section { width: min(380px, 100%); padding: 32px; border: 1px solid var(--line); border-radius: 16px; background: white; box-shadow: var(--shadow); }
  h1 { margin: 32px 0 8px; font-family: var(--font-display); font-size: 30px; } p { margin: 0 0 24px; color: var(--muted); }
  form, label { display: grid; gap: 8px; } form { gap: 18px; } label { font-size: 13px; font-weight: 650; }
  input { height: 42px; padding: 0 12px; border: 1px solid var(--line); border-radius: 9px; font: inherit; }
  button { height: 44px; border: 0; border-radius: 10px; background: var(--ink); color: white; font-weight: 700; cursor: pointer; }
  button:disabled { opacity: .6; } .error { color: #a54f42; font-size: 13px; }
</style>
