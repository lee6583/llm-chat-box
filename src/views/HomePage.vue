<script setup>
import { defineAsyncComponent, ref, onMounted, onUnmounted } from 'vue'
import { Search, ChatLineRound, Document, Setting } from '@element-plus/icons-vue'

const SearchDialog = defineAsyncComponent(() => import('@/components/SearchDialog.vue'))

const searchText = ref('')
const showSearchDialog = ref(false)

const handleSearchClick = () => {
  showSearchDialog.value = true
}

const handleOverlayClick = (event) => {
  if (event.target.classList.contains('search-dialog-overlay')) {
    showSearchDialog.value = false
  }
}

const handleClickOutside = (event) => {
  const searchDialog = document.querySelector('.search-dialog')
  if (searchDialog && !searchDialog.contains(event.target) && !event.target.closest('.search-container')) {
    showSearchDialog.value = false
  }
}

const handleKeydown = (event) => {
  if (event.key === 'Escape') {
    showSearchDialog.value = false
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    showSearchDialog.value = true
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="home-page">
    <header class="header">
      <div class="header-left">
        <span class="logo-text">LLM Chat</span>
      </div>
      <div class="header-right">
        <button class="search-container" type="button" aria-label="打开快速问答" @click="handleSearchClick">
          <div class="search-input">
            <el-icon class="search-icon"><Search /></el-icon>
            <input v-model="searchText" type="text" placeholder="快速问一问" readonly />
            <div class="shortcut-key">⌘ / Ctrl + K</div>
          </div>
        </button>
        <a href="https://github.com/lee6583/llm-chat-box" target="_blank" class="github-link">
          <img src="@/assets/photo/github.png" alt="GitHub" class="github-icon" />
        </a>
      </div>
    </header>

    <main class="main-content">
      <div class="hero-section">
        <h1 class="title">欢迎使用 LLM Chat</h1>
        <p class="description">更适合日常工作的 AI 对话助手：支持多会话、附件处理、流式回复和快捷问答。</p>
        <div class="features">
          <div class="feature-item">
            <el-icon class="feature-icon"><ChatLineRound /></el-icon>
            <h3>更清晰的对话管理</h3>
            <p>自动生成会话标题、支持搜索历史记录，切换上下文更省心。</p>
          </div>
          <div class="feature-item">
            <el-icon class="feature-icon"><Document /></el-icon>
            <h3>附件处理更透明</h3>
            <p>上传后会提示哪些内容被提取、哪些被截断，让你知道模型实际看到了什么。</p>
          </div>
          <div class="feature-item">
            <el-icon class="feature-icon"><Setting /></el-icon>
            <h3>设置更易懂</h3>
            <p>基础设置与高级设置分层，既能开箱即用，也方便接入自定义网关与模型。</p>
          </div>
        </div>
        <router-link to="/chat" class="start-button">
          <span class="mirror-text">进入聊天</span>
          <div class="liquid"></div>
        </router-link>
      </div>
    </main>

    <Transition name="fade">
      <div v-if="showSearchDialog" class="search-dialog-overlay" @click="handleOverlayClick">
        <div class="search-dialog-container" @click.stop>
          <SearchDialog />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.home-page {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--el-bg-color);
  padding-left: var(--safe-area-left);
  padding-right: var(--safe-area-right);
}

.header {
  min-height: calc(64px + var(--safe-area-top));
  padding: var(--safe-area-top) 32px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  color: #171717;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  justify-content: flex-end;
}

.search-container {
  flex: 1;
  max-width: 360px;
  margin-left: 16px;
  border: none;
  background: transparent;
  cursor: pointer;
}

.search-input {
  display: flex;
  align-items: center;
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border-radius: 10px;
  background: #f4f4f5;
  border: 1px solid #ececec;

  .search-icon {
    font-size: 14px;
    color: #8f8f8f;
    margin-right: 8px;
  }

  input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    color: #000;
    cursor: pointer;
  }

  .shortcut-key {
    flex-shrink: 0;
    font-size: 12px;
    color: #475569;
    background: #fff;
    padding: 2px 6px;
    border-radius: 6px;
    border: 1px solid #dbeafe;
  }
}

.github-icon {
  width: 22px;
  height: 22px;
}

.main-content {
  padding: 80px 20px;
  padding-bottom: calc(80px + var(--safe-area-bottom));
  max-width: 1200px;
  margin: 0 auto;
}

.hero-section {
  text-align: center;
}

.title {
  font-size: 48px;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 24px;
}

.description {
  font-size: 20px;
  color: #64748b;
  max-width: 720px;
  margin: 0 auto 64px;
  line-height: 1.7;
}

.features {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  margin-bottom: 64px;
}

.feature-item {
  padding: 28px;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.06);
  text-align: left;

  .feature-icon {
    font-size: 28px;
    color: #2563eb;
    margin-bottom: 16px;
  }

  h3 {
    margin-bottom: 10px;
    color: #0f172a;
  }

  p {
    color: #64748b;
    line-height: 1.7;
  }
}

.start-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 180px;
  height: 52px;
  border-radius: 999px;
  background: linear-gradient(90deg, #2563eb, #3b82f6);
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  box-shadow: 0 16px 36px rgba(37, 99, 235, 0.22);
}

.search-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding:
    max(24px, calc(var(--safe-area-top) + 16px))
    calc(16px + var(--safe-area-right))
    calc(24px + var(--safe-area-bottom))
    calc(16px + var(--safe-area-left));
  z-index: 999;
}

.search-dialog-container {
  width: min(100%, 720px);
}

@media (max-width: 768px) {
  .header {
    height: auto;
    min-height: calc(60px + var(--safe-area-top));
    padding: calc(var(--safe-area-top) + 10px) 16px 12px;
    align-items: center;
    gap: 12px;
  }

  .shortcut-key {
    display: none;
  }

  .header-right {
    gap: 10px;
  }

  .search-container {
    margin-left: 0;
    max-width: none;
  }

  .features {
    grid-template-columns: 1fr;
  }

  .title {
    font-size: 34px;
  }

  .description {
    font-size: 16px;
    margin-bottom: 40px;
  }

  .main-content {
    padding: 40px 16px calc(32px + var(--safe-area-bottom));
  }

  .search-dialog-overlay {
    padding:
      max(8px, var(--safe-area-top))
      calc(12px + var(--safe-area-right))
      calc(12px + var(--safe-area-bottom))
      calc(12px + var(--safe-area-left));
    align-items: stretch;
  }

  .search-dialog-container {
    width: 100%;
    height: 100%;
  }
}
</style>
