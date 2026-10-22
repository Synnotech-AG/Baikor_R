import type { ThemeConfig } from 'antd'

// The blocking /theme.css stylesheet is loaded before the application module.
// Read its computed values here because Ant Design and canvas styles need actual
// colors, rather than CSS var() expressions. Reload after editing the theme.
const rootStyles = getComputedStyle(document.documentElement)

function themeValue(name: string): string {
  const value = rootStyles.getPropertyValue(name).trim()
  if (!value) throw new Error(`Missing theme value: ${name}. Check /theme.css.`)
  return value
}

const color = (role: string) => themeValue(`--color-${role}`)

export const applicationTheme: ThemeConfig = {
  token: {
    colorPrimary: color('primary'),
    colorPrimaryHover: color('primary-hover'),
    colorPrimaryActive: color('primary-active'),
    colorPrimaryBg: color('primary-soft'),
    colorPrimaryBgHover: color('primary-soft'),
    colorPrimaryBorder: color('primary-border'),
    colorPrimaryBorderHover: color('primary-hover'),
    colorPrimaryText: color('primary'),
    colorPrimaryTextHover: color('primary-hover'),
    colorPrimaryTextActive: color('primary-active'),
    colorLink: color('primary'),
    colorLinkHover: color('primary-hover'),
    colorLinkActive: color('primary-active'),
    colorInfo: color('info'),
    colorInfoBg: color('info-soft'),
    colorInfoBorder: color('info-border'),
    colorSuccess: color('success'),
    colorSuccessBg: color('success-soft'),
    colorSuccessBorder: color('success-border'),
    colorWarning: color('warning'),
    colorWarningBg: color('warning-soft'),
    colorWarningBorder: color('warning-border'),
    colorError: color('error'),
    colorErrorHover: color('error-hover'),
    colorErrorBg: color('error-soft'),
    colorErrorBorder: color('error-border'),
    colorTextBase: color('text'),
    colorText: color('text'),
    colorTextSecondary: color('text-secondary'),
    colorTextTertiary: color('text-secondary'),
    colorTextDisabled: color('text-disabled'),
    colorTextLightSolid: color('on-primary'),
    colorBgBase: color('surface'),
    colorBgContainer: color('surface'),
    colorBgElevated: color('surface'),
    colorBgLayout: color('canvas'),
    colorBgContainerDisabled: color('surface-subtle'),
    colorBorder: color('border-strong'),
    colorBorderSecondary: color('border'),
    controlOutline: color('focus-ring'),
    fontFamily: themeValue('--font-family'),
    borderRadius: Number.parseFloat(themeValue('--border-radius')),
  },
  components: {
    Button: { fontWeight: 650 },
    Table: {
      headerBg: themeValue('--table-header-background'),
      headerColor: themeValue('--table-header-foreground'),
      headerSortActiveBg: themeValue('--table-header-background'),
      headerSortHoverBg: themeValue('--table-header-background'),
      headerSplitColor: color('transparent'),
      headerBorderRadius: 0,
      bodySortBg: color('surface'),
      borderColor: themeValue('--table-border-color'),
      rowHoverBg: themeValue('--table-row-hover-background'),
      rowSelectedBg: themeValue('--table-row-selected-background'),
      rowSelectedHoverBg: themeValue('--table-row-selected-background'),
    },
  },
}

export const mapTheme = {
  saved: { fill: themeValue('--map-saved-fill'), stroke: themeValue('--map-saved-stroke') },
  selected: { fill: themeValue('--map-selected-fill'), stroke: themeValue('--map-selected-stroke') },
  editor: { fill: themeValue('--map-editor-fill'), stroke: themeValue('--map-editor-stroke') },
  marker: { fill: themeValue('--map-marker-fill'), stroke: themeValue('--map-marker-stroke') },
}

document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color('surface'))
