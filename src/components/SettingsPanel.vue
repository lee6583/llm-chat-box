<script setup>
/**
 * 设置面板组件
 * 
 * 负责配置模型参数，包括：
 * - 模型选择
 * - 流式响应开关
 * - API Key 配置
 * - maxTokens（最大 token 数）
 * - temperature（温度参数）
 * - topP（核采样参数）
 * - topK（Top-K 采样参数）
 * 
 * 功能：
 * - 所有配置项都会自动持久化到 localStorage
 * - 根据选择的模型动态调整 maxTokens 上限
 * - 提供友好的 UI 和提示信息
 * 
 * 使用方式：
 * 父组件通过 ref 调用 openDrawer 方法打开设置面板
 * 
 * @example
 * <SettingsPanel ref="settingDrawer" />
 * 
 * // 在父组件中
 * settingDrawer.value.openDrawer()
 */

import { ref, watch, computed } from 'vue'
import { useSettingStore, modelOptions } from '@/stores/setting'
import { QuestionFilled } from '@element-plus/icons-vue'

/**
 * 全局设置 store
 * 
 * 所有配置项都会被持久化到本地（localStorage）
 * 修改配置后会自动保存，刷新页面后配置不丢失
 */
const settingStore = useSettingStore()

/**
 * 控制抽屉显示/隐藏
 * 
 * @type {Ref<boolean>}
 * @description
 * 控制 el-drawer 组件的显示/隐藏
 * true: 显示设置面板
 * false: 隐藏设置面板
 */
const visible = ref(false)

/**
 * 根据当前选中模型动态计算其允许的最大 tokens
 * 
 * @type {ComputedRef<number>}
 * @description
 * 上限会用来限制滑块范围，防止用户设置超过模型支持的最大值
 * 
 * 计算逻辑：
 * 1. 从 modelOptions 中查找当前选中的模型
 * 2. 如果找到，返回该模型的 maxTokens
 * 3. 如果找不到，返回默认值 4096
 * 
 * @returns {number} 当前模型支持的最大 token 数
 */
const currentMaxTokens = computed(() => {
  // 从模型列表中查找当前选中的模型
  const selectedModel = modelOptions.find((option) => option.value === settingStore.settings.model)
  // 如果找到模型，返回其 maxTokens；否则返回默认值 4096
  return selectedModel ? selectedModel.maxTokens : 4096
})

/**
 * 监听模型变化
 * 
 * 当切换模型时，自动调整 maxTokens，避免超过模型上限
 * 
 * @description
 * 监听逻辑：
 * 1. 监听 settingStore.settings.model 的变化
 * 2. 当模型切换时，检查当前 maxTokens 是否超过新模型的上限
 * 3. 如果超过，自动调整为新模型的上限值
 * 
 * 使用场景：
 * - 用户从支持 16K tokens 的模型切换到只支持 4K tokens 的模型
 * - 如果当前 maxTokens 设置为 8000，会自动调整为 4096
 */
watch(
  () => settingStore.settings.model, // 监听的响应式数据
  (newModel) => {
    // 查找新模型对应的配置
    const selectedModel = modelOptions.find((option) => option.value === newModel)
    if (selectedModel) {
      // 更新 maxTokens，并确保不超过模型的最大值
      // Math.min 确保 maxTokens 不会超过模型支持的上限
      settingStore.settings.maxTokens = Math.min(
        settingStore.settings.maxTokens, // 当前设置的 maxTokens
        selectedModel.maxTokens, // 新模型支持的最大值
      )
    }
  },
)

/**
 * 打开抽屉的方法
 * 
 * 供父组件通过 ref 调用
 * 
 * @description
 * 设置 visible 为 true，触发 el-drawer 显示
 * 
 * @example
 * settingDrawer.value.openDrawer()
 */
const openDrawer = () => {
  visible.value = true
}

/**
 * 暴露方法给父组件
 * 
 * 通过 defineExpose 暴露 openDrawer 方法
 * 父组件（ChatView）可以通过 ref 访问此方法
 * 
 * @description
 * 暴露的方法：
 * - openDrawer: 打开设置面板
 */
defineExpose({
  openDrawer, // 打开设置面板的方法
})
</script>

<template>
  <el-drawer v-model="visible" title="设置" direction="rtl" size="350px">
    <div class="setting-container">
      <!-- 模型选择 -->
      <div class="setting-item">
        <div class="setting-label">Model</div>
        <el-select
          v-model="settingStore.settings.model"
          class="model-select"
          placeholder="选择或输入模型"
          filterable
          allow-create
          default-first-option
        >
          <el-option
            v-for="option in modelOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </div>

      <!-- 流式响应开关 -->
      <div class="setting-item">
        <div class="setting-label-row">
          <div class="label-with-tooltip">
            <span>流式响应</span>
            <el-tooltip content="开启后将流式响应 AI 的回复" placement="top">
              <el-icon><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
          <el-switch v-model="settingStore.settings.stream" />
        </div>
      </div>

      <!-- API Key -->
      <div class="setting-item">
        <div class="setting-label-row">
          <div class="label-with-tooltip">
            <span>API Key</span>
            <el-tooltip
              content="建议填写你自己的 Key。也可通过 VITE_DEFAULT_API_KEY 注入默认 Key（会打包进前端并公开可见）"
              placement="top"
            >
              <el-icon><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
        </div>
        <el-input
          v-model="settingStore.settings.apiKey"
          type="password"
          placeholder="输入你的 API Key"
          show-password
        />
        <div class="hint-text">留空将无法请求接口；填写后会使用你的 Key 并可切换/自定义模型。</div>
      </div>

      <!-- Max Tokens -->
      <div class="setting-item">
        <div class="setting-label">
          Max Tokens
          <el-tooltip content="生成文本的最大长度" placement="top">
            <el-icon><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="setting-control">
          <el-slider
            v-model="settingStore.settings.maxTokens"
            :min="1"
            :max="currentMaxTokens"
            :step="1"
            :show-tooltip="false"
            class="setting-slider"
          />
          <el-input-number
            v-model="settingStore.settings.maxTokens"
            :min="1"
            :max="currentMaxTokens"
            :step="1"
            controls-position="right"
          />
        </div>
      </div>

      <!-- Temperature -->
      <div class="setting-item">
        <div class="setting-label">
          Temperature
          <el-tooltip content="值越高，回答越随机" placement="top">
            <el-icon><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="setting-control">
          <el-slider
            v-model="settingStore.settings.temperature"
            :min="0"
            :max="2"
            :step="0.1"
            :show-tooltip="false"
            class="setting-slider"
          />
          <el-input-number
            v-model="settingStore.settings.temperature"
            :min="0"
            :max="2"
            :step="0.1"
            controls-position="right"
          />
        </div>
      </div>

      <!-- Top-P -->
      <div class="setting-item">
        <div class="setting-label">
          Top-P
          <el-tooltip content="核采样阈值" placement="top">
            <el-icon><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="setting-control">
          <el-slider
            v-model="settingStore.settings.topP"
            :min="0"
            :max="1"
            :step="0.1"
            :show-tooltip="false"
            class="setting-slider"
          />
          <el-input-number
            v-model="settingStore.settings.topP"
            :min="0"
            :max="1"
            :step="0.1"
            controls-position="right"
          />
        </div>
      </div>

      <!-- Top-K -->
      <div class="setting-item">
        <div class="setting-label">
          Top-K
          <el-tooltip content="保留概率最高的 K 个词" placement="top">
            <el-icon><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="setting-control">
          <el-slider
            v-model="settingStore.settings.topK"
            :min="1"
            :max="100"
            :step="1"
            :show-tooltip="false"
            class="setting-slider"
          />
          <el-input-number
            v-model="settingStore.settings.topK"
            :min="1"
            :max="100"
            :step="1"
            controls-position="right"
          />
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style lang="scss" scoped>
.setting-container {
  padding: 20px;
  color: #27272a;
}

.setting-item {
  margin-bottom: 24px;

  // 基础标签样式
  .setting-label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-weight: 500;
    color: #27272a;
  }

  // 水平布局的标签行，用于标签和控件在同一行的情况
  .setting-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    color: #27272a;

    // 标签和提示图标的容器
    .label-with-tooltip {
      display: flex;
      align-items: center;
      gap: 8px;
    }

  }

  // 控件容器样式，用于包含滑块和数字输入框
  .setting-control {
    display: flex;
    align-items: center;
    gap: 16px;

    // 滑块占据剩余空间
    .setting-slider {
      flex: 1;
    }

    // 数字输入框固定宽度
    :deep(.el-input-number) {
      width: 120px;
    }
  }

  // 模型选择下拉框宽度
  .model-select {
    width: 100%;
  }

  .hint-text {
    margin-top: 8px;
    font-size: 12px;
    color: #71717a;
    line-height: 1.4;
  }

  // 下拉选项文字颜色
  :deep(.el-select-dropdown__item) {
    color: #27272a;
  }
}
</style>
