// Pure geometry, no three.js. Turns a layout choice plus dimensions into rooms,
// wall segments (with doorways cut in), hangable wall faces, doors, benches and skylights.
//
// Axes: x runs west to east, z runs north (negative) to south (positive).
// Every room is an axis-aligned rectangle measured to wall centerlines.

const EPS = 1e-6;
const r3 = v => Math.round(v * 1000) / 1000;

export function makeRooms(kind, w, d) {
  const rooms = [];
  const add = (id, name, x0, z0, x1, z1) => {
    const r = { id, name, x0: r3(x0), z0: r3(z0), x1: r3(x1), z1: r3(z1) };
    r.cx = (r.x0 + r.x1) / 2; r.cz = (r.z0 + r.z1) / 2;
    rooms.push(r);
  };
  if (kind === 'single') {
    add('r0', 'Gallery', -w / 2, -d / 2, w / 2, d / 2);
  } else if (kind === 'enfilade') {
    const n = Math.max(2, Math.min(6, Math.round(d / 11)));
    const step = d / n;
    for (let i = 0; i < n; i++) {
      const z1 = d / 2 - i * step;
      add('r' + i, `Gallery ${i + 1}`, -w / 2, z1 - step, w / 2, z1);
    }
  } else {
    // Grand hall down the middle, galleries off both sides
    const hw = Math.max(8, Math.min(w * 0.42, w - 10));
    const side = Math.max(5, (w - hw) / 2);
    const n = Math.max(1, Math.min(6, Math.round(d / 11)));
    const step = d / n;
    add('hall', 'Grand hall', -hw / 2, -d / 2, hw / 2, d / 2);
    for (let i = 0; i < n; i++) {
      const z1 = d / 2 - i * step, z0 = z1 - step;
      add('w' + i, `West gallery ${i + 1}`, -hw / 2 - side, z0, -hw / 2, z1);
      add('e' + i, `East gallery ${i + 1}`, hw / 2, z0, hw / 2 + side, z1);
    }
  }
  return rooms;
}

export function generateLayout(params, opts = {}) {
  const T = opts.wallT ?? 0.3;
  const DW = opts.doorW ?? 2.6;
  const h = params.h;
  const DH = Math.min(opts.doorH ?? 3.2, h - 0.6);
  const rooms = makeRooms(params.layout, params.w, params.d);
  const roomById = Object.fromEntries(rooms.map(r => [r.id, r]));

  // 1. Collect every room edge onto shared lines.
  // "pos" = the room on the positive-axis side of the line, "neg" = the negative side.
  const lines = { h: new Map(), v: new Map() };
  const push = (o, c, e) => {
    const k = c.toFixed(3);
    if (!lines[o].has(k)) lines[o].set(k, { c, list: [] });
    lines[o].get(k).list.push(e);
  };
  for (const r of rooms) {
    push('h', r.z0, { a: r.x0, b: r.x1, room: r.id, side: 1 });
    push('h', r.z1, { a: r.x0, b: r.x1, room: r.id, side: -1 });
    push('v', r.x0, { a: r.z0, b: r.z1, room: r.id, side: 1 });
    push('v', r.x1, { a: r.z0, b: r.z1, room: r.id, side: -1 });
  }

  // 2. Split each line into pieces where the rooms on either side stay the same.
  const pieces = [];
  for (const o of ['h', 'v']) {
    const sorted = [...lines[o].values()].sort((p, q) => p.c - q.c);
    for (const { c, list } of sorted) {
      const pts = [...new Set(list.flatMap(e => [e.a, e.b]))].sort((x, y) => x - y);
      let cur = null;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], m = (a + b) / 2;
        if (b - a < EPS) continue;
        const pos = list.find(e => e.side > 0 && e.a <= m && m <= e.b)?.room ?? null;
        const neg = list.find(e => e.side < 0 && e.a <= m && m <= e.b)?.room ?? null;
        if (!pos && !neg) { cur = null; continue; }
        if (cur && cur.pos === pos && cur.neg === neg && Math.abs(cur.b - a) < EPS) cur.b = b;
        else { cur = { o, c, a, b, pos, neg }; pieces.push(cur); }
      }
    }
  }

  // 3. Doors between rooms, wall segments around them, and the faces you can hang on.
  const doors = [], segments = [], faces = {}, counters = {};
  const edgeName = (o, side) => (o === 'h' ? (side > 0 ? 'N' : 'S') : (side > 0 ? 'W' : 'E'));
  const addFace = (room, o, side, c, a, b, maxY = h) => {
    const edge = edgeName(o, side);
    const key = room + edge;
    const idx = (counters[key] = (counters[key] ?? -1) + 1);
    const id = `${room}-${edge}${idx}`;
    const m = (a + b) / 2;
    const nx = o === 'v' ? side : 0, nz = o === 'h' ? side : 0;
    faces[id] = {
      id, room, edge,
      cx: o === 'h' ? m : c + side * T / 2,
      cz: o === 'h' ? c + side * T / 2 : m,
      nx, nz, rx: nz, rz: -nx,   // "right" for someone facing the wall
      len: b - a,
      maxY,                      // works must stay below this (window sills)
    };
    return id;
  };
  // ext says which side of the wall faces outdoors: 'pos', 'neg' or null
  // upper segments sit above the floor-level wall, so nothing collides with them
  const seg = (o, c, a, b, y0, y1, faceRefs, lintel = false, ext = null, upper = false) => {
    const box = o === 'h'
      ? { x0: a, x1: b, z0: c - T / 2, z1: c + T / 2 }
      : { x0: c - T / 2, x1: c + T / 2, z0: a, z1: b };
    segments.push({ id: 's' + segments.length, o, ...box, y0, y1, faces: faceRefs, lintel, ext, upper });
  };

  // Clerestory windows run above the hanging zone on every outside wall, and the
  // south wall of the entrance room is a glass curtain wall looking outdoors.
  const windows = [], glassWalls = [];
  const useWindows = params.windows !== false && h >= 4.6;
  const sill = Math.max(DH + 0.25, h - 2.1), top = h - 0.45;
  const startRoom = roomById.hall || rooms.reduce((a, b) => (b.z1 > a.z1 ? b : a));

  for (const p of pieces) {
    const ext = !p.pos ? 'pos' : !p.neg ? 'neg' : null;
    const room = p.pos || p.neg;
    if (ext && useWindows && p.o === 'h' && room === startRoom.id && Math.abs(p.c - startRoom.z1) < EPS && p.b - p.a > 4) {
      // Glass curtain wall: a low curb, a head beam, and slim mullions between the panes
      seg(p.o, p.c, p.a - T / 2, p.b + T / 2, 0, 0.12, { pos: null, neg: null }, false, ext);
      seg(p.o, p.c, p.a - T / 2, p.b + T / 2, h - 0.4, h, { pos: null, neg: null }, false, ext, true);
      const n = Math.max(2, Math.round((p.b - p.a) / 1.8));
      for (let i = 1; i < n; i++) {
        const m = p.a + ((p.b - p.a) / n) * i;
        seg(p.o, p.c, m - 0.06, m + 0.06, 0.12, h - 0.4, { pos: null, neg: null }, false, ext, true);
      }
      glassWalls.push({ o: p.o, c: p.c, a: p.a, b: p.b, y0: 0.12, y1: h - 0.4, ext });
      continue;
    }
    if (ext && useWindows && p.b - p.a >= 3.2) {
      // Solid wall up to the sill, piers between windows, and a band above them
      const len = p.b - p.a;
      const n = Math.max(1, Math.floor((len - 0.8) / 3.2));
      const bay = len / n, ww = Math.min(2.4, bay - 0.8);
      const faceRefs = {
        pos: p.pos ? addFace(p.pos, p.o, 1, p.c, p.a, p.b, sill) : null,
        neg: p.neg ? addFace(p.neg, p.o, -1, p.c, p.a, p.b, sill) : null,
      };
      seg(p.o, p.c, p.a - T / 2, p.b + T / 2, 0, sill, faceRefs, false, ext);
      seg(p.o, p.c, p.a - T / 2, p.b + T / 2, top, h, { pos: null, neg: null }, false, ext, true);
      let edge = p.a - T / 2;
      for (let i = 0; i < n; i++) {
        const m = p.a + bay * (i + 0.5);
        seg(p.o, p.c, edge, m - ww / 2, sill, top, { pos: null, neg: null }, false, ext, true);
        windows.push({ o: p.o, c: p.c, a: m - ww / 2, b: m + ww / 2, y0: sill, y1: top, ext });
        edge = m + ww / 2;
      }
      seg(p.o, p.c, edge, p.b + T / 2, sill, top, { pos: null, neg: null }, false, ext, true);
      continue;
    }
    let door = null;
    if (p.pos && p.neg && p.b - p.a >= DW + 1) {
      const m = (p.a + p.b) / 2;
      door = { a: m - DW / 2, b: m + DW / 2 };
      doors.push({
        id: 'd' + doors.length, o: p.o,
        x: p.o === 'h' ? m : p.c, z: p.o === 'h' ? p.c : m,
        width: DW, height: DH, rooms: [p.pos, p.neg],
      });
    }
    // [start, end, startIsDoorJamb, endIsDoorJamb]
    const spans = door ? [[p.a, door.a, false, true], [door.b, p.b, true, false]] : [[p.a, p.b, false, false]];
    for (const [a, b, ja, jb] of spans) {
      if (b - a < 0.05) continue;
      const faceRefs = {
        pos: p.pos && b - a >= 0.6 ? addFace(p.pos, p.o, 1, p.c, a, b) : null,
        neg: p.neg && b - a >= 0.6 ? addFace(p.neg, p.o, -1, p.c, a, b) : null,
      };
      // Extend past corners so walls meet cleanly, except at door jambs
      seg(p.o, p.c, a - (ja ? 0 : T / 2), b + (jb ? 0 : T / 2), 0, h, faceRefs, false, ext);
    }
    if (door) seg(p.o, p.c, door.a, door.b, DH, h, { pos: null, neg: null }, true);
  }

  // 4. Furniture and skylights
  const benches = [], skylights = [];
  for (const r of rooms) {
    const rw = r.x1 - r.x0, rd = r.z1 - r.z0;
    const alongZ = rd >= rw;
    const L = Math.max(rw, rd), S = Math.min(rw, rd);
    if (S >= 7 && L >= 9) {
      const n = L > 24 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : (i === 0 ? -L / 4 : L / 4);
        const b = alongZ ? { x: r.cx, z: r.cz + off, hx: 0.3, hz: 1.2 } : { x: r.cx + off, z: r.cz, hx: 1.2, hz: 0.3 };
        benches.push({ ...b, room: r.id, alongZ });
      }
    }
    const count = Math.max(1, Math.round(L / 8));
    const across = Math.min(S * 0.4, 4), alongLen = Math.min(3.6, (L / count) * 0.55);
    for (let i = 0; i < count; i++) {
      const c = -L / 2 + (L / count) * (i + 0.5);
      const sx = alongZ ? r.cx : r.cx + c, sz = alongZ ? r.cz + c : r.cz;
      const hx = (alongZ ? across : alongLen) / 2, hz = (alongZ ? alongLen : across) / 2;
      skylights.push({ room: r.id, x0: sx - hx, x1: sx + hx, z0: sz - hz, z1: sz + hz, alongZ });
    }
  }

  const colliders = [
    ...segments.filter(s => !s.lintel && !s.upper).map(({ x0, x1, z0, z1 }) => ({ x0, x1, z0, z1 })),
    ...benches.map(b => ({ x0: b.x - b.hx, x1: b.x + b.hx, z0: b.z - b.hz, z1: b.z + b.hz })),
  ];
  const bounds = {
    x0: Math.min(...rooms.map(r => r.x0)) - T / 2, x1: Math.max(...rooms.map(r => r.x1)) + T / 2,
    z0: Math.min(...rooms.map(r => r.z0)) - T / 2, z1: Math.max(...rooms.map(r => r.z1)) + T / 2,
  };

  // You walk in at the south end of the main room, facing north toward the title wall
  const start = { room: startRoom.id, x: startRoom.cx, z: startRoom.z1 - Math.min(2.5, (startRoom.z1 - startRoom.z0) / 3) };
  const overDoor = doors.some(dr => dr.o === 'h' && Math.abs(dr.z - startRoom.z0) < 1e-3 && dr.x > startRoom.x0 && dr.x < startRoom.x1);
  const title = { x: startRoom.cx, z: startRoom.z0 + T / 2, width: startRoom.x1 - startRoom.x0, overDoor };

  return { rooms, roomById, segments, faces, doors, benches, skylights, windows, glassWalls, sill: useWindows ? sill : h, colliders, bounds, h, doorH: DH, wallT: T, start, title };
}
