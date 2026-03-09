/**
 * 应用入口文件
 * 
 * 负责创建 Vue 应用实例并挂载全局插件
 * 这是整个应用的启动点，所有全局配置都在这里完成
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Pinia 持久化插件（IndexedDB），用于将 store 数据保存到浏览器本地数据库
import { createPiniaIndexedDbPersist } from './plugins/piniaIndexedDbPersist'
// 根组件
import App from './App.vue'
// 路由配置
import router from './router'
// 全局样式文件
import './assets/styles/main.scss'
// 动画库（用于过渡效果）
import 'animate.css'

/**
 * 创建 Vue 应用实例
 * 
 * 使用 createApp 创建应用实例，传入根组件 App
 * 这是 Vue 3 的推荐方式，替代了 Vue 2 的 new Vue()
 */
const app = createApp(App)
const pinia = createPinia()

/**
 * 注册 Pinia 状态管理
 * 
 * 创建 Pinia 实例并挂载持久化插件
 * 持久化插件会自动将配置了 persist: true 的 store 保存到 IndexedDB
 * 
 * 持久化的 store：
 * - stores/chat.js - 聊天对话和消息数据
 * - stores/setting.js - 用户设置和配置
 * 
 * @description
 * 持久化机制：
 * - 数据自动保存到 IndexedDB（按当前站点隔离）
 * - 页面刷新后自动恢复数据
 * - 键名格式：'llm-chat'、'llm-setting'（与 store id 一致）
 */
pinia.use(
  createPiniaIndexedDbPersist({
    dbName: 'llm-chat-box',
    objectStore: 'pinia-state',
    debounceMs: 250,
  }),
)
app.use(pinia)

/**
 * 注册路由
 * 
 * 使用 Vue Router 进行页面路由管理
 * 路由配置在 router/index.js 中定义
 * 
 * @description
 * 路由结构：
 * - / - 首页（HomePage）
 * - /chat - 聊天页（ChatView）
 */
app.use(router)

/**
 * 挂载应用到 DOM
 * 
 * 将 Vue 应用挂载到 id 为 'app' 的 DOM 元素上
 * 这个元素在 index.html 中定义
 * 
 * @description
 * 挂载后：
 * - Vue 应用开始运行
 * - 组件开始渲染
 * - 路由开始工作
 * - 所有插件和 store 生效
 */
app.mount('#app')
