extends RefCounted
class_name DioramaProps

## Scale props from primitive meshes: sandbox, child, toy excavator,
## two trees, a lamp, and a short conveyor. Nothing here is gameplay.

const LAYER_PROPS := 2


static func build(parent: Node3D, mats: Dictionary) -> Node3D:
	var root := Node3D.new()
	root.name = "Props"
	parent.add_child(root)
	_sandbox(root, mats)
	_child(root, mats)
	_excavator(root, mats)
	_tree(root, mats, Vector3(-1.22, 0.0, -0.95), 1.0)
	_tree(root, mats, Vector3(1.18, 0.0, -0.72), 0.85)
	_lamp(root, mats)
	_conveyor(root, mats)
	return root


static func _sandbox(root: Node3D, mats: Dictionary) -> void:
	var origin := Vector3(-0.58, 0.0, -0.32)
	_box(root, mats.sand, origin + Vector3(0, 0.035, 0), Vector3(0.78, 0.05, 0.56))
	var wall_h := 0.11
	var t := 0.035
	_box(root, mats.wood, origin + Vector3(0, wall_h * 0.55, 0.28), Vector3(0.86, wall_h, t))
	_box(root, mats.wood, origin + Vector3(0, wall_h * 0.55, -0.28), Vector3(0.86, wall_h, t))
	_box(root, mats.wood, origin + Vector3(0.41, wall_h * 0.55, 0), Vector3(t, wall_h, 0.56))
	_box(root, mats.wood, origin + Vector3(-0.41, wall_h * 0.55, 0), Vector3(t, wall_h, 0.56))
	_solid(root, origin + Vector3(0, 0.08, 0), Vector3(0.9, 0.2, 0.64))


static func _child(root: Node3D, mats: Dictionary) -> void:
	var g := Node3D.new()
	g.name = "Child"
	g.position = Vector3(-0.62, 0.06, -0.34)
	g.rotation_degrees = Vector3(-12, 28, 0)
	root.add_child(g)
	_box(g, mats.cloth_dark, Vector3(0, 0.07, 0), Vector3(0.1, 0.12, 0.06))
	_box(g, mats.cloth, Vector3(0, 0.18, 0), Vector3(0.12, 0.13, 0.07))
	_sphere(g, mats.skin, Vector3(0, 0.3, 0.01), 0.05)
	_box(g, mats.skin, Vector3(0.08, 0.16, 0.03), Vector3(0.035, 0.1, 0.035))
	_box(g, mats.cloth, Vector3(-0.01, 0.14, 0.07), Vector3(0.035, 0.11, 0.035), Vector3(18, 0, 8))
	_cylinder(g, mats.wood, Vector3(0.03, 0.13, 0.12), 0.012, 0.26, Vector3(18, 0, 6))
	_box(g, mats.metal, Vector3(0.05, 0.015, 0.2), Vector3(0.08, 0.012, 0.055))
	_solid(root, g.position + Vector3(0, 0.16, 0), Vector3(0.22, 0.4, 0.2))


static func _excavator(root: Node3D, mats: Dictionary) -> void:
	var g := Node3D.new()
	g.name = "Excavator"
	g.position = Vector3(0.48, 0.0, -0.02)
	g.rotation_degrees = Vector3(0, -36, 0)
	root.add_child(g)
	_box(g, mats.metal, Vector3(-0.1, 0.05, 0.1), Vector3(0.28, 0.07, 0.09))
	_box(g, mats.metal, Vector3(-0.1, 0.05, -0.1), Vector3(0.28, 0.07, 0.09))
	_box(g, mats.yellow, Vector3(-0.08, 0.14, 0), Vector3(0.32, 0.1, 0.2))
	_box(g, mats.yellow, Vector3(-0.16, 0.24, 0), Vector3(0.16, 0.12, 0.16))
	_box(g, mats.glass, Vector3(-0.16, 0.25, 0.06), Vector3(0.1, 0.07, 0.02))
	_box(g, mats.yellow, Vector3(0.1, 0.2, 0), Vector3(0.22, 0.05, 0.06), Vector3(0, 0, 28))
	_box(g, mats.yellow, Vector3(0.24, 0.12, 0), Vector3(0.16, 0.045, 0.05), Vector3(0, 0, 70))
	_box(g, mats.metal, Vector3(0.3, 0.05, 0), Vector3(0.07, 0.05, 0.09))
	_solid(root, g.position + Vector3(0, 0.16, 0), Vector3(0.7, 0.36, 0.4))


static func _tree(root: Node3D, mats: Dictionary, pos: Vector3, scale: float) -> void:
	var g := Node3D.new()
	g.position = pos
	g.scale = Vector3.ONE * scale
	root.add_child(g)
	_cylinder(g, mats.wood, Vector3(0, 0.18, 0), 0.025, 0.36, Vector3.ZERO)
	_sphere(g, mats.foliage, Vector3(0, 0.42, 0), 0.16)
	_sphere(g, mats.foliage_deep, Vector3(0.08, 0.38, 0.04), 0.1)
	_sphere(g, mats.foliage, Vector3(-0.07, 0.4, -0.02), 0.09)
	_solid(root, pos + Vector3(0, 0.3, 0) * scale, Vector3(0.28, 0.6, 0.28) * scale)


static func _lamp(root: Node3D, mats: Dictionary) -> void:
	var g := Node3D.new()
	g.position = Vector3(1.02, 0.0, 0.22)
	root.add_child(g)
	_cylinder(g, mats.metal, Vector3(0, 0.22, 0), 0.015, 0.44, Vector3.ZERO)
	_box(g, mats.metal, Vector3(0.08, 0.42, 0), Vector3(0.16, 0.02, 0.02))
	_sphere(g, mats.lamp, Vector3(0.16, 0.4, 0), 0.035)
	var light := OmniLight3D.new()
	light.position = Vector3(0.16, 0.38, 0)
	light.light_color = Color("ffc89a")
	light.light_energy = 0.35
	light.omni_range = 1.8
	light.shadow_enabled = false
	g.add_child(light)
	_solid(root, g.position + Vector3(0, 0.22, 0), Vector3(0.28, 0.5, 0.16))


static func _conveyor(root: Node3D, mats: Dictionary) -> void:
	var g := Node3D.new()
	g.position = Vector3(0.95, 0.0, 0.62)
	g.rotation_degrees = Vector3(0, 18, 0)
	root.add_child(g)
	_box(g, mats.metal, Vector3(0, 0.08, 0), Vector3(0.5, 0.025, 0.14))
	_box(g, mats.cloth_dark, Vector3(0, 0.1, 0), Vector3(0.48, 0.012, 0.1))
	_cylinder(g, mats.metal, Vector3(-0.18, 0.08, 0), 0.025, 0.14, Vector3(90, 0, 0))
	_cylinder(g, mats.metal, Vector3(0.0, 0.08, 0), 0.025, 0.14, Vector3(90, 0, 0))
	_cylinder(g, mats.metal, Vector3(0.18, 0.08, 0), 0.025, 0.14, Vector3(90, 0, 0))
	_box(g, mats.granite, Vector3(-0.05, 0.14, 0), Vector3(0.06, 0.05, 0.05))
	_box(g, mats.limestone, Vector3(0.08, 0.13, 0.01), Vector3(0.05, 0.04, 0.045))
	_solid(root, g.position + Vector3(0, 0.1, 0), Vector3(0.55, 0.22, 0.24))


static func _box(parent: Node3D, mat: Material, pos: Vector3, size: Vector3, rot_deg: Vector3 = Vector3.ZERO) -> void:
	var mesh := BoxMesh.new()
	mesh.size = size
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.rotation_degrees = rot_deg
	parent.add_child(mi)


static func _sphere(parent: Node3D, mat: Material, pos: Vector3, radius: float) -> void:
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	mesh.radial_segments = 16
	mesh.rings = 8
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	parent.add_child(mi)


static func _cylinder(parent: Node3D, mat: Material, pos: Vector3, radius: float, height: float, rot_deg: Vector3) -> void:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = height
	mesh.radial_segments = 12
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.rotation_degrees = rot_deg
	parent.add_child(mi)


static func _solid(parent: Node3D, pos: Vector3, size: Vector3) -> void:
	var body := StaticBody3D.new()
	body.collision_layer = LAYER_PROPS
	body.collision_mask = 0
	body.position = pos
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	shape.shape = box
	body.add_child(shape)
	parent.add_child(body)
