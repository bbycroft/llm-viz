
import resolveConfig from 'tailwindcss/resolveConfig'
import tailwindConfig from '../..//tailwind.config.js'

let cfg = resolveConfig(tailwindConfig);

let colors = cfg.theme!.colors! as Record<Color, Record<Values, string>>;

type Color = 'current'
| 'transparent'
| 'black'
| 'white'
| 'slate'
| 'gray'
| 'zinc'
| 'neutral'
| 'stone'
| 'red'
| 'orange'
| 'amber'
| 'yellow'
| 'lime'
| 'green'
| 'emerald'
| 'teal'
| 'cyan'
| 'sky'
| 'blue'
| 'indigo'
| 'violet'
| 'purple'
| 'fuchsia'
| 'pink'
| 'rose';

type Values = '50'
| '100'
| '200'
| '300'
| '400'
| '500'
| '600'
| '700'
| '800'
| '900'
| '950';

export const palette = {
    compBg: colors.cyan['500'],
    portInputBg: 'rgb(45 212 191)',
    portOutputBg: 'rgb(251 146 60)',
};

export const paletteTw = {
    compBg: 'bg-cyan-500',
    portInputBg: 'bg-teal-400',
    portOutputBg: 'bg-orange-400',
};
