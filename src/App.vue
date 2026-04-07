<template>
  <!-- 
    根组件：只负责承载路由视图
    
    这是整个应用的根组件，作为所有页面的容器
    具体显示哪个页面由 vue-router 根据当前路由决定
    
    路由匹配逻辑：
    - 路径为 '/' 时显示 HomePage 组件
    - 路径为 '/chat' 时显示 ChatView 组件
    
    组件结构：
    App.vue (根组件)
      └── <router-view> (路由视图)
          ├── HomePage.vue (首页，路径: /)
          └── ChatView.vue (聊天页，路径: /chat)
  -->
  <router-view></router-view>
</template>

<style>
/**
 * 应用级别的基础样式
 * 
 * 目前交由 main.scss 统一处理全局样式
 * 如需添加应用级别的样式，可以在这里添加
 * 
 * 注意：
 * - 这里的样式是全局的，会影响所有组件
 * - 建议使用 scoped 样式或 CSS Modules 来避免样式污染
 * - 全局样式应该在 main.scss 中定义
 */
</style>
