import { computed } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

export type Locale = 'zh-CN' | 'en'

const messages: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    // AppHeader
    'header.connections': '连接列表',
    'header.newConnection': '新建连接',
    'header.settings': '设置',
    'header.ai': 'AI',

    // Sidebar
    'sidebar.title': '连接',
    'sidebar.newConnection': '新建连接',
    'sidebar.collapse': '收起',
    'sidebar.noConnections': '暂无连接',
    'sidebar.noSearchResults': '无匹配结果',
    'sidebar.searchPlaceholder': '搜索名称或主机...',
    'sidebar.connect': '连接',
    'sidebar.edit': '编辑',
    'sidebar.duplicate': '复制',
    'sidebar.delete': '删除',

    // ConnectionForm
    'conn.editTitle': '编辑连接',
    'conn.newTitle': '新建连接',
    'conn.name': '名称',
    'conn.namePlaceholder': '我的服务器',
    'conn.type': '类型',
    'conn.host': '主机',
    'conn.hostPlaceholder': '192.168.1.1',
    'conn.port': '端口',
    'conn.user': '用户名',
    'conn.userPlaceholder': 'root',
    'conn.authType': '认证方式',
    'conn.password': '密码',
    'conn.keyPath': '密钥路径',
    'conn.keyPathPlaceholder': '~/.ssh/id_rsa',
    'conn.cancel': '取消',
    'conn.saveConnect': '保存并连接',
    'conn.connect': '连接',
    'conn.save': '保存',
    'conn.saveOnly': '仅保存',
    'conn.hostRequired': '主机地址不能为空',

    // TabItem
    'tab.duplicate': '复制',
    'tab.closeRight': '关闭右侧标签',
    'tab.closeLeft': '关闭左侧标签',
    'tab.closeOther': '关闭其他标签',
    'tab.close': '关闭',

    // TerminalTab
    'terminal.askAI': '问AI',
    'terminal.copy': '复制',
    'terminal.copyAndPaste': '复制并粘贴',
    'terminal.paste': '粘贴',

    // Input context menu
    'input.cut': '剪切',
    'input.copy': '复制',
    'input.paste': '粘贴',
    'input.selectAll': '全选',

    // AISidebar
    'ai.title': 'AI 助手',
    'ai.settings': '设置',
    'ai.close': '关闭',
    'ai.newSession': '新建会话',
    'ai.recentSessions': '最近会话',
    'ai.debug': '调试',
    'ai.thinking': '思考中...',
    'ai.placeholder': '让 AI 帮你做点什么...',
    'ai.send': '发送',
    'ai.stop': '停止',
    'ai.run': '运行',
    'ai.skip': '跳过',
    'ai.in': '输入',
    'ai.out': '输出',
    'ai.bypass': '全部免确认',
    'ai.confirm': '确认',
    'ai.confirmAll': '全部确认',
    'ai.confirmDangerous': '仅高危确认',
    'ai.dangerous': '高危',
    'ai.justNow': '刚刚',
    'ai.minutesAgo': '{n}分钟前',
    'ai.hoursAgo': '{n}小时前',
    'ai.daysAgo': '{n}天前',
    'ai.monthsAgo': '{n}个月前',
    'ai.yearsAgo': '{n}年前',

    // AIMessage
    'ai.avatarUser': '你',
    'ai.avatarTool': '工具',
    'ai.avatarAI': 'AI',

    // SettingsTab
    'settings.title': '设置',
    'settings.basic': '基础设置',
    'settings.terminal': '终端配置',
    'settings.ai': 'AI 助理设置',
    'settings.theme': '主题',
    'settings.themeDark': '暗色',
    'settings.themeDeepBlue': '深蓝',
    'settings.themeLight': '浅色',
    'settings.themeSystem': '跟随系统',
    'settings.language': '语言',
    'settings.langZhCN': '简体中文',
    'settings.langEn': 'English',
    'settings.langSystem': '系统默认',
    'settings.colorScheme': '配色方案',
    'settings.font': '字体',
    'settings.fontSize': '字体大小',
    'settings.selectionAction': '选中后执行',
    'settings.selectionNone': '无动作',
    'settings.selectionCopy': '复制到剪贴板',
    'settings.rightClick': '右键功能',
    'settings.rightClickMenu': '弹出右键菜单',
    'settings.rightClickPaste': '直接粘贴',
    'settings.maxHistory': '最大历史行数',
    'settings.themeDesc': '选择界面主题风格',
    'settings.languageDesc': '切换界面显示语言',
    'settings.colorSchemeDesc': '终端窗口的配色方案',
    'settings.fontDesc': '终端显示的字体',
    'settings.fontSizeDesc': '终端字体大小',
    'settings.selectionActionDesc': '选中文字后的默认操作',
    'settings.rightClickDesc': '右键点击终端的行为',
    'settings.maxHistoryDesc': '终端保留的最大输出行数',
    'settings.modelList': '模型列表',
    'settings.modelListDesc': '配置和管理 AI 模型',
    'settings.addModel': '添加模型',
    'settings.editModel': '编辑模型',
    'settings.newModel': '添加模型',
    'settings.modelName': '名称',
    'settings.modelBaseURL': 'Base URL',
    'settings.modelModel': '模型',
    'settings.modelApiKey': 'API Key',
    'settings.modelProtocol': '协议',
    'settings.cancel': '取消',
    'settings.save': '保存',
  },
  'en': {
    // AppHeader
    'header.connections': 'Connections',
    'header.newConnection': 'New Connection',
    'header.settings': 'Settings',
    'header.ai': 'AI',

    // Sidebar
    'sidebar.title': 'Connections',
    'sidebar.newConnection': 'New Connection',
    'sidebar.collapse': 'Collapse',
    'sidebar.noConnections': 'No connections yet',
    'sidebar.noSearchResults': 'No matches',
    'sidebar.searchPlaceholder': 'Search name or host...',
    'sidebar.connect': 'Connect',
    'sidebar.edit': 'Edit',
    'sidebar.duplicate': 'Duplicate',
    'sidebar.delete': 'Delete',

    // ConnectionForm
    'conn.editTitle': 'Edit Connection',
    'conn.newTitle': 'New Connection',
    'conn.name': 'Name',
    'conn.namePlaceholder': 'My Server',
    'conn.type': 'Type',
    'conn.host': 'Host',
    'conn.hostPlaceholder': '192.168.1.1',
    'conn.port': 'Port',
    'conn.user': 'User',
    'conn.userPlaceholder': 'root',
    'conn.authType': 'Auth Type',
    'conn.password': 'Password',
    'conn.keyPath': 'Key Path',
    'conn.keyPathPlaceholder': '~/.ssh/id_rsa',
    'conn.cancel': 'Cancel',
    'conn.saveConnect': 'Save & Connect',
    'conn.connect': 'Connect',
    'conn.save': 'Save',
    'conn.saveOnly': 'Save Only',
    'conn.hostRequired': 'Host is required',

    // TabItem
    'tab.duplicate': 'Duplicate',
    'tab.closeRight': 'Close Tabs to the Right',
    'tab.closeLeft': 'Close Tabs to the Left',
    'tab.closeOther': 'Close Other Tabs',
    'tab.close': 'Close',

    // TerminalTab
    'terminal.askAI': 'Ask AI',
    'terminal.copy': 'Copy',
    'terminal.copyAndPaste': 'Copy & Paste',
    'terminal.paste': 'Paste',

    // Input context menu
    'input.cut': 'Cut',
    'input.copy': 'Copy',
    'input.paste': 'Paste',
    'input.selectAll': 'Select All',

    // AISidebar
    'ai.title': 'AI Assistant',
    'ai.settings': 'Settings',
    'ai.close': 'Close',
    'ai.newSession': 'New Session',
    'ai.recentSessions': 'Recent Sessions',
    'ai.debug': 'Debug',
    'ai.thinking': 'Thinking...',
    'ai.placeholder': 'Ask the AI to do something...',
    'ai.send': 'Send',
    'ai.stop': 'Stop',
    'ai.run': 'Run',
    'ai.skip': 'Skip',
    'ai.in': 'IN',
    'ai.out': 'OUT',
    'ai.bypass': 'Bypass',
    'ai.confirm': 'Confirm',
    'ai.confirmAll': 'Confirm All',
    'ai.confirmDangerous': 'Dangerous Only',
    'ai.dangerous': 'DANGER',
    'ai.justNow': 'just now',
    'ai.minutesAgo': '{n} min ago',
    'ai.hoursAgo': '{n} hr ago',
    'ai.daysAgo': '{n} days ago',
    'ai.monthsAgo': '{n} months ago',
    'ai.yearsAgo': '{n} years ago',

    // AIMessage
    'ai.avatarUser': 'You',
    'ai.avatarTool': 'Tool',
    'ai.avatarAI': 'AI',

    // SettingsTab
    'settings.title': 'Settings',
    'settings.basic': 'Basic',
    'settings.terminal': 'Terminal',
    'settings.ai': 'AI Assistant',
    'settings.theme': 'Theme',
    'settings.themeDark': 'Dark',
    'settings.themeDeepBlue': 'Deep Blue',
    'settings.themeLight': 'Light',
    'settings.themeSystem': 'System',
    'settings.language': 'Language',
    'settings.langZhCN': '简体中文',
    'settings.langEn': 'English',
    'settings.langSystem': 'System Default',
    'settings.colorScheme': 'Color Scheme',
    'settings.font': 'Font',
    'settings.fontSize': 'Font Size',
    'settings.selectionAction': 'Selection Action',
    'settings.selectionNone': 'None',
    'settings.selectionCopy': 'Copy to clipboard',
    'settings.rightClick': 'Right Click Action',
    'settings.rightClickMenu': 'Show context menu',
    'settings.rightClickPaste': 'Paste directly',
    'settings.maxHistory': 'Max History Lines',
    'settings.themeDesc': 'Choose the interface theme',
    'settings.languageDesc': 'Switch the display language',
    'settings.colorSchemeDesc': 'Terminal color scheme',
    'settings.fontDesc': 'Terminal font family',
    'settings.fontSizeDesc': 'Terminal font size',
    'settings.selectionActionDesc': 'Default action after selecting text',
    'settings.rightClickDesc': 'Right-click behavior in terminal',
    'settings.maxHistoryDesc': 'Maximum output lines to keep in terminal',
    'settings.modelList': 'Model List',
    'settings.modelListDesc': 'Configure and manage AI models',
    'settings.addModel': 'Add Model',
    'settings.editModel': 'Edit Model',
    'settings.newModel': 'Add Model',
    'settings.modelName': 'Name',
    'settings.modelBaseURL': 'Base URL',
    'settings.modelModel': 'Model',
    'settings.modelApiKey': 'API Key',
    'settings.modelProtocol': 'Protocol',
    'settings.cancel': 'Cancel',
    'settings.save': 'Save',
  }
}

function resolveLocale(): Locale {
  const settingsStore = useSettingsStore()
  const lang = settingsStore.language
  if (lang === 'system') {
    const navLang = navigator.language
    if (navLang.startsWith('zh')) return 'zh-CN'
    return 'en'
  }
  return lang as Locale
}

export function useI18n() {
  const locale = computed(() => resolveLocale())

  function t(key: string, params?: Record<string, string | number>): string {
    const msg = messages[locale.value]?.[key] || messages['en']?.[key] || key
    if (!params) return msg
    return msg.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
  }

  return { t, locale }
}

// Direct translation function for non-component usage
export function t(key: string, params?: Record<string, string | number>): string {
  try {
    const locale = resolveLocale()
    const msg = messages[locale]?.[key] || messages['en']?.[key] || key
    if (!params) return msg
    return msg.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
  } catch {
    return key
  }
}
