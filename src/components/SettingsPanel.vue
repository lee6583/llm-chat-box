<script setup>
import { ref, watch, computed } from 'vue'
import { useSettingStore, modelOptions } from '@/stores/setting'
import { QuestionFilled, ArrowDown } from '@element-plus/icons-vue'

const settingStore = useSettingStore()
const visible = ref(false)
const advancedOpen = ref(false)

const currentMaxTokens = computed(() => {
  const selected = modelOptions.find((option) => option.value === settingStore.settings.model)
  return selected ? selected.maxTokens : 4096
})

const accessModeText = computed(() => {
  if ((settingStore.settings.apiKey || '').trim()) return '当前优先使用你填写的 API Key'
  return '当前未填写 API Key，会优先尝试站点默认配置 / 内置代理'
})

watch(
  () => settingStore.settings.model,
  (newModel) => {
    const selectedModel = modelOptions.find((option) => option.value === newModel)
    if (selectedModel) {
      settingStore.settings.maxTokens = Math.min(
        settingStore.settings.maxTokens,
        selectedModel.maxTokens,
      )
    }
  },
)

const openDrawer = () => {
  visible.value = true
}

defineExpose({
  openDrawer,
})
</script>

<template>
  <el-drawer v-model="visible" title="设置" direction="rtl" size="380px">
    <div class="setting-container">
      <div class="intro-card">
        <strong>先调这 3 项就够了</strong>
        <p>模型、是否流式、API Key 是最常用配置；其余参数建议有明确需求时再改。</p>
        <span>{{ accessModeText }}</span>
      </div>

      <div class="setting-group">
        <div class="group-title">基础设置</div>

        <div class="setting-item">
          <div class="setting-label">模型</div>
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
          <div class="hint-text">如果当前模型不可用，系统会自动切换到可用模型并提示你。</div>
        </div>

        <div class="setting-item compact-row">
          <div class="label-with-tooltip">
            <span>流式响应</span>
            <el-tooltip content="开启后会边生成边显示，更适合聊天场景" placement="top">
              <el-icon><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
          <el-switch v-model="settingStore.settings.stream" />
        </div>

        <div class="setting-item">
          <div class="setting-label-row">
            <div class="label-with-tooltip">
              <span>API Key</span>
              <el-tooltip content="可选。填写后优先使用你自己的 Key；留空时使用站点默认配置。" placement="top">
                <el-icon><QuestionFilled /></el-icon>
              </el-tooltip>
            </div>
          </div>
          <el-input
            v-model="settingStore.settings.apiKey"
            type="password"
            placeholder="可选：输入你自己的 API Key"
            show-password
          />
          <div class="hint-text">适合需要自带额度、自定义模型权限或使用私有网关时填写。</div>
        </div>
      </div>

      <div class="advanced-toggle" @click="advancedOpen = !advancedOpen">
        <span>高级设置</span>
        <el-icon :class="{ expanded: advancedOpen }"><ArrowDown /></el-icon>
      </div>

      <Transition name="slide-fade">
        <div v-if="advancedOpen" class="setting-group advanced-group">
          <div class="setting-item">
            <div class="setting-label-row">
              <div class="label-with-tooltip">
                <span>API Base URL</span>
                <el-tooltip content="只有在你有自定义网关时才需要填写，例如 https://example.com/v1" placement="top">
                  <el-icon><QuestionFilled /></el-icon>
                </el-tooltip>
              </div>
            </div>
            <el-input
              v-model="settingStore.settings.apiBaseUrl"
              placeholder="可选：例如 https://example.com/v1"
              clearable
            />
            <div class="hint-text">若出现 401 / 404，优先检查这里是否填错。</div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              Max Tokens
              <el-tooltip content="限制单次最大输出长度" placement="top">
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

          <div class="setting-item">
            <div class="setting-label">
              Temperature
              <el-tooltip content="越高越发散，越低越稳定" placement="top">
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

          <div class="setting-item">
            <div class="setting-label">
              Top-P
              <el-tooltip content="控制候选词的概率覆盖范围" placement="top">
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

          <div class="setting-item">
            <div class="setting-label">
              Top-K
              <el-tooltip content="保留概率最高的 K 个候选词；部分网关可能忽略该参数" placement="top">
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
      </Transition>
    </div>
  </el-drawer>
</template>

<style lang="scss" scoped>
.setting-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.intro-card {
  padding: 14px;
  border-radius: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;

  strong {
    display: block;
    margin-bottom: 6px;
    color: #0f172a;
  }

  p {
    margin: 0 0 8px;
    color: #475569;
    font-size: 13px;
    line-height: 1.6;
  }

  span {
    font-size: 12px;
    color: #64748b;
  }
}

.setting-group {
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 14px;
}

.setting-item {
  &:not(:last-child) {
    margin-bottom: 18px;
  }
}

.setting-label,
.setting-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: #0f172a;
  font-size: 14px;
  font-weight: 500;
}

.label-with-tooltip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.compact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hint-text {
  margin-top: 8px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.setting-control {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
}

.setting-slider {
  width: 100%;
}

.advanced-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px dashed #cbd5e1;
  color: #334155;
  cursor: pointer;
  user-select: none;

  .expanded {
    transform: rotate(180deg);
  }
}

.advanced-group {
  background: #fcfcfd;
}
</style>
