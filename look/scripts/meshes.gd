extends RefCounted
class_name MeshLib

## Bevelled cube, pre-fractured convex chunks, and technical-drawing lines.
## Shared meshes only — per-block variation is a transform, not a new mesh.

const BEVEL := 0.02


static func beveled_cube(bevel: float = BEVEL) -> ArrayMesh:
	var h := 0.5
	var m := h - bevel
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var face_col := Color(1, 1, 1, 1)
	var edge_col := Color(0.94, 0.94, 0.94, 1)
	var corner_col := Color(0.88, 0.88, 0.88, 1)

	# Six face squares. Inset so the bevel strips have room.
	_poly(st, [
		Vector3(m, h, m), Vector3(-m, h, m), Vector3(-m, h, -m), Vector3(m, h, -m)
	], Vector3.UP, face_col)
	_poly(st, [
		Vector3(m, -h, -m), Vector3(-m, -h, -m), Vector3(-m, -h, m), Vector3(m, -h, m)
	], Vector3.DOWN, face_col)
	_poly(st, [
		Vector3(h, m, -m), Vector3(h, -m, -m), Vector3(h, -m, m), Vector3(h, m, m)
	], Vector3.RIGHT, face_col)
	_poly(st, [
		Vector3(-h, m, m), Vector3(-h, -m, m), Vector3(-h, -m, -m), Vector3(-h, m, -m)
	], Vector3.LEFT, face_col)
	_poly(st, [
		Vector3(-m, m, h), Vector3(m, m, h), Vector3(m, -m, h), Vector3(-m, -m, h)
	], Vector3.BACK, face_col)
	_poly(st, [
		Vector3(m, m, -h), Vector3(-m, m, -h), Vector3(-m, -m, -h), Vector3(m, -m, -h)
	], Vector3.FORWARD, face_col)

	# Twelve edge quads. `axis` is the long direction of the original cube edge.
	for axis in 3:
		for s1 in [-1.0, 1.0]:
			for s2 in [-1.0, 1.0]:
				var outward := Vector3.ZERO
				var a1 := (axis + 1) % 3
				var a2 := (axis + 2) % 3
				outward[a1] = s1
				outward[a2] = s2
				_poly(st, _edge_quad(axis, s1, s2, h, m), outward, edge_col)

	# Eight corner triangles.
	for sx in [-1.0, 1.0]:
		for sy in [-1.0, 1.0]:
			for sz in [-1.0, 1.0]:
				_poly(st, [
					Vector3(sx * h, sy * m, sz * m),
					Vector3(sx * m, sy * h, sz * m),
					Vector3(sx * m, sy * m, sz * h),
				], Vector3(sx, sy, sz), corner_col)

	st.generate_tangents()
	return st.commit()


static func _edge_quad(axis: int, s1: float, s2: float, h: float, m: float) -> Array:
	var a1 := (axis + 1) % 3
	var a2 := (axis + 2) % 3
	var pts: Array = []
	# Two vertices sit on the first adjacent face, two on the second.
	for along in [-m, m]:
		var p := Vector3.ZERO
		p[axis] = along
		p[a1] = s1 * h
		p[a2] = s2 * m
		pts.append(p)
	for along in [-m, m]:
		var p := Vector3.ZERO
		p[axis] = along
		p[a1] = s1 * m
		p[a2] = s2 * h
		pts.append(p)
	# Order around the quad: p0 (+/-), p2, p3, p1 is not reliable.
	# Rebuild a loop: start, end along first edge, then the other edge reversed.
	return [pts[0], pts[1], pts[3], pts[2]]


static func fracture_cube(target_pieces: int, rng_seed: int) -> Array:
	seed(rng_seed)
	var parts: Array = [_unit_cube_faces()]
	var tries := 0
	while parts.size() < target_pieces and tries < 48:
		tries += 1
		var idx := _largest_part(parts)
		var n := Vector3(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0), randf_range(-1.0, 1.0))
		if n.length_squared() < 0.05:
			continue
		n = n.normalized()
		var d := randf_range(-0.10, 0.10)
		var split: Array = split_convex(parts[idx], n, d)
		if split.is_empty():
			continue
		var va := _volume(split[0])
		var vb := _volume(split[1])
		if va < 0.03 or vb < 0.03:
			continue
		parts.remove_at(idx)
		parts.append(split[0])
		parts.append(split[1])

	var out: Array = []
	for faces in parts:
		var mesh := _faces_to_mesh(faces)
		out.append({
			"mesh": mesh,
			"points": _unique_points(faces),
			"volume": _volume(faces),
		})
	return out


static func self_test() -> void:
	var cube := beveled_cube()
	print("beveled surfaces ", cube.get_surface_count(), " verts ", cube.surface_get_array_len(0))
	for variant in 2:
		var parts: Array = fracture_cube(6, 6371 + variant * 17)
		var sum := 0.0
		var counts: Array = []
		for p in parts:
			sum += p.volume
			counts.append(snappedf(p.volume, 0.001))
		print("fracture v", variant, " pieces ", parts.size(), " volume ", snappedf(sum, 0.001), " ", counts)


static func build_tech_lines(block: AABB, zoom: float, layer_ys: PackedFloat32Array, earth_r: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_LINES)
	var ink := Color(0.27, 0.36, 0.48)
	var grid_a := smoothstep(0.045, 0.16, zoom) * (1.0 - smoothstep(0.58, 0.86, zoom))
	var layer_a := smoothstep(0.06, 0.20, zoom) * (1.0 - smoothstep(0.62, 0.90, zoom))
	var earth_a := smoothstep(0.36, 0.62, zoom)
	if grid_a > 0.03:
		_add_grid(st, block, zoom, Color(ink.r, ink.g, ink.b, grid_a * 0.55))
	if layer_a > 0.03:
		_add_layer_lines(st, block, zoom, layer_ys, Color(ink.r, ink.g, ink.b, layer_a * 0.8))
	if earth_a > 0.03:
		_add_earth(st, block, earth_r, Color(ink.r, ink.g, ink.b, earth_a * 0.9))
	return st.commit()


static func split_convex(faces: Array, n: Vector3, d: float) -> Array:
	var front_faces: Array = []
	var back_faces: Array = []
	var cap_pts: Array = []
	for face in faces:
		var front := _clip_half(face, n, d, true)
		var back := _clip_half(face, n, d, false)
		if front.size() >= 3:
			front_faces.append(front)
		if back.size() >= 3:
			back_faces.append(back)
		_collect_crossings(face, n, d, cap_pts)
	if front_faces.is_empty() or back_faces.is_empty():
		return []
	var cap := _cap_from_points(cap_pts, n)
	if cap.size() < 3:
		return []
	front_faces.append(_orient_face(cap.duplicate(), -n))
	back_faces.append(_orient_face(cap.duplicate(), n))
	return [front_faces, back_faces]


static func _unit_cube_faces() -> Array:
	var h := 0.5
	return [
		_orient_face([Vector3(h, h, h), Vector3(-h, h, h), Vector3(-h, h, -h), Vector3(h, h, -h)], Vector3.UP),
		_orient_face([Vector3(h, -h, h), Vector3(h, -h, -h), Vector3(-h, -h, -h), Vector3(-h, -h, h)], Vector3.DOWN),
		_orient_face([Vector3(h, h, h), Vector3(h, h, -h), Vector3(h, -h, -h), Vector3(h, -h, h)], Vector3.RIGHT),
		_orient_face([Vector3(-h, h, h), Vector3(-h, -h, h), Vector3(-h, -h, -h), Vector3(-h, h, -h)], Vector3.LEFT),
		_orient_face([Vector3(h, h, h), Vector3(h, -h, h), Vector3(-h, -h, h), Vector3(-h, h, h)], Vector3.BACK),
		_orient_face([Vector3(h, h, -h), Vector3(-h, h, -h), Vector3(-h, -h, -h), Vector3(h, -h, -h)], Vector3.FORWARD),
	]


static func _faces_to_mesh(faces: Array) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for face in faces:
		if face.size() < 3:
			continue
		_poly(st, face, (face[1] - face[0]).cross(face[2] - face[0]), Color.WHITE)
	st.generate_tangents()
	return st.commit()


static func _poly(st: SurfaceTool, pts: Array, outward: Vector3, col: Color) -> void:
	if pts.size() < 3:
		return
	var ordered := _orient_face(pts, outward)
	for i in range(1, ordered.size() - 1):
		_tri(st, ordered[0], ordered[i], ordered[i + 1], col)


static func _tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, col: Color) -> void:
	var n: Vector3 = (b - a).cross(c - a)
	if n.length_squared() < 1e-12:
		return
	n = n.normalized()
	for p in [a, b, c]:
		st.set_normal(n)
		st.set_color(col)
		st.set_uv(_uv(p, n))
		st.add_vertex(p)


static func _uv(p: Vector3, n: Vector3) -> Vector2:
	var an := Vector3(absf(n.x), absf(n.y), absf(n.z))
	if an.x >= an.y and an.x >= an.z:
		return Vector2(p.z + 0.5, p.y + 0.5)
	if an.y >= an.z:
		return Vector2(p.x + 0.5, p.z + 0.5)
	return Vector2(p.x + 0.5, p.y + 0.5)


static func _orient_face(pts: Array, outward: Vector3) -> Array:
	var n: Vector3 = (pts[1] - pts[0]).cross(pts[2] - pts[0])
	if n.dot(outward) < 0.0:
		var rev: Array = pts.duplicate()
		rev.reverse()
		return rev
	return pts


static func _clip_half(poly: Array, n: Vector3, d: float, keep_front: bool) -> Array:
	var out: Array = []
	var count := poly.size()
	if count == 0:
		return out
	for i in count:
		var curr: Vector3 = poly[i]
		var prev: Vector3 = poly[(i + count - 1) % count]
		var curr_in := _inside(curr, n, d, keep_front)
		var prev_in := _inside(prev, n, d, keep_front)
		if curr_in:
			if not prev_in:
				out.append(_intersect(prev, curr, n, d))
			out.append(curr)
		elif prev_in:
			out.append(_intersect(prev, curr, n, d))
	return out


static func _inside(p: Vector3, n: Vector3, d: float, keep_front: bool) -> bool:
	var s := n.dot(p) - d
	if keep_front:
		return s >= -1e-6
	return s <= 1e-6


static func _intersect(a: Vector3, b: Vector3, n: Vector3, d: float) -> Vector3:
	var sa := n.dot(a) - d
	var sb := n.dot(b) - d
	var denom := sa - sb
	if absf(denom) < 1e-8:
		return a
	return a.lerp(b, clampf(sa / denom, 0.0, 1.0))


static func _collect_crossings(face: Array, n: Vector3, d: float, into: Array) -> void:
	var count := face.size()
	for i in count:
		var a: Vector3 = face[i]
		var b: Vector3 = face[(i + 1) % count]
		var sa := n.dot(a) - d
		var sb := n.dot(b) - d
		if sa * sb < 0.0:
			into.append(_intersect(a, b, n, d))
		elif absf(sa) <= 1e-5:
			into.append(a)


static func _cap_from_points(pts: Array, n: Vector3) -> Array:
	var unique: Array = []
	for p in pts:
		var dup := false
		for q in unique:
			if (p as Vector3).distance_to(q) < 1e-4:
				dup = true
				break
		if not dup:
			unique.append(p)
	if unique.size() < 3:
		return []
	var c := Vector3.ZERO
	for p in unique:
		c += p
	c /= float(unique.size())
	var u := n.cross(Vector3.UP)
	if u.length() < 0.2:
		u = n.cross(Vector3.RIGHT)
	u = u.normalized()
	var v := n.cross(u).normalized()
	var keyed: Array = []
	for p in unique:
		keyed.append({"a": atan2(v.dot(p - c), u.dot(p - c)), "p": p})
	for i in range(1, keyed.size()):
		var item: Dictionary = keyed[i]
		var j := i - 1
		while j >= 0 and (keyed[j].a as float) > (item.a as float):
			keyed[j + 1] = keyed[j]
			j -= 1
		keyed[j + 1] = item
	var out: Array = []
	for k in keyed:
		out.append(k.p)
	return out


static func _volume(faces: Array) -> float:
	var vol := 0.0
	for face in faces:
		if face.size() < 3:
			continue
		var a: Vector3 = face[0]
		for i in range(1, face.size() - 1):
			var b: Vector3 = face[i]
			var c: Vector3 = face[i + 1]
			vol += a.dot(b.cross(c))
	return absf(vol) / 6.0


static func _largest_part(parts: Array) -> int:
	var best := 0
	var best_v := -1.0
	for i in parts.size():
		var v := _volume(parts[i])
		if v > best_v:
			best_v = v
			best = i
	return best


static func _unique_points(faces: Array) -> PackedVector3Array:
	var unique: Array = []
	for face in faces:
		for p in face:
			var dup := false
			for q in unique:
				if (p as Vector3).distance_to(q) < 1e-4:
					dup = true
					break
			if not dup:
				unique.append(p)
	var packed := PackedVector3Array()
	packed.resize(unique.size())
	for i in unique.size():
		packed[i] = unique[i]
	return packed


static func _raw_line(st: SurfaceTool, a: Vector3, b: Vector3, col: Color) -> void:
	if a.distance_squared_to(b) < 1e-6:
		return
	st.set_color(col)
	st.add_vertex(a)
	st.set_color(col)
	st.add_vertex(b)


static func _add_grid(st: SurfaceTool, block: AABB, zoom: float, col: Color) -> void:
	var grow := lerpf(0.55, 7.5, smoothstep(0.0, 0.55, zoom))
	var step := 0.5
	var origin := block.position - Vector3(grow, grow * 0.35, grow)
	var limit := block.position + block.size + Vector3(grow, grow * 0.15, grow)
	var y_top := block.position.y + block.size.y + 0.03
	var y_bot := block.position.y - 0.03
	# Cut a vertical shaft out of the grid so lines stop at the block instead of crossing it.
	var hole := AABB(block.position + Vector3(0, -2.0, 0), block.size + Vector3(0, 6.0, 0))
	var x := ceilf(origin.x / step) * step
	while x <= limit.x + 0.001:
		_line_minus_block(st, Vector3(x, y_top, origin.z), Vector3(x, y_top, limit.z), col, hole)
		_line_minus_block(st, Vector3(x, y_bot, origin.z), Vector3(x, y_bot, limit.z), col, hole)
		x += step
	var z := ceilf(origin.z / step) * step
	while z <= limit.z + 0.001:
		_line_minus_block(st, Vector3(origin.x, y_top, z), Vector3(limit.x, y_top, z), col, hole)
		_line_minus_block(st, Vector3(origin.x, y_bot, z), Vector3(limit.x, y_bot, z), col, hole)
		z += step
	# Verticals only on the outer rectangle, so the grid stays a drawing and not a cage.
	x = ceilf(origin.x / step) * step
	while x <= limit.x + 0.001:
		_raw_line(st, Vector3(x, y_bot, origin.z), Vector3(x, y_top, origin.z), col)
		_raw_line(st, Vector3(x, y_bot, limit.z), Vector3(x, y_top, limit.z), col)
		x += step
	z = ceilf(origin.z / step) * step + step
	while z <= limit.z - step + 0.001:
		_raw_line(st, Vector3(origin.x, y_bot, z), Vector3(origin.x, y_top, z), col)
		_raw_line(st, Vector3(limit.x, y_bot, z), Vector3(limit.x, y_top, z), col)
		z += step


static func _add_layer_lines(st: SurfaceTool, block: AABB, zoom: float, layer_ys: PackedFloat32Array, col: Color) -> void:
	var front_z := block.position.z + block.size.z + 0.04
	var left := block.position.x
	var right := block.position.x + block.size.x
	var extend := lerpf(0.45, 11.0, pow(clampf(zoom, 0.0, 1.0), 0.75))
	var tick := 0.12
	for y in layer_ys:
		_raw_line(st, Vector3(right, y, front_z), Vector3(right + extend, y, front_z), col)
		_raw_line(st, Vector3(left, y, front_z), Vector3(left - extend, y, front_z), col)
		_raw_line(st, Vector3(right + extend, y - tick, front_z), Vector3(right + extend, y + tick, front_z), col)
		_raw_line(st, Vector3(left - extend, y - tick, front_z), Vector3(left - extend, y + tick, front_z), col)
	# Height dimension just beside the cut face.
	var dx := right + extend * 0.42
	var y0 := block.position.y + block.size.y
	var y1 := block.position.y
	var dim := Color(col.r, col.g, col.b, col.a * 0.9)
	_raw_line(st, Vector3(dx, y0, front_z), Vector3(dx, y1, front_z), dim)
	_raw_line(st, Vector3(dx - tick, y0, front_z), Vector3(dx + tick, y0, front_z), dim)
	_raw_line(st, Vector3(dx - tick, y1, front_z), Vector3(dx + tick, y1, front_z), dim)


static func _add_earth(st: SurfaceTool, block: AABB, earth_r: float, col: Color) -> void:
	var center := Vector3(0.0, -earth_r, 0.0)
	var rings := [
		[1.0, false, 1.0],
		[0.972, true, 0.75],
		[0.935, false, 0.55],
		[0.84, true, 0.6],
		[0.62, false, 0.8],
		[0.40, true, 0.55],
		[0.22, false, 0.85],
	]
	for ring in rings:
		var radius := earth_r * float(ring[0])
		var dashed: bool = ring[1]
		var alpha := col.a * float(ring[2])
		var tint := Color(col.r, col.g, col.b, alpha)
		_circle(st, center, radius, tint, dashed, block)
		if float(ring[0]) > 0.95:
			# A second pass, a hair off the plane, thickens the surface curve.
			_circle(st, center + Vector3(0, 0, 0.12), radius, Color(tint.r, tint.g, tint.b, tint.a * 0.45), false, block)

	var frame := earth_r + 10.0
	var top := 9.0
	var bot := -2.0 * earth_r - 9.0
	var left := -frame
	var right := frame
	var z := 0.0
	var frame_col := Color(col.r, col.g, col.b, col.a * 0.45)
	_raw_line(st, Vector3(left, top, z), Vector3(right, top, z), frame_col)
	_raw_line(st, Vector3(right, top, z), Vector3(right, bot, z), frame_col)
	_raw_line(st, Vector3(right, bot, z), Vector3(left, bot, z), frame_col)
	_raw_line(st, Vector3(left, bot, z), Vector3(left, top, z), frame_col)
	var axis := Color(col.r, col.g, col.b, col.a * 0.8)
	_line_minus_block(st, Vector3(0, top, z), Vector3(0, bot, z), axis, block)
	_line_minus_block(st, Vector3(left, -earth_r, z), Vector3(right, -earth_r, z), axis, block)
	# Ticks where the vertical axis meets each solid ring.
	for ring in rings:
		if ring[1]:
			continue
		var y := -earth_r + earth_r * float(ring[0])
		_raw_line(st, Vector3(-0.9, y, z), Vector3(0.9, y, z), axis)
		y = -earth_r - earth_r * float(ring[0])
		_raw_line(st, Vector3(-0.9, y, z), Vector3(0.9, y, z), axis)


static func _circle(st: SurfaceTool, center: Vector3, radius: float, col: Color, dashed: bool, block: AABB) -> void:
	var segments := 160 if radius > 40.0 else 96
	for i in segments:
		if dashed and (i % 2 == 0):
			continue
		var a0 := TAU * float(i) / float(segments)
		var a1 := TAU * float(i + 1) / float(segments)
		var p0 := center + Vector3(cos(a0), sin(a0), 0.0) * radius
		var p1 := center + Vector3(cos(a1), sin(a1), 0.0) * radius
		_line_minus_block(st, p0, p1, col, block)


static func _line_minus_block(st: SurfaceTool, a: Vector3, b: Vector3, col: Color, block: AABB) -> void:
	var hit = _segment_aabb_t(a, b, block)
	if hit == null:
		_raw_line(st, a, b, col)
		return
	var t0: float = hit[0]
	var t1: float = hit[1]
	if t0 > 0.02:
		_raw_line(st, a, a.lerp(b, t0), col)
	if t1 < 0.98:
		_raw_line(st, a.lerp(b, t1), b, col)


static func _segment_aabb_t(a: Vector3, b: Vector3, box: AABB):
	var d := b - a
	var t0 := 0.0
	var t1 := 1.0
	var mn := box.position
	var mx := box.position + box.size
	for axis in 3:
		if absf(d[axis]) < 1e-8:
			if a[axis] < mn[axis] or a[axis] > mx[axis]:
				return null
		else:
			var inv := 1.0 / d[axis]
			var ta := (mn[axis] - a[axis]) * inv
			var tb := (mx[axis] - a[axis]) * inv
			if ta > tb:
				var tmp := ta
				ta = tb
				tb = tmp
			t0 = maxf(t0, ta)
			t1 = minf(t1, tb)
			if t0 > t1:
				return null
	if t1 < 0.0 or t0 > 1.0:
		return null
	return [clampf(t0, 0.0, 1.0), clampf(t1, 0.0, 1.0)]
