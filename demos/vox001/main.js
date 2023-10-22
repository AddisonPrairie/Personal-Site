//voxels interface
let v = null;
let thetaX = 0.;
let thetaY = Math.PI / 6.;
let distance = 250.;
let mouse = {
    active: false,
    x: 0.,
    y: 0.
};
let height = 50.;
let rotating = true;

//CA terrain
let state = null;
let L = 7;
let K = Math.floor(Math.pow(2, L)) + 1;
let cubeRule = [[], [], [], [], [], [], [], [], []];
let faceRule = [[], [], [], [], [], [], []];
let edgeRule = [[], [], [], [], [], [], []];
let flipP = 1.;
let symmetricAdd = 1.;

let curVObj = null;

//position and direction
let pos = {
    //get the forward view vector
    calcForward: () => {
        return {
            x: Math.cos(thetaX) * Math.cos(thetaY),
            y: Math.sin(thetaX) * Math.cos(thetaY),
            z: Math.sin(-thetaY)
        };
    },
    //get the right view vector
    calcRight: () => {
        const ninety = Math.PI / 2.;
        return {
            x: Math.cos(thetaX + ninety),
            y: Math.sin(thetaX + ninety),
            z: 0
        };
    },
    //change angles
    addAngle: (valX, valY) => {
        thetaX = thetaX + valX;
        const ninety = Math.PI / 2.;
        thetaY = Math.min(Math.max(thetaY + valY, -ninety), ninety);
    },
    //get the position
    calcPosition: () => {
        let forward = {
            x: Math.cos(thetaX) * Math.cos(thetaY),
            y: Math.sin(thetaX) * Math.cos(thetaY),
            z: Math.sin(-thetaY)
        };
        return {
            x: 64. - forward.x * distance,
            y: 64. - forward.y * distance,
            z: height - forward.z * distance
        };
    }
};

//onload - init everything and begin running animation frames
window.onload = async () => {
    v = await voxels({
        canvas: document.querySelector("#render"),
        path: "VOXELS/"
    });

    //lets users rotate model
    document.querySelector("#render").addEventListener("mousedown", (e) => {
        e.preventDefault();
        mouse.active = true;
    });
    document.addEventListener("mouseup", (e) => {
        mouse.active = false;
    });
    document.addEventListener("mousemove", (e) => {
        if (mouse.active) {
            const deltaX = e.pageX - mouse.x;
            const deltaY = -e.pageY + mouse.y;
            pos.addAngle(deltaX * .01, -deltaY * .01);
        }
        mouse.x = e.pageX;
        mouse.y = e.pageY;
    });

    v.setSunDirection({x: 1., y: 2., z: 2.});

    newRule();
    
    frame(0);
};

//keeping track of time between frames
let then = 0.;
function frame(now) {
    //get time per frame (in seconds)
    now *= 0.001;
    const deltaTime = now - then;
    then = now;

    if (!mouse.active && rotating) {
        pos.addAngle(deltaTime * .25, 0);
    }
    
    v.setPosition(pos.calcPosition());
    v.setForward(pos.calcForward());
    v.setRight(pos.calcRight());

    //render frame
    v.frame();

    window.requestAnimationFrame(frame);
}

function initArr() {
    let returned = {states: [], palette: []};

    for (var x = 0; x < 129; x++) {
        returned.states[x] = [];
        for (var y = 0; y < 129; y++) {
            returned.states[x][y] = [];
            for (var z = 0; z < 129; z++) {
                returned.states[x][y][z] = 0.;
                
            }
        }
    }

    for (var i = 0; i < 2; i++) {
        returned.palette[i * 3] = Math.random();
        returned.palette[i * 3 + 1] = Math.random();
        returned.palette[i * 3 + 2] = Math.random();
    }

    state = returned.states;

    return returned;
}

function newRule() {
    curVObj = initArr();
    randomRule(Math.max(Math.min(Math.random(), .7), .3));
    initState();
    evalState();
    v.loadScene(v.convertScene(curVObj));
}

function newPalette() {
    for (var i = 0; i < 2; i++) {
        curVObj.palette[i * 3] = Math.random();
        curVObj.palette[i * 3 + 1] = Math.random();
        curVObj.palette[i * 3 + 2] = Math.random();
    }
    v.loadScene(v.convertScene(curVObj));
}

function newStateRandom() {
    initState();
    evalState();
    v.loadScene(v.convertScene(curVObj));
}

function newStateSymmetric() {
    initStateSymmetric();
    evalState();
    v.loadScene(v.convertScene(curVObj));
}

function moveUp() {
    height += 10.;
}

function moveDown() {
    height -= 10.;
}

function moveCloser() {
    distance -= 10.;
    if (distance < 0.) {
        distance = 0.;
    }
}

function moveFurther() {
    distance += 10.;
}

function flipRotation() {
    rotating = !rotating;
    if (rotating == true) {
        document.querySelector("#flipRotation").innerHTML = "STOP ROTATION";
    } else {
        document.querySelector("#flipRotation").innerHTML = "START ROTATION";
    }
}

let AA = false;
function flipAA() {
    AA = !AA;
    if (AA == true) {
        document.querySelector("#flipAA").innerHTML = "AA: ON";
        v.setAAJitter(.15);
    } else {
        document.querySelector("#flipAA").innerHTML = "AA: OFF";
        v.setAAJitter(0.);
    }
}

//port of:
//https://bitbucket.org/BWerness/voxel-automata-terrain/src/master/ThreeState3dBitbucket.pde
function evalCube(i, j, k, w) {
    if (i < 0 || j < 0 || k < 0 || i + w >= K || j + w >= K || k + w >= K) return;

    let idx1 =  (state[i][j][k] == 1 ? 1 : 0) + (state[i + w][j][k] == 1 ? 1 : 0) + (state[i + w][j + w][k] == 1 ? 1 : 0) +
                (state[i][j][k + w] == 1 ? 1 : 0) + (state[i + w][j][k + w] == 1 ? 1 : 0) + (state[i + w][j + w][k + w] == 1 ? 1 : 0) + 
                (state[i][j + w][k + w] == 1 ? 1 : 0) + (state[i][j][k + w] == 1 ? 1 : 0) + (state[i][j + w][k] == 1 ? 1 : 0);
    let idx2 =  (state[i][j][k] == 2 ? 1 : 0) + (state[i + w][j][k] == 2 ? 1 : 0) + (state[i + w][j + w][k] == 2 ? 1 : 0) +
                (state[i][j][k + w] == 2 ? 1 : 0) + (state[i + w][j][k + w] == 2 ? 1 : 0) + (state[i + w][j + w][k + w] == 2 ? 1 : 0) + 
                (state[i][j + w][k + w] == 2 ? 1 : 0) + (state[i][j][k + w] == 2 ? 1 : 0) + (state[i][j + w][k] == 2 ? 1 : 0);

    let w2 = Math.floor(w/2);
    state[i + w2][j + w2][k + w2] = cubeRule[idx1][idx2];

    if (state[i + w2][j + w2][k + w2] > 0 && Math.random() > flipP) {
        state[i + w2][j + w2][k + w2] = 3 - state[i + w2][j + w2][k + w2];
    }
}

function f1(i, j, k , w) {
    let w2 = Math.floor(w/2);
    if (i < 0 || j < 0 || k - w2 < 0 || i + w >= K || j + w >= K || k + w2 >= K) return;

    let idx1 =  (state[i][j][k] == 1 ? 1 : 0) + (state[i + w][j][k] == 1 ? 1 : 0) + (state[i][j + w][k] == 1 ? 1 : 0)  +
                (state[i + w][j + w][k] == 1 ? 1 : 0) + (state[i + w2][j + w2][k - w2] == 1 ? 1 : 0) + (state[i + w2][j + w2][k + w2] == 1 ? 1 : 0); 
    let idx2 =  (state[i][j][k] == 2 ? 1 : 0) + (state[i + w][j][k] == 2 ? 1 : 0) + (state[i][j + w][k] == 2 ? 1 : 0)  +
                (state[i + w][j + w][k] == 2 ? 1 : 0) + (state[i + w2][j + w2][k - w2] == 2 ? 1 : 0) + (state[i + w2][j + w2][k + w2] == 2 ? 1 : 0);

    state[i + w2][j + w2][k] = faceRule[idx1][idx2];

    if (state[i + w2][j + w2][k] > 0 && Math.random() > flipP) {
        state[i + w2][j + w2][k] = 3 - state[i + w2][j + w2][k];
    }
}

function f2(i, j, k , w) {
    let w2 = Math.floor(w/2);
    if (i < 0 || j - w2 < 0 || k < 0 || i + w >= K || j + w2 >= K || k + w >= K) return;

    let idx1 =  (state[i][j][k] == 1 ? 1 : 0) + (state[i + w][j][k] == 1 ? 1 : 0) + (state[i][j][k + w] == 1 ? 1 : 0)  +
                (state[i + w][j][k + w] == 1 ? 1 : 0) + (state[i + w2][j - w2][k + w2] == 1 ? 1 : 0) + (state[i + w2][j + w2][k + w2] == 1 ? 1 : 0); 
    let idx2 =  (state[i][j][k] == 2 ? 1 : 0) + (state[i + w][j][k] == 2 ? 1 : 0) + (state[i][j][k + w] == 2 ? 1 : 0)  +
                (state[i + w][j][k + w] == 2 ? 1 : 0) + (state[i + w2][j - w2][k + w2] == 2 ? 1 : 0) + (state[i + w2][j + w2][k + w2] == 2 ? 1 : 0); 

    state[i + w2][j][k + w2] = faceRule[idx1][idx2];

    if (state[i + w2][j][k + w2] > 0 && Math.random() > flipP) {
        state[i + w2][j][k + w2] = 3 - state[i + w2][j][k + w2];
    }
}

function f3(i, j, k , w) {
    let w2 = Math.floor(w/2);
    if (i - w/2 < 0 || j < 0 || k < 0 || i + w2 >= K || j + w >= K || k + w >= K) return;

    let idx1 =  (state[i][j][k] == 1 ? 1 : 0) + (state[i][j][k + w] == 1 ? 1 : 0) + (state[i][j + w][k] == 1 ? 1 : 0)  +
                (state[i][j + w][k + w] == 1 ? 1 : 0) + (state[i - w2][j + w2][k + w2] == 1 ? 1 : 0) + (state[i + w2][j + w2][k + w2] == 1 ? 1 : 0); 
    let idx2 =  (state[i][j][k] == 2 ? 1 : 0) + (state[i][j][k + w] == 2 ? 1 : 0) + (state[i][j + w][k] == 2 ? 1 : 0)  +
                (state[i][j + w][k + w] == 2 ? 1 : 0) + (state[i - w2][j + w2][k + w2] == 2 ? 1 : 0) + (state[i + w2][j + w2][k + w2] == 2 ? 1 : 0); 

    state[i][j + w2][k + w2] = faceRule[idx1][idx2];

    if (state[i][j + w2][k + w2] > 0 && Math.random() > flipP) {
        state[i][j + w2][k + w2] = 3 - state[i][j + w2][k + w2];
    }
}

function f4(i, j, k, w) {
    f1(i, j, k + w, w);
}

function f5(i, j, k, w) {
    f1(i, j + w, k, w);
}

function f6(i, j, k, w) {
    f1(i + w, j, k, w);
}

function evalFaces(i, j, k, w) {
    f1(i, j, k, w);
    f2(i, j, k, w);
    f3(i, j, k, w);
    f4(i, j, k, w);
    f5(i, j, k, w);
    f6(i, j, k, w);
}

function e1(i, j, k, w) {
    let w2 = Math.floor(w / 2);
    if (i < 0 || j - w2 < 0 || k - w2 < 0 || i + w >= K || j + w2 >= K || k + w2 >= K) return;

    let idx1 =  (state[i][j][k]== 1 ? 1 : 0) + (state[i + w][j][k]== 1 ? 1 : 0) + (state[i + w2][j - w2][k]== 1 ? 1 : 0) +
                (state[i + w2][j + w2][k]== 1 ? 1 : 0) + (state[i + w2][j][k + w2]== 1 ? 1 : 0) + (state[i + w2][j][k - w2]== 1 ? 1 : 0);
    let idx2 =  (state[i][j][k]== 1 ? 1 : 0) + (state[i + w][j][k]== 1 ? 1 : 0) + (state[i + w2][j - w2][k]== 1 ? 1 : 0) +
                (state[i + w2][j + w2][k]== 1 ? 1 : 0) + (state[i + w2][j][k + w2]== 1 ? 1 : 0) + (state[i + w2][j][k - w2]== 1 ? 1 : 0);

    state[i + w2][j][k] = edgeRule[idx1][idx2];

    if (state[i + w2][j][k] > 0 && Math.random() > flipP) {
        state[i + w2][j][k] = 3 - state[i + w2][j][k];
    }
}

function e2(i, j, k, w) {
    e1(i, j+w, k, w);
}

function e3(i, j, k, w) {
    e1(i, j, k + w, w);
}

function e4(i, j, k, w) {
    e1(i, j+w, k + w, w);
}

function e5(i, j, k, w) {
    let w2 = Math.floor(w / 2);
    e1(i - w2, j + w2, k, w);
}

function e6(i, j, k, w) {
    let w2 = Math.floor(w / 2);
    e1(i + w2, j + w2, k, w);
}

function e7(i, j, k, w) {
    let w2 = Math.floor(w / 2);
    e1(i - w2, j + w2, k + w, w);
}

function e8(i, j, k, w) {
    let w2 = Math.floor(w / 2);
    e1(i + w2, j + w2, k + w, w);
}

function evalEdges(i, j, k, w) {
    e1(i, j, k, w);
    e2(i, j, k, w);
    e3(i, j, k, w);
    e4(i, j, k, w);
    e5(i, j, k, w);
    e6(i, j, k, w);
    e7(i, j, k, w);
    e8(i, j, k, w);
}

function randomRule(lambda) {
    for (var i = 0; i < 9; i++) {
        for (var j = 0; j < 9 - i; j++) {
            if ((i == 0 && j == 0) || Math.random() > lambda) cubeRule[i][j] = 0;
            else {
                cubeRule[i][j] = Math.floor(Math.random() * 2.) + 1;
            }
        }
    }

    for (var i = 0; i < 7; i++) {
        for (var j = 0; j < 7 - i; j++) {
            if ((i == 0 && j == 0) || Math.random() > lambda) faceRule[i][j] = 0;
            else {
                faceRule[i][j] = Math.floor(Math.random() * 2.) + 1;
            }
        }
    }

    for (var i = 0; i < 7; i++) {
        for (var j = 0; j < 7 - i; j++) {
            if ((i == 0 && j == 0) || Math.random() > lambda) edgeRule[i][j] = 0;
            else {
                edgeRule[i][j] = Math.floor(Math.random() * 2.) + 1;
            }
        }
    }
}

function initState() {
    for (var i = 0; i < K; i++) {
        for (var j = 0; j < K; j++) {
            state[i][j][0] = Math.floor(Math.random() * 2) + 1;
        }
    }
}

function initStateSymmetric() {
    if (symmetricAdd == 1) {
        symmetricAdd = 2;
    } else {
        symmetricAdd = 1;
    }
    for (var i = 0; i < K; i++) {
        for (var j = 0; j < K; j++) {
            state[i][j][0] = symmetricAdd;
        }
    }
}

function evalState() {
    for (var w = K - 1; w >= 2; w = Math.floor(w / 2)) {
        for (var i = 0; i < K - 1; i = i + w) {
            for (var j = 0; j < K - 1; j = j + w) {
                for (var k = 0; k < K - 1; k = k + w) {
                    evalCube(i, j, k, w);
                }
            }
        }
        for (var i = 0; i < K - 1; i = i + w) {
            for (var j = 0; j < K - 1; j = j + w) {
                for (var k = 0; k < K - 1; k = k + w) {
                    evalFaces(i, j, k, w);
                }
            }
        }
        for (var i = 0; i < K - 1; i = i + w) {
            for (var j = 0; j < K - 1; j = j + w) {
                for (var k = 0; k < K - 1; k = k + w) {
                    evalEdges(i, j, k, w);
                }
            }
        }  
    }
}
