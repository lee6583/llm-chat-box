/**
 * 路由配置模块
 *
 * 使用 Vue Router 进行单页应用的路由管理
 * 定义应用的所有路由规则和对应的组件
 *
 * 性能优化：
 * - 使用 defineAsyncComponent 实现路由级别的懒加载
 * - 结合 Vite 自动代码分割，按需加载组件
 * - 降低首屏加载时间，提升用户体验
 */
import { createRouter, createWebHistory } from 'vue-router'

/**
 * 创建路由实例
 *
 * 配置路由模式和路由规则
 *
 * @description
 * 路由模式：
 * - 使用 HTML5 History 模式（createWebHistory）
 * - URL 格式：/path（而不是 /#/path）
 * - 需要服务器配置支持（所有路由都返回 index.html）
 * - 支持部署到子路径（通过 BASE_URL 环境变量）
 *
 * BASE_URL 说明：
 * - 开发环境：通常为 '/'
 * - 生产环境：可以是 '/' 或 '/subpath/'
 * - 用于部署到非根路径的场景
 */
const router = createRouter({
  /**
   * 使用 HTML5 History 模式
   *
   * @description
   * createWebHistory 创建基于 HTML5 History API 的路由模式
   * 优点：
   * - URL 更美观（没有 # 号）
   * - 支持浏览器前进/后退
   * - SEO 友好
   *
   * 缺点：
   * - 需要服务器配置（所有路由返回 index.html）
   * - 不支持旧版浏览器（IE9 及以下）
   *
   * import.meta.env.BASE_URL：
   * - Vite 提供的环境变量
   * - 默认值为 '/'
   * - 可通过 vite.config.js 或环境变量配置
   */
  history: createWebHistory(import.meta.env.BASE_URL),

  /**
   * 路由规则配置
   *
   * @description
   * 每个路由对象包含：
   * - path: 路由路径（URL 路径）
   * - name: 路由名称（用于编程式导航）
   * - component: 对应的组件
   */
  routes: [
    /**
     * 首页路由
     *
     * @description
     * 路径：'/' - 根路径
     * 组件：HomePage - 首页组件
     * 功能：展示项目介绍和功能入口
     */
    {
      path: '/', // 路由路径（URL）
      name: 'home', // 路由名称（用于 router.push({ name: 'home' })）
      component: () => import('@/views/HomePage.vue'), // 直接使用路由级懒加载
    },
    /**
     * 聊天页路由
     *
     * @description
     * 路径：'/chat' - 聊天页路径
     * 组件：ChatView - 聊天页组件
     * 功能：主要的聊天界面，包含消息列表、输入框等
     */
    {
      path: '/chat', // 路由路径
      name: 'chat', // 路由名称
      component: () => import('@/views/ChatView.vue'), // 直接使用路由级懒加载
    },
  ],
})

/**
 * 导出路由实例
 *
 * 供 main.js 使用，注册到 Vue 应用中
 */
export default router
