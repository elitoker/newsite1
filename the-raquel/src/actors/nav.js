// Navigation shared by the player and the patrons. No three.js here.

export function roomAt(L, x, z, margin = 0) {
  return L.rooms.find(r => x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin) || null;
}

// Breadth-first search through doors. Returns the doors to pass through, in order.
export function roomPath(L, from, to) {
  if (from === to) return [];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    if (id === to) break;
    for (const d of L.doors) {
      if (!d.rooms.includes(id)) continue;
      const other = d.rooms[0] === id ? d.rooms[1] : d.rooms[0];
      if (other in prev) continue;
      prev[other] = { door: d, from: id };
      queue.push(other);
    }
  }
  if (!(to in prev)) return null;
  const out = [];
  for (let c = to; prev[c]; c = prev[c].from) out.unshift(prev[c].door);
  return out;
}

// Two points, one each side of a door, so people walk through it straight on
export function doorWaypoints(L, d, fromId, off = 0.9) {
  const r = L.roomById[fromId];
  if (d.o === 'h') {
    const s = Math.sign(r.cz - d.z) || 1;
    return [{ x: d.x, z: d.z + s * off }, { x: d.x, z: d.z - s * off }];
  }
  const s = Math.sign(r.cx - d.x) || 1;
  return [{ x: d.x + s * off, z: d.z }, { x: d.x - s * off, z: d.z }];
}

// Push a circle out of axis-aligned boxes (walls and benches)
export function collide(p, r, boxes) {
  for (const b of boxes) {
    const cx = Math.max(b.x0, Math.min(p.x, b.x1));
    const cz = Math.max(b.z0, Math.min(p.z, b.z1));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2), k = (r - d) / d;
      p.x += dx * k; p.z += dz * k;
    } else {
      const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bb = b.z1 - p.z;
      const m = Math.min(l, rr, t, bb);
      if (m === l) p.x = b.x0 - r;
      else if (m === rr) p.x = b.x1 + r;
      else if (m === t) p.z = b.z0 - r;
      else p.z = b.z1 + r;
    }
  }
}
