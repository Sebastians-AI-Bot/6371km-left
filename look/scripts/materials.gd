extends RefCounted
class_name RockMaterials

## Photographic PBR for the strata, procedural for paper, lines, and props.
## Textures are Poly Haven CC0 1K JPGs. See textures/CREDITS.txt.
## Ore flecks and lava cracks live in the rock shader, not in extra photos.

static func build() -> Dictionary:
	var paper := _paper_grain(128)
	var rock := load("res://shaders/rock_pbr.gdshader") as Shader
	var water_shader := load("res://shaders/water.gdshader") as Shader
	var soil := _maps("farm_soil")
	var sand := _maps("gravel_ground_01")
	var lime := _maps("rock_boulder_dry")
	var grain := _maps("granular_concrete")

	var mats := {}
	mats["topsoil"] = _rock(rock, soil, {
		"uv_scale": 0.22,
		"color_mul": Vector3(0.72, 0.55, 0.4),
		"normal_strength": 1.05,
		"roughness_mul": 1.05,
		"rough_gamma": 1.0,
		"specular_amt": 0.28,
	})
	mats["sand"] = _rock(rock, sand, {
		"uv_scale": 0.16,
		"color_mul": Vector3(1.05, 0.9, 0.68),
		"normal_strength": 0.85,
		"roughness_mul": 0.95,
		"rough_gamma": 1.0,
		"specular_amt": 0.32,
	})
	mats["limestone"] = _rock(rock, lime, {
		"uv_scale": 0.38,
		"color_mul": Vector3(1.18, 1.08, 0.96),
		"normal_strength": 0.7,
		"roughness_mul": 0.82,
		"rough_gamma": 1.0,
		"specular_amt": 0.38,
	})
	mats["granite"] = _rock(rock, grain, {
		"uv_scale": 0.2,
		"color_mul": Vector3(0.7, 0.72, 0.74),
		"normal_strength": 0.65,
		"roughness_mul": 0.7,
		"rough_gamma": 1.0,
		"metallic": 0.04,
		"specular_amt": 0.42,
		"ore_amount": 0.85,
		"ore_threshold": 0.7,
	})
	mats["wet"] = _rock(rock, grain, {
		"uv_scale": 0.24,
		"color_mul": Vector3(0.22, 0.22, 0.21),
		"normal_strength": 0.45,
		"roughness_mul": 0.32,
		"rough_gamma": 1.0,
		"metallic": 0.08,
		"specular_amt": 0.7,
		"clearcoat_amt": 0.4,
	})
	mats["copper"] = _rock(rock, grain, {
		"uv_scale": 0.22,
		"color_mul": Vector3(0.62, 0.58, 0.52),
		"normal_strength": 0.55,
		"roughness_mul": 0.62,
		"rough_gamma": 1.0,
		"specular_amt": 0.5,
		"ore_amount": 1.0,
		"ore_threshold": 0.52,
	})
	mats["hot0"] = _hot(rock, lime, 0.35)
	mats["hot1"] = _hot(rock, lime, 0.85)
	mats["hot2"] = _hot(rock, lime, 1.45)
	mats["water"] = _water(water_shader)
	mats["wood"] = _plain(Color("7a4e2d"), 0.68, 0.0)
	mats["cloth"] = _plain(Color("2a4f8f"), 0.78, 0.0)
	mats["cloth_dark"] = _plain(Color("1c2744"), 0.8, 0.0)
	mats["skin"] = _plain(Color("e2b48f"), 0.58, 0.0)
	mats["yellow"] = _plain(Color("e2a322"), 0.42, 0.06)
	mats["metal"] = _plain(Color("2c3038"), 0.38, 0.72)
	mats["glass"] = _glass()
	mats["foliage"] = _plain(Color("e7b7c6"), 0.82, 0.0)
	mats["foliage_deep"] = _plain(Color("c9899c"), 0.84, 0.0)
	mats["lamp"] = _lamp()
	mats["paper"] = _paper(paper)
	mats["lines"] = _lines()
	mats["catcher"] = _catcher()
	return mats


static func _maps(id: String) -> Dictionary:
	# JPEGs are gamma-encoded. Convert once so the shader can sample them as linear
	# data: albedo, OpenGL normals, and roughness.
	return {
		"albedo": _linear_tex("res://textures/%s_diff_1k.jpg" % id),
		"normal": _linear_tex("res://textures/%s_nor_gl_1k.jpg" % id),
		"rough": _linear_tex("res://textures/%s_rough_1k.jpg" % id),
	}


static func _linear_tex(res_path: String) -> Texture2D:
	var img := Image.new()
	var err := img.load(ProjectSettings.globalize_path(res_path))
	if err != OK:
		push_error("texture load failed %s (%s)" % [res_path, err])
		return null
	if img.get_format() != Image.FORMAT_RGB8 and img.get_format() != Image.FORMAT_RGBA8:
		img.convert(Image.FORMAT_RGB8)
	img.srgb_to_linear()
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


static func _rock(shader: Shader, maps: Dictionary, p: Dictionary) -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("albedo_tex", maps.albedo)
	mat.set_shader_parameter("normal_tex", maps.normal)
	mat.set_shader_parameter("rough_tex", maps.rough)
	for key in p.keys():
		mat.set_shader_parameter(key, p[key])
	return mat


static func _hot(shader: Shader, maps: Dictionary, energy: float) -> ShaderMaterial:
	return _rock(shader, maps, {
		"uv_scale": 0.32,
		"color_mul": Vector3(0.07, 0.045, 0.035),
		"normal_strength": 0.85,
		"roughness_mul": 0.85,
		"rough_gamma": 1.0,
		"specular_amt": 0.3,
		"hot_amount": energy,
		"hot_color": Vector3(1.0, 0.28, 0.04),
	})


static func _water(shader: Shader) -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("water_color", Color(0.1, 0.42, 0.48, 0.62))
	return mat


static func _plain(albedo: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = albedo
	mat.roughness = roughness
	mat.metallic = metallic
	return mat


static func _glass() -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.12, 0.18, 0.22, 0.45)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.roughness = 0.06
	mat.metallic = 0.0
	mat.metallic_specular = 0.8
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	return mat


static func _lamp() -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("ffd2a4")
	mat.emission_enabled = true
	mat.emission = Color("ffc58a")
	mat.emission_energy_multiplier = 2.2
	mat.roughness = 0.35
	return mat


static func _paper(grain: Texture2D) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color("efe4d6")
	mat.albedo_texture = grain
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	return mat


static func _lines() -> ShaderMaterial:
	var shader := Shader.new()
	shader.code = """
shader_type spatial;
render_mode unshaded, cull_disabled, blend_mix, depth_draw_never;
varying vec4 col;
void vertex() {
	col = COLOR;
}
void fragment() {
	ALBEDO = col.rgb;
	ALPHA = col.a;
}
"""
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.render_priority = 2
	return mat


static func _catcher() -> ShaderMaterial:
	var shader := Shader.new()
	shader.code = """
shader_type spatial;
render_mode cull_disabled, blend_mix, shadow_to_opacity, ambient_light_disabled;
void fragment() {
	ALBEDO = vec3(0.0);
}
"""
	return _shader_mat(shader)


static func _shader_mat(shader: Shader) -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.shader = shader
	return mat


static func _paper_grain(size: int) -> Texture2D:
	var noise := FastNoiseLite.new()
	noise.seed = 19
	noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	noise.frequency = 0.02
	noise.fractal_octaves = 3
	var paper := Image.create(size, size, false, Image.FORMAT_RGB8)
	for y in size:
		for x in size:
			var fiber := noise.get_noise_2d(float(x), float(y))
			var tone := clampf(0.94 + fiber * 0.045, 0.0, 1.0)
			paper.set_pixel(x, y, Color(tone, tone, tone * 0.985))
	paper.generate_mipmaps()
	return ImageTexture.create_from_image(paper)
