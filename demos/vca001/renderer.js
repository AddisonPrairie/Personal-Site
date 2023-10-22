let mouse = {"x":0, "y":0, "receivingInput":false};
let previousMouse = {"x": 0, "y": 0};
let refresh = true;
let State0 = [0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,1,1,1,1,1,1,1];
let State1 = [1,1,1,1,1,1,1,0,0,1,0,1,1,1,0,0,0,0,1,0,0,1,1,0,1,0,1];
let State2 = [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3];
let State3 = [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4];
let distance = 50.;
let aoSamples = 10;
let framesStatic = 0;
let datInput = {"distance" : 100, 
    "Reset State" : function() {refresh = true;}, 
    "Shuffle Rules" : randomizeRules,
    "Pause/Play" : function() { pause = !pause;}
};
function randomizeRules() {
    refresh = true;
    for (var i = 0; i < 26; i++)
    {
        State1[i] = 1 + (Math.random() * 2 < 1);
        State2[i] = 2 + (Math.random() * 2 < 1);
        State3[i] = 3 + (Math.random() * 2 < 1);
    }
}
function onDocumentMouseMove(event) {
    
    if (document.querySelector(".dg").contains(document.elementFromPoint(event.clientX, event.clientY)))
    {
        mouse.receivingInput = false;
    }
    else{
        event.preventDefault();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        if (mouse.receivingInput) {
            framesStatic = 0;
        }
    }
}

function onMouseClick(event) {
    if (document.querySelector(".dg").contains(document.elementFromPoint(event.clientX, event.clientY)))
    {
    }
    else{
        event.preventDefault();
        mouse.receivingInput = true;
    }
}

function onMouseRelease(event) {
    if (document.querySelector(".dg").contains(document.elementFromPoint(event.clientX, event.clientY)))
    {
    }
    else{
        event.preventDefault();
        mouse.receivingInput = false;
    }
}

var pause = false;

function onKeyBoardPress(event) {
    if (event.keyCode == 32) {
        //pause = !pause;
        //refresh = true;
    }
}

let prevDistance = 0.;

function getAllValues() {
    distance = document.querySelector("#distance").value;
    if (distance != prevDistance) {
        framesStatic = 0;
    }
    prevDistance = distance;
    aoSamples = document.querySelector("#aoSamples").value;
}

window.onload = () => {
    datInput.Background = [99, 99, 99];
    datInput.state1 = [200, 200, 200];
    datInput.state2 = [150, 150, 150];
    datInput.state3 = [100, 100, 100];
    datInput.state4 = [50, 50, 50];
    var gui = new dat.GUI({name: 'Controls'});
    var movementFolder = gui.addFolder('Movement');
    movementFolder.add(datInput, "distance",10, 180);
    var colorFolder = gui.addFolder('Render');
    colorFolder.addColor(datInput, "Background");
    colorFolder.addColor(datInput, "state1");
    colorFolder.addColor(datInput, "state2");
    colorFolder.addColor(datInput, "state3");
    colorFolder.addColor(datInput, "state4");
    var caFolder = gui.addFolder('CA');
    caFolder.add(datInput, "Reset State");
    caFolder.add(datInput, "Shuffle Rules");
    caFolder.add(datInput, "Pause/Play");
    randomizeRules();
    document.addEventListener('mousedown', onMouseClick, false);
    document.addEventListener('mouseup', onMouseRelease, false);
    document.addEventListener('mousemove', onDocumentMouseMove, false);
    document.addEventListener('keydown', onKeyBoardPress, false);
    /*document.querySelector("#pause").onclick = (e) => {
        pause = !pause;
        pauseButton = document.querySelector("#pause");
        if (pause) {
            pauseButton.innerHTML = "Run";
            framesStatic = 0.;
        }
        else {
            pauseButton.innerHTML = "Stop";
        }
    };
    document.querySelector("#refresh").onclick = (e) => {
        refresh = true;
        framesStatic = 0.;
    };
    document.querySelector("#shuffleRules").onclick = (e) => {
        randomizeRules();
        framesStatic = 0.;
    };*/
    
    let cameraZTheta = 45.;
    let cameraYTheta = -45.;
    let cameraRotationSpeed = 360.;
    const canvas = document.querySelector("#targetCanvas");

    var gl = canvas.getContext("webgl");
    if (!gl) {
        alert("No gl context");
        return;
    }

    resizeCanvasToDisplaySize(gl.canvas, gl);

    /*let vertexShaderSource = `
        attribute vec2 a_position;

        uniform vec2 u_vertexResolution;

        void main() {
            vec2 zeroToOne = a_position / u_vertexResolution;
            
            vec2 zeroToTwo = zeroToOne * 2.;

            vec2 clipSpace = zeroToTwo - 1.;

            gl_Position = vec4(clipSpace * vec2(1., -1.), 0, 1);
        }
    `;*/
    let vertexShaderSource = `
    attribute vec2 a_position;

    void main() {
        gl_Position = vec4(a_position, 0, 1);
    }
    `;

    let program2;
    {
        let fragSource = `
        precision highp float;
        uniform sampler2D renderedTexture;
        uniform vec2 u_resolution;
        void main() {
            gl_FragColor = vec4(((texture2D(renderedTexture, (gl_FragCoord.xy) / u_resolution).xyz)), 1.);
        }`;
        program2 = createProgram(gl, vertexShaderSource, fragSource);
    }

    const test = fetch('frag.glsl').then(result => result.text()).then(shaderSource => {
    
    let program = createProgram(gl, vertexShaderSource, shaderSource);
    
    const frameBuffer = gl.createFramebuffer();
    var bufferTexture = createTexture(gl, canvas.clientWidth, canvas.clientHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bufferTexture, 0  
    );
    const frameBuffer2 = gl.createFramebuffer();
    var bufferTexture2 = createTexture(gl, canvas.clientWidth, canvas.clientHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer2);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bufferTexture2, 0
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bufferTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bufferTexture2);

    

    let currentState = new Uint8Array(128 * 128 * 128);
    let timeSum = 0.;
    let then = 0.;
    let worker = new Worker('cellularworker.js');
    let receivedThreadData = false;
    worker.addEventListener('message', (e) => {
        currentState = e.data;
        receivedThreadData = true;
    });
    worker.postMessage({"inArray": currentState, "State0": State0, "State1" : State1, "State2" : State2, "State3" : State3, "refresh" : true}, [currentState.buffer]); 
    let output;
    let post = false;
    refresh = false;
    function render(now) {
        getAllValues();
        now *= 0.001;
        const deltaTime = now - then;
        then = now;
        timeSum += deltaTime;
        if (receivedThreadData)
        {
            output = currentState;
        }
        let mouseXTheta = 0.;
        let mouseYTheta = 0.;
        if (mouse.receivingInput)
        {
            mouseXTheta = mouse.x - previousMouse.x;
            mouseYTheta = mouse.y - previousMouse.y;
        }
        cameraZTheta += mouseXTheta  * cameraRotationSpeed;
        cameraYTheta += mouseYTheta  * cameraRotationSpeed;
        drawScene(gl, program, program2, frameBuffer, frameBuffer2, output, {"cameraZTheta": cameraZTheta, "cameraYTheta": cameraYTheta, "time" : now, "distance" : datInput.distance, "aoSamples" : aoSamples}, receivedThreadData);
        previousMouse.x = mouse.x;
        previousMouse.y = mouse.y;
        if (receivedThreadData)
        {
            receivedThreadData = false;
            post = true;
        }
        if (timeSum > .01 && post && !pause)
        {
            timeSum = 0.;
            post = false;
            worker.postMessage({"inArray": currentState, "State0": State0, "State1" : State1, "State2" : State2, "State3" : State3, "refresh" : refresh}, [currentState.buffer]);
            refresh = false;
        }
        //framesStatic += 1;
        requestAnimationFrame(render);
      }
      requestAnimationFrame(render);
    }); 
};

function setValue(int8Array, x, y, z, value) {
    let zXOffset = z % 16;
    let zYOffset = Math.floor(z / 16);

    int8Array[(zYOffset * 128 + y) * 2048 + zXOffset * 128 + x] = value;
}


let drawScene = (gl, program, program2, fb1, fb2, voxelArray, uniforms, outputChanged) => {
    gl.clearColor(0., 0., 0., 1.);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    /*
    if (framesStatic % 2 == 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb1);
        let prevRenderedLocation = gl.getUniformLocation(program, "prevFrame");
        gl.uniform1i(prevRenderedLocation, 1);
    }
    else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb2);
        let prevRenderedLocation = gl.getUniformLocation(program, "prevFrame");
        gl.uniform1i(prevRenderedLocation, 0); 
    }*/
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    //let positionAttributeLocation = gl.getAttribLocation(program, "a_position");
    let vertexResolutionUniformLocation = gl.getUniformLocation(program, "u_vertexResolution");
    gl.uniform2f(vertexResolutionUniformLocation, gl.canvas.width, gl.canvas.height);
    let resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
    let timeUniformLocation = gl.getUniformLocation(program, "u_time");
    gl.uniform1f(timeUniformLocation, parseFloat(uniforms.time));
    let textureLocation = gl.getUniformLocation(program, "u_texture");
    gl.uniform1i (textureLocation, 2);
    let camYLocation = gl.getUniformLocation(program, "u_camY");
    gl.uniform1f(camYLocation, uniforms.cameraYTheta);
    let camZLocation = gl.getUniformLocation(program, "u_camZ");
    gl.uniform1f(camZLocation, uniforms.cameraZTheta);
    let distanceLocation = gl.getUniformLocation(program, "u_distance");
    gl.uniform1f(distanceLocation, parseFloat(uniforms.distance));
    let aoLocation = gl.getUniformLocation(program, "u_aoSamples");
    gl.uniform1i(aoLocation, parseInt(uniforms.aoSamples));
    let staticFramesLocation = gl.getUniformLocation(program, "u_staticFrames");
    let backgroundLocation = gl.getUniformLocation(program, "u_background");
    gl.uniform3f(backgroundLocation, datInput.Background[0] / 255, datInput.Background[1]/255, datInput.Background[2]/255);
    let state1 = gl.getUniformLocation(program, "state1");
    gl.uniform3f(state1, datInput.state1[0]/255, datInput.state1[1]/255, datInput.state1[2]/255);
    let state2 = gl.getUniformLocation(program, "state2");
    gl.uniform3f(state2, datInput.state2[0]/255, datInput.state2[1]/255, datInput.state2[2]/255);
    let state3 = gl.getUniformLocation(program, "state3");
    gl.uniform3f(state3, datInput.state3[0]/255, datInput.state3[1]/255, datInput.state3[2]/255);
    let state4 = gl.getUniformLocation(program, "state4");
    gl.uniform3f(state4, datInput.state4[0]/255, datInput.state4[1]/255, datInput.state4[2]/255);
    if (outputChanged === true) {
        let texture = binaryTextureFromArray(gl, voxelArray, 2048, 1024);
        framesStatic = 0.;
    }
    //console.log(uniforms.distance);
    gl.uniform1i(staticFramesLocation, framesStatic);
    renderFragmentShader(gl, program);
    /*
    gl.useProgram(program2);
    if (framesStatic % 2 == 0) {
        let renderedTexture = gl.getUniformLocation(program2, "renderedTexture");
        gl.uniform1i(renderedTexture, 0);
    }
    else {
        let renderedTexture = gl.getUniformLocation(program2, "renderedTexture");
        gl.uniform1i(renderedTexture, 1);
    }
    let prog2Resolution = gl.getUniformLocation(program2, "u_resolution");
    gl.uniform2f(prog2Resolution, gl.canvas.width, gl.canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    renderFragmentShader(gl, program2);
    framesStatic += 1;*/
}

function renderFragmentShader(gl, program) {
    gl.clearColor(0., 0., 0., 1.);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let positionAttributeLocation = gl.getAttribLocation(program, "a_position");
    
    let positionBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    var positions = [
        -1, -1,
         1,  1,
         1, -1,
         -1, -1,
         1, 1,
         -1, 1
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.useProgram(program);

    gl.enableVertexAttribArray(positionAttributeLocation);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    {
        var size = 2;
        var type = gl.FLOAT;
        var normalize = false;
        var stride = 0;
        var offset = 0;

        gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset);
    }

    var primitiveType = gl.TRIANGLES;
    var drawOffset = 0;
    var count = positions.length / 2;

    gl.drawArrays(primitiveType, drawOffset, count);
}

let createShader = (gl, type, source) => {
    let shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    let success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }

    alert("Shader compile failed");
    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
};

let createProgram = (gl, vertexShaderSource, fragmentShaderSource) => {
    let vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    let fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    let success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success)
    {
        return program;
    }

    alert("create Program Failed");
    gl.deleteProgram(program);
};

let resizeCanvasToDisplaySize = (canvas, gl) => {
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    const needResize = canvas.width !== displayWidth || canvas.height != displayHeight;
    canvas.width = displayWidth / 1.;
    canvas.height = displayHeight / 1.;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    return needResize;
};

let binaryTextureFromArray = (gl, dataArray, width, height) => {
    gl.activeTexture(gl.TEXTURE2);
    let typedArray = new Uint8Array(dataArray);
    let texture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, width, height, 0, gl.ALPHA, gl.UNSIGNED_BYTE, typedArray);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    return texture;
};

function createTexture(gl, width, height) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const level = 0;
    const internalFormat = gl.RGBA;
    const border = 0;
    const format = gl.RGBA;
    const type = gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
        width, height, border, format, type, null);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return texture;
}
