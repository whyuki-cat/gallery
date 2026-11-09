import type { LucideIcon } from 'lucide-react'
import { FolderOpen, Library, Scissors, Settings2 } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  description: string
  badge?: string
  disabled?: boolean
}

export interface NavSection {
  id: string
  label: string
  items: NavItem[]
}

export const navSections: NavSection[] = [
  {
    id: 'tools',
    label: '工具',
    items: [
      {
        to: '/tools/rename',
        label: '文件管理',
        icon: FolderOpen,
        description: '浏览本地目录，批量重命名、删除与预览媒体文件。',
      },
      {
        to: '/tools/trim',
        label: '视频裁剪',
        icon: Scissors,
        description: '按时间区间截取视频片段，以无损方式逐段或合并导出。',
      },
    ],
  },
  {
    id: 'library',
    label: '媒体',
    items: [
      {
        to: '/library',
        label: '媒体库',
        icon: Library,
        description: '扫描本地目录，建立可浏览、可播放的媒体库。',
        badge: '规划中',
        disabled: true,
      },
    ],
  },
]

export const settingsItem: NavItem = {
  to: '/settings',
  label: '设置',
  icon: Settings2,
  description: '调整界面外观与其他本地偏好。',
}

export const allNavItems: NavItem[] = [
  ...navSections.flatMap((section) => section.items),
  settingsItem,
]

export function findNavItem(pathname: string) {
  return allNavItems.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
}

export function findNavSection(item: NavItem | undefined) {
  if (!item) return undefined
  if (item === settingsItem) {
    return { id: 'system', label: '系统', items: [settingsItem] }
  }
  return navSections.find((section) => section.items.includes(item))
}
