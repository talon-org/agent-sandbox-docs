import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Agent Sandbox Platform',
  description: 'AI agent 在线沙箱平台：让 AI 在隔离环境里写代码、跑命令、开浏览器、给项目出预览 URL',
  lang: 'zh-CN',
  cleanUrls: true,

  // ADR 文件从主仓同步，内部有指向主仓代码的相对链接，跳过检查
  ignoreDeadLinks: true,

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { property: 'og:title', content: 'Agent Sandbox Platform' }],
    ['meta', { property: 'og:description', content: 'AI agent 在线沙箱平台：让 AI 在隔离环境里写代码、跑命令、开浏览器、给项目出预览 URL' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { name: 'theme-color', content: '#7aa2f7' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap', rel: 'stylesheet' }],
  ],

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'tokyo-night',
    },
    lineNumbers: true,
  },

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      {
        text: '快速开始',
        items: [
          { text: 'curl 30 秒上手', link: '/quickstart/curl' },
          { text: 'Docker（本机 5 分钟）', link: '/quickstart/docker' },
          { text: '服务器自部署', link: '/quickstart/self-hosted' },
          { text: 'Agent SDK 第一个请求', link: '/quickstart/agent-sdk' },
        ],
      },
      {
        text: '核心概念',
        items: [
          { text: 'Sandbox 生命周期', link: '/concepts/sandbox-lifecycle' },
        ],
      },
      {
        text: 'API 参考',
        items: [
          { text: 'OpenAPI 规格', link: '/api/spec' },
          { text: '认证', link: '/api/auth' },
          { text: 'Sandboxes', link: '/api/sandboxes' },
          { text: 'Processes', link: '/api/processes' },
          { text: 'PTY', link: '/api/pty' },
          { text: '文件系统', link: '/api/fs' },
          { text: 'Browser', link: '/api/browser' },
          { text: 'Agent Run', link: '/api/agent' },
          { text: 'Admin / Secrets / Audit', link: '/api/admin' },
          { text: '错误码', link: '/api/errors' },
        ],
      },
      {
        text: '部署',
        items: [
          { text: 'Docker Compose', link: '/deploy/docker-compose' },
          { text: 'systemd 单节点', link: '/deploy/systemd-single-node' },
          { text: 'Mac → 服务器', link: '/deploy/from-mac-to-server' },
          { text: '反向代理', link: '/deploy/reverse-proxy' },
        ],
      },
      {
        text: '运维',
        items: [
          { text: '监控接入', link: '/operations/monitoring' },
        ],
      },
      { text: 'Changelog', link: '/changelog' },
    ],

    sidebar: {
      '/quickstart/': [
        {
          text: '快速开始',
          items: [
            { text: 'curl 30 秒上手', link: '/quickstart/curl' },
            { text: 'Docker（本机 5 分钟）', link: '/quickstart/docker' },
            { text: '服务器自部署', link: '/quickstart/self-hosted' },
            { text: 'Agent SDK 第一个请求', link: '/quickstart/agent-sdk' },
          ],
        },
      ],
      '/concepts/': [
        {
          text: '核心概念',
          items: [
            { text: 'Sandbox 生命周期', link: '/concepts/sandbox-lifecycle' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: '概述', link: '/api/' },
            { text: 'OpenAPI 规格(完整渲染)', link: '/api/spec' },
            { text: '认证', link: '/api/auth' },
            { text: 'Sandboxes', link: '/api/sandboxes' },
            { text: 'Processes', link: '/api/processes' },
            { text: 'PTY', link: '/api/pty' },
            { text: '文件系统 (FS)', link: '/api/fs' },
            { text: 'Browser (CDP)', link: '/api/browser' },
            { text: 'Agent Run', link: '/api/agent' },
            { text: 'Admin / Secrets / Audit', link: '/api/admin' },
            { text: '错误码', link: '/api/errors' },
          ],
        },
      ],
      '/deploy/': [
        {
          text: '部署指南',
          items: [
            { text: 'Docker Compose（开发 / demo）', link: '/deploy/docker-compose' },
            { text: 'systemd 单节点（生产）', link: '/deploy/systemd-single-node' },
            { text: 'Mac → 服务器发布', link: '/deploy/from-mac-to-server' },
            { text: '反向代理（Caddy / nginx）', link: '/deploy/reverse-proxy' },
          ],
        },
      ],
      '/operations/': [
        {
          text: '运维',
          items: [
            { text: '监控接入', link: '/operations/monitoring' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'http://x.xgit.pro/dark/agent-sandbox-platform' },
    ],

    editLink: {
      pattern: 'http://x.xgit.pro/dark/agent-sandbox-docs/edit/main/docs/:path',
      text: '在 Gitea 上编辑此页',
    },

    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'short',
      },
    },

    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档',
              },
              modal: {
                displayDetails: '显示详情',
                resetButtonTitle: '重置搜索',
                backButtonTitle: '返回',
                noResultsText: '未找到结果',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
        },
      },
    },

    footer: {
      message: '基于 MIT License 发布',
      copyright: `Copyright © 2025-${new Date().getFullYear()} Agent Sandbox Platform`,
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },

    outline: {
      label: '本页目录',
      level: [2, 3],
    },
  },
})
