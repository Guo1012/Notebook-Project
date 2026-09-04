<script lang="ts">
  import '../styles.css';
  let { children } = $props();
</script>

<svelte:head>
  <title>Lumen Notebook</title>
  <meta name="description" content="面向探索与创造的交互式 Notebook" />
</svelte:head>

{@render children()}
