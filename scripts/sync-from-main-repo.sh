#!/usr/bin/env bash
# sync-from-main-repo.sh
# 从主仓同步 CHANGELOG 和 ADR 到文档站。
# 用法：bash scripts/sync-from-main-repo.sh

set -euo pipefail

MAIN_REPO="/Users/dark/WebstormProjects/agent-sandbox-platform"
DOCS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ----------------------------------------------------------------
# 检查主仓
# ----------------------------------------------------------------
if [ ! -d "$MAIN_REPO" ]; then
  echo "❌  主仓不在 $MAIN_REPO，退出" >&2
  exit 1
fi

# 检查主仓是否有未 commit 改动（警告，不阻止）
if ! git -C "$MAIN_REPO" diff --quiet HEAD 2>/dev/null; then
  echo "⚠️   主仓有未 commit 的改动，同步的可能是工作区未提交版本"
fi

echo "→  同步 CHANGELOG..."

# ----------------------------------------------------------------
# 同步 CHANGELOG.md → docs/changelog.md
# ----------------------------------------------------------------
# 保留现有 frontmatter，只替换正文
CHANGELOG_SRC="$MAIN_REPO/CHANGELOG.md"
CHANGELOG_DST="$DOCS_ROOT/docs/changelog.md"

if [ ! -f "$CHANGELOG_SRC" ]; then
  echo "  ⚠️  $CHANGELOG_SRC 不存在，跳过"
else
  # 提取主仓 CHANGELOG 正文（去掉第一行的 # Changelog 标题，换成 frontmatter 版）
  FRONTMATTER="---
title: Changelog
description: Agent Sandbox Platform 版本更新记录
---

# Changelog

本文件按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式维护。
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

> 此文件从主仓 \`CHANGELOG.md\` 自动同步，请勿手动修改。
> 运行 \`pnpm sync:docs\` 可拉取最新版本。
"

  # 跳过主仓 CHANGELOG 头部（# Changelog + 描述段落 + --- 分隔线），从第一个版本条目开始
  # 找到第一个 ## [版本] 行的行号
  FIRST_VER_LINE=$(grep -n "^## \[" "$CHANGELOG_SRC" | head -1 | cut -d: -f1)
  if [ -n "$FIRST_VER_LINE" ]; then
    BODY=$(tail -n +"$FIRST_VER_LINE" "$CHANGELOG_SRC")
  else
    # 兜底：跳过前 6 行
    BODY=$(tail -n +7 "$CHANGELOG_SRC")
  fi
  printf '%s\n\n%s\n' "$FRONTMATTER" "$BODY" > "$CHANGELOG_DST"
  echo "  ✅  CHANGELOG 已同步 → docs/changelog.md"
fi

# ----------------------------------------------------------------
# 同步 ADR（架构决策记录）
# ----------------------------------------------------------------
ADR_SRC="$MAIN_REPO/docs/decisions"
ADR_DST="$DOCS_ROOT/docs/architecture/decisions"

if [ -d "$ADR_SRC" ]; then
  mkdir -p "$ADR_DST"
  cp "$ADR_SRC"/*.md "$ADR_DST/" 2>/dev/null && \
    echo "  ✅  ADR 已同步 → docs/architecture/decisions/" || \
    echo "  ℹ️   没有 ADR 文件需要同步"
else
  echo "  ℹ️   主仓 docs/decisions/ 不存在，跳过 ADR 同步"
fi

echo ""
echo "✅  同步完成"
echo "   下一步：pnpm dev 查看效果，或 git add + commit"
