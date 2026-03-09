/**
 * 设置状态管理 Store
 * 
 * 存放模型参数、API Key 等配置
 * 通过 Pinia 持久化插件自动保存到 IndexedDB，刷新页面后配置不丢失
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 设置 Store
 * 
 * @description
 * 使用 Pinia 的 setup 语法（Composition API 风格）
 * 所有设置项都在 settings 对象中，便于统一管理和持久化
 * 
 * 持久化配置：
 * - persist: true - 启用持久化，数据自动保存到 IndexedDB
 * - key: 'llm-setting' - 存储键名
 */
export const useSettingStore = defineStore(
  'llm-setting', // Store 的唯一标识符
  () => {
    /**
     * 与后端 LLM 接口相关的所有配置项
     * 
     * @type {Ref<Object>}
     * @description
     * 配置项说明：
     * - model: 模型名称，用于指定使用的 LLM 模型
     * - apiKey: API 密钥，用于身份验证（敏感信息，持久化存储）
     * - stream: 是否启用流式响应（true: 实时显示，false: 一次性显示）
     * - maxTokens: 最大生成 token 数，限制回答长度
     * - temperature: 温度参数（0-2），控制输出的随机性
     *   - 0: 完全确定性，总是选择最可能的词
     *   - 1: 平衡随机性和确定性
     *   - 2: 高度随机，创造性更强
     * - topP: 核采样阈值（0-1），控制采样的多样性
     *   - 0.1: 只考虑前 10% 概率的词
     *   - 0.9: 考虑前 90% 概率的词
     * - topK: Top-K 采样参数（1-100），限制候选词数量
     *   - 1: 只考虑最可能的词
     *   - 50: 考虑前 50 个最可能的词
     */
    const settings = ref({
      model: 'gpt-5.3-codex', // 默认模型（走内置代理 API）
      apiKey: '', // 可选：留空时使用内置代理 key；手动填写时优先使用用户输入
      stream: true, // 是否开启流式响应（默认开启，提供更好的用户体验）
      maxTokens: 4096, // 每次回答的最大 token 数（默认值，会根据模型自动调整）
      temperature: 0.7, // 温度参数（默认 0.7，平衡创造性和准确性）
      topP: 0.7, // nucleus sampling 参数（默认 0.7）
      topK: 50, // top-k 采样参数（默认 50，部分后端不生效）
    })

    // 返回需要暴露的状态
    return {
      settings, // 设置对象（响应式）
    }
  },
  {
    // Pinia 持久化插件配置
    persist: true, // 启用持久化，数据自动保存到 IndexedDB
    // 默认存储键名：'llm-setting'
    // 默认存储位置：IndexedDB
    // 注意：apiKey 等敏感信息也会被持久化，请确保在安全环境中使用
  },
)

/**
 * 可选模型列表
 * 
 * 提供给 SettingsPanel 下拉框使用，并约束各模型的最大 tokens
 * 
 * @type {Array<Object>}
 * @description
 * 每个模型对象包含：
 * - label: string - 显示名称（用户看到的名称）
 * - value: string - 模型标识（API 中使用的值）
 * - maxTokens: number - 该模型支持的最大 token 数
 * 
 * @example
 * // 在 SettingsPanel 中使用
 * <el-option
 *   v-for="option in modelOptions"
 *   :key="option.value"
 *   :label="option.label"
 *   :value="option.value"
 * />
 */
export const modelOptions = [
  {
    label: 'GPT-5.3-Codex',
    value: 'gpt-5.3-codex',
    maxTokens: 4096,
  },
  {
    label: 'GPT-5',
    value: 'gpt-5',
    maxTokens: 4096,
  },
  {
    label: 'GPT-5 Mini',
    value: 'gpt-5-mini',
    maxTokens: 4096,
  },
  {
    label: 'GPT-4.1',
    value: 'gpt-4.1',
    maxTokens: 4096,
  },
  {
    label: 'GPT-4.1 Mini',
    value: 'gpt-4.1-mini',
    maxTokens: 4096,
  },
]
