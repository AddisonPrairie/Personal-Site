async function compile(canvas) {
    const adapter = await navigator.gpu?.requestAdapter();
    const device  = await adapter?.requestDevice();
    const context = canvas.getContext("webgpu");

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({device, format: presentationFormat});

    const scale = 1.;
    const width = Math.ceil(canvas.clientWidth * scale); const height = Math.ceil(canvas.clientHeight * scale);
    canvas.width = width; canvas.height = height;

    const position = [0., 0.0001, 2.5]; const lookAt = [0, 0, 0];

    const vsShaderCode = /* wgsl */ `
    @vertex
    fn vs(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {
        switch(vertexIndex) {
            case 0u: {
                return vec4f(1., 1., 0., 1.);}
            case 1u: {
                return vec4f(-1., 1., 0., 1.);}
            case 2u: {
                return vec4f(-1., -1., 0., 1.);}
            case 3u: {
                return vec4f(1., -1., 0., 1.);}
            case 4u: {
                return vec4f(1., 1., 0., 1.);}
            case 5u: {
                return vec4f(-1., -1., 0., 1.);}
            default: {
                return vec4f(0., 0., 0., 0.);}
        }
    }`;

    const fsShaderCode = /* wgsl */ `
    @group(0) @binding(0) var image : texture_2d<f32>;
    const sw : vec2f = vec2f(${width}., ${height}.);
    fn lum(z : vec3f) -> f32 {return dot(z, vec3f(.2126, .7152, .0722));}
    @fragment
    fn fs(@builtin(position) fragCoord : vec4f) -> @location(0) vec4f { 
        var raw : vec4f = textureLoad(image, vec2i(fragCoord.xy), 0);
        var col : vec3f = raw.xyz / raw.a;
        col = col / (1. + lum(col));
        col = pow(col, vec3f(1. / 2.2));
        return vec4f(col, 1.);
    }`;

    const ptShaderCode = /* wgsl */ `
    @group(0) @binding(0) var otex : texture_2d<f32>;
    @group(0) @binding(1) var dtex : texture_2d<f32>;
    @group(0) @binding(2) var ttex : texture_2d<f32>;
    @group(0) @binding(3) var btex : texture_2d<f32>;
    @group(1) @binding(0) var oout : texture_storage_2d<rgba32float, write>;
    @group(1) @binding(1) var dout : texture_storage_2d<rgba32float, write>;
    @group(1) @binding(2) var tout : texture_storage_2d<rgba32float, write>;
    @group(1) @binding(3) var bout : texture_storage_2d<rgba32float, write>;
    
    const Pi      = 3.14159265358979323846;
    const InvPi   = 0.31830988618379067154;
    const Inv2Pi  = 0.15915494309189533577;
    const Inv4Pi  = 0.07957747154594766788;
    const PiOver2 = 1.57079632679489661923;
    const PiOver4 = 0.78539816339744830961;
    const Sqrt2   = 1.41421356237309504880;
    
    const sw_f : vec2f = vec2f(${width}., ${height}.);
    const sw_u : vec2u = vec2u(${width}u, ${height}u);
    
    const  campos : vec3f = vec3f(${position[0]}, ${position[1]}, ${position[2]});
    const forward : vec3f = normalize(vec3f(${lookAt[0] - position[0]}, ${lookAt[1] - position[1]}, ${lookAt[2] - position[2]}));
    const   right : vec3f = normalize(vec3f(forward.y, -forward.x, 0.));
    const      up : vec3f = cross(right, forward);
    const     fov :   f32 = 90.f;
    const  sinfov :   f32 = sin(.5 * fov * Pi / 180.f);
    const  aspect :   f32 = ${width / height}f;

    const iter    : i32 = 1000;
    const  eps    : f32 = .003;
    const maxdist : f32 = 20.;

    const mbounce : f32 = 5.;

    struct RayHit {
        norm : vec3f,
        dist :   f32,
        imat :   i32
    };

    @compute @workgroup_size(8, 8, 1)
    fn main(@builtin(global_invocation_id) global_id : vec3u) {
        if (any(global_id.xy >= sw_u)) {return;}
        var coord : vec2i = vec2i(global_id.xy);

        var o : vec4f = textureLoad(otex, coord, 0);
        var d : vec4f = textureLoad(dtex, coord, 0);
        var t : vec4f = textureLoad(ttex, coord, 0);
        var b : vec4f = textureLoad(btex, coord, 0);

        ptStep(coord, &o, &d, &b, &t);

        textureStore(oout, coord, o);
        textureStore(dout, coord, d);
        textureStore(tout, coord, t);
        textureStore(bout, coord, b);
    }
    
    fn ptStep(coord : vec2i, oin : ptr<function, vec4f>, din : ptr<function, vec4f>, bin : ptr<function, vec4f>, tin : ptr<function, vec4f>) {
        var o : vec3f = (*oin).xyz;
        var d : vec3f = (*din).xyz;
        var b : vec3f = (*bin).xyz;

        var    seed : f32 = (*oin).a;
        var bounces : f32 = (*din).a;

        var bNewPath : bool = all(b == vec3f(0.));
        var frame0   : bool = bNewPath && ((*tin).a == 0.);
        if (frame0) {
            seed = f32(baseHash(vec2u(coord))) / f32(0xffffffffu) + .008;
        }

        if (bNewPath) {
            getCameraRay(vec2f(coord) + vec2f(.5) + uniformSampleDisk(rand2(seed)) * .5, &o, &d); seed += 2.;
            b = vec3f(1.);
        }

        var res : RayHit = trace(o, d);
        if (res.dist >= 0.) {
            var o1 : vec3f = normalize(ortho(res.norm));
            var o2 : vec3f = normalize(cross(o1, res.norm));

            var wo : vec3f = toLocal(o1, o2, res.norm, -d);
            var wi : vec3f;
            var c  : vec3f;

            o = o + d * res.dist;
            if (res.imat == 0) {
                var r : f32 = fbm((o + vec3f(0., 0., o.x * .2)) * vec3f(5., 5., 30.), 1.);
                if (r < .4) {
                    c = 
                    ggxSmith(&seed, &wi, wo, vec3f(255., 215., 0.) / 255., .1);
                } else {
                    c = lambertDiffuse(&seed, &wi, wo, vec3f(.2));
                }
            }
            if (res.imat == 1) {
                c = 
                lambertDiffuse(&seed, &wi, wo, vec3f(.5));
            }

            b *= c;
            o += res.norm * 1.01 * eps;
            d = toWorld(o1, o2, res.norm, wi);

            if (bounces > 3) {
                var q : f32 = max(.05f, 1. - b.y);
                if (rand2(seed).x < q) {
                    b = vec3f(0.);
                } else {
                    b /= 1. - q;
                } seed += 2.;
            }

            if (all(b == vec3f(0.))) {
                *tin += vec4f(0., 0., 0., 1.);
                bounces = -1.;
            }
        } else {
            *tin += vec4f(b * 6., 1.);
            bounces = -1.;
            b = vec3f(0.);
        }

        *oin  = vec4f(o, seed);
        *din  = vec4f(d, bounces + 1.);
        *bin  = vec4f(b, 1.);
    }

    fn trace(o : vec3f, d : vec3f) -> RayHit {
        var returned : RayHit;
        var i : i32 = 0;
        var bHit : bool = false;
        for (; i < iter; i++) {
            var dist : f32 = abs(DE(o + returned.dist * d));
            returned.dist += dist;
            if ((dist) < eps) {bHit = true; break;}
            if (returned.dist > maxdist) {break;}
        }

        if (!bHit) {returned.dist = -1.;}
        returned.norm = getNormal(o + (returned.dist - eps) * d);

        var z : vec3f = o + (returned.dist) * d;
        var d0 : f32 = OB0(z); var d1 : f32 = OB1(z);
        var mindis : f32 = min(d0, d1);
        if (d0 == mindis) {returned.imat = 0;}
        if (d1 == mindis) {returned.imat = 1;}
        return returned;
    }

    fn rotate2d(z : vec2f, r : f32) -> vec2f {
        var c : f32 = cos(r); var s : f32 = sin(r);
        return vec2f(c * z.x - s * z.y, s * z.x + c * z.y);
    }

    //from: https://jbaker.graphics/writings/DEC.html
    fn fract0(p0 : vec3f) -> f32 {
        var p : vec3f = p0;
        var s=2.; var e : f32;
        for(var j = 0; j < 8 ; j++) {
            e=2./clamp(dot(p,p),.2,1.);
            s*=e;
            p=abs(p)*e-vec3(.5,8.,.5);
        }
        return length(cross(p,vec3(1.,1.,-1.)))/s;
    }

    fn cylinder(p : vec3f, r : f32, h : f32) -> f32 {
        var d : f32 = length(p.xz) - r;
        d = max(d, abs(p.y) - h);
        return d;
    }

    fn OB0(z : vec3f) -> f32 {
        return fract0(z);
    }
    fn OB1(z : vec3f) -> f32 {
        return max(z.z, -cylinder(z, .4, 1.));
    }

    fn DE(z : vec3f) -> f32 {
        return min(OB0(z), OB1(z));
    }

    fn lambertDiffuse(seed : ptr<function, f32>, wi : ptr<function, vec3f>, wo : vec3f, c : vec3f) -> vec3f {
        *wi = cosineSampleHemisphere(rand2(*seed)); *seed += 2.;
        return pow(c, vec3f(2.2));
    }

    fn perfectMirror(wi : ptr<function, vec3f>, wo : vec3f, c : vec3f) -> vec3f {
        *wi = wo * vec3f(-1., -1., 1.);
        return pow(c, vec3f(2.2));
    }

    //http://luthuli.cs.uiuc.edu/~daf/courses/computergraphics/week8/shading.pdf
    fn fbm(o : vec3f, r : f32) -> f32 {
        var accum : f32 = 0.;
        for (var i = 1; i < 5; i++) {
            var oexp : f32 = pow(2., f32(i));
            accum += trilinearNoise(o * oexp) * pow(oexp, -r);
        }
        return accum;
    }

    //https://en.wikipedia.org/wiki/Trilinear_interpolation
    fn trilinearNoise(o : vec3f) -> f32 {
        var b : vec3f = floor(o);

        var rel : vec3f = o - b;

        var c000 : f32 = noise(b + vec3f(0., 0., 0.));
        var c100 : f32 = noise(b + vec3f(1., 0., 0.));
        var c010 : f32 = noise(b + vec3f(0., 1., 0.));
        var c110 : f32 = noise(b + vec3f(1., 1., 0.));
        var c001 : f32 = noise(b + vec3f(0., 0., 1.));
        var c101 : f32 = noise(b + vec3f(1., 0., 1.));
        var c011 : f32 = noise(b + vec3f(0., 1., 1.));
        var c111 : f32 = noise(b + vec3f(1., 1., 1.));

        var cx : vec4f = 
            vec4f(c000, c001, c010, c011) * (1. - rel.x) +
            vec4f(c100, c101, c110, c111) * (rel.x);
        
        var cy : vec2f = 
            vec2f(cx.x, cx.y) * (1. - rel.y) +
            vec2f(cx.z, cx.w) * (rel.y);
        
        return cy.x * (1. - rel.z) + cy.y * rel.z;
    }

    //vec3f->f32 noise, from: https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83
    fn mod289(x : f32) -> f32 {
        return x - floor(x / 289.) * 289.;
    }
    fn mod289_4(x : vec4f) -> vec4f {
        return x - floor(x / 289.) * 289.;
    }
    fn perm(x : vec4f) -> vec4f {
        return mod289_4(((x * 34.0) + vec4f(1.)) * x);
    }
    fn noise(p : vec3f) -> f32 {
        var a : vec3f = floor(p);
        var d : vec3f = p - a;
        d = d * d * (vec3f(3.) - 2. * d);
        
        var b : vec4f = a.xxyy + vec4f(0., 1., 0., 1.);
        var k1: vec4f = perm(b.xyxy);
        var k2: vec4f = perm(k1.xyxy + b.zzww);

        var c : vec4f = k2 + a.zzzz;
        var k3: vec4f = perm(c);
        var k4: vec4f = perm(c + vec4f(1.));

        var o1: vec4f = fract(k3 / 41.);
        var o2: vec4f = fract(k4 / 41.);

        var o3: vec4f = o2 * d.z + o1 * (1. - d.z);
        var o4: vec2f = o3.yw * d.x + o3.xz * (1. - d.x);

        return o4.y * d.y + o4.x * (1. - d.y);
    }

    //based on https://jcgt.org/published/0007/04/01/paper.pdf &
    //       https://inria.hal.science/hal-00996995v1/document 
    fn ggxSmith(seed : ptr<function, f32>, wi : ptr<function, vec3f>, wo : vec3f, c : vec3f, r : f32) -> vec3f {
        var hw : vec3f = ggxSmithVNDF(wo, rand2(*seed), r); *seed += 2.;

        *wi = reflect(-wo, hw);

        var refl : vec3f = vec3f(0.);

        var pdf : f32 = ggxSmithVNDF_PDF(wo, hw, r) / (4. * dot(hw, wo));


        var G : f32 = smithG1(wo, r) * smithG1(*wi, r);

        refl = pow(c, vec3f(2.2)) * schlickFresnelConductor(wo, hw, 1.2, 2.) * G / smithG1(wo, r);

        if (any(refl != refl) || pdf != pdf || (*wi).z <= 0.) {refl = vec3f(0.);}

        return refl;
    }

    fn ggxSmithVNDF(wo : vec3f, r2 : vec2f, roughness : f32) -> vec3f {
        var v : vec3f = normalize(wo * vec3f(roughness, roughness, 1.));

        var lensq : f32 = dot(v.xy, v.xy);
        var o1 : vec3f;
        if (lensq > 0.) {
            o1 = normalize(vec3f(-v.y, v.x, 0.));
        } else {
            o1 = vec3f(1., 0., 0.);
        }
        var o2 : vec3f = cross(v, o1);

        var r : f32 = sqrt(r2.x);
        var phi : f32 = 2. * Pi * r2.y;

        var t1 = r * cos(phi);
        var t2 = r * sin(phi);

        var s = .5 * (1. * v.z);
        t2 = (1. - s) * sqrt(1. - t1 * t1) + s * t2;

        var n : vec3f = t1 * o1 + t2 * o2 + sqrt(max(0., 1. - t1 * t1 - t2 * t2)) * v;

        return normalize(
            vec3f(n.x, n.y, max(n.z, 0.)) * vec3f(roughness, roughness, 1.)
        );
    }

    fn ggxSmithVNDF_PDF(v : vec3f, n : vec3f, roughness : f32) -> f32 {
        return smithG1(v, roughness) * max(0., dot(v, n)) * ggxD(n, roughness) / v.z;
    }

    fn smithG1(v : vec3f, roughness : f32) -> f32 {
        return 2. / (1. + sqrt(1. + roughness * roughness * dot(v.xy, v.xy) / (v.z * v.z)));
    }

    fn ggxD(n : vec3f, roughness : f32) -> f32 {
        var a2 : f32 = roughness * roughness;
        var denom : f32 = (dot(n.xy, n.xy) / a2 + n.z * n.z);

        return 1. / (Pi * a2 * denom * denom);
    }
    
    fn schlickFresnelConductor(v : vec3f, n : vec3f, ior : f32, absorption : f32) -> f32 {
        var F = (ior - 1.) * (ior - 1.) + 4. * ior * pow(1. - dot(v, n), 5.) + absorption * absorption;
        return F / ((ior + 1.) * (ior + 1.) + absorption * absorption);
    }

    fn getNormal(z : vec3f) -> vec3f {
        return normalize(
            vec3f(
                DE(z + vec3f(eps, 0., 0.)) - DE(z - vec3f(eps, 0., 0.)),
                DE(z + vec3f(0., eps, 0.)) - DE(z - vec3f(0., eps, 0.)),
                DE(z + vec3f(0., 0., eps)) - DE(z - vec3f(0., 0., eps))
            )
        );
    }

    fn getCameraRay(coord : vec2f, o : ptr<function, vec3f>, d : ptr<function, vec3f>) {
        var sspace : vec2f = coord / sw_f; sspace = sspace * 2. - vec2f(1.); sspace.y *= -1.;
        var local  : vec3f = vec3f(
            aspect * sspace.x * sinfov,
            1.,
            sspace.y * sinfov
        );
        *o = campos;
        *d = toWorld(right, forward, up, normalize(local));
    }

    fn ortho(v : vec3<f32>) -> vec3<f32> {
        if (abs(v.x) > abs(v.y)) {
            return vec3<f32>(-v.y, v.x, 0.);
        }
        return  vec3<f32>(0., -v.z, v.y);
    }

    fn toLocal(v_x : vec3f, v_y : vec3f, v_z : vec3f, w : vec3f) -> vec3f {
        return vec3f(dot(v_x, w), dot(v_y, w), dot(v_z, w));
    }
    
    fn toWorld(v_x : vec3f, v_y : vec3f, v_z : vec3f, w : vec3f) -> vec3f {
        return v_x * w.x + v_y * w.y + v_z * w.z;
    }
    
    //GPU hashes from: https://www.shadertoy.com/view/XlycWh
    fn baseHash(p : vec2u) -> u32 {
        var p2 : vec2u = 1103515245u*((p >> vec2u(1u))^(p.yx));
        var h32 : u32 = 1103515245u*((p2.x)^(p2.y>>3u));
        return h32^(h32 >> 16u);
    }
    fn rand2(seed : f32) -> vec2f {
        var n : u32 = baseHash(bitcast<vec2u>(vec2f(seed + 1., seed + 2.)));
        var rz : vec2u = vec2u(n, n * 48271u);
        return vec2f(rz.xy & vec2u(0x7fffffffu))/f32(0x7fffffff);
    }

    //from: pbrt
    fn cosineSampleHemisphere(r2 : vec2f) -> vec3f {
        var d : vec2f = uniformSampleDisk(r2);
        var z : f32 = sqrt(max(0., 1. - d.x * d.x - d.y * d.y));
        return vec3f(d.xy, z);
    }
    fn uniformSampleDisk(r2 : vec2f) -> vec2f {
        var r : f32 = sqrt(max(r2.x, 0.));
        var theta : f32 = 2. * Pi * r2.y;
        return vec2f(r * cos(theta), r * sin(theta));
    }`;

    const oTextures = [
        device.createTexture({size: [width, height], format: "rgba32float", dimension: "2d", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING}),
        device.createTexture({size: [width, height], format: "rgba32float", dimension: "2d", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING})
    ];
    const dTextures = [
        device.createTexture({size: [width, height], format: "rgba32float", dimension: "2d", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING}),
        device.createTexture({size: [width, height], format: "rgba32float", dimension: "2d", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING})
    ];
    const tTextures = [
        device.createTexture({size: [width, height], format: "rgba32float", dimension: "2d", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING}),
        device.createTexture({size: [width, height], format: "rgba32float", dimension: "2d", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING})
    ];
    const bTextures = [
        device.createTexture({size: [width, height], format: "rgba32float", dimension: "2d", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING}),
        device.createTexture({size: [width, height], format: "rgba32float", dimension: "2d", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING})
    ];

    const ptBGInLayout = device.createBindGroupLayout({
        entries: [
            {binding: 0, visibility: GPUShaderStage.COMPUTE, texture: {sampleType: "unfilterable-float", viewDimension: "2d", multisampled: false}},
            {binding: 1, visibility: GPUShaderStage.COMPUTE, texture: {sampleType: "unfilterable-float", viewDimension: "2d", multisampled: false}},
            {binding: 2, visibility: GPUShaderStage.COMPUTE, texture: {sampleType: "unfilterable-float", viewDimension: "2d", multisampled: false}},
            {binding: 3, visibility: GPUShaderStage.COMPUTE, texture: {sampleType: "unfilterable-float", viewDimension: "2d", multisampled: false}},
        ]
    });

    const ptBGIns = [
        device.createBindGroup({
            layout: ptBGInLayout,
            entries: [
                {binding: 0, resource: oTextures[0].createView()},
                {binding: 1, resource: dTextures[0].createView()},
                {binding: 2, resource: tTextures[0].createView()},
                {binding: 3, resource: bTextures[0].createView()},
            ]
        }),
        device.createBindGroup({
            layout: ptBGInLayout,
            entries: [
                {binding: 0, resource: oTextures[1].createView()},
                {binding: 1, resource: dTextures[1].createView()},
                {binding: 2, resource: tTextures[1].createView()},
                {binding: 3, resource: bTextures[1].createView()},
            ]
        })
    ];

    const ptBGOutLayout = device.createBindGroupLayout({
        entries: [
            {binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: {format: "rgba32float", viewDimension: "2d"}},
            {binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: {format: "rgba32float", viewDimension: "2d"}},
            {binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: {format: "rgba32float", viewDimension: "2d"}},
            {binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: {format: "rgba32float", viewDimension: "2d"}},
        ]
    });

    const ptBGOuts = [
        device.createBindGroup({
            layout: ptBGOutLayout,
            entries: [
                {binding: 0, resource: oTextures[1].createView()},
                {binding: 1, resource: dTextures[1].createView()},
                {binding: 2, resource: tTextures[1].createView()},
                {binding: 3, resource: bTextures[1].createView()},
            ]
        }),
        device.createBindGroup({
            layout: ptBGOutLayout,
            entries: [
                {binding: 0, resource: oTextures[0].createView()},
                {binding: 1, resource: dTextures[0].createView()},
                {binding: 2, resource: tTextures[0].createView()},
                {binding: 3, resource: bTextures[0].createView()},
            ]
        })
    ];

    const ptShaderModule = device.createShaderModule({
        code: ptShaderCode
    });

    const ptPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({bindGroupLayouts: [ptBGInLayout, ptBGOutLayout]}),
        compute: {module: ptShaderModule, entryPoint: "main"}
    });

    const fsBGLayout = device.createBindGroupLayout({
        entries: [{binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {sampleType: "unfilterable-float", viewDimension: "2d", multisampled: false}}]
    });

    const fsBGs = [
        device.createBindGroup({
            layout: fsBGLayout, entries: [{binding: 0, resource: tTextures[1].createView()}]
        }),
        device.createBindGroup({
            layout: fsBGLayout, entries: [{binding: 0, resource: tTextures[0].createView()}]
        })
    ];

    const fsShaderModule = device.createShaderModule({
        code: vsShaderCode + fsShaderCode
    });

    const fsPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({bindGroupLayouts: [fsBGLayout]}),
        vertex: {module: fsShaderModule, entryPoint: "vs"},
        fragment: {
            module: fsShaderModule, entryPoint: "fs",
            targets: [{format: presentationFormat}]
        }
    });

    let frames = 0;
    async function frame() {
        const pingpong = frames++ % 2;
        
        const commandEncoder = device.createCommandEncoder();

        const ptPass = commandEncoder.beginComputePass();
        ptPass.setPipeline(ptPipeline);
        ptPass.setBindGroup(0, ptBGIns[pingpong]);
        ptPass.setBindGroup(1, ptBGOuts[pingpong]);
        ptPass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
        ptPass.end();
        
        const fsPass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    clearValue: {r: 1., g: 0., b: 0., a: 1.},
                    loadOp: "clear", storeOp: "store"
                }
            ]
        });
        fsPass.setPipeline(fsPipeline);
        fsPass.setBindGroup(0, fsBGs[pingpong]);
        fsPass.draw(6);
        fsPass.end();

        device.queue.submit([commandEncoder.finish()]);

        return device.queue.onSubmittedWorkDone();
    }

    return {frame};
}