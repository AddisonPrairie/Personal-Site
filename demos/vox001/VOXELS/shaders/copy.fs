#version 300 es
precision highp float;
layout(location=0) out vec4 outColor;
uniform sampler2D u_source;
void main() {
    outColor = texelFetch(u_source, ivec2(gl_FragCoord.xy), 0);
}