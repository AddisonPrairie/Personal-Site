#version 300 es

precision highp float;
precision highp usampler2D;
precision highp isampler2D;
precision highp sampler2DArray;

//output of shader
layout(location=0) out vec4 outColor;

//current frame values
uniform sampler2D u_albedo;
uniform sampler2D u_aosun;
uniform sampler2D u_positionTex;

//color correction
vec3 acesGamma(vec3 x) {
    //return x;
    //perform aces and gamma color correction
    x = pow(x, vec3(1. / 1.5));
    //return x;
    return clamp((x * (x * 2.51 + .03)) / (x * (2.43 * x + .59) + .14), vec3(0.), vec3(1.));
}

void main() {
    ivec2 pos = ivec2(gl_FragCoord.xy);

    vec2 aosun = texelFetch(u_aosun, pos, 0).xy;
    vec4 position = texelFetch(u_positionTex, pos, 0);
    vec3 albedo = texelFetch(u_albedo, pos, 0).xyz;

    vec2 sumAOSun = aosun * 41. / 273.;
    float sum = 41. / 273.;

    //guassian kernel
    float arr[25];
    arr[0] = 1. / 273.;
    arr[1] = 4. / 273.;
    arr[2] = 7. / 273.;
    arr[3] = 4. / 273.;
    arr[4] = 1. / 273.;
    arr[5] = 4. / 273.;
    arr[6] = 16./ 273.;
    arr[7] = 26./ 273.;
    arr[8] = 16./ 273.;
    arr[9] = 4. / 273.;
    arr[10]= 7. / 273.;
    arr[11]= 26./ 273.;
    arr[12]= 41./ 273.;
    arr[13]= 26./ 273.;
    arr[14]= 7. / 273.;
    arr[15]= 4. / 273.;
    arr[16]= 16./ 273.;
    arr[17]= 26./ 273.;
    arr[18]= 16./ 273.;
    arr[19]= 4. / 273.;
    arr[20]= 1. / 273.;
    arr[21]= 4. / 273.;
    arr[22]= 7. / 273.;
    arr[23]= 4. / 273.;
    arr[24]= 1. / 273.;
    
    //5x5 guassian blur
    for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
            ivec2 uv = pos + ivec2(x, y);

            if (uv == pos) {
                //we already have the center
                continue;
            }

            vec4 positionTemp = texelFetch(u_positionTex, uv, 0);
            if (length(positionTemp.xyz - position.xyz) > .9 || positionTemp.a != position.a) {
                continue;
            }

            sumAOSun += texelFetch(u_aosun, uv, 0).xy * arr[(x + 3) + (y + 3) * 5];
            sum += arr[(x + 3) + (y + 3) * 5];
        }
    }

    aosun = sumAOSun / sum;
    
    vec3 retColor;

    //sky color
    if (position.a == 0.) {
        retColor = albedo;
    } else {
        retColor = albedo * aosun.x * aosun.y;
    }

    outColor = vec4(acesGamma(retColor), 1.);
}