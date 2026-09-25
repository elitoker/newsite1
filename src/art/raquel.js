// Raquel Weinberg's work, from her archive at raquelrudy.com.
// Images load straight from her Cargo site, which allows it (CORS header present).

const IN = 2.54;
const img = (hash, name, width) => `https://freight.cargo.site/w/${width}/i/${hash}/${name}`;

const WORKS = [
  ['Men I’m Scared Of', 'oil on canvas', 32, 46, '2025', 'V2980155942496246732158992272460', 'IMG_2611.jpeg', 3513, 2433],
  ['Somewhere Between the 10th and 3rd Arrondissement', 'screen print and oil on steel', 24, 24, '2025', 'F2980156261938513856587297606732', 'IMG_2805.jpeg', 2497, 2518],
  ['Public Transportation Portal', 'oil on canvas', 36, 48, '2024', 'Q2980159301519215346152374684748', 'IMG_2031.jpg', 3077, 2257],
  ['Between Essex and Delancy St.', 'screenprint on canvas', 32, 41.5, '2025', 'C2980156738879081882347754638412', 'IMG_2686.jpeg', 1972, 2437],
  ['Bar Bathroom on Marcy Ave I', 'screenprint on paper', 17.5, 27.5, '2025', 'V2980155773118242647357889334348', 'IMG_2607.jpeg', 2131, 3309],
  ['Bar Bathroom on Marcy Ave II', 'screenprint on paper', 17.5, 27.5, '2025', 'B2980157045279500946663406980172', 'IMG_1159.jpeg', 1083, 1666],
  ['Bathroom in Paris', 'screenprint on canvas', 17, 13, '2025', 'N2983777802348268473896002800716', 'IMG_2612.jpeg', 2293, 2989],
  ['Feeling Small in a Large Place', 'screenprint and oil on steel', 12, 12, '2025', 'G2980155647975530851312291171404', '04606DFE-7DD6-4F38-8C0D-590E3BC7C5E9_1_102_a.jpg', 1756, 1790],
  ['454', 'screenprint on paper', 17, 15, '2025', 'E2983777802292928241674874145868', 'IMG_2665.jpeg', 1907, 2530],
  ['Femme Fatale', 'oil on steel', 14, 14, '2025', 'S2983777802366715217969712352332', 'IMG_1163.jpeg', 1668, 1642],
  ['Untitled', 'oil on canvas', 11, 17, '2023', 'A2983777802311374985748583697484', 'IMG_2222.jpeg', 2796, 2251],
  ['How Do We Separate Art from Artist?', 'oil on canvas', 60, 72, '2023', 'T2983777802329821729822293249100', 'IMG_8066.jpeg', 3170, 2395],
];

export const RAQUEL = WORKS.map(([title, medium, a, b, date, hash, name, w, h]) => ({
  source: 'raquelrudy.com',
  sourceId: hash,
  title, medium, date,
  artist: 'Raquel Weinberg',
  thumb: img(hash, name, 300),
  src: img(hash, name, 1600),
  aspect: w / h,
  hCm: a * IN,
  wCm: b * IN,
}));

export const isRaquelQuery = q => /raquel|weinberg/i.test(q);
