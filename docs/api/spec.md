---
title: OpenAPI 规格
layout: page
sidebar: false
aside: false
---

<style scoped>
/* 让 redoc 渲染面板占满 */
:deep(redoc) {
  display: block;
  min-height: 100vh;
}
.spec-actions {
  display: flex;
  gap: 16px;
  padding: 16px 32px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  font: 14px/1.5 system-ui, sans-serif;
}
.spec-actions a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}
.spec-actions a:hover {
  text-decoration: underline;
}
.spec-actions .spacer {
  flex: 1;
}
.spec-version {
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}
</style>

<div class="spec-actions">
  <a href="/openapi.yaml" download>下载 openapi.yaml</a>
  <a href="https://editor.swagger.io/?url=/openapi.yaml" target="_blank" rel="noopener">在 Swagger Editor 中打开</a>
  <span class="spacer"></span>
  <span class="spec-version">OpenAPI 3.1 · v1.0.0</span>
</div>

<ClientOnly>
  <redoc spec-url="/openapi.yaml" hide-loading></redoc>
</ClientOnly>

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  // 已加载就不重复
  if (document.querySelector('script[data-redoc]')) return
  const s = document.createElement('script')
  s.src = 'https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js'
  s.dataset.redoc = '1'
  s.async = true
  document.body.appendChild(s)
})
</script>
