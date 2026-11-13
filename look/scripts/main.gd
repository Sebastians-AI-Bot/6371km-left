extends Node3D

## Look prototype. Orbit, zoom, click a block to break it.
## No gameplay, no menus, no currency.
##
## Controls:
##   Right mouse  — orbit
##   Wheel        — zoom (block to line-drawn Earth)
##   Left click   — break the block under the cursor
##   H            — hide or show the debug panel

const EARTH_R := 90.0
const FOV := 30.0
const SHOT_DIR := "res://notes/screenshots"

var camera: Camera3D
var key_light: DirectionalLight3D
var fill_light: DirectionalLight3D
var rim_light: DirectionalLight3D
var world_env: WorldEnvironment
var sky: Sky
var field: Node3D
var line_mi: MeshInstance3D
var dim_label: Label3D
var paper: MeshInstance3D
var panel: PanelContainer
var fps_label: Label
var count_label: Label
var zoom_slider: HSlider
var variation_slider: HSlider
var stress_box: CheckBox

var yaw := deg_to_rad(22.0)
var pitch := deg_to_rad(28.0)
var zoom01 := 0.0
var focus_y_bias := 0.0
var dist_scale := 1.0
var background_name := "Paper"
var light_name := "Studio warm"
var _orbiting := false
var _pressing := false
var _press_pos := Vector2.ZERO
var _line_key := -1.0
var _block_tris := 0
var _fps_window := 0.0
var _fps_frames := 0
var _fps_shown := 0.0
var _shot_running := false

var _presets := {
	"Studio warm": {
		"key_from": Vector3(-6.0, 10.0, 5.5),
		"key_color": Color(1.0, 0.93, 0.82),
		"key_energy": 0.92,
		"key_angular": 3.1,
		"fill_from": Vector3(7.0, 3.2, 4.0),
		"fill_color": Color(0.78, 0.84, 0.96),
		"fill_energy": 0.55,
		"rim_from": Vector3(-1.0, 4.5, -7.0),
		"rim_energy": 0.22,
		"ambient": Color(0.78, 0.7, 0.6),
		"ambient_energy": 0.62,
		"ssao": 1.25,
		"exposure": 1.0,
	},
	"Daylight": {
		"key_from": Vector3(-2.0, 14.0, 3.0),
		"key_color": Color(0.98, 0.98, 1.0),
		"key_energy": 1.55,
		"key_angular": 0.35,
		"fill_from": Vector3(5.0, 2.0, 2.0),
		"fill_color": Color(0.75, 0.82, 0.95),
		"fill_energy": 0.14,
		"rim_from": Vector3(0.0, 3.0, -6.0),
		"rim_energy": 0.08,
		"ambient": Color(0.62, 0.68, 0.78),
		"ambient_energy": 0.28,
		"ssao": 1.15,
		"exposure": 1.0,
	},
	"Gallery": {
		"key_from": Vector3(-1.5, 12.0, 2.0),
		"key_color": Color(1.0, 0.97, 0.92),
		"key_energy": 0.85,
		"key_angular": 2.8,
		"fill_from": Vector3(2.0, 4.0, 8.0),
		"fill_color": Color(1.0, 0.96, 0.9),
		"fill_energy": 0.48,
		"rim_from": Vector3(-4.0, 2.0, -3.0),
		"rim_energy": 0.1,
		"ambient": Color(0.84, 0.8, 0.74),
		"ambient_energy": 0.62,
		"ssao": 2.15,
		"exposure": 1.02,
	},
}


func _ready() -> void:
	_configure_view()
	_build_environment()
	_build_lights()
	print("6.371 km look — loading CC0 rock materials")
	var mats: Dictionary = RockMaterials.build()
	print("meshing bevelled cube and fractures")
	var mesh := MeshLib.beveled_cube()
	_block_tris = _triangle_count(mesh)
	var chunks := [MeshLib.fracture_cube(6, 6371), MeshLib.fracture_cube(6, 6419)]
	_log_fractures(chunks)
	field = preload("res://scripts/block_field.gd").new()
	add_child(field)
	field.setup(mats, mesh, chunks)
	DioramaProps.build(self, mats)
	_build_lines(mats)
	_build_camera_and_paper(mats)
	_build_panel()
	_apply_light("Studio warm")
	_apply_background("Paper")
	print("ready  blocks=", field.solid, " tris/block=", _block_tris, " adapter=", RenderingServer.get_video_adapter_name())
	var args := OS.get_cmdline_user_args()
	if "--shots" in args or "--quick" in args or "--sky" in args or "--granite" in args or "--preview" in args:
		_shot_running = true
		_run_shots("--quick" in args, "--sky" in args)


func _configure_view() -> void:
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	var win := get_window()
	win.size = Vector2i(1500, 1000)
	win.position = Vector2i(48, 48)
	get_viewport().msaa_3d = Viewport.MSAA_2X
	get_viewport().use_debanding = true


func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("efe4d6")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.78, 0.7, 0.6)
	env.ambient_light_energy = 0.55
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.0
	env.tonemap_white = 6.0
	env.fog_enabled = false
	env.ssao_enabled = true
	env.ssao_radius = 0.22
	env.ssao_intensity = 1.25
	env.ssao_power = 1.2
	env.ssao_detail = 0.7
	env.ssao_horizon = 0.2
	env.ssao_sharpness = 0.45
	env.glow_enabled = true
	env.glow_intensity = 0.4
	env.glow_strength = 0.65
	env.glow_bloom = 0.08
	env.glow_hdr_threshold = 1.15
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.42, 0.62, 0.88)
	sky_mat.sky_horizon_color = Color(0.76, 0.84, 0.92)
	sky_mat.ground_horizon_color = Color(0.7, 0.78, 0.86)
	sky_mat.ground_bottom_color = Color(0.5, 0.62, 0.78)
	sky_mat.sun_angle_max = 28.0
	sky = Sky.new()
	sky.sky_material = sky_mat
	env.sky = sky
	world_env = WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)


func _build_lights() -> void:
	key_light = DirectionalLight3D.new()
	key_light.shadow_enabled = true
	key_light.shadow_bias = 0.04
	key_light.shadow_normal_bias = 0.85
	key_light.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	key_light.directional_shadow_max_distance = 40.0
	add_child(key_light)
	fill_light = DirectionalLight3D.new()
	fill_light.shadow_enabled = false
	add_child(fill_light)
	rim_light = DirectionalLight3D.new()
	rim_light.shadow_enabled = false
	rim_light.light_color = Color(1.0, 0.9, 0.78)
	add_child(rim_light)


func _build_lines(mats: Dictionary) -> void:
	line_mi = MeshInstance3D.new()
	line_mi.name = "TechLines"
	line_mi.material_override = mats.lines
	line_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(line_mi)
	dim_label = Label3D.new()
	dim_label.text = "6 371 km"
	dim_label.font_size = 56
	dim_label.pixel_size = 0.042
	dim_label.modulate = Color(0.28, 0.36, 0.48, 0.0)
	dim_label.outline_size = 0
	dim_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	dim_label.position = Vector3(EARTH_R + 4.0, -EARTH_R * 0.45, 0.4)
	dim_label.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(dim_label)


func _build_camera_and_paper(mats: Dictionary) -> void:
	camera = Camera3D.new()
	camera.fov = FOV
	camera.near = 0.05
	camera.far = 900.0
	camera.current = true
	add_child(camera)
	var quad := QuadMesh.new()
	quad.size = Vector2(1, 1)
	paper = MeshInstance3D.new()
	paper.mesh = quad
	paper.material_override = mats.paper
	paper.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	camera.add_child(paper)


func _build_panel() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 20
	add_child(layer)
	var host := Control.new()
	host.set_anchors_preset(Control.PRESET_FULL_RECT)
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(host)
	panel = PanelContainer.new()
	panel.position = Vector2(14, 14)
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.14, 0.12, 0.1, 0.82)
	style.set_corner_radius_all(6)
	style.set_content_margin_all(12)
	panel.add_theme_stylebox_override("panel", style)
	host.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	panel.add_child(box)
	var title := Label.new()
	title.text = "6.371 km look"
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(0.97, 0.94, 0.88))
	box.add_child(title)
	var hint := Label.new()
	hint.text = "RMB orbit   wheel zoom   LMB break   H hide"
	hint.add_theme_color_override("font_color", Color(0.78, 0.74, 0.66))
	box.add_child(hint)
	box.add_child(_row("Material", _option(["Layered", "Topsoil", "Sand", "Limestone", "Granite", "Copper", "Hot rock"], _on_material)))
	box.add_child(_row("Light", _option(["Studio warm", "Daylight", "Gallery"], _on_light)))
	variation_slider = _slider(0.0, 1.0, 0.01, field.variation, _on_variation)
	box.add_child(_row("Variation", variation_slider))
	zoom_slider = _slider(0.0, 1.0, 0.001, 0.0, _on_zoom_slider)
	box.add_child(_row("Zoom", zoom_slider))
	box.add_child(_row("Background", _option(["Paper", "Sky"], _on_background)))
	stress_box = CheckBox.new()
	stress_box.text = "Stress 100k blocks"
	stress_box.add_theme_color_override("font_color", Color(0.96, 0.93, 0.86))
	stress_box.toggled.connect(_on_stress)
	box.add_child(stress_box)
	fps_label = Label.new()
	fps_label.add_theme_color_override("font_color", Color(0.96, 0.93, 0.86))
	box.add_child(fps_label)
	count_label = Label.new()
	count_label.add_theme_color_override("font_color", Color(0.96, 0.93, 0.86))
	box.add_child(count_label)


func _row(label_text: String, control: Control) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var label := Label.new()
	label.text = label_text
	label.custom_minimum_size = Vector2(108, 0)
	label.add_theme_color_override("font_color", Color(0.9, 0.86, 0.78))
	row.add_child(label)
	control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	control.custom_minimum_size = Vector2(180, 0)
	row.add_child(control)
	return row


func _option(items: Array, callback: Callable) -> OptionButton:
	var opt := OptionButton.new()
	for item in items:
		opt.add_item(str(item))
	opt.item_selected.connect(func(idx: int) -> void:
		callback.call(opt.get_item_text(idx))
	)
	return opt


func _slider(min_v: float, max_v: float, step: float, value: float, callback: Callable) -> HSlider:
	var slider := HSlider.new()
	slider.min_value = min_v
	slider.max_value = max_v
	slider.step = step
	slider.value = value
	slider.value_changed.connect(callback)
	return slider


func _process(delta: float) -> void:
	_update_camera()
	_update_lines()
	_update_paper()
	_update_hud(delta)
	if key_light:
		var dist := camera.global_position.distance_to(_focus_point())
		key_light.directional_shadow_max_distance = clampf(dist * 3.0, 24.0, 220.0)
	if field and field.catcher:
		field.catcher.visible = false


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if button.button_index == MOUSE_BUTTON_LEFT:
			if button.pressed:
				_pressing = true
				_press_pos = button.position
			elif _pressing:
				_pressing = false
				if _press_pos.distance_to(button.position) < 6.0 and not _shot_running:
					field.try_break(camera, button.position)
		elif button.button_index == MOUSE_BUTTON_RIGHT:
			_orbiting = button.pressed
		elif button.pressed and button.button_index == MOUSE_BUTTON_WHEEL_UP:
			_set_zoom(zoom01 - 0.04)
		elif button.pressed and button.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_set_zoom(zoom01 + 0.04)
	elif event is InputEventMouseMotion and _orbiting:
		var motion := event as InputEventMouseMotion
		yaw -= motion.relative.x * 0.005
		pitch = clampf(pitch - motion.relative.y * 0.004, deg_to_rad(12.0), deg_to_rad(68.0))
	elif event is InputEventKey and event.pressed and not event.echo:
		if (event as InputEventKey).keycode == KEY_H:
			panel.visible = not panel.visible


func _update_camera() -> void:
	var focus := _focus_point()
	var dist := _camera_distance() * dist_scale
	var direction := Vector3(cos(pitch) * sin(yaw), sin(pitch), cos(pitch) * cos(yaw))
	camera.global_position = focus + direction * dist
	camera.look_at(focus, Vector3.UP)
	camera.near = lerpf(0.04, 0.6, zoom01)
	camera.far = maxf(900.0, dist * 4.0)


func _focus_point() -> Vector3:
	var block_focus := Vector3(0.0, -field.block_height * 0.46 + focus_y_bias, 0.15)
	var earth_focus := Vector3(0.0, -EARTH_R, 0.0)
	return block_focus.lerp(earth_focus, smoothstep(0.48, 1.0, zoom01))


func _camera_distance() -> float:
	var close_d: float = field.fit_distance(FOV)
	var far_d := EARTH_R * 4.35
	var t := clampf(zoom01, 0.0, 1.0)
	return exp(lerpf(log(close_d), log(far_d), t))


func _update_lines() -> void:
	var key := snappedf(zoom01, 0.012)
	var size_key := float(field.nx * 1000 + field.ny)
	var token := key + size_key * 0.00001
	if absf(token - _line_key) > 0.0000001:
		_line_key = token
		line_mi.mesh = MeshLib.build_tech_lines(field.world_aabb(), zoom01, field.layer_boundary_ys(), EARTH_R)
	line_mi.visible = zoom01 >= 0.04
	var label_a := smoothstep(0.5, 0.7, zoom01)
	dim_label.modulate.a = label_a
	dim_label.visible = label_a > 0.04


func _update_paper() -> void:
	var show := background_name == "Paper"
	paper.visible = show
	if not show:
		return
	var dist := 520.0
	paper.position = Vector3(0, 0, -dist)
	var half := deg_to_rad(camera.fov * 0.5)
	var height := 2.0 * dist * tan(half) * 1.08
	var width := height * (float(get_viewport().size.x) / maxf(float(get_viewport().size.y), 1.0))
	paper.scale = Vector3(width, height, 1.0)


func _update_hud(delta: float) -> void:
	_fps_window += delta
	_fps_frames += 1
	if _fps_window >= 0.4:
		_fps_shown = float(_fps_frames) / _fps_window
		_fps_window = 0.0
		_fps_frames = 0
	if fps_label:
		fps_label.text = "FPS  %.0f" % _fps_shown
	if count_label and field:
		count_label.text = "Blocks  %d    debris  %d" % [field.solid, _debris_bodies()]


func _debris_bodies() -> int:
	var n := 0
	for child in field.debris_root.get_children():
		if child is RigidBody3D:
			n += 1
	return n


func _set_zoom(z: float) -> void:
	zoom01 = clampf(z, 0.0, 1.0)
	if zoom_slider:
		zoom_slider.set_value_no_signal(zoom01)


func _apply_light(name: String) -> void:
	light_name = name
	var preset: Dictionary = _presets[name]
	_aim(key_light, preset.key_from)
	key_light.light_color = preset.key_color
	key_light.light_energy = preset.key_energy
	key_light.light_angular_distance = preset.key_angular
	_aim(fill_light, preset.fill_from)
	fill_light.light_color = preset.fill_color
	fill_light.light_energy = preset.fill_energy
	_aim(rim_light, preset.rim_from)
	rim_light.light_energy = preset.rim_energy
	var env := world_env.environment
	env.ambient_light_color = preset.ambient
	env.ambient_light_energy = preset.ambient_energy
	env.ssao_intensity = preset.ssao
	env.tonemap_exposure = preset.exposure


func _aim(light: DirectionalLight3D, from: Vector3) -> void:
	light.global_position = from
	light.look_at(Vector3(0, -1.2, 0), Vector3.UP)


func _apply_background(name: String) -> void:
	background_name = name
	var env := world_env.environment
	if name == "Sky":
		env.background_mode = Environment.BG_SKY
	else:
		env.background_mode = Environment.BG_COLOR
		env.background_color = Color("efe4d6")


func _on_material(mode: String) -> void:
	field.apply_material_mode(mode)


func _on_light(name: String) -> void:
	_apply_light(name)


func _on_background(name: String) -> void:
	_apply_background(name)


func _on_variation(value: float) -> void:
	field.apply_variation(value)


func _on_zoom_slider(value: float) -> void:
	zoom01 = value


func _on_stress(enabled: bool) -> void:
	print("rebuilding stress=", enabled)
	var t0 := Time.get_ticks_msec()
	field.rebuild(enabled)
	_line_key = -1.0
	print("rebuild ", Time.get_ticks_msec() - t0, " ms  blocks=", field.solid)


func _run_shots(quick: bool, sky_only: bool = false) -> void:
	var report := {
		"godot": Engine.get_version_info(),
		"adapter": RenderingServer.get_video_adapter_name(),
		"renderer": str(ProjectSettings.get_setting("rendering/renderer/rendering_method")),
		"tris_per_block": _block_tris,
	}
	panel.visible = false
	if "--preview" in OS.get_cmdline_user_args():
		await _settle_frames(8)
		await _save_shot("01-diorama-studio")
		get_tree().quit(0)
		return
	if "--granite" in OS.get_cmdline_user_args():
		field.apply_material_mode("Granite")
		await _settle_frames(6)
		await _save_shot("08-material-granite")
		get_tree().quit(0)
		return
	if sky_only:
		_apply_background("Sky")
		await _settle_frames(6)
		await _save_shot("07-background-sky")
		get_tree().quit(0)
		return
	await _settle_frames(8)
	report["viewport"] = _viewport_size()
	report["beauty"] = await _bench(24 if quick else 40)
	report["beauty"]["blocks"] = field.solid
	report["beauty"]["mesh_instances"] = field.mesh_instances
	report["beauty"]["triangles"] = field.mesh_instances * _block_tris
	await _save_shot("01-diorama-studio")
	if quick:
		_break_cluster(12)
		await _physics_steps(120)
		await _save_shot("02-break-debris")
		_write_report(report)
		get_tree().quit(0)
		return
	_break_cluster(12)
	await _physics_steps(160)
	report["after_break"] = await _bench(24)
	report["after_break"]["blocks"] = field.solid
	report["after_break"]["debris"] = _debris_bodies()
	await _save_shot("02-break-debris")
	_set_zoom(0.2)
	await _settle_frames(4)
	await _save_shot("03-zoom-lines-near")
	_set_zoom(1.0)
	await _settle_frames(6)
	await _save_shot("04-zoom-lines-earth")
	_set_zoom(0.0)
	focus_y_bias = 0.0
	dist_scale = 1.0
	_apply_light("Daylight")
	await _settle_frames(4)
	await _save_shot("05-light-daylight")
	_apply_light("Gallery")
	await _settle_frames(4)
	await _save_shot("06-light-gallery")
	_apply_light("Studio warm")
	_apply_background("Sky")
	await _settle_frames(4)
	await _save_shot("07-background-sky")
	_apply_background("Paper")
	field.apply_material_mode("Granite")
	await _settle_frames(3)
	await _save_shot("08-material-granite")
	field.apply_material_mode("Layered")
	focus_y_bias = -field.block_height * 0.22
	dist_scale = 0.62
	pitch = deg_to_rad(16.0)
	yaw = deg_to_rad(34.0)
	await _settle_frames(4)
	await _save_shot("09-water-hot")
	focus_y_bias = 0.0
	dist_scale = 1.0
	pitch = deg_to_rad(28.0)
	yaw = deg_to_rad(22.0)
	_set_zoom(0.0)
	panel.visible = true
	await _settle_frames(3)
	await _save_shot("11-debug-panel")
	panel.visible = false
	print("building stress grid")
	var t0 := Time.get_ticks_msec()
	field.rebuild(true)
	report["stress_build_ms"] = Time.get_ticks_msec() - t0
	_line_key = -1.0
	await _settle_frames(6)
	report["stress"] = await _bench(16)
	report["stress"]["blocks"] = field.solid
	report["stress"]["triangles"] = field.mesh_instances * _block_tris
	report["stress"]["shadows"] = true
	await _save_shot("10-stress")
	field.set_cast_shadows(false)
	key_light.shadow_enabled = false
	await _settle_frames(4)
	report["stress_no_shadow"] = await _bench(16)
	report["stress_no_shadow"]["blocks"] = field.solid
	_write_report(report)
	get_tree().quit(0)


func _break_cluster(count: int) -> void:
	var broken := 0
	var x0: int = int(field.nx) / 2 - 1
	var y0: int = int(float(field.ny) * 0.28)
	for iy in range(y0, y0 + 4):
		for ix in range(x0, x0 + 3):
			if broken >= count:
				print("broke ", broken)
				return
			if field.break_cell(ix, iy, field.nz - 1, Vector3(0.0, 0.2, 1.0)):
				broken += 1
	print("broke ", broken)


func _settle_frames(n: int) -> void:
	for _i in n:
		await get_tree().process_frame


func _physics_steps(n: int) -> void:
	for _i in n:
		await get_tree().physics_frame


func _bench(frames: int) -> Dictionary:
	await _settle_frames(4)
	var t0 := Time.get_ticks_usec()
	var worst_ms := 0.0
	for _i in frames:
		var a := Time.get_ticks_usec()
		await get_tree().process_frame
		var ms := float(Time.get_ticks_usec() - a) / 1000.0
		worst_ms = maxf(worst_ms, ms)
	var elapsed := float(Time.get_ticks_usec() - t0) / 1000000.0
	var avg := float(frames) / maxf(elapsed, 0.0001)
	var result := {
		"frames": frames,
		"seconds": snappedf(elapsed, 0.01),
		"fps_avg": snappedf(avg, 0.1),
		"fps_min": snappedf(1000.0 / maxf(worst_ms, 0.01), 0.1),
	}
	print("BENCH ", result)
	return result


func _save_shot(shot_name: String) -> void:
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var path := SHOT_DIR + "/" + shot_name + ".png"
	var err := image.save_png(path)
	print("shot ", path, " ", image.get_width(), "x", image.get_height(), " err=", err)


func _viewport_size() -> Array:
	var s := get_viewport().get_visible_rect().size
	return [int(s.x), int(s.y)]


func _write_report(report: Dictionary) -> void:
	var path := ProjectSettings.globalize_path("res://notes/bench.json")
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		push_error("could not write " + path)
		return
	file.store_string(JSON.stringify(report, "\t"))
	print("wrote ", path)


func _log_fractures(chunks: Array) -> void:
	for i in chunks.size():
		var sum := 0.0
		for piece in chunks[i]:
			sum += float(piece.volume)
		print("fracture ", i, " pieces=", chunks[i].size(), " volume=", snappedf(sum, 0.001))


func _triangle_count(mesh: ArrayMesh) -> int:
	var total := 0
	for surface in mesh.get_surface_count():
		var indexed := mesh.surface_get_array_index_len(surface)
		if indexed > 0:
			total += indexed / 3
		else:
			total += mesh.surface_get_array_len(surface) / 3
	return total
