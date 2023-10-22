//voxel API
async function voxels(opt) {
    //user must supply a canvas to render to
    if (!("canvas" in opt) || !(opt["canvas"] instanceof HTMLCanvasElement)) {
        console.error("VOXEL error: no canvas");
        return;
    }

    let canvas = opt.canvas;

    let path = opt["path"];

    if (path == null) {
        console.error("VOXEL error: no path");
        return;
    }

    resizeCanvasToDisplaySize(canvas);

    //width and height - important, used throughout as state variable
    let width = canvas.width;
    let height = canvas.height;

    //gl variables
    let gl = canvas.getContext("webgl2");

    //rendering to float/uint/int textures
    if (!gl.getExtension("EXT_color_buffer_float")) {
        console.error("FLOAT color buffer not available");
        return;
    }
    //filtering floating point textures
    if (!gl.getExtension("OES_texture_float_linear")) {
        console.error("FLOAT sampling not available");
        return;
    } 

    //man :( ... fixes the texture loading issues
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    //reserved textures
    //TEXTURE0 - states texture blocks (i.e. level >= 2) - 513 x 73 = 37,449 R
    //TEXTURE1 - states texture leaves (i.e. level = 1 & material) - 512 x 512
    //TEXTURE2 - blue noise
    //TEXTURE3 - albedo
    //TEXTURE4 - sun
    //TEXTURE5 - final1
    //TEXTURE6 - position1
    //TEXTURE7 - final2
    //TEXTURE8 - position2
    //TEXTURE9 - result of AA

    //variables for voxel states
    let statesBlocks = gl.createTexture();
    let statesLeaves = gl.createTexture();

    //pipeline variables
    //raw & reprojection -> atrous x5 -> FXAA
    const rawProgram = createProgramFromScripts(gl, await fetch(path + "shaders/quad.vs").then(result => result.text()), await fetch(path + "shaders/raw.fs").then(result => result.text()));
    const denoiseProgram = createProgramFromScripts(gl, await fetch(path + "shaders/quad.vs").then(result => result.text()), await fetch(path + "shaders/denoise.fs").then(result => result.text()));
    const TAAProgram = createProgramFromScripts(gl, await fetch(path + "shaders/quad.vs").then(result => result.text()), await fetch(path + "shaders/TAA.fs").then(result => result.text()));
    const finalProgram = createProgramFromScripts(gl, await fetch(path + "shaders/quad.vs").then(result => result.text()), await fetch(path + "shaders/final.fs").then(result => result.text()));
    const copyProgram = createProgramFromScripts(gl, await fetch(path + "shaders/quad.vs").then(result => result.text()), await fetch(path + "shaders/copy.fs").then(result => result.text()));
    
    //load noise
    let img = new Image();
    img.src = path + "static/bluenoise16.png";
    img.onload = () => {
        let tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

        let canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128 * 16;
        let ctx = canvas.getContext('2d');
        
        ctx.drawImage(img, 0, 0);
        var imgData = ctx.getImageData(0, 0, 128, 128 * 16);
        var pixels = new Uint8Array(imgData.data.buffer);

        gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, 128, 128, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    };

    //rendering frame buffers & textures
    let rawAOSun = null;
    let rawAlbedo = null;
    let AAFrame1 = null;
    let position1 = null;
    let AAFrame2 = null;
    let position2 = null;
    let AAResult = null;
    const rawFrameBuffer1 = gl.createFramebuffer();
    const rawFrameBuffer2 = gl.createFramebuffer();
    const denoiseFrameBuffer1 = gl.createFramebuffer();
    const denoiseFrameBuffer2 = gl.createFramebuffer();
    const AAFrameBuffer = gl.createFramebuffer();

    //uniform variables
    let forward = {x: 0, y: 1, z: 0};
    let right = {x: 1, y: 0, z: 0};
    let position = {x: 0, y: 0, z: 0};
    let lastForward = {x: 0, y: 1, z: 0};
    let lastRight = {x: 1, y: 0, z: 0};
    let lastPosition = {x: 0, y: 0, z: 0};
    let sunDirection = {x: 1, y: 1, z: 1};
    let frames = 0;

    //get attribute locations in all shaders - used for uniforms
    //check - not all of these are necessary?
    let attributeLocations = {
        "raw_screensize": gl.getUniformLocation(rawProgram, "u_screensize"),
        "raw_bluenoise": gl.getUniformLocation(rawProgram, "u_bluenoise"),
        "raw_forward": gl.getUniformLocation(rawProgram, "u_forward"),
        "raw_right": gl.getUniformLocation(rawProgram, "u_right"),
        "raw_position": gl.getUniformLocation(rawProgram, "u_position"),
        "raw_statesBlocks": gl.getUniformLocation(rawProgram, "u_statesBlocks"),
        "raw_statesLeaves": gl.getUniformLocation(rawProgram, "u_statesLeaves"),
        "raw_frames": gl.getUniformLocation(rawProgram, "u_frames"),
        "raw_jitter": gl.getUniformLocation(rawProgram, "u_jitter"),
        "raw_palette": gl.getUniformLocation(rawProgram, "u_palette"),
        "raw_sunDirection": gl.getUniformLocation(rawProgram, "u_sunDirection"),
        "denoise_albedo": gl.getUniformLocation(denoiseProgram, "u_albedo"),
        "denoise_aosun": gl.getUniformLocation(denoiseProgram, "u_aosun"),
        "denoise_positionTex": gl.getUniformLocation(denoiseProgram, "u_positionTex"),
        "TAA_screensize": gl.getUniformLocation(TAAProgram, "u_screensize"),
        "TAA_frames": gl.getUniformLocation(TAAProgram, "u_frames"),
        "TAA_forward": gl.getUniformLocation(TAAProgram, "u_forward"),
        "TAA_right": gl.getUniformLocation(TAAProgram, "u_right"),
        "TAA_position": gl.getUniformLocation(TAAProgram, "u_position"),
        "TAA_lforward": gl.getUniformLocation(TAAProgram, "u_lforward"),
        "TAA_lright": gl.getUniformLocation(TAAProgram, "u_lright"),
        "TAA_lposition": gl.getUniformLocation(TAAProgram, "u_lposition"),
        "TAA_posTex": gl.getUniformLocation(TAAProgram, "u_posTex"),
        "TAA_colTex": gl.getUniformLocation(TAAProgram, "u_colTex"),
        "TAA_lposTex": gl.getUniformLocation(TAAProgram, "u_lposTex"),
        "TAA_lcolTex": gl.getUniformLocation(TAAProgram, "u_lcolTex"),
        "TAA_jitter": gl.getUniformLocation(TAAProgram, "u_jitter"),
        "final_fColor": gl.getUniformLocation(finalProgram, "u_fColor"),
        "copy_source": gl.getUniformLocation(copyProgram, "u_source")
    };

    {//set one time uniforms
        gl.useProgram(rawProgram);
        gl.uniform1i(attributeLocations.raw_statesBlocks, 0);
        gl.uniform1i(attributeLocations.raw_statesLeaves, 1);
        gl.uniform1i(attributeLocations.raw_bluenoise, 2);
        gl.uniform3f(attributeLocations.raw_sunDirection, sunDirection.x, sunDirection.y, sunDirection.z);

        let size = 0.;
        let arr = [-size, size, size, -size, size, size, -size, -size];
        gl.uniform2fv(attributeLocations.raw_jitter,arr);

        gl.useProgram(denoiseProgram);
        gl.uniform1i(attributeLocations.denoise_albedo, 3);
        gl.uniform1i(attributeLocations.denoise_aosun, 4);

        gl.useProgram(TAAProgram);
        gl.uniform2fv(attributeLocations.TAA_jitter, arr);
    }

    //sets AA jitter offset to size - set to 0 to turn of AA
    //size should range between [0., .5)
    let setAAJitter = (size) => {
        let arr = [-size, size, size, -size, size, size, -size, -size];
        gl.useProgram(rawProgram);
        gl.uniform2fv(attributeLocations.raw_jitter,arr);
        gl.useProgram(TAAProgram);
        gl.uniform2fv(attributeLocations.TAA_jitter, arr);
    };

    //send states textures to GPU
    let loadScene = (data) => {
        //load block data
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, statesBlocks);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 513, 73, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data.blocks);
        //load leaf data
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, statesLeaves);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, 512, 512, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, data.leaves);
        //load palette
        gl.useProgram(rawProgram);
        gl.uniform3fv(attributeLocations.raw_palette, data.palette);
    };

    //JavaScript function to convert raw data to VOXEL's data structure
    //input: object/JSON string with 128x128x128 array of voxel states and 128*3 array of color components for palette
    //outputs: object 
    let convertScene = (data) => {
        if (typeof data === "string") {
            data = JSON.parse(data);
        }

        let palette = data.palette;

        if (palette == null || data.states == null) {
            console.error("VOXELS ERROR: no palette at lazyConvert");
            console.error("lazyConvert requires an object with \n - 128x128x128 array of voxel data \n - 127*3 array of color components for 127 palette colors");
            return;
        }

        data = data.states;

        var blocks = new Uint8Array(513 * 73);
        var leaves = new Uint16Array(512 * 512 * 4);
        //convert lowest level 64^3 storing blocks
        var num = 64 * 64;
        for (var x = 0; x < 64; x++) {
            var x2 = x * 2;
            for (var y = 0; y < 64; y++) {
                var y2 = y * 2;
                for (var z = 0; z < 64; z++) {
                    var z2 = z * 2;
                    var idx = num * x + y * 64 + z;
                    leaves[idx * 4]     = (data[x2][y2][z2] > 0 ? 1 : 0) + (data[x2 + 1][y2][z2] > 0 ? 256 : 0) + 
                                          ((data[x2][y2][z2] + 127) % 128) * 2 + ((data[x2 + 1][y2][z2] + 127) % 128) * 512;
                    leaves[idx * 4 + 1] = (data[x2][y2 + 1][z2] > 0 ? 1 : 0) + (data[x2 + 1][y2 + 1][z2] > 0 ? 256 : 0) +
                                          ((data[x2][y2 + 1][z2] + 127) % 128) * 2 + ((data[x2 + 1][y2 + 1][z2] + 127) % 128) * 512;
                    leaves[idx * 4 + 2] = (data[x2][y2][z2 + 1] > 0 ? 1 : 0) + (data[x2 + 1][y2][z2 + 1] > 0 ? 256 : 0) + 
                                          ((data[x2][y2][z2 + 1] + 127) % 128) * 2 + ((data[x2 + 1][y2][z2 + 1] + 127) % 128) * 512;
                    leaves[idx * 4 + 3] = (data[x2][y2 + 1][z2 + 1] > 0 ? 1 : 0) + (data[x2 + 1][y2 + 1][z2 + 1] > 0 ? 256 : 0) + 
                                          ((data[x2][y2 + 1][z2 + 1] + 127) % 128) * 2 + ((data[x2 + 1][y2 + 1][z2 + 1] + 127) % 128) * 512;
                }
            }
        }
        //"mip" other layers
        let levels = [];
        for (var l = 1; l < 7; l++) {
            var size = Math.floor(Math.pow(2, l));
            var width = Math.floor(128 / size);
            levels[l - 1] = [];
            for (var x = 0; x < width; x++) {
                levels[l - 1][x] = [];
                for (var y = 0; y < width; y++) {
                    levels[l - 1][x][y] = [];
                    for (var z = 0; z < width; z++) {
                        var full = false;
                        if (l == 1) {
                            full = 
                            data[2 * x][2 * y][2 * z] > 0 ||
                            data[2 * x + 1][2 * y][2 * z] > 0 ||
                            data[2 * x][2 * y + 1][2 * z] > 0 ||
                            data[2 * x + 1][2 * y + 1][2 * z] > 0 ||
                            data[2 * x][2 * y][2 * z + 1] > 0 ||
                            data[2 * x + 1][2 * y][2 * z + 1] > 0 ||
                            data[2 * x][2 * y + 1][2 * z + 1] > 0  ||
                            data[2 * x + 1][2 * y + 1][ 2 * z + 1] > 0;
                        } else {
                            full = 
                            levels[l - 2][2 * x][2 * y][2 * z] ||
                            levels[l - 2][2 * x + 1][2 * y][2 * z] ||
                            levels[l - 2][2 * x][2 * y + 1][2 * z] ||
                            levels[l - 2][2 * x + 1][2 * y + 1][2 * z] ||
                            levels[l - 2][2 * x][2 * y][2 * z + 1] ||
                            levels[l - 2][2 * x + 1][2 * y][2 * z + 1] ||
                            levels[l - 2][2 * x][2 * y + 1][2 * z + 1] ||
                            levels[l - 2][2 * x + 1][2 * y + 1][ 2 * z + 1];
                        }
                        levels[l - 1][x][y][z] = full;
                    }
                }
            }
        }
        //convert "mipped" layers into typed array for texture
        var offsets = [0, 1, 9, 73, 585, 4681];
        for (var l = 1; l < 7; l++) {
            var size = Math.floor(Math.pow(2, l));
            var width = Math.floor(128 / (size * 2.));
            var offset = offsets[6 - l];
            for (var x = 0; x < width; x++) {
                for (var y = 0; y < width; y++) {
                    for (var z = 0; z < width; z++) {
                        var value = 
                        (levels[l - 1][2 * x][2 * y][2 * z] ? 1 : 0) + 
                        (levels[l - 1][2 * x + 1][2 * y][2 * z] ? 2 : 0) + 
                        (levels[l - 1][2 * x][2 * y + 1][2 * z] ? 4 : 0) + 
                        (levels[l - 1][2 * x + 1][2 * y + 1][2 * z] ? 8 : 0) + 
                        (levels[l - 1][2 * x][2 * y][2 * z + 1] ? 16 : 0) + 
                        (levels[l - 1][2 * x + 1][2 * y][2 * z + 1] ? 32 : 0) + 
                        (levels[l - 1][2 * x][2 * y + 1][2 * z + 1] ? 64 : 0) + 
                        (levels[l - 1][2 * x + 1][2 * y + 1][2 * z + 1] ? 128 : 0);
                        blocks[offset + width * width * x + width * y + z] = value;
                    }
                }
            }
        }

        return {
            blocks,
            leaves,
            palette
        };
    };

    //let res = convertScene(await fetch(path + "model.txt").then(result => result.text()));

    //loadScene(res);

    //when the screen is resized (or on start), recreate the textures/renderbuffers
    //there is probably some stuff here that is not necessary
    let onResize = () => {
        if (rawAOSun != null) {
            gl.deleteTexture(rawAOSun);
        }
        if (rawAlbedo != null) {
            gl.deleteTexture(rawAlbedo);
        }
        if (AAFrame1 != null) {
            gl.deleteTexture(AAFrame1);
        }
        if (AAFrame2 != null) {
            gl.deleteTexture(AAFrame2);
        }
        if (position1 != null) {
            gl.deleteTexture(position1);
        }
        if (position2 != null) {
            gl.deleteTexture(position2);
        }
        if (AAResult != null) {
            gl.deleteTexture(AAResult);
        }

        rawAlbedo = gl.createTexture();
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, rawAlbedo);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        rawAOSun = gl.createTexture();
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, rawAOSun);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG32F, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        AAFrame1 = gl.createTexture();
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, AAFrame1);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        position1 = gl.createTexture();
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D, position1);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        AAFrame2 = gl.createTexture();
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, AAFrame2);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        position2 = gl.createTexture();
        gl.activeTexture(gl.TEXTURE8);
        gl.bindTexture(gl.TEXTURE_2D, position2);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        AAResult = gl.createTexture();
        gl.activeTexture(gl.TEXTURE9);
        gl.bindTexture(gl.TEXTURE_2D, AAResult);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.bindFramebuffer(gl.FRAMEBUFFER, rawFrameBuffer1);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rawAlbedo, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, position1, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, rawAOSun, 0);

        gl.bindFramebuffer(gl.FRAMEBUFFER, rawFrameBuffer2);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rawAlbedo, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, position2, 0); 
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, rawAOSun, 0);

        gl.bindFramebuffer(gl.FRAMEBUFFER, denoiseFrameBuffer1);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, AAFrame1, 0);

        gl.bindFramebuffer(gl.FRAMEBUFFER, denoiseFrameBuffer2);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, AAFrame2, 0);
    
        gl.bindFramebuffer(gl.FRAMEBUFFER, AAFrameBuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, AAResult, 0);
    };

    onResize();

    //function for a frame, handles uniforms and calls every aspect of the pipeline
    let frame = async () => {
        //normalizes vectors
        let lenForward = Math.sqrt(forward.x * forward.x + forward.y * forward.y + forward.z * forward.z);
        let lenRight = Math.sqrt(right.x * right.x + right.y * right.y + right.z * right.z);
        if (lenForward > 0.) {
            forward.x /= lenForward;
            forward.y /= lenForward;
            forward.z /= lenForward;
        }
        if (lenRight > 0.) {
            right.x /= lenRight;
            right.y /= lenRight;
            right.z /= lenRight;
        }

        //adjust resolution, buffers, etc. on screen size change
        var sizeChanged = resizeCanvasToDisplaySize(canvas);
        if (sizeChanged) {
            width = canvas.width;
            height = canvas.height;
            //change sizes of render target textures
            onResize();
        }

        //stage one - noisy shadow/AO, albedo
        gl.useProgram(rawProgram);
        gl.uniform3f(attributeLocations.raw_position, position.x, position.y, position.z);
        gl.uniform3f(attributeLocations.raw_forward, forward.x, forward.y, forward.z);
        gl.uniform3f(attributeLocations.raw_right, right.x, right.y, right.z);
        gl.uniform2i(attributeLocations.raw_screensize, width, height);
        gl.uniform1i(attributeLocations.raw_frames, frames);

        //ping pong buffers
        //is this still necessary ?
        if (frames % 2 == 0) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, rawFrameBuffer1);
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, rawFrameBuffer2);
        }

        gl.viewport(0, 0, width, height);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
        drawFragment(gl, rawProgram, attributeLocations.rawPosition);

        //stage two - denoise shadow/AO, recombine with albedo, color correction
        gl.useProgram(denoiseProgram);
        gl.uniform2i(attributeLocations.denoise_screensize, width, height);
        
        //ping pong buffers
        if (frames % 2 == 0) {
            gl.uniform1i(attributeLocations.denoise_positionTex, 6);
            gl.bindFramebuffer(gl.FRAMEBUFFER, denoiseFrameBuffer1);
        } else {
            gl.uniform1i(attributeLocations.denoise_positionTex, 8);
            gl.bindFramebuffer(gl.FRAMEBUFFER, denoiseFrameBuffer2);
        }

        gl.viewport(0, 0, width, height);
        drawFragment(gl, denoiseProgram, attributeLocations.rawPosition);
        
        //stage 3 - temporal reprojection anti-aliasing
        gl.useProgram(TAAProgram);
        gl.uniform2i(attributeLocations.TAA_screensize, width, height);
        gl.uniform3f(attributeLocations.TAA_lposition, lastPosition.x, lastPosition.y, lastPosition.z);
        gl.uniform3f(attributeLocations.TAA_lforward, lastForward.x, lastForward.y, lastForward.z);
        gl.uniform3f(attributeLocations.TAA_lright, lastRight.x, lastRight.y, lastRight.z);
        gl.uniform1i(attributeLocations.TAA_frames, frames);

        //ping pong buffers
        if (frames % 2 == 0) {
            gl.uniform1i(attributeLocations.TAA_posTex, 6);
            gl.uniform1i(attributeLocations.TAA_colTex, 5);
            gl.uniform1i(attributeLocations.TAA_lposTex, 8);
            gl.uniform1i(attributeLocations.TAA_lcolTex, 7);
        } else {
            gl.uniform1i(attributeLocations.TAA_posTex, 8);
            gl.uniform1i(attributeLocations.TAA_colTex, 7);
            gl.uniform1i(attributeLocations.TAA_lposTex, 6);
            gl.uniform1i(attributeLocations.TAA_lcolTex, 5);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, AAFrameBuffer);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        gl.viewport(0, 0, width, height);

        drawFragment(gl, TAAProgram, attributeLocations.rawPosition);

        //stage 4 - draw to screen
        gl.useProgram(finalProgram);
        gl.uniform1i(attributeLocations.final_fColor, 9);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        drawFragment(gl, finalProgram, attributeLocations.rawPosition);

        //stage 5 - copy results to history buffer for TRAA
        if (frames % 2 == 0) {
            gl.useProgram(copyProgram);
            gl.bindFramebuffer(gl.FRAMEBUFFER, denoiseFrameBuffer1);
            gl.uniform1i(attributeLocations.copy_source, 9);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
            gl.viewport(0, 0, width, height);
            drawFragment(gl, copyProgram, attributeLocations.rawPosition);
        } else {
            gl.useProgram(copyProgram);
            gl.bindFramebuffer(gl.FRAMEBUFFER, denoiseFrameBuffer2);
            gl.uniform1i(attributeLocations.copy_source, 9);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
            gl.viewport(0, 0, width, height);
            drawFragment(gl, copyProgram, attributeLocations.rawPosition);
        }

        //update variables
        frames++;
        lastForward.x = forward.x;
        lastForward.y = forward.y;
        lastForward.z = forward.z;
        lastRight.x = right.x;
        lastRight.y = right.y;
        lastRight.z = right.z;
        lastPosition.x = position.x;
        lastPosition.y = position.y;
        lastPosition.z = position.z;
    };

    //returns an object with all of the functionality required for VOXEL
    return {
        frame: frame,
        setForward: (inval) => {
            if ("x" in inval) {
                if ("y" in inval) {
                    if ("z" in inval) {
                        forward = inval;
                        return;
                    }
                }
            }
            console.error("invalid argument to setForward");
            return;
        },
        getForward: () => forward,
        setRight: (inval) => {
            if ("x" in inval) {
                if ("y" in inval) {
                    if ("z" in inval) {
                        right = inval;
                        return;
                    }
                }
            }
            console.error("invalid argument to setForward");
            return;
        },
        getRight: () => right,
        setPosition: (inval) => {
            if ("x" in inval) {
                if ("y" in inval) {
                    if ("z" in inval) {
                        position = inval;
                        return;
                    }
                }
            }
            console.error("invalid argument to setForward");
            return;
        },
        getPosition: () => position,
        convertScene,
        loadScene,
        setAAJitter,
        setSunDirection: (dir) => {
            if ("x" in dir) {
                if ("y" in dir) {
                    if ("z" in dir) {
                        sunDirection = dir;
                        gl.useProgram(rawProgram);
                        gl.uniform3f(attributeLocations.raw_sunDirection, sunDirection.x, sunDirection.y, sunDirection.z);
                        return;
                    }
                }
            }
            console.error("invalid argument to setSunDirection");
            return;
        }
    };

    //additional helper functions:

    //async/await load image
    //https://www.fabiofranchino.com/log/load-an-image-with-javascript-using-await/
    function loadImage(path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.src = path;
            img.onload = () => {
                resolve(img);
            };
            img.onerror = (e) => {
                reject(e);
            }
        });
    };

    //creates program from 2 shaders
    function createProgram(gl, vertexShader, fragmentShader) {
        //create a program
        var program = gl.createProgram();

        //attach the shaders
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);

        //link the program
        gl.linkProgram(program);

        //Check if it linked
        var success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (!success) {
            //something went wrong with the link
            console.log("Program link failed:\n" + gl.getProgramInfoLog(program));
        }

        return program;
    }

    //compiles a shader
    function compileShader(gl, shaderSource, shaderType) {
        //create the shader object
        var shader = gl.createShader(shaderType);

        //Set the shader source code
        gl.shaderSource(shader, shaderSource);

        //compile the shader
        gl.compileShader(shader);

        //check if compile was successful
        var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (!success) {
            console.log("Could not compile shader:\n" + gl.getShaderInfoLog(shader));
        }

        return shader;
    }

    //creates a program from 2 shader sources
    function createProgramFromScripts(gl, vertexScript, fragmentScript) {
        //create shaders
        var vertexShader = compileShader(gl, vertexScript, gl.VERTEX_SHADER);
        var fragmentShader = compileShader(gl, fragmentScript, gl.FRAGMENT_SHADER);

        //create and return the actual program
        return createProgram(gl, vertexShader, fragmentShader);
    }

    //resize canvas to make correct
    function resizeCanvasToDisplaySize(canvas) {
        //lookup the size the browser is displaying the canvas at in css pixels
        const displayWidth = canvas.clientWidth;
        const displayHeight = canvas.clientHeight;

        //check if the canvas is not the same size
        const needResize = canvas.width !== displayWidth || canvas.height !== displayHeight;

        if (needResize) {
            //resize the canvas
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }

        return needResize;
    }

    //execute a fragment shader onto a full screen quad
    function drawFragment(gl, program, positionAttributeLocation) {
        //use program
        gl.useProgram(program);

        //create triangle buffer
        var positionBuffer = gl.createBuffer();

        //bind buffer to ARRAY_BUFFER
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

        //clippos vertex positions
        var positions = [-1, -1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1];
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        //create a vertex array object (handles attribute state)
        var vao = gl.createVertexArray();

        //make vao the current vertex array we are editing
        gl.bindVertexArray(vao);

        gl.enableVertexAttribArray(positionAttributeLocation);

        //settings for how to read positions
        var size = 2;
        var type = gl.FLOAT;
        var normalize = false;
        var stride = 0;
        var offset = 0;

        gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset);

        //resize canvas
        resizeCanvasToDisplaySize(gl.canvas);

        //tell gl to use our program
        gl.useProgram(program);

        //bind the attribute/buffer set we want
        gl.bindVertexArray(vao);

        //draw
        var primitiveType = gl.TRIANGLES;
        var offset = 0;
        var count = 6;
        gl.drawArrays(primitiveType, offset, count);
    }
}



