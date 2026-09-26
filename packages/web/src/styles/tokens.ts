// Design tokens — DERIVADO de tokens.css por scripts/design-derive.ts. Nao edite a mao.

export const primitives = {
  brand: { '50': '#FFF6F3', '100': '#FFE9E3', '200': '#FFD4C6', '300': '#FDB9A4', '400': '#FA9373', '500': '#F54E00', '600': '#D04200', '700': '#9D2F00', '800': '#7A2200', '900': '#551500', '950': '#3B0C00' },
  accent: { '50': '#F6FAEB', '100': '#ECF3D8', '200': '#DAE5B3', '300': '#C5D587', '400': '#ABBE55', '500': '#8A9D0E', '600': '#6D7D00', '700': '#556200', '800': '#414A00', '900': '#2C3300', '950': '#1C2200' },
  agent: { '50': '#FAF6FE', '100': '#F3EBFD', '200': '#E7D7FB', '300': '#D8BEF8', '400': '#C69CF5', '500': '#AE6BEF', '600': '#8E4CCA', '700': '#7137A4', '800': '#57297F', '900': '#3C1B59', '950': '#28113D' },
  neutral: { '0': '#FFFFFF', '50': '#F8F8F5', '100': '#EFEFEC', '200': '#DFDFDA', '300': '#CDCBC3', '400': '#B4B3A9', '500': '#939287', '600': '#75746A', '700': '#5C5B52', '800': '#45443D', '900': '#2F2F2A', '925': '#27261F', '950': '#1F1F1B', '960': '#1A1912', '970': '#15140D', '980': '#11100A', '990': '#0D0C06', '1000': '#090803', '1010': '#050502' },
  success: { '50': '#EDFCF5', '100': '#DAF7E9', '200': '#B6EED3', '300': '#8AE1BB', '400': '#52CD9D', '500': '#00AC7B', '600': '#008861', '700': '#006B4C', '800': '#005239', '900': '#003826', '950': '#002618' },
  warning: { '50': '#FFF7ED', '100': '#FFEBD4', '200': '#FED7A9', '300': '#F9BF76', '400': '#EBA135', '500': '#C58111', '600': '#9D660B', '700': '#7C5007', '800': '#5F3C04', '900': '#422902', '950': '#2D1A01' },
  danger: { '50': '#FFF5F6', '100': '#FFE8EA', '200': '#FFD2D6', '300': '#FEB4BC', '400': '#FE8B9A', '500': '#EE5271', '600': '#C73155', '700': '#A11F41', '800': '#7D1530', '900': '#570D20', '950': '#3C0714' },
  info: { '50': '#F3F8FF', '100': '#E5F0FF', '200': '#CAE1FF', '300': '#A9CEFF', '400': '#7DB5FF', '500': '#4F93E9', '600': '#3E74BA', '700': '#2F5B93', '800': '#224572', '900': '#162F50', '950': '#0C1E36' },
} as const

export const color = {
  // superficies
  'bg/base': primitives.neutral['1000'], // #090803
  'bg/panel': primitives.neutral['990'], // #0D0C06
  'bg/surface': primitives.neutral['980'], // #11100A
  'bg/raised': primitives.neutral['970'], // #15140D
  'bg/inset': primitives.neutral['1010'], // #050502
  'bg/hover': primitives.neutral['960'], // #1A1912
  'bg/active': primitives.neutral['925'], // #27261F
  'bg/selected': primitives.agent['950'], // #28113D
  // marca
  'bg/brand': primitives.brand['500'], // #F54E00
  'bg/brand-hover': primitives.brand['400'], // #FA9373
  'bg/brand-subtle': primitives.brand['950'], // #3B0C00
  'bg/brand-muted': primitives.brand['900'], // #551500
  // fundos de status
  'bg/success-subtle': primitives.success['950'], // #002618
  'bg/warning-subtle': primitives.warning['950'], // #2D1A01
  'bg/danger-subtle': primitives.danger['950'], // #3C0714
  'bg/info-subtle': primitives.info['950'], // #0C1E36
  'bg/neutral-subtle': primitives.neutral['925'], // #27261F
  // texto
  'text/primary': primitives.neutral['50'], // #F8F8F5
  'text/secondary': primitives.neutral['400'], // #B4B3A9
  'text/tertiary': primitives.neutral['500'], // #939287
  'text/disabled': primitives.neutral['700'], // #5C5B52
  'text/inverse': primitives.neutral['1000'], // #090803
  'text/on-brand': primitives.neutral['1000'], // #090803
  'text/brand': primitives.brand['400'], // #FA9373
  'text/link': primitives.agent['400'], // #C69CF5
  'text/code': primitives.neutral['300'], // #CDCBC3
  'text/success': primitives.success['400'], // #52CD9D
  'text/warning': primitives.warning['400'], // #EBA135
  'text/danger': primitives.danger['400'], // #FE8B9A
  'text/info': primitives.info['400'], // #7DB5FF
  // bordas
  'border/subtle': primitives.neutral['960'], // #1A1912
  'border/default': primitives.neutral['925'], // #27261F
  'border/strong': primitives.neutral['800'], // #45443D
  'border/brand': primitives.brand['500'], // #F54E00
  'border/danger': primitives.danger['500'], // #EE5271
  'border/focus': primitives.brand['400'], // #FA9373
  // dominio — sessao
  'session/running': primitives.success['400'], // #52CD9D
  'session/exited': primitives.neutral['500'], // #939287
  'session/failed': primitives.danger['400'], // #FE8B9A
  'session/shell': primitives.info['400'], // #7DB5FF
  'session/agent': primitives.agent['400'], // #C69CF5
  // dominio — worktree e git
  'worktree/clean': primitives.success['400'], // #52CD9D
  'worktree/dirty': primitives.warning['400'], // #EBA135
  'worktree/missing': primitives.danger['400'], // #FE8B9A
  'git/branch': primitives.accent['400'], // #ABBE55
  'git/ahead': primitives.info['400'], // #7DB5FF
  'git/behind': primitives.warning['400'], // #EBA135
  'git/added': primitives.success['400'], // #52CD9D
  'git/removed': primitives.danger['400'], // #FE8B9A
  'git/modified': primitives.warning['400'], // #EBA135
  // dominio — hierarquia e daemon
  'scope/global': primitives.info['400'], // #7DB5FF
  'scope/workspace': primitives.agent['400'], // #C69CF5
  'scope/project': primitives.neutral['400'], // #B4B3A9
  'scope/worktree': primitives.accent['400'], // #ABBE55
  'daemon/online': primitives.success['400'], // #52CD9D
  'daemon/offline': primitives.danger['400'], // #FE8B9A
  // dominio — codigo
  'syntax/keyword': primitives.agent['400'], // #C69CF5
  'syntax/string': primitives.accent['400'], // #ABBE55
  'syntax/number': primitives.warning['300'], // #F9BF76
  'syntax/comment': primitives.neutral['600'], // #75746A
  'syntax/function': primitives.info['400'], // #7DB5FF
  'syntax/type': primitives.success['300'], // #8AE1BB
  'syntax/punctuation': primitives.neutral['400'], // #B4B3A9
  'git/added-subtle': primitives.success['950'], // #002618
  'git/removed-subtle': primitives.danger['950'], // #3C0714
  'syntax/comment-diff': primitives.neutral['500'], // #939287
  'git/untracked': primitives.info['400'], // #7DB5FF
  // dominio — editor
  'editor/cursor': primitives.agent['400'], // #C69CF5
  'editor/selection': primitives.agent['900'], // #3C1B59
  'editor/active-line': primitives.neutral['980'], // #11100A
  'editor/line-number': primitives.neutral['500'], // #939287
  'editor/line-number-active': primitives.neutral['300'], // #CDCBC3
  'editor/readonly': primitives.neutral['400'], // #B4B3A9
  // dominio — salvamento
  'save/saving': primitives.neutral['400'], // #B4B3A9
  'save/saved': primitives.success['400'], // #52CD9D
  'save/failed': primitives.danger['400'], // #FE8B9A
  'save/stale': primitives.warning['400'], // #EBA135
  // dominio — conversa
  'turn/agent': primitives.agent['400'], // #C69CF5
  'turn/user': primitives.neutral['300'], // #CDCBC3
  'turn/thought': primitives.neutral['500'], // #939287
  'turn/caret': primitives.agent['400'], // #C69CF5
  'tool/pending': primitives.neutral['500'], // #939287
  'tool/running': primitives.info['400'], // #7DB5FF
  'tool/ok': primitives.success['400'], // #52CD9D
  'tool/failed': primitives.danger['400'], // #FE8B9A
  'tool/cancelled': primitives.neutral['400'], // #B4B3A9
  'permission/pending': primitives.warning['400'], // #EBA135
  'permission/allowed': primitives.success['400'], // #52CD9D
  'permission/denied': primitives.danger['400'], // #FE8B9A
  'plan/pending': primitives.neutral['500'], // #939287
  'plan/active': primitives.agent['400'], // #C69CF5
  'plan/done': primitives.success['400'], // #52CD9D
  'usage/quiet': primitives.neutral['400'], // #B4B3A9
  'usage/warn': primitives.warning['400'], // #EBA135
  'usage/over': primitives.danger['400'], // #FE8B9A
  'usage/cost': primitives.accent['400'], // #ABBE55
  'mode/plan': primitives.info['400'], // #7DB5FF
  'mode/auto': primitives.agent['400'], // #C69CF5
  'mode/bypass': primitives.danger['400'], // #FE8B9A
} as const

export const space = { '0': 0, '1': 1, '2': 2, '4': 4, '6': 6, '8': 8, '10': 10, '12': 12, '16': 16, '20': 20, '24': 24, '32': 32, '40': 40, '48': 48, '64': 64 } as const
export const radius = { 'none': 0, 'xs': 4, 'sm': 6, 'md': 8, 'lg': 12, 'xl': 16, '2xl': 20, 'full': 9999 } as const
export const size = { 'control/xs': 20, 'control/sm': 24, 'control/md': 28, 'control/lg': 32, 'control/xl': 40, 'icon/xs': 12, 'icon/sm': 14, 'icon/md': 16, 'icon/lg': 20, 'row/compact': 28, 'row/cozy': 32, 'target/min': 24, 'topbar/height': 40, 'sidebar/width': 264, 'detail/max': 880, 'terminal/min': 420, 'dialog/width': 420, 'dialog/wide': 640, 'menu/width': 300, 'menu/max-h': 280, 'panel/right': 360, 'panel/right-min': 260, 'panel/right-max': 720, 'gutter/line': 44, 'viewer/min': 360, 'turn/gutter': 20, 'tool/output-max': 240, 'composer/min': 72, 'board/col': 200, 'board/rail': 36 } as const

export type ColorToken = keyof typeof color
