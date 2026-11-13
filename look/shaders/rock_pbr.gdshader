shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;

// Object-space triplanar on the dominant face. Each MultiMesh block shifts
// the sample with INSTANCE_CUSTOM so neighbouring cubes are not the same crop.
// Debris sets the instance uniform uv_offset instead.

uniform sampler2D albedo_tex : filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D normal_tex : filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rough_tex : filter_linear_mipmap_anisotropic, repeat_enable;
uniform float uv_scale = 2.5;
uniform float uv_jitter = 4.0;
uniform vec3 color_mul = vec3(1.0);
uniform float normal_strength = 0.8;
uniform float normal_y_sign = 1.0;
uniform float roughness_mul = 1.0;
uniform float rough_gamma = 1.0;
uniform float metallic = 0.0;
uniform float specular_amt = 0.4;
uniform float ore_amount = 0.0;
uniform float ore_threshold = 0.84;
uniform float hot_amount = 0.0;
uniform vec3 hot_color = vec3(1.0, 0.32, 0.05);
uniform float clearcoat_amt = 0.0;

instance uniform vec3 uv_offset = vec3(0.0);

varying vec3 sample_pos;
varying vec3 sample_n;
varying vec3 local_vert;
varying vec3 shift;

void vertex() {
	shift = uv_offset + INSTANCE_CUSTOM.xyz * uv_jitter;
	sample_pos = VERTEX * uv_scale + shift;
	sample_n = NORMAL;
	local_vert = VERTEX;
}

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.yzx + 33.33);
	return fract((p.x + p.y) * p.z);
}

float crack_mask(vec3 p) {
	float a = abs(sin(p.x * 2.1 + sin(p.y * 1.2) * 1.5));
	float b = abs(sin(p.z * 1.7 + sin(p.x * 0.8) * 1.4));
	float c = abs(sin((p.x + p.z) * 1.35 + p.y * 0.45));
	float v = min(a, min(b, c));
	return 1.0 - smoothstep(0.012, 0.04, v);
}

void fragment() {
	vec3 n = normalize(sample_n);
	vec3 an = abs(n);
	vec2 uv;
	if (an.y >= an.x && an.y >= an.z) {
		uv = sample_pos.xz;
	} else if (an.x >= an.z) {
		uv = sample_pos.zy;
	} else {
		uv = sample_pos.xy;
	}

	vec3 alb = texture(albedo_tex, uv).rgb * color_mul * COLOR.rgb;
	float rough = pow(max(texture(rough_tex, uv).r, 0.001), rough_gamma) * roughness_mul;
	float metal = metallic;
	float spec = specular_amt;

	if (ore_amount > 0.001) {
		// Blobs in cube-local space, so a nugget stays large enough to read.
		vec3 cell = floor(local_vert * 2.6 + shift * 3.0);
		float h = hash13(cell);
		float fleck = smoothstep(ore_threshold, ore_threshold + 0.05, h) * clamp(ore_amount, 0.0, 1.0);
		float gold = hash13(cell + vec3(5.2, 1.3, 8.0));
		vec3 ore_col = mix(vec3(0.55, 0.28, 0.12), vec3(0.78, 0.58, 0.22), gold);
		alb = mix(alb, ore_col, fleck);
		metal = mix(metal, 0.92, fleck);
		rough = mix(rough, 0.28, fleck);
		spec = mix(spec, 0.8, fleck);
	}

	float glow = 0.0;
	if (hot_amount > 0.001) {
		// The photo is a light boulder. Pull it down to charcoal so the
		// layer reads as hot rock, and keep the photo only as a stain.
		alb = mix(vec3(0.035, 0.024, 0.02), alb * vec3(0.45, 0.32, 0.26), 0.3);
		float cracks = crack_mask(local_vert * 3.4 + shift);
		vec3 edge_v = abs(local_vert);
		// Second-largest axis: near an edge of the cube, not the whole face.
		float second = min(max(edge_v.x, edge_v.y), min(max(edge_v.x, edge_v.z), max(edge_v.y, edge_v.z)));
		float edge = smoothstep(0.47, 0.495, second);
		float vein = clamp(max(cracks, edge), 0.0, 1.0);
		glow = vein * hot_amount;
		rough = mix(rough, 0.55, vein);
	}

	vec3 tn = texture(normal_tex, uv).xyz * 2.0 - 1.0;
	tn.y *= normal_y_sign;
	tn.xy *= normal_strength;
	tn.z = sqrt(max(1.0 - clamp(dot(tn.xy, tn.xy), 0.0, 1.0), 0.0001));

	vec3 geo_n = NORMAL;
	vec3 geo_t = TANGENT;
	vec3 geo_b = BINORMAL;
	NORMAL = normalize(geo_t * tn.x + geo_b * tn.y + geo_n * tn.z);

	ALBEDO = alb;
	ROUGHNESS = clamp(rough, 0.04, 1.0);
	METALLIC = metal;
	SPECULAR = spec;
	EMISSION = hot_color * glow;
	CLEARCOAT = clearcoat_amt;
	CLEARCOAT_ROUGHNESS = 0.18;
}
