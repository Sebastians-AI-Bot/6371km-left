extends Node3D

## Instanced earth block. Static MultiMeshes per material.
## Physics bodies exist only for debris and for the few cells next to a break.

const TARGET_WIDTH := 3.2
const VISUAL_FILL := 0.962
const LAYER_SPANS := [
	["topsoil", 0.13],
	["sand", 0.17],
	["limestone", 0.18],
	["granite", 0.18],
	["water", 0.16],
	["hot", 0.18],
]

const LAYER_WORLD := 1
const LAYER_DEBRIS := 8

var materials: Dictionary = {}
var block_mesh: ArrayMesh
var fractures: Array = []

var variation := 0.7
var stress := false
var material_mode := "Layered"

var nx := 16
var ny := 24
var nz := 16
var stride := 0.2
var visual := 0.18
var block_width := 3.2
var block_height := 4.8
var block_depth := 3.2
var bottom_y := -4.8
var solid := 0
var mesh_instances := 0

var _records: Array = []
var _by_cell: Dictionary = {}
var _removed: Dictionary = {}
var _proxies: Dictionary = {}
var _groups: Dictionary = {}
var _water_y := 0.0

var mesh_root: Node3D
var debris_root: Node3D
var collision_root: Node3D
var water_mi: MeshInstance3D
var catcher: MeshInstance3D

var _phys_mat: PhysicsMaterial
var _dust_mesh: QuadMesh


func setup(mats: Dictionary, mesh: ArrayMesh, chunks: Array) -> void:
	materials = mats
	block_mesh = mesh
	fractures = chunks
	_phys_mat = PhysicsMaterial.new()
	_phys_mat.friction = 0.92
	_phys_mat.bounce = 0.04
	_dust_mesh = QuadMesh.new()
	_dust_mesh.size = Vector2(0.07, 0.07)
	var dust_mat := StandardMaterial3D.new()
	dust_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	dust_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dust_mat.albedo_color = Color(0.55, 0.45, 0.36, 0.45)
	dust_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	_dust_mesh.material = dust_mat

	mesh_root = Node3D.new()
	mesh_root.name = "Blocks"
	add_child(mesh_root)
	debris_root = Node3D.new()
	debris_root.name = "Debris"
	add_child(debris_root)
	collision_root = Node3D.new()
	collision_root.name = "Collision"
	add_child(collision_root)
	rebuild(false)


func rebuild(use_stress: bool) -> void:
	stress = use_stress
	_free_children(mesh_root)
	_free_children(debris_root)
	_free_children(collision_root)
	if is_instance_valid(water_mi):
		water_mi.queue_free()
		water_mi = null
	if is_instance_valid(catcher):
		catcher.queue_free()
		catcher = null
	_records.clear()
	_by_cell.clear()
	_removed.clear()
	_proxies.clear()
	_groups.clear()

	if stress:
		nx = 40
		ny = 64
		nz = 40
	else:
		# Fewer, larger cubes so the cut face reads as masonry, not grit.
		nx = 12
		ny = 20
		nz = 12
	stride = TARGET_WIDTH / float(nx)
	visual = stride * VISUAL_FILL
	block_width = stride * float(nx - 1) + visual
	block_depth = stride * float(nz - 1) + visual
	block_height = stride * float(ny - 1) + visual
	var top_center_y := -visual * 0.5
	bottom_y = top_center_y - stride * float(ny - 1) - visual * 0.5

	var buckets := {}
	for kind in ["topsoil", "sand", "limestone", "granite", "wet", "copper", "hot0", "hot1", "hot2"]:
		buckets[kind] = []

	for iy in ny:
		for iz in nz:
			for ix in nx:
				if _is_pool_air(ix, iy, iz):
					continue
				var kind := _kind(ix, iy, iz)
				buckets[kind].append(Vector3i(ix, iy, iz))

	solid = 0
	for kind in buckets.keys():
		var cells: Array = buckets[kind]
		if cells.is_empty():
			continue
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.use_custom_data = true
		mm.mesh = block_mesh
		mm.instance_count = cells.size()
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.material_override = _material_for(kind)
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		mmi.name = kind
		mesh_root.add_child(mmi)
		_groups[kind] = {"mm": mm, "mmi": mmi}
		for i in cells.size():
			var c: Vector3i = cells[i]
			var rec := {
				"mm": mm,
				"index": i,
				"ix": c.x,
				"iy": c.y,
				"iz": c.z,
				"kind": kind,
			}
			_records.append(rec)
			_by_cell[c] = rec
			mm.set_instance_transform(i, _xform(c.x, c.y, c.z))
			mm.set_instance_color(i, _tint(c.x, c.y, c.z, kind))
			mm.set_instance_custom_data(i, _uv_shift(c.x, c.y, c.z))
		solid += cells.size()
	mesh_instances = solid
	_build_water()
	_build_table()
	_build_catcher()
	apply_material_mode(material_mode)


func apply_variation(v: float) -> void:
	variation = clampf(v, 0.0, 1.0)
	for rec in _records:
		var key := Vector3i(rec.ix, rec.iy, rec.iz)
		var mm: MultiMesh = rec.mm
		if _removed.has(key):
			continue
		mm.set_instance_transform(rec.index, _xform(rec.ix, rec.iy, rec.iz))
		mm.set_instance_color(rec.index, _tint(rec.ix, rec.iy, rec.iz, rec.kind))


func apply_material_mode(mode: String) -> void:
	material_mode = mode
	for kind in _groups.keys():
		var mmi: MultiMeshInstance3D = _groups[kind].mmi
		if mode == "Layered":
			mmi.material_override = _material_for(kind)
		else:
			mmi.material_override = _uniform_material(mode)
	apply_variation(variation)


func set_cast_shadows(on: bool) -> void:
	var mode := GeometryInstance3D.SHADOW_CASTING_SETTING_ON if on else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for kind in _groups.keys():
		(_groups[kind].mmi as GeometryInstance3D).cast_shadow = mode


func break_cell(ix: int, iy: int, iz: int, push: Vector3) -> bool:
	if ix < 0 or iy < 0 or iz < 0 or ix >= nx or iy >= ny or iz >= nz:
		return false
	var key := Vector3i(ix, iy, iz)
	if _removed.has(key) or _is_pool_air(ix, iy, iz):
		return false
	var rec := _find_record(key)
	if rec.is_empty():
		return false
	var mm: MultiMesh = rec.mm
	var center := _center(ix, iy, iz)
	# Degenerate scale keeps the instance inside the original bounds.
	mm.set_instance_transform(rec.index, Transform3D(Basis.from_scale(Vector3(0.0001, 0.0001, 0.0001)), center))
	_removed[key] = true
	solid = maxi(0, solid - 1)
	_spawn_debris(center, rec.kind, push)
	_spawn_dust(center, push)
	for n in [Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0), Vector3i(0, -1, 0), Vector3i(0, 0, 1), Vector3i(0, 0, -1)]:
		_ensure_proxy(key + n)
	return true


func try_break(camera: Camera3D, screen_pos: Vector2) -> bool:
	var origin := camera.project_ray_origin(screen_pos)
	var dir := camera.project_ray_normal(screen_pos)
	var hit := _dda(origin, dir)
	if hit.x < 0:
		return false
	var center := _center(hit.x, hit.y, hit.z)
	var dist := origin.distance_to(center)
	if _occluder_closer(origin, dir, dist):
		return false
	return break_cell(hit.x, hit.y, hit.z, -dir)


func debris_count() -> int:
	return debris_root.get_child_count()


func world_aabb() -> AABB:
	var pad := stride * 0.15
	return AABB(
		Vector3(-block_width * 0.5 - pad, bottom_y - pad, -block_depth * 0.5 - pad),
		Vector3(block_width + pad * 2.0, block_height + pad * 2.0, block_depth + pad * 2.0)
	)


func layer_boundary_ys() -> PackedFloat32Array:
	var ys := PackedFloat32Array()
	ys.append(0.0)
	var prev := ""
	for iy in ny:
		var name := _layer_of(iy)
		if name != prev and prev != "":
			ys.append(_center(0, iy, 0).y + visual * 0.5)
		prev = name
	ys.append(bottom_y)
	return ys


func fit_distance(fov_deg: float) -> float:
	var half := deg_to_rad(fov_deg * 0.5)
	var diag := Vector2(block_width, block_height).length()
	return diag * 0.78 / tan(half)


func _physics_process(_delta: float) -> void:
	var floor_y := bottom_y - 0.05
	var limit := 18.0
	for node in debris_root.get_children():
		if not (node is RigidBody3D):
			continue
		var body := node as RigidBody3D
		var p := body.global_position
		var fallen := p.y < floor_y - 1.5
		var escaped := absf(p.x) > limit or absf(p.z) > limit
		if fallen or escaped:
			p.x = clampf(p.x, -6.0, 6.0)
			p.z = clampf(p.z, -2.0, 8.0)
			p.y = floor_y + 0.08
			body.global_position = p
			body.linear_velocity = Vector3.ZERO
			body.angular_velocity = Vector3.ZERO


func _kind(ix: int, iy: int, iz: int) -> String:
	var layer := _layer_of(iy)
	if layer == "water":
		return "wet"
	if layer == "hot":
		var heat := _hash01(ix, iy, iz + 11)
		if iz >= nz - 2 and heat > 0.45:
			return "hot2"
		if heat > 0.78:
			return "hot2"
		if heat > 0.42:
			return "hot1"
		return "hot0"
	if layer == "granite":
		var ore := _hash01(ix + 4, iy, iz + 9)
		var on_face := iz == nz - 1 and (ix % 3 == 1)
		if on_face or ore > 0.9:
			return "copper"
	return layer


func _layer_of(iy: int) -> String:
	var f := (float(iy) + 0.5) / float(ny)
	var acc := 0.0
	for span in LAYER_SPANS:
		acc += float(span[1])
		if f <= acc + 0.0001:
			return str(span[0])
	return "hot"


func _is_pool_air(ix: int, iy: int, iz: int) -> bool:
	if _layer_of(iy) != "water":
		return false
	var f := (float(iy) + 0.5) / float(ny)
	var start := _span_start("water")
	var local := (f - start) / 0.16
	# local 0 is the ceiling of the water band. Keep the lower bed as rock.
	if local > 0.52:
		return false
	if iz < int(float(nz) * 0.40):
		return false
	if ix < 2 or ix > nx - 3:
		return false
	return true


func _material_for(kind: String) -> Material:
	return materials[kind]


func _uniform_material(mode: String) -> Material:
	match mode:
		"Topsoil":
			return materials.topsoil
		"Sand":
			return materials.sand
		"Limestone":
			return materials.limestone
		"Granite":
			return materials.granite
		"Copper":
			return materials.copper
		"Hot rock":
			return materials.hot1
		_:
			return materials.granite


func _center(ix: int, iy: int, iz: int) -> Vector3:
	var x0 := -stride * float(nx - 1) * 0.5
	var z0 := -stride * float(nz - 1) * 0.5
	var y0 := -visual * 0.5
	return Vector3(x0 + stride * float(ix), y0 - stride * float(iy), z0 + stride * float(iz))


func _xform(ix: int, iy: int, iz: int) -> Transform3D:
	var yaw := (_hash01(ix, iy, iz + 4) - 0.5) * deg_to_rad(2.0) * variation
	var pitch := (_hash01(ix + 3, iy, iz) - 0.5) * deg_to_rad(0.8) * variation
	var roll := (_hash01(ix, iy + 5, iz + 1) - 0.5) * deg_to_rad(0.8) * variation
	var base := lerpf(0.995, 0.97 + 0.025 * _hash01(ix + 8, iy + 2, iz), variation)
	var sx := base * lerpf(1.0, 0.985 + 0.03 * _hash01(ix, iy, iz + 9), variation)
	var sy := base * lerpf(1.0, 0.985 + 0.03 * _hash01(ix + 2, iy + 6, iz), variation)
	var sz := base * lerpf(1.0, 0.985 + 0.03 * _hash01(ix + 5, iy, iz + 2), variation)
	var jitter := Vector3(
		(_hash01(ix + 1, iy, iz) - 0.5) * stride * 0.02 * variation,
		(_hash01(ix, iy + 3, iz) - 0.5) * stride * 0.015 * variation,
		(_hash01(ix, iy, iz + 6) - 0.5) * stride * 0.02 * variation
	)
	var basis := Basis.from_euler(Vector3(pitch, yaw, roll)).scaled(Vector3(sx, sy, sz) * visual)
	return Transform3D(basis, _center(ix, iy, iz) + jitter)


func _tint(ix: int, iy: int, iz: int, _kind: String) -> Color:
	var r := 1.0 + (_hash01(ix, iy, iz) - 0.5) * 0.08 * variation
	var g := 1.0 + (_hash01(ix + 19, iy, iz) - 0.5) * 0.06 * variation
	var b := 1.0 + (_hash01(ix, iy + 7, iz + 3) - 0.5) * 0.05 * variation
	return Color(clampf(r, 0.85, 1.12), clampf(g, 0.85, 1.12), clampf(b, 0.85, 1.12), 1.0)


func _uv_shift(ix: int, iy: int, iz: int) -> Color:
	return Color(
		_hash01(ix * 3 + 1, iy, iz),
		_hash01(ix, iy * 5 + 2, iz + 4),
		_hash01(ix + 8, iy + 1, iz * 3),
		1.0
	)


func _hash01(x: int, y: int, z: int) -> float:
	var n := (x * 73856093) ^ (y * 19349663) ^ (z * 83492791)
	n = (n << 13) ^ n
	n = n * (n * n * 15731 + 789221) + 1376312589
	return float(n & 0x7fffffff) / float(0x7fffffff)


func _span_start(layer_name: String) -> float:
	var acc := 0.0
	for span in LAYER_SPANS:
		if str(span[0]) == layer_name:
			return acc
		acc += float(span[1])
	return acc


func _find_record(key: Vector3i) -> Dictionary:
	return _by_cell.get(key, {})


func _build_water() -> void:
	var min_ix := 2
	var max_ix := nx - 3
	var min_iz := int(float(nz) * 0.40)
	var max_iz := nz - 1
	if max_ix <= min_ix:
		return
	var start := _span_start("water")
	var surface_f := start + 0.52 * 0.16
	var surface_iy := clampi(int(surface_f * float(ny)), 0, ny - 1)
	_water_y = _center(0, surface_iy, 0).y + visual * 0.35
	var x_a := _center(min_ix, 0, 0).x
	var x_b := _center(max_ix, 0, 0).x
	var z_a := _center(0, 0, min_iz).z
	var z_b := _center(0, 0, max_iz).z + visual * 0.5
	var size := Vector3(absf(x_b - x_a), visual * 0.55, absf(z_b - z_a))
	var box := BoxMesh.new()
	box.size = Vector3(1, 1, 1)
	water_mi = MeshInstance3D.new()
	water_mi.name = "Water"
	water_mi.mesh = box
	water_mi.scale = size
	water_mi.position = Vector3((x_a + x_b) * 0.5, _water_y - size.y * 0.45, (z_a + z_b) * 0.5)
	water_mi.material_override = materials.water
	water_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(water_mi)

	var bed := StaticBody3D.new()
	bed.collision_layer = LAYER_WORLD
	bed.collision_mask = LAYER_WORLD
	bed.physics_material_override = _phys_mat
	bed.position = water_mi.position + Vector3(0, -size.y * 0.5, 0)
	var shape := CollisionShape3D.new()
	var slab := BoxShape3D.new()
	slab.size = Vector3(size.x, 0.05, size.z)
	shape.shape = slab
	bed.add_child(shape)
	collision_root.add_child(bed)


func _build_table() -> void:
	var body := StaticBody3D.new()
	body.name = "Table"
	body.collision_layer = LAYER_WORLD
	body.collision_mask = LAYER_WORLD
	body.physics_material_override = _phys_mat
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(16, 1.2, 18)
	shape.shape = box
	body.add_child(shape)
	body.position = Vector3(0, bottom_y - 0.6, 2.0)
	collision_root.add_child(body)


func _build_catcher() -> void:
	var quad := QuadMesh.new()
	quad.size = Vector2(12, 12)
	catcher = MeshInstance3D.new()
	catcher.name = "ShadowCatcher"
	catcher.mesh = quad
	catcher.material_override = materials.catcher
	catcher.rotation_degrees = Vector3(-90, 0, 0)
	catcher.position = Vector3(0, bottom_y - 0.02, 1.2)
	catcher.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# Shadow-to-opacity rendered as a solid black slab here, so the
	# catcher stays off and the backdrop stays the paper colour.
	catcher.visible = false
	add_child(catcher)


func _ensure_proxy(cell: Vector3i) -> void:
	if _proxies.has(cell):
		return
	if cell.x < 0 or cell.y < 0 or cell.z < 0 or cell.x >= nx or cell.y >= ny or cell.z >= nz:
		return
	if _removed.has(cell) or _is_pool_air(cell.x, cell.y, cell.z):
		return
	var body := StaticBody3D.new()
	body.collision_layer = LAYER_WORLD
	body.collision_mask = LAYER_WORLD
	body.physics_material_override = _phys_mat
	body.position = _center(cell.x, cell.y, cell.z)
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3.ONE * stride * 0.86
	shape.shape = box
	body.add_child(shape)
	collision_root.add_child(body)
	_proxies[cell] = body


func _spawn_debris(center: Vector3, kind: String, push: Vector3) -> void:
	if fractures.is_empty():
		return
	var which := 0
	if fractures.size() > 1 and _hash01(int(center.x * 17.0), int(center.y * 13.0), int(center.z * 11.0)) > 0.5:
		which = 1
	var variant: Array = fractures[which]
	var mat: Material = _material_for(kind)
	if material_mode != "Layered":
		mat = _uniform_material(material_mode)
	var outward := push
	if outward.length_squared() < 0.001:
		outward = Vector3(0, 0.2, 1)
	outward = outward.normalized()
	var piece_i := 0
	for chunk in variant:
		var body := RigidBody3D.new()
		body.collision_layer = LAYER_DEBRIS
		body.collision_mask = LAYER_WORLD | LAYER_DEBRIS
		body.physics_material_override = _phys_mat
		body.mass = maxf(0.05, float(chunk.volume) * 0.35)
		body.continuous_cd = false
		body.can_sleep = true
		body.linear_damp = 0.15
		body.angular_damp = 0.45
		var mi := MeshInstance3D.new()
		mi.mesh = chunk.mesh
		mi.material_override = mat
		if mat is ShaderMaterial:
			mi.set_instance_shader_parameter("uv_offset", Vector3(
				_hash01(piece_i, int(center.x * 10.0) + 1, 3),
				_hash01(piece_i + 2, int(center.y * 10.0) + 4, 5),
				_hash01(piece_i + 4, int(center.z * 10.0) + 6, 7)
			) * 4.0)
		mi.scale = Vector3.ONE * visual * 0.86
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		body.add_child(mi)
		var col := CollisionShape3D.new()
		var shape := ConvexPolygonShape3D.new()
		shape.points = chunk.points
		col.shape = shape
		col.scale = mi.scale
		body.add_child(col)
		var j := _hash01(piece_i + 3, int(center.y * 40.0) + 1, int(center.x * 40.0) + 2)
		body.position = center + outward * visual * 0.85 + Vector3(j - 0.5, _hash01(piece_i, 2, 5) - 0.5, _hash01(piece_i, 8, 1) - 0.5) * visual * 0.15
		body.rotation = Vector3(j, _hash01(piece_i, 4, 4), _hash01(piece_i, 9, 2)) * 0.4
		debris_root.add_child(body)
		var kick := outward * randf_range(0.18, 0.32) + Vector3(0, randf_range(0.04, 0.12), 0)
		body.apply_central_impulse(kick)
		body.apply_torque_impulse(Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * 0.008)
		piece_i += 1


func _spawn_dust(center: Vector3, push: Vector3) -> void:
	var particles := GPUParticles3D.new()
	particles.one_shot = true
	particles.explosiveness = 0.9
	particles.amount = 18
	particles.lifetime = 0.7
	particles.visibility_aabb = AABB(Vector3(-1, -1, -1), Vector3(2, 2, 2))
	particles.position = center
	particles.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var proc := ParticleProcessMaterial.new()
	proc.direction = Vector3(0, 1, 0) + push.normalized() * 0.6
	proc.spread = 55.0
	proc.initial_velocity_min = 0.35
	proc.initial_velocity_max = 1.1
	proc.gravity = Vector3(0, -1.6, 0)
	proc.scale_min = 0.35
	proc.scale_max = 1.0
	proc.color = Color(0.62, 0.5, 0.4, 0.55)
	particles.process_material = proc
	particles.draw_pass_1 = _dust_mesh
	add_child(particles)
	particles.emitting = true
	get_tree().create_timer(1.8).timeout.connect(func() -> void:
		if is_instance_valid(particles):
			particles.queue_free()
	)


func _occluder_closer(origin: Vector3, dir: Vector3, block_dist: float) -> bool:
	var space := get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(origin, origin + dir * block_dist)
	query.collision_mask = 2 | LAYER_DEBRIS
	var hit := space.intersect_ray(query)
	if hit.is_empty():
		return false
	return origin.distance_to(hit.position) < block_dist - visual * 0.4


func _dda(origin: Vector3, dir: Vector3) -> Vector3i:
	var o := _to_cell(origin)
	var d := Vector3(dir.x / stride, -dir.y / stride, dir.z / stride)
	if d.length() < 1e-8:
		return Vector3i(-1, -1, -1)
	var dims := Vector3(nx, ny, nz)
	var t_enter := 0.0
	var t_exit := 1.0e8
	for axis in 3:
		if absf(d[axis]) < 1e-8:
			if o[axis] < 0.0 or o[axis] > dims[axis]:
				return Vector3i(-1, -1, -1)
		else:
			var inv := 1.0 / d[axis]
			var t1 := (0.0 - o[axis]) * inv
			var t2 := (dims[axis] - o[axis]) * inv
			t_enter = maxf(t_enter, minf(t1, t2))
			t_exit = minf(t_exit, maxf(t1, t2))
	if t_enter > t_exit or t_exit < 0.0:
		return Vector3i(-1, -1, -1)
	var t := maxf(t_enter, 0.0)
	var p := o + d * (t + 1e-4)
	var cell := Vector3i(
		clampi(floori(p.x), 0, nx - 1),
		clampi(floori(p.y), 0, ny - 1),
		clampi(floori(p.z), 0, nz - 1)
	)
	var step := Vector3i(
		1 if d.x >= 0.0 else -1,
		1 if d.y >= 0.0 else -1,
		1 if d.z >= 0.0 else -1
	)
	var t_delta := Vector3(
		INF if absf(d.x) < 1e-8 else absf(1.0 / d.x),
		INF if absf(d.y) < 1e-8 else absf(1.0 / d.y),
		INF if absf(d.z) < 1e-8 else absf(1.0 / d.z)
	)
	var t_max := Vector3(
		_boundary_t(o.x, d.x, cell.x),
		_boundary_t(o.y, d.y, cell.y),
		_boundary_t(o.z, d.z, cell.z)
	)
	for _step in nx + ny + nz + 4:
		if _occupied(cell):
			return cell
		if t_max.x <= t_max.y and t_max.x <= t_max.z:
			cell.x += step.x
			if cell.x < 0 or cell.x >= nx:
				return Vector3i(-1, -1, -1)
			t_max.x += t_delta.x
		elif t_max.y <= t_max.z:
			cell.y += step.y
			if cell.y < 0 or cell.y >= ny:
				return Vector3i(-1, -1, -1)
			t_max.y += t_delta.y
		else:
			cell.z += step.z
			if cell.z < 0 or cell.z >= nz:
				return Vector3i(-1, -1, -1)
			t_max.z += t_delta.z
	return Vector3i(-1, -1, -1)


func _boundary_t(axis_origin: float, axis_dir: float, cell: int) -> float:
	if absf(axis_dir) < 1e-8:
		return INF
	var boundary := float(cell + 1) if axis_dir > 0.0 else float(cell)
	return (boundary - axis_origin) / axis_dir


func _to_cell(world: Vector3) -> Vector3:
	var x0 := -stride * float(nx) * 0.5
	var z0 := -stride * float(nz) * 0.5
	var y_top := -visual * 0.5 + stride * 0.5
	return Vector3((world.x - x0) / stride, (y_top - world.y) / stride, (world.z - z0) / stride)


func _occupied(cell: Vector3i) -> bool:
	if cell.x < 0 or cell.y < 0 or cell.z < 0 or cell.x >= nx or cell.y >= ny or cell.z >= nz:
		return false
	if _removed.has(cell) or _is_pool_air(cell.x, cell.y, cell.z):
		return false
	return true


func _free_children(node: Node) -> void:
	if node == null:
		return
	for child in node.get_children():
		node.remove_child(child)
		child.free()
