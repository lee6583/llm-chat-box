/**
 * Markdown 渲染工具模块
 * 
 * 提供 Markdown 文本到 HTML 的转换功能，支持：
 * - 代码高亮（highlight.js）
 * - Emoji 表情
 * - 链接自动转换
 * - 代码块复制和主题切换功能
 */

import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import python from 'highlight.js/lib/languages/python'
import java from 'highlight.js/lib/languages/java'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'
import mdLinkAttributes from 'markdown-it-link-attributes'
import { full as emoji } from 'markdown-it-emoji'
// import 'highlight.js/styles/github.css'
// 使用 atom-one-dark 主题作为代码高亮样式（暗色主题，适合代码展示）
import 'highlight.js/styles/atom-one-dark.css'
import copyIcon from '@/assets/photo/复制.png'
import darkIcon from '@/assets/photo/暗黑模式.png'
import lightIcon from '@/assets/photo/明亮模式.png'

// 仅注册聊天场景中常见的代码语言，避免引入 highlight.js 全量语言包
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('java', java)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('rs', rust)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('vue', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)

/**
 * 创建 markdown-it 实例，统一配置 Markdown 渲染规则
 * 
 * 配置项说明：
 * - html: true - 允许 HTML 标签在 Markdown 中渲染（安全性由后端保证）
 * - breaks: true - 单个换行符转换为 <br>（GitHub 风格）
 * - linkify: true - 自动将 URL 文本转换为链接
 * - highlight: 自定义代码块高亮函数
 */
const md = new MarkdownIt({
  html: false, // 禁止直接渲染原始 HTML，避免模型返回内容通过 v-html 注入页面
  breaks: true, // 转换单个换行符为 <br> 标签（GitHub 风格的换行）
  linkify: true, // 自动将文本中的 URL 转换为链接
  /**
   * 自定义代码块高亮函数
   * 
   * @param {string} str - 代码内容
   * @param {string} lang - 代码语言（如 'javascript', 'python' 等）
   * @returns {string} 高亮后的 HTML 字符串
   */
  highlight: function (str, lang) {
    // 如果指定了语言且 highlight.js 支持该语言
    if (lang && hljs.getLanguage(lang)) {
      try {
        // 使用 highlight.js 进行语法高亮
        // ignoreIllegals: true 表示忽略无法识别的语法，继续高亮
        const highlighted = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
        
        // 返回包含代码块头部（语言标识、复制按钮、主题切换按钮）的完整 HTML
        // 代码块结构：
        // - code-block: 外层容器
        //   - code-header: 头部栏（语言名 + 操作按钮）
        //     - code-lang: 语言标识
        //     - code-actions: 操作按钮组
        //       - copy: 复制按钮
        //       - theme: 主题切换按钮（暗色/亮色）
        //   - pre.hljs: 高亮后的代码内容
        return `<div class="code-block"><div class="code-header"><span class="code-lang">${lang}</span><div class="code-actions"><button class="code-action-btn" data-action="copy" data-tooltip="复制"><img src="${copyIcon}" alt="copy" /></button><button class="code-action-btn" data-action="theme" data-tooltip="切换主题"><img src="${darkIcon}" alt="theme" data-light-icon="${lightIcon}" data-dark-icon="${darkIcon}" /></button></div></div><pre class="hljs"><code>${highlighted}</code></pre></div>`
      } catch {
        // 高亮失败时静默处理，返回未高亮的代码块
      }
    }
    // 如果没有指定语言或语言不支持，返回未高亮的代码块（使用 HTML 转义防止 XSS）
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  },
})

/**
 * 配置所有链接在新标签页打开，并加上安全相关属性
 * 
 * 使用 markdown-it-link-attributes 插件，为所有链接添加：
 * - target="_blank": 在新标签页打开
 * - rel="noopener": 防止新页面访问 window.opener（安全考虑）
 */
md.use(mdLinkAttributes, {
  attrs: {
    target: '_blank', // 在新标签页打开链接
    rel: 'noopener noreferrer nofollow', // 安全属性，防止新页面访问原页面并降低恶意跳转风险
  },
})

/**
 * 启用 emoji 支持
 * 
 * 支持使用 :smile: 这样的语法插入 emoji 表情
 * 例如：:smile: 会被转换为 😄
 */
md.use(emoji)

/**
 * 对外的 Markdown 渲染函数
 * 
 * 将纯文本 Markdown 转换为 HTML 字符串
 * 这是组件中主要使用的函数
 * 
 * @param {string} content - Markdown 格式的文本内容
 * @returns {string} 渲染后的 HTML 字符串
 * 
 * @example
 * const html = renderMarkdown('# 标题\n这是一段**粗体**文本')
 * // 返回: '<h1>标题</h1>\n<p>这是一段<strong>粗体</strong>文本</p>'
 */
export const renderMarkdown = (content) => {
  // 如果内容为空，直接返回空字符串
  if (!content) return ''
  // 使用 markdown-it 实例渲染 Markdown 为 HTML
  return md.render(content)
}

/**
 * 导出 markdown-it 实例
 * 
 * 允许在其他地方进行更细粒度的扩展和自定义
 * 例如添加自定义插件、修改渲染规则等
 */
export { md }
