// Design tokens — GERADO por scripts/generate_palette.py. Nao edite a mao.

export const primitives = {
  brand: { '50': '#F8F7FF', '100': '#EFECFF', '200': '#DFD9FF', '300': '#CCC2FF', '400': '#B5A2FF', '500': '#9774FD', '600': '#7955D7', '700': '#603FAF', '800': '#492F88', '900': '#321F5F', '950': '#211441' },
  accent: { '50': '#F6FAEB', '100': '#ECF3D8', '200': '#DAE5B3', '300': '#C5D587', '400': '#ABBE55', '500': '#8A9D0E', '600': '#6D7D00', '700': '#556200', '800': '#414A00', '900': '#2C3300', '950': '#1C2200' },
  neutral: { '0': '#FFFFFF', '50': '#F8F7F9', '100': '#EFEEF1', '200': '#DEDEE3', '300': '#CBCAD2', '400': '#B2B1BB', '500': '#91909B', '600': '#73727C', '700': '#5A5962', '800': '#44434A', '900': '#2E2E33', '925': '#26252C', '950': '#1E1E22', '960': '#19181F', '970': '#14131A', '980': '#100F15', '990': '#0C0B11', '1000': '#08070D', '1010': '#050408' },
  success: { '50': '#EEFCF3', '100': '#DCF7E6', '200': '#BAEDCE', '300': '#91E0B3', '400': '#60CC93', '500': '#1AAC6E', '600': '#008955', '700': '#006C42', '800': '#005331', '900': '#003920', '950': '#002614' },
  warning: { '50': '#FFF7EA', '100': '#FEECD2', '200': '#FAD9A7', '300': '#F4C273', '400': '#E5A52E', '500': '#BF8500', '600': '#986900', '700': '#785200', '800': '#5C3E00', '900': '#402A00', '950': '#2B1B00' },
  danger: { '50': '#FFF5F4', '100': '#FFE9E6', '200': '#FFD3CD', '300': '#FFB6AE', '400': '#FF8D83', '500': '#F0554F', '600': '#C93433', '700': '#A32223', '800': '#7E1718', '900': '#580F0F', '950': '#3D0808' },
  info: { '50': '#F1F9FF', '100': '#DFF2FF', '200': '#BEE5FF', '300': '#94D4FF', '400': '#4FBEFF', '500': '#009CE0', '600': '#007CB2', '700': '#00618D', '800': '#004A6D', '900': '#00334C', '950': '#002134' },
} as const

export const color = {
  // superficies
  'bg/base': primitives.neutral['1000'], // #08070D
  'bg/panel': primitives.neutral['990'], // #0C0B11
  'bg/surface': primitives.neutral['980'], // #100F15
  'bg/raised': primitives.neutral['970'], // #14131A
  'bg/inset': primitives.neutral['1010'], // #050408
  'bg/hover': primitives.neutral['960'], // #19181F
  'bg/active': primitives.neutral['925'], // #26252C
  'bg/selected': primitives.brand['950'], // #211441
  // marca
  'bg/brand': primitives.brand['500'], // #9774FD
  'bg/brand-hover': primitives.brand['400'], // #B5A2FF
  'bg/brand-subtle': primitives.brand['950'], // #211441
  'bg/brand-muted': primitives.brand['900'], // #321F5F
  // fundos de status
  'bg/success-subtle': primitives.success['950'], // #002614
  'bg/warning-subtle': primitives.warning['950'], // #2B1B00
  'bg/danger-subtle': primitives.danger['950'], // #3D0808
  'bg/info-subtle': primitives.info['950'], // #002134
  'bg/neutral-subtle': primitives.neutral['925'], // #26252C
  // texto
  'text/primary': primitives.neutral['50'], // #F8F7F9
  'text/secondary': primitives.neutral['400'], // #B2B1BB
  'text/tertiary': primitives.neutral['500'], // #91909B
  'text/disabled': primitives.neutral['700'], // #5A5962
  'text/inverse': primitives.neutral['1000'], // #08070D
  'text/on-brand': primitives.neutral['1000'], // #08070D
  'text/brand': primitives.brand['400'], // #B5A2FF
  'text/link': primitives.brand['400'], // #B5A2FF
  'text/code': primitives.neutral['300'], // #CBCAD2
  'text/success': primitives.success['400'], // #60CC93
  'text/warning': primitives.warning['400'], // #E5A52E
  'text/danger': primitives.danger['400'], // #FF8D83
  'text/info': primitives.info['400'], // #4FBEFF
  // bordas
  'border/subtle': primitives.neutral['960'], // #19181F
  'border/default': primitives.neutral['925'], // #26252C
  'border/strong': primitives.neutral['800'], // #44434A
  'border/brand': primitives.brand['500'], // #9774FD
  'border/danger': primitives.danger['500'], // #F0554F
  'border/focus': primitives.brand['400'], // #B5A2FF
  // dominio — sessao
  'session/running': primitives.success['400'], // #60CC93
  'session/exited': primitives.neutral['500'], // #91909B
  'session/failed': primitives.danger['400'], // #FF8D83
  'session/shell': primitives.info['400'], // #4FBEFF
  'session/agent': primitives.brand['400'], // #B5A2FF
  // dominio — worktree e git
  'worktree/clean': primitives.success['400'], // #60CC93
  'worktree/dirty': primitives.warning['400'], // #E5A52E
  'worktree/missing': primitives.danger['400'], // #FF8D83
  'git/branch': primitives.accent['400'], // #ABBE55
  'git/ahead': primitives.info['400'], // #4FBEFF
  'git/behind': primitives.warning['400'], // #E5A52E
  'git/added': primitives.success['400'], // #60CC93
  'git/removed': primitives.danger['400'], // #FF8D83
  'git/modified': primitives.warning['400'], // #E5A52E
  // dominio — hierarquia e daemon
  'scope/workspace': primitives.brand['400'], // #B5A2FF
  'scope/project': primitives.neutral['400'], // #B2B1BB
  'scope/worktree': primitives.accent['400'], // #ABBE55
  'daemon/online': primitives.success['400'], // #60CC93
  'daemon/offline': primitives.danger['400'], // #FF8D83
  // dominio — codigo
  'syntax/keyword': primitives.brand['400'], // #B5A2FF
  'syntax/string': primitives.accent['400'], // #ABBE55
  'syntax/number': primitives.warning['300'], // #F4C273
  'syntax/comment': primitives.neutral['600'], // #73727C
  'syntax/function': primitives.info['400'], // #4FBEFF
  'syntax/type': primitives.success['300'], // #91E0B3
  'syntax/punctuation': primitives.neutral['400'], // #B2B1BB
  'git/added-subtle': primitives.success['950'], // #002614
  'git/removed-subtle': primitives.danger['950'], // #3D0808
  'git/untracked': primitives.info['400'], // #4FBEFF
  // dominio — editor
  'editor/cursor': primitives.brand['400'], // #B5A2FF
  'editor/selection': primitives.brand['900'], // #321F5F
  'editor/active-line': primitives.neutral['980'], // #100F15
  'editor/line-number': primitives.neutral['500'], // #91909B
  'editor/line-number-active': primitives.neutral['300'], // #CBCAD2
  'editor/readonly': primitives.neutral['400'], // #B2B1BB
  // dominio — salvamento
  'save/saving': primitives.neutral['400'], // #B2B1BB
  'save/saved': primitives.success['400'], // #60CC93
  'save/failed': primitives.danger['400'], // #FF8D83
  'save/stale': primitives.warning['400'], // #E5A52E
} as const

export const space = { '0': 0, '1': 1, '2': 2, '4': 4, '6': 6, '8': 8, '10': 10, '12': 12, '16': 16, '20': 20, '24': 24, '32': 32, '40': 40, '48': 48, '64': 64 } as const
export const radius = { 'none': 0, 'xs': 2, 'sm': 4, 'md': 6, 'lg': 8, 'xl': 12, '2xl': 16, 'full': 9999 } as const
export const size = { 'control/xs': 20, 'control/sm': 24, 'control/md': 28, 'control/lg': 32, 'control/xl': 40, 'icon/xs': 12, 'icon/sm': 14, 'icon/md': 16, 'icon/lg': 20, 'row/compact': 28, 'row/cozy': 32, 'target/min': 24, 'topbar/height': 40, 'sidebar/width': 264, 'detail/max': 880, 'terminal/min': 420, 'dialog/width': 420, 'menu/width': 300, 'panel/right': 360, 'panel/right-min': 260, 'panel/right-max': 720, 'gutter/line': 44, 'viewer/min': 360 } as const

export type ColorToken = keyof typeof color
