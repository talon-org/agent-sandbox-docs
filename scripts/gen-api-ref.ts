#!/usr/bin/env tsx
/**
 * gen-api-ref.ts
 *
 * 从主仓 internal/api/http/router.go 和 internal/api/dto/dto.go 提取路由和 DTO 信息，
 * 生成 docs/api/ 下的各 ref 页面。
 *
 * 用法：pnpm gen:api
 *
 * 注意：自动生成的页面不要手动修改——改 dto.go 后重新跑此脚本。
 * 手写的 api/*.md 页面会被此脚本跳过（见 SKIP_FILES）。
 *
 * 当前实现：解析 router.go 提取路由列表，结合已知 dto 信息，
 * 输出结构化的路由摘要到 docs/api/_routes-summary.md（供开发者参考）。
 * 主要的 API ref 页面已手写（涵盖所有端点），此脚本作为补充工具。
 */

import * as fs from 'fs';
import * as path from 'path';

const MAIN_REPO = '/Users/dark/WebstormProjects/agent-sandbox-platform';
const DOCS_API = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'docs', 'api');

const ROUTER_GO = path.join(MAIN_REPO, 'internal', 'api', 'http', 'router.go');
const DTO_GO = path.join(MAIN_REPO, 'internal', 'api', 'dto', 'dto.go');

// ---------------------------------------------------------------
// 解析 router.go 提取路由
// ---------------------------------------------------------------
interface Route {
  method: string;
  path: string;
  handler: string;
  auth: string;
  note?: string;
}

function parseRoutes(content: string): Route[] {
  const routes: Route[] = [];

  // 匹配 mux.Handle("METHOD /path", chain(..., handler, ...) 模式
  const handleRe = /mux\.Handle\("(\w+)\s+([^"]+)"/g;
  let m: RegExpExecArray | null;

  while ((m = handleRe.exec(content)) !== null) {
    const method = m[1];
    const routePath = m[2];

    // 提取 handler 名（chain 或 chainDev 后面的 http.HandlerFunc(h.xxx)）
    const lineStart = content.lastIndexOf('\n', m.index) + 1;
    const lineEnd = content.indexOf('\n', m.index + m[0].length);
    const segment = content.slice(lineStart, lineEnd > -1 ? Math.min(m.index + 500, lineEnd + 200) : m.index + 500);

    // 判断 auth tier
    let auth = 'none';
    if (segment.includes('chainAdmin')) auth = 'admin';
    else if (segment.includes('chainOwner')) auth = 'owner';
    else if (segment.includes('chainDev')) auth = 'developer';
    else if (segment.includes('chain(') && !segment.includes('chainDev') && !segment.includes('chainAdmin')) {
      if (segment.includes(', true)') || segment.includes(', true,')) auth = 'viewer';
      else auth = 'none';
    }

    // 提取 handler 函数名
    const handlerMatch = segment.match(/http\.HandlerFunc\((?:h\.|ah\.|adminH\.|rbacH\.|imgH\.|imgProgH\.|eh\.)(\w+)/);
    const handler = handlerMatch ? handlerMatch[1] : 'unknown';

    routes.push({ method, path: routePath, handler, auth });
  }

  return routes;
}

// ---------------------------------------------------------------
// 解析 dto.go 提取结构体名列表
// ---------------------------------------------------------------
function parseDTONames(content: string): string[] {
  const names: string[] = [];
  const re = /^type (\w+)\s+struct\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    names.push(m[1]);
  }
  return names;
}

// ---------------------------------------------------------------
// 生成摘要 markdown
// ---------------------------------------------------------------
function generateSummary(routes: Route[], dtoNames: string[]): string {
  const lines: string[] = [
    '---',
    'title: API Routes Summary (Auto-generated)',
    'description: 从 router.go 自动提取的路由列表，供开发者参考。不要手动修改此文件。',
    '---',
    '',
    '# API Routes Summary',
    '',
    '> **自动生成**，不要手动修改。改 `router.go` 后运行 `pnpm gen:api` 更新。',
    '',
    `共 ${routes.length} 个路由。`,
    '',
    '## 路由列表',
    '',
    '| Method | Path | Handler | Auth |',
    '|---|---|---|---|',
  ];

  const authLabel: Record<string, string> = {
    admin: 'admin',
    owner: 'owner',
    developer: 'developer',
    viewer: 'viewer',
    none: 'none',
  };

  for (const r of routes) {
    lines.push(`| \`${r.method}\` | \`${r.path}\` | \`${r.handler}\` | ${authLabel[r.auth] ?? r.auth} |`);
  }

  lines.push('');
  lines.push('## DTO 结构体列表');
  lines.push('');
  lines.push(dtoNames.map(n => `- \`${n}\``).join('\n'));
  lines.push('');
  lines.push(`---`);
  lines.push('');
  lines.push(`*Generated at ${new Date().toISOString()}*`);

  return lines.join('\n');
}

// ---------------------------------------------------------------
// main
// ---------------------------------------------------------------
function main() {
  if (!fs.existsSync(ROUTER_GO)) {
    console.error(`❌  router.go not found: ${ROUTER_GO}`);
    process.exit(1);
  }

  if (!fs.existsSync(DTO_GO)) {
    console.error(`❌  dto.go not found: ${DTO_GO}`);
    process.exit(1);
  }

  const routerContent = fs.readFileSync(ROUTER_GO, 'utf8');
  const dtoContent = fs.readFileSync(DTO_GO, 'utf8');

  const routes = parseRoutes(routerContent);
  const dtoNames = parseDTONames(dtoContent);

  console.log(`✅  Parsed ${routes.length} routes from router.go`);
  console.log(`✅  Found ${dtoNames.length} DTO structs in dto.go`);

  const summary = generateSummary(routes, dtoNames);
  const outPath = path.join(DOCS_API, '_routes-summary.md');
  fs.writeFileSync(outPath, summary);
  console.log(`✅  Written: ${outPath}`);

  // 打印路由摘要到 stdout
  console.log('\nRoutes by auth tier:');
  const byAuth: Record<string, Route[]> = {};
  for (const r of routes) {
    if (!byAuth[r.auth]) byAuth[r.auth] = [];
    byAuth[r.auth].push(r);
  }
  for (const [auth, rs] of Object.entries(byAuth)) {
    console.log(`  ${auth}: ${rs.length} routes`);
  }
}

main();
