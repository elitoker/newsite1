// Gallery looks: famous museums, and the four kinds of museum you can start a
// free play game with. A style only sets building settings; the show comes separately.

export const MUSEUMS = {
  louvre: {
    name: 'The Louvre', city: 'Paris',
    blurb: 'Deep red salons, gilt frames and chandeliers, with the glass pyramid in the courtyard.',
    aliases: ['louvre'],
    look: { layout: 'enfilade', room: { w: 16, d: 66, h: 8 }, wallColor: '#7a2a2a', floor: 'walnut', frame: 'gold', fixture: 'chandelier', skylight: 'strips', backdrop: 'plaza', landmark: 'pyramid', time: 0.3, warmth: 0.75 },
    show: { title: 'Masterpieces of the Grand Gallery', queries: ['Raphael', 'Titian', 'Rembrandt', 'Rubens', 'Poussin', 'Fragonard', 'David'] },
  },
  met: {
    name: 'The Met', city: 'New York',
    blurb: 'A row of gray-green galleries with oak floors and gilt frames, beside Central Park.',
    aliases: ['met', 'metropolitan'],
    look: { layout: 'enfilade', room: { w: 14, d: 56, h: 6.5 }, wallColor: '#6f7a6c', floor: 'oak', frame: 'gold', fixture: 'pendant', skylight: 'strips', backdrop: 'park', time: 0.15, warmth: 0.6 },
    show: { title: 'European Paintings, 1300 to 1900', queries: ['Vermeer', 'El Greco', 'Goya', 'Rembrandt', 'Monet', 'Cézanne'] },
  },
  moma: {
    name: 'MoMA', city: 'New York',
    blurb: 'White walls, pale oak, thin black frames and track lights in midtown.',
    aliases: ['moma', 'museum of modern art'],
    look: { layout: 'hall', room: { w: 30, d: 34, h: 5 }, wallColor: '#f1efea', floor: 'oak', frame: 'black', fixture: 'track', skylight: 'none', backdrop: 'city', time: 0.1, warmth: 0.35 },
    show: { title: 'Modern Beginnings', queries: ['Cézanne', 'Seurat', 'Van Gogh', 'Gauguin', 'Toulouse-Lautrec', 'Klimt'] },
  },
  tate: {
    name: 'Tate Modern', city: 'London',
    blurb: 'A converted power station: concrete floors, charcoal walls, enormous scale.',
    aliases: ['tate'],
    look: { layout: 'single', room: { w: 26, d: 60, h: 12 }, wallColor: '#34332f', floor: 'concrete', frame: 'none', fixture: 'track', skylight: 'giant', backdrop: 'city', time: 0.2, warmth: 0.4 },
    show: { title: 'Weather and Light', queries: ['Turner', 'Constable', 'storm', 'fog'] },
  },
  orsay: {
    name: 'Musée d\'Orsay', city: 'Paris',
    blurb: 'An old railway station under one giant glass roof, with sculpture down the nave.',
    aliases: ['orsay'],
    look: { layout: 'hall', room: { w: 34, d: 60, h: 11 }, wallColor: '#c9c3b8', floor: 'concrete', frame: 'gold', fixture: 'chandelier', skylight: 'giant', backdrop: 'city', time: 0.35, warmth: 0.6, sculptures: ['figure', 'bust', 'reclining', 'figure'] },
    show: { title: 'The Impressionist Revolution', queries: ['Monet', 'Renoir', 'Degas', 'Pissarro', 'Sisley', 'Morisot', 'Caillebotte'] },
  },
  uffizi: {
    name: 'The Uffizi', city: 'Florence',
    blurb: 'Long corridors of Renaissance painting, terracotta walls, marble busts between the windows.',
    aliases: ['uffizi', 'florence'],
    look: { layout: 'enfilade', room: { w: 10, d: 70, h: 7 }, wallColor: '#b5654a', floor: 'walnut', frame: 'gold', fixture: 'pendant', skylight: 'strips', backdrop: 'plaza', time: 0.4, warmth: 0.8, sculptures: ['bust', 'bust', 'bust'] },
    show: { title: 'The Renaissance in Florence', queries: ['Botticelli', 'Filippo Lippi', 'Fra Angelico', 'Perugino', 'Italian Renaissance'] },
  },
  dia: {
    name: 'Detroit Institute of Arts', city: 'Detroit',
    blurb: 'Beaux-Arts galleries off a grand central hall, warm walls and a big glass court.',
    aliases: ['dia', 'detroit'],
    look: { layout: 'hall', room: { w: 32, d: 44, h: 7 }, wallColor: '#8a7560', floor: 'walnut', frame: 'gold', fixture: 'pendant', skylight: 'giant', backdrop: 'city', time: 0.2, warmth: 0.65 },
    show: { title: 'American and European Masters', queries: ['Van Gogh', 'Bruegel', 'Whistler', 'Sargent', 'Cassatt'] },
  },
};

// The first question in free play: what kind of museum is this?
export const KINDS = {
  whitecube: {
    name: 'White cube', blurb: 'Bright, modern, quiet. The art does the talking.',
    look: { layout: 'hall', room: { w: 28, d: 36, h: 5.5 }, wallColor: '#f1efea', floor: 'oak', frame: 'black', fixture: 'track', skylight: 'strips', warmth: 0.45 },
  },
  palace: {
    name: 'Grand palace', blurb: 'Colored walls, gilt frames, chandeliers, a long run of rooms.',
    look: { layout: 'enfilade', room: { w: 16, d: 56, h: 8 }, wallColor: '#7a2a2a', floor: 'walnut', frame: 'gold', fixture: 'chandelier', skylight: 'strips', warmth: 0.75 },
  },
  industrial: {
    name: 'Industrial', blurb: 'A converted warehouse with concrete floors and a glass roof.',
    look: { layout: 'single', room: { w: 26, d: 44, h: 10 }, wallColor: '#34332f', floor: 'concrete', frame: 'none', fixture: 'track', skylight: 'giant', warmth: 0.4 },
  },
  salon: {
    name: 'Jewel box', blurb: 'Small, intimate rooms in deep colors, like a collector\'s house.',
    look: { layout: 'enfilade', room: { w: 11, d: 36, h: 5 }, wallColor: '#26344d', floor: 'walnut', frame: 'gold', fixture: 'pendant', skylight: 'none', warmth: 0.8 },
  },
};

export const ARRIVALS = { morning: ['Morning', 0.05], golden: ['Golden hour', 0.4], sunset: ['Sunset', 0.6], night: ['Night', 1] };

export const WALLS_WITH = {
  raquel: { name: 'Raquel Weinberg', title: 'Raquel Weinberg: New Work', queries: ['raquel'] },
  impressionists: { name: 'The Impressionists', title: 'The Impressionist Eye', queries: ['Monet', 'Renoir', 'Pissarro', 'Sisley', 'Degas', 'Morisot'] },
  masters: { name: 'Old masters', title: 'Old Masters', queries: ['Rembrandt', 'Rubens', 'Titian', 'Vermeer', 'Velázquez'] },
  mix: { name: 'A bit of everything', title: null, queries: null },
};

// Turn a look into state changes
export function applyLook(state, look) {
  const { fixture, warmth, sculptures, time, landmark = '', ...rest } = look;
  Object.assign(state, rest, { landmark });
  if (time !== undefined) state.time = time;
  state.lighting = { ...state.lighting, ...(fixture ? { fixture } : {}), ...(warmth !== undefined ? { warmth } : {}) };
  state.furniture = [];
  state.partitions = [];
  state.pendingSculptures = sculptures || [];
}

// "the Georgia O'Keeffe show at DIA" -> { artist: "Georgia O'Keeffe", museum: 'dia', museumText: 'DIA' }
export function parseShowQuery(text) {
  let t = text.trim().replace(/[“”"]/g, '');
  let museumText = '';
  const at = t.match(/\s+(?:at|@|in)\s+(?:the\s+)?(.+)$/i);
  if (at) { museumText = at[1].trim(); t = t.slice(0, at.index); }
  const artist = t
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\b(show|exhibition|exhibit|retrospective|survey|paintings|works)\b/gi, '')
    .replace(/['’]s\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const low = museumText.toLowerCase();
  const museum = Object.keys(MUSEUMS).find(k => MUSEUMS[k].aliases.some(a => new RegExp(`\\b${a}\\b`).test(low))) || null;
  return { artist, museum, museumText };
}
