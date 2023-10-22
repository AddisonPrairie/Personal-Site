#version 300 es

precision highp float;
precision highp usampler2D;
precision highp sampler2DArray;

//output of shader
layout(location=0) out vec4 outAlbedo;
layout(location=1) out vec4 outPosition;
layout(location=2) out vec2 outAOSun;

//screen resolution
uniform ivec2 u_screensize;
//forward (view) vector
uniform vec3 u_forward;
//right (view) vector
uniform vec3 u_right;
//position
uniform vec3 u_position;
//stores voxel states blocks
uniform usampler2D u_statesBlocks;
//stores voxel states leaves
uniform usampler2D u_statesLeaves;
//voxel colors
uniform vec3 u_palette[128];
//sun direction
uniform vec3 u_sunDirection;
//blue noise
uniform sampler2DArray u_bluenoise;
//frames
uniform int u_frames;

//TAA
uniform vec2 u_jitter[4];

//functions
void getRay(in vec2 fragCoord, inout vec3 pos, inout vec3 dir);
bool intersect(in vec3 o, in vec3 dir, inout vec3 normal, inout float dist, inout ivec3 ipos, inout vec3 tempColor);
bool cheapRay(in vec3 o, in vec3 d);
vec3 getSampleBiased(vec3 d, vec3 o1, vec3 o2, float power);
vec3 getConeSample(vec3 dir, float extent);
vec3 ortho(vec3 v);

float offset = 0.;
vec2 seed;

//get blue random number
vec2 rand2n() {
    vec2 returned = texelFetch(u_bluenoise, ivec3(ivec2(gl_FragCoord.xy) % ivec2(128, 128), u_frames % 16), 0).xy;
    returned = mod((returned + offset), 1.);
    offset += 1.61803398875;

    return (returned);
}

//functions for fetching data from textures
uint getBlockTex(int index) {
    return texelFetch(u_statesBlocks, ivec2(index % 513, index / 513), 0).r;
}
uvec4 getLeafTex(int index) {
    return texelFetch(u_statesLeaves, ivec2(index % 512, index / 512), 0);
}

void main() {
    //original ray position/direction
    vec3 pos;
    vec3 dir;

    seed = gl_FragCoord.xy  * max(.01, abs(sin(float(1 + u_frames))));

    getRay(gl_FragCoord.xy + u_jitter[(u_frames) % 4], pos, dir);

    vec3 normal;
    ivec3 ipos;
    float dist;
    vec3 tempColor;

    bool hit = intersect(pos, dir, normal, dist, ipos, tempColor);

    vec3 sky = vec3(1.);

    if (!hit) {
        outAlbedo = vec4(sky, 0.);
        outPosition = vec4(-10., -10., -10., 0.);
        outAOSun = vec2(1.);
        return;
    }

    int samples = 6;

    vec3 o1 = normalize(ortho(normal));
    vec3 o2 = normalize(cross(normal, o1));

    pos = pos + dir * dist + normal * (.0001);

    vec3 tempN;
    float tempD;
    ivec3 tempI;
    vec3 tempC;

    float sum = 0.;

    //ambient occlusion
    for (int i = 0; i < samples; i++) {
        dir = getSampleBiased(normal, o1, o2, 0.);
        if (!cheapRay(pos + normal * .002 * float(ipos.x == 0 || ipos.x == 127 || ipos.y == 0 || ipos.y == 127 || ipos.z == 0 || ipos.z == 127), dir)) {
            sum +=  1.;
        }
    }

    //sun light
    float time = float(u_frames) / 2000.;
    vec3 sunDir = normalize(u_sunDirection);  
    bool sun = !intersect(pos + normal * .003 * float(ipos.x == 0 || ipos.x == 127 || ipos.y == 0 || ipos.y == 127 || ipos.z == 0 || ipos.z == 127), getConeSample(sunDir, 1e-4), tempN, tempD, tempI, tempC);
    float sunMultiplier =  max(dot(sunDir, normal), 0.) * float(sun) * .9 + 0.1;

    //ambient occlusion
    float aoStrength = 1.;
    float aoFactor = (1. - aoStrength) + aoStrength * sum / float(samples);

    outAlbedo = vec4(tempColor, 0.);
    outPosition = vec4(pos, dot(abs(normal), vec3(.25, .5, 1.)));
    outAOSun = vec2(aoFactor, sunMultiplier);
}

//convert pixel coordinate to a camera ray
void getRay(in vec2 fragCoord, inout vec3 pos, inout vec3 dir) {
    //switch to uniform later
    float scale = 1.;
    //relative position of camera
    vec2 sspace = (fragCoord - .5 * vec2(u_screensize)) / vec2(u_screensize.y);
    //out position
    pos = u_position  + scale * (u_forward + normalize(cross(u_forward, u_right)) * sspace.y + u_right * sspace.x);
    dir = normalize(pos - u_position);
}

//intersects a cube from the inside of the cube
vec3 cube(vec3 o, vec3 d, vec3 iDir, float scale) {
    return - (sign(d) * (o - scale * .5) - scale * .5) * iDir;
}

uvec4 storedLeaf = uvec4(1u);

//get the albedo
vec3 getAlbedo(vec3 octant) {
    int octIndex = int(octant.x) + int(octant.y) * 2 + int(octant.z) * 4;
    
    switch(octIndex) {
        case 0: return u_palette[int((storedLeaf.r & 254u) >> 1) % 128];
        case 1: return u_palette[int((storedLeaf.r & 65024u) >> 9) % 128];
        case 2: return u_palette[int((storedLeaf.g & 254u) >> 1) % 128];
        case 3: return u_palette[int((storedLeaf.g & 65024u) >> 9) % 128];
        case 4: return u_palette[int((storedLeaf.b & 254u) >> 1) % 128];
        case 5: return u_palette[int((storedLeaf.b & 65024u) >> 9) % 128];
        case 6: return u_palette[int((storedLeaf.a & 254u) >> 1) % 128];
        case 7: return u_palette[int((storedLeaf.a & 65024u) >> 9) % 128];
    }

    return vec3(1., 0., 0.);
}

//change - make it store more blocks in a texel and save the result to decrease reads even further
//nvm, fast enough!
uint getBlock(float scale, vec3 floored, uint offset) {
    if (scale == 128.) {
        if (floored != vec3(0.)) {
            return 0u;
        }
        return 1u;
    }

    ivec3 ipos = ivec3(floored / scale) >> 1;

    if (scale == 1.) {
        storedLeaf = getLeafTex(ipos.x * 64 * 64 + ipos.y * 64 + ipos.z);

        return (storedLeaf.r & 1u) + ((storedLeaf.r & 256u) >> 7) +
        ((storedLeaf.g & 1u) << 2) + ((storedLeaf.g & 256u) >> 5) +
        ((storedLeaf.b & 1u) << 4) + ((storedLeaf.b & 256u) >> 3) +
        ((storedLeaf.a & 1u) << 6) + ((storedLeaf.a & 256u) >> 1);
    }

    int iamt = int(64. / scale);

    if (ipos.x < 0 || ipos.y < 0 || ipos.z < 0) {
        return 0u;
    }

    if (floored.x >= 128. || floored.y >= 128. || floored.z >= 128.) { 
        return 0u;
    }

    uint fetched = getBlockTex(int(offset) + iamt * iamt * ipos.x + iamt * ipos.y + ipos.z);
    return fetched;
}

//ray-scene intersection function
bool intersect(in vec3 o, in vec3 d, inout vec3 normal, inout float dist, inout ivec3 ipos, inout vec3 tempColor) {
    float maxScale = 128.;
    float scale = 64.;

    int iterations = 500;

    vec3 pos = o;

    //for DDA
    vec3 iDir = 1. / max(abs(d), vec3(.001));

    //initial intersection, move ray to edge of cube
    vec3 t0 = -o * iDir * sign(d);
    vec3 t1 = (vec3(maxScale) - o) * iDir * sign(d);

    vec3 mins = min(t0, t1);
    vec3 maxs = max(t0, t1);

    vec2 t = vec2(max(mins.x, max(mins.y, mins.z)), min(maxs.x, min(maxs.y, maxs.z)));

    //calculate normal for things on bounding box
    normal = vec3(bvec3(t.x == mins.x, t.x == mins.y, t.x == mins.z));

    if (t.x > t.y || t.y < 0.) {
        return false;
    }

    //running distance
    dist = max(0., t.x + .001);
    pos += d * dist;
    
    bool exitoct = false;

    vec3 mask;

    //position within the voxel
    vec3 relative = mod(pos, scale);
    //position in the grid
    vec3 floored = pos - relative;
    //position in octant
    vec3 octant = vec3(greaterThanEqual(floored, vec3(scale)));

    int i;
    bool hit = false;

    //tracks the offset that voxel data is stored in memory
    uint offset = 0u;
    uint amt = 1u;

    //adjust for floating point errors
    t.y = t.y - .00001;

    uint block = getBlock(scale, floored, offset);

    for (i = 0; i < iterations; i++) {
        //if we have left the cube
        if (dist > t.y) {
            break;
        }

        //if we need to go up a level
        if (exitoct) {
            //new floored
            vec3 newfloored = floor(floored/(scale * 2.)) * (scale * 2.);
            relative += floored - newfloored;
            floored = newfloored;

            //update offset
            amt >>= 3;
            offset -= amt;

            scale *= 2.;

            octant = (mod(floored / scale, 2.));
            block = getBlock(scale, floored, offset);

            exitoct = clamp(octant, vec3(0.), vec3(1.)) != octant;
            continue;
        }

        //we need to actually get the voxel state
        //int voxelstate = state(scale, floored);
        uint idx = 1u << (int(octant.x) + int(octant.y) * 2 + int(octant.z) * 4);
        int voxelstate = int((idx & block) > 0u);

        if (scale <= 1.) {
            voxelstate *= 2;
        }

        //go down lower, fetch the current branch
        if (voxelstate == 1) {
            scale *= .5;

            if (scale < 1.) {
                hit = true;
                break;
            }

            //find the next octant
            vec3 octmask = step(vec3(scale), relative);
            floored += octmask * scale;
            relative -= octmask * scale;

            //update offset
            offset += amt;
            amt <<= 3;

            octant = octmask;
            block = getBlock(scale, floored, offset);

            continue;
        }

        if (voxelstate == 2) {
            hit = true;
            tempColor = getAlbedo(octant);
            break;
        }

        vec3 hits = cube(relative, d, iDir, scale);

        mask = vec3(lessThan(hits.xyz, min(hits.yzx, hits.zxy)));

        float newdist = dot(mask, hits);

        dist += newdist;

        //move forward but mod it
        relative += d * newdist - mask * sign(d) * scale;
        vec3 newfloored = floored + mask * sign(d) * scale;

        //update the current octant
        octant += mask * sign(d);
        
        //check if we need to go up a level
        exitoct = (scale < maxScale) && (floor(newfloored / scale * .5 + .25)) != floor(floored / scale * .5 + .25);

        floored = newfloored;
        normal = mask;
    }

    if (!hit) {
        normal = vec3(0);
    }

    normal *= -sign(d);
    ipos = ivec3(floored);

    return hit;
}

//get a random sample in a hemisphere
vec3 getSampleBiased(vec3 d, vec3 o1, vec3 o2, float power) {
    vec2 r = rand2n();
    r.x = r.x * 2. * 3.1415926535897932;
    r.y = pow(r.y, 1. / (power + 1.));
    float oneminus = sqrt(1. - r.y * r.y);
    return cos(r.x) * oneminus * o1 + sin(r.x) * oneminus * o2 + r.y * d;
}

//gets orthonormal vector
vec3 ortho(vec3 v) {
    if (abs(v.x) > abs(v.y)) {
        return vec3(-v.y, v.x, 0.);
    }
    return vec3(0., -v.z, v.y);
}

//http://blog.hvidtfeldts.net/index.php/2015/01/path-tracing-3d-fractals/
vec3 getConeSample(vec3 dir, float extent) {
        // Formula 34 in GI Compendium
	dir = normalize(dir);
	vec3 o1 = normalize(ortho(dir));
	vec3 o2 = normalize(cross(dir, o1));
	vec2 r =  rand2n();
	r.x=r.x*2.*3.1415926535897932;
	r.y=1.0-r.y*extent;
	float oneminus = sqrt(1.0-r.y*r.y);
	return cos(r.x)*oneminus*o1+sin(r.x)*oneminus*o2+r.y*dir;
}


//new cheapRay, actual perfect intersection
bool cheapRay(in vec3 o, in vec3 d) {
    int steps = 30;
    float radius = 15.;

    if (o.x < 0. || o.y < 0. || o.z < 0. || o.x >= 128. || o.y >= 128. || o.z >= 128.) {
            return false;
    }

    ivec3 ipos = ivec3(o) >> 1;

    vec3 rel = mod(o, vec3(1.));
    vec3 iDir = 1. / max(abs(d), vec3(.001));

    uvec4 storedLeaf = getLeafTex(ipos.x * 64 * 64 + ipos.y * 64 + ipos.z);
    uint block = (storedLeaf.r & 1u) + ((storedLeaf.r & 256u) >> 7) 
        + ((storedLeaf.g & 1u) << 2) + ((storedLeaf.g & 256u) >> 5) +
        ((storedLeaf.b & 1u) << 4) + ((storedLeaf.b & 256u) >> 3) +
        ((storedLeaf.a & 1u) << 6) + ((storedLeaf.a & 256u) >> 1);

    float sumDist = 0.;

    for (int i = 0; i < steps; i++) {
        
        vec3 hits = - (sign(d) * (rel - .5) - .5) * iDir;

        vec3 offset = d * (dot(vec3(lessThan(hits.xyz, min(hits.yzx, hits.zxy))), hits) + .001);
        sumDist += dot(vec3(lessThan(hits.xyz, min(hits.yzx, hits.zxy))), hits);

        if (sumDist > radius) {
            return false;
        }

        o += offset;
        rel = mod(rel + offset, 1.);

        if (o.x < 0. || o.y < 0. || o.z < 0. || o.x >= 128. || o.y >= 128. || o.z >= 128.) {
            return false;
        }

        ivec3 newpos = ivec3(o) >> 1;

        //fetch block when place changes
        if (newpos != ipos) {
            ipos = newpos;
            uvec4 storedLeaf = getLeafTex(ipos.x * 64 * 64 + ipos.y * 64 + ipos.z);

            block =
            (storedLeaf.r & 1u) + ((storedLeaf.r & 256u) >> 7) +
            ((storedLeaf.g & 1u) << 2) + ((storedLeaf.g & 256u) >> 5) +
            ((storedLeaf.b & 1u) << 4) + ((storedLeaf.b & 256u) >> 3) +
            ((storedLeaf.a & 1u) << 6) + ((storedLeaf.a & 256u) >> 1);
        }

        ivec3 oct = ivec3(o) - 2 * ipos;
        uint idx = 1u << (oct.x + oct.y * 2 + oct.z * 4);

        if ((idx & block) > 0u) {
            return true;
        }
    }

    return false;
}
