shader_type spatial;
render_mode cull_disabled, blend_mix, depth_draw_always, diffuse_burley, specular_schlick_ggx;

uniform vec4 water_color : source_color = vec4(0.16, 0.48, 0.52, 0.58);

varying vec3 world_pos;
varying vec3 world_normal;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_normal = normalize(MODEL_NORMAL_MATRIX * NORMAL);
}

void fragment() {
	float t = TIME * 0.45;
	vec2 u = world_pos.xz;
	float wx = cos(u.x * 4.2 + t * 1.1) * sin(u.y * 3.4 - t * 0.6);
	wx += cos((u.x + u.y) * 7.5 + t * 1.4) * 0.4;
	float wy = sin(u.x * 4.2 + t * 1.1) * cos(u.y * 3.4 - t * 0.6);
	wy += cos((u.x + u.y) * 7.5 + t * 1.4) * 0.4;
	vec3 rip = normalize(vec3(-wx * 0.45, 1.0, -wy * 0.45));
	vec3 n = normalize(mix(world_normal, rip, 0.85));
	NORMAL = normalize(mat3(VIEW_MATRIX) * n);
	float crest = clamp(wx * 0.35 + wy * 0.35, -1.0, 1.0);

	ALBEDO = water_color.rgb * (0.82 + crest * 0.18);
	ALPHA = water_color.a;
	ROUGHNESS = 0.04;
	METALLIC = 0.0;
	SPECULAR = 0.9;
	CLEARCOAT = 0.72;
	CLEARCOAT_ROUGHNESS = 0.08;
}
