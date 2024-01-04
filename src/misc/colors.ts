import { colors } from 'consola/utils'

export { colors as clr }

export const rainbowstrip = (size = 5) => [colors.red, colors.yellow, colors.green, colors.blue, colors.magenta, colors.cyan].map((clr, i) => clr('▃'.repeat(size))).join('')