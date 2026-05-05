import caveatBundle from 'tegaki/fonts/caveat'

export const font = {
  ...caveatBundle,
  fontUrl:     '/fonts/caveat-subset.ttf',
  fullFontUrl: '/fonts/caveat-full.ttf',
  fontFaceCSS: `
    @font-face { font-family: 'Caveat Tegaki 3dc76002'; src: url('/fonts/caveat-subset.ttf'); }
    @font-face { font-family: 'Caveat'; src: url('/fonts/caveat-full.ttf'); }
  `,
}
