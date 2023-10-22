#version 300 es

precision highp float;

//output of shader
layout(location=0) out vec4 outColor;

//render info
uniform ivec2 u_screensize;
uniform int u_frames;

//last frame info
uniform vec3 u_lforward;
uniform vec3 u_lright;
uniform vec3 u_lposition;

//textures
uniform sampler2D u_posTex;
uniform sampler2D u_colTex;
uniform sampler2D u_lposTex;
uniform sampler2D u_lcolTex;

//to unjitter
uniform vec2 u_jitter[4];

//temporal reprojection anti-aliasing
void main() {
    ivec2 spos = ivec2(gl_FragCoord.xy);

    vec3 pos = texelFetch(u_posTex, spos, 0).xyz;
    vec4 curColor = texture(u_colTex, (gl_FragCoord.xy - u_jitter[u_frames % 4]) / vec2(u_screensize));

    vec3 lCenter = u_lposition + u_lforward;
    vec3 lDirection = normalize(u_lposition - pos);
    vec3 lScreenPlane = pos - lCenter - lDirection * (dot(pos, u_lforward) - dot(lCenter, u_lforward)) / (dot(lDirection, u_lforward));
    vec2 lSSpace = vec2(dot(lScreenPlane, u_lright) , dot(normalize(cross(u_lforward, u_lright)), lScreenPlane));

    ivec2 lUV = ivec2(lSSpace * float(u_screensize.y) + .5 * vec2(u_screensize));

    if ((!(pos.z < -1.) && length(texelFetch(u_lposTex, lUV, 0).xyz - pos) > .3) || lUV.x < 0 || lUV.x >= u_screensize.x || lUV.y < 0 || lUV.y >= u_screensize.y || pos.z <= -1.) {
        outColor = curColor;
        return;
    }
    
    vec4 historySample = texture(u_lcolTex, (lSSpace * float(u_screensize.y) + .5 * vec2(u_screensize)) / vec2(u_screensize));

    float strength = .15;

    outColor = (historySample * (1. - strength) + curColor * strength);
}