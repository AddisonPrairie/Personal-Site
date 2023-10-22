precision mediump float;
#define PI 3.1415926538
uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_texture;
uniform float u_camZ;
uniform float u_camY;
uniform float u_distance;
uniform int u_aoSamples;
uniform sampler2D prevFrame;
uniform int u_staticFrames;
const int MAX_RAY_STEPS = 500;
uniform vec3 u_background;
uniform vec3 state1;
uniform vec3 state2;
uniform vec3 state3;
uniform vec3 state4;
vec3 bounds = vec3(128.);
vec2 randSeed;
float valueFromVoxelArray(int x, int y, int z) {
    float xCoord = (mod(float(z), 16.) * 128. + float(x)) / 2048.;
    float yCoord = (floor(float(z / 16)) * 128. + float(y)) / 1024.;
    return float(texture2D(u_texture, vec2(xCoord, yCoord)).a);
}
bool getVoxel(ivec3 c) {
	if (c.x < 0 || c.y < 0 || c.z < 0 || c.x > int(bounds.x - 1.) || c.y > int(bounds.y - 1.) || c.z > int(bounds.z - 1.))
    {
        return false;
    }
    if ( 0. < valueFromVoxelArray(c.x, c.y, c.z))
    {
        return true;
    }
    return false;
}
vec3 getVoxelColor(ivec3 c) {
    float value = valueFromVoxelArray(c.x, c.y, c.z);
    if (value < .25) {
        return state1;
    }
    if (value < .5) {
        return state2;
    }
    if (value < .75) {
        return state3;
    }
    return state4;
    return .75 - vec3(valueFromVoxelArray(c.x, c.y, c.z));
}
vec3 getEmittance(ivec3 c) {
    return vec3(1.) * float(.6 < valueFromVoxelArray(c.x, c.y, c.z));
}
vec2 rotate2d(vec2 toRotate, float theta) {
	float s = sin(theta);
	float c = cos(theta);
	return vec2(toRotate.x * c - toRotate.y * s, toRotate.y * c + toRotate.x * s);	
}
bool castToBox(inout vec3 rayPos, vec3 rayDir, vec3 invRay);
float ambientOcclusion(vec3 normal, vec3 position);
vec3 color(vec3 rayPos, vec3 rayDir);
void main()
{
    randSeed = gl_FragCoord.xy / u_resolution * (u_time + 1.);
    vec2 relCoords = gl_FragCoord.xy / u_resolution;
   float cameraRot = u_camZ;
   float cameraForward = u_camY;
    vec2 screenPos = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
    vec3 cameraDir = vec3(0.0, 0.8, 0.0);
	vec3 cameraPlaneU = vec3(1., 0.0, 0.0);
	vec3 cameraPlaneV = vec3(0.0, 0.0, 1.0) * u_resolution.y / u_resolution.x;
	vec3 rayDir = normalize(cameraDir + screenPos.x * cameraPlaneU + screenPos.y * cameraPlaneV);
	vec3 rayPos = vec3(0.0, -180. + u_distance, 0.0);
    rayPos.yz = rotate2d(rayPos.yz, cameraForward * PI / 180.);
    rayDir.yz = rotate2d(rayDir.yz, cameraForward * PI / 180.);
    rayPos.xy = rotate2d(rayPos.xy, -cameraRot * PI / 180.);
	rayDir.xy = rotate2d(rayDir.xy, -cameraRot  * PI / 180.);
    rayPos += vec3(64., 64., 64.);
    vec3 lightDir = normalize(vec3(1., 2., 5.));
    vec3 lightPos = vec3(64, 64, 50);
    vec3 inOptColor;
    vec3 hitNormal;
    ivec3 hitCoord;
    vec3 currColor = color(rayPos, rayDir);
    //vec3 prevColor = texture2D(prevFrame, (gl_FragCoord.xy) / u_resolution).xyz;
    //vec3 color = mix(prevColor, currColor, 1. / float(u_staticFrames + 1));
    gl_FragColor = vec4(currColor, 1.);
}
bool outOfBounds(vec3 pos) {
    return pos.x < -1. || pos.x > bounds.x + 2. || pos.y < -1. || pos.y > bounds.y + 2. || pos.z < -1. || pos.z > bounds.z + 2.;
}
bool intOutOfBounds(ivec3 pos) {
    return pos.x < -1 || pos.x > int(bounds.x + 2.) || pos.y < -1 || pos.y > int(bounds.y + 2.) || pos.z < -1 || pos.z > int(bounds.z + 2.);
}
bool castToBox(inout vec3 rayPos, vec3 rayDir, vec3 invRay) {
    bvec3 initOutOfBounds = bvec3(rayPos.x < -1. || rayPos.x > bounds.x + 1., rayPos.y < -1. || rayPos.y > bounds.y + 1., rayPos.z < -1. || rayPos.z > bounds.z + 1.);
    if (!initOutOfBounds.x && !initOutOfBounds.y && !initOutOfBounds.z)
    {
        return true;
    }
    float lengthX = 0.;
    float lengthY = 0.;
    float lengthZ = 0.;
    float minLength = 10000.;
    if (initOutOfBounds.x)
    {
        if (rayPos.x < 0.)
        {
            vec3 newPos = rayPos + rayDir * (abs(rayPos.x) - 1.) * abs(invRay.x) * 1.00001;
            if (!outOfBounds(newPos))
            {
                lengthX = (abs(rayPos.x) - 1.) * abs(invRay.x);
                if (lengthX < minLength)
                {
                    minLength = lengthX;
                }
            }
        }
        else
        {
            vec3 newPos = rayPos + rayDir * abs(rayPos.x - (bounds.x + 2.)) * abs(invRay.x) * 1.00001;
            if (!outOfBounds(newPos))
            {
                lengthX = abs(rayPos.x - (bounds.x + 2.)) * abs(invRay.x);
                if (lengthX < minLength)
                {
                    minLength = lengthX;
                }
            }
        }
    }
    if (initOutOfBounds.y)
    {
        if (rayPos.y < 0.)
        {
            vec3 newPos = rayPos + rayDir * (abs(rayPos.y) - 1.) * abs(invRay.y) * 1.00001;
            if (!outOfBounds(newPos))
            {
                lengthY = (abs(rayPos.y) - 1.) * abs(invRay.y);
                if (lengthY < minLength)
                {
                    minLength = lengthY;
                }
            }
        }
        else
        {
            vec3 newPos = rayPos + rayDir * abs(rayPos.y - (bounds.y + 2.)) * abs(invRay.y) * 1.00001;
            if (!outOfBounds(newPos))
            {
                lengthY = abs(rayPos.y - (bounds.y + 2.)) * abs(invRay.y);
                if (lengthY < minLength)
                {
                    minLength = lengthY;
                }
            }
        }
    }
    if (initOutOfBounds.z)
    {
        if (rayPos.z < 0.)
        {
            vec3 newPos = rayPos + rayDir * (abs(rayPos.z) - 1.) * abs(invRay.z) * 1.00001;
            if (!outOfBounds(newPos))
            {
                lengthZ = (abs(rayPos.z) - 1.) * abs(invRay.z);
                if (lengthZ < minLength)
                {
                    minLength = lengthZ;
                }
            }
        }
        else
        {
            vec3 newPos = rayPos + rayDir * (rayPos.z - (bounds.z + 2.)) * invRay.z * 1.00001;
            if (!outOfBounds(newPos))
            {
                lengthZ = abs(rayPos.z - (bounds.z + 2.)) * abs(invRay.z);
                if (lengthZ < minLength)
                {
                    minLength = lengthZ;
                }
            }
        }
    }
    if (minLength == 10000.)
    {
        return false;
    }
    rayPos = rayPos + rayDir * (minLength + .001);
    return true;
}
bool rayCast(vec3 rayPos, vec3 rayDir, inout ivec3 hitCoord,  inout vec3 hitPos, inout vec3 hitNormal, inout float totalDist, int maxSteps) {
	vec3 deltaDist = abs(vec3(length(rayDir)) / rayDir);
    rayDir = normalize(rayDir);
    vec3 originalPosition = rayPos;
    float initDistance;
    if (castToBox(rayPos, rayDir, deltaDist)) {
        initDistance = length(rayPos - originalPosition) -.01;
    }
    else {
        return false;
        totalDist = 0.;
    }
    ivec3 mapPos = ivec3(floor(rayPos + 0.));
	ivec3 rayStep = ivec3(sign(rayDir));
	vec3 sideDist = (sign(rayDir) * (vec3(mapPos) - rayPos) + (sign(rayDir) * 0.5) + 0.5) * deltaDist;
    //vec3 sideDist = vec3(0.);
	bvec3 mask;
    if (getVoxel(mapPos))
    {
        return true;
    }
	for (int i = 0; i < MAX_RAY_STEPS; i++) {
		if (getVoxel(mapPos) && i != 0)
        {
            break;
        }
        mask = lessThanEqual(sideDist.xyz, min(sideDist.yzx, sideDist.zxy));
		sideDist += vec3(mask) * deltaDist;
		mapPos += ivec3(vec3(mask)) * rayStep;
        if (i + 1 == MAX_RAY_STEPS || i == maxSteps)
        {
            //optColor = vec3(0.0);
            return false;
        }
        if (intOutOfBounds(mapPos))
        {
            //optColor = vec3(0.0);
            return false;
        }
	}
    if (mask.x)
    {
        if (rayDir.x < 0.)
        {
            hitNormal = vec3(1., 0., 0.);
        }
        else
        {
            hitNormal = vec3(-1., 0., 0.);
        }
    }
    if (mask.y)
    {
        if (rayDir.y < 0.)
        {
            hitNormal = vec3(0., 1., 0.);
        }
        else
        {
            hitNormal = vec3(0., -1., 0.);
        }
    }
    if (mask.z)
    {
        if (rayDir.z < 0.)
        {
            hitNormal = vec3(0., 0., 1.);
        }
        else
        {
            hitNormal = vec3(0., 0., -1.);
        }
    }
    hitCoord = mapPos;
    totalDist = length(vec3(mask) * (sideDist - deltaDist)) / length(rayDir);// + initDistance;
    hitPos = rayPos + rayDir * (totalDist);
    //optColor = vec3(mask);
    return true;
}
vec3 orthogonal(vec3 p) {
    return abs(p.x) > abs(p.z) ? vec3(-p.y, p.x, 0) : vec3(0., -p.z, p.y);
}
vec2 randVec2() {
    randSeed += vec2(-1, 1);
    return vec2(fract(sin(dot(randSeed.xy ,vec2(12.9898,78.233))) * 43758.5453),
		fract(cos(dot(randSeed.xy ,vec2(4.898,7.23))) * 23421.631));
}
vec3 getSampleBiased(vec3 dir, float power) {
    dir = normalize(dir);
	vec3 o1 = normalize(orthogonal(dir));
	vec3 o2 = normalize(cross(dir, o1));
	vec2 r = randVec2();
	r.x=r.x*2.*PI;
	r.y=pow(r.y,1.0/(power+1.0));
	float oneminus = sqrt(1.0-r.y*r.y);
	return cos(r.x)*oneminus*o1+sin(r.x)*oneminus*o2+r.y*dir;
}
vec3 getSample(vec3 normal) {
    return getSampleBiased(normal, 0.);
}
vec3 getCosineWeightedSample(vec3 normal) {
    return getSampleBiased(normal, 1.);
}
vec3 getConeSample(vec3 dir, float extent) {
	dir = normalize(dir);
	vec3 o1 = normalize(orthogonal(dir));
	vec3 o2 = normalize(cross(dir, o1));
	vec2 r =  randVec2();
	r.x=r.x*2.*PI;
	r.y=1.0-r.y*extent;
	float oneminus = sqrt(1.0-r.y*r.y);
	return cos(r.x)*oneminus*o1+sin(r.x)*oneminus*o2+r.y*dir;
}
vec3 getAtmo(vec3 rayDir) {
    return vec3(1.);
}
float ambientOcclusion(vec3 normal, vec3 position) {
    vec3 dir = getSample(normal);
    ivec3 hitCoord = ivec3(1);
    vec3 hitNormal;
    vec3 hit;
    float dist;
    bool isHit = rayCast(position, dir, hitCoord, hit, hitNormal, dist, 50);
    if (isHit) {
        return 0.;
        dir = getSample(hitNormal);
        bool hitTwo = rayCast(hit + hitNormal * .01, dir, hitCoord, hit, hitNormal, dist, 25);
        if (hitTwo) {
            return 0.;
        }
        //return .75;
    }
    return 1.;
}
vec3 color(vec3 rayPos, vec3 rayDir) {
    ivec3 hitCoord;
    vec3 hit;
    vec3 hitNormal;
    float dist;
    vec3 hitColor;
    bool isHit = rayCast(rayPos, rayDir, hitCoord, hit, hitNormal, dist, 500);
    if (isHit) {
        vec3 optColor;
        if (hitNormal.x != 0.) {
            optColor = vec3(.75) + vec3(.05) * sign(hitNormal.x);
        }
        else if (hitNormal.y != 0.) {
            optColor = vec3(.70) + vec3(.05) * sign(hitNormal.y);
        }
        else if (hitNormal.z != 0.) {
            optColor = vec3(.8) + vec3(.2) * sign(hitNormal.z);
        }
        return getVoxelColor(hitCoord) * optColor;
    }
    else {
        return u_background;
    }
}