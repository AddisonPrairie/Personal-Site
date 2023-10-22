let maxX = 80;
let minX = 50;
let maxY = 80;
let minY = 50;
let maxZ = 80;
let minZ = 50; 

self.addEventListener('message', (e) => {
    let arr;
    if (e.data["refresh"]) {
        arr = resetArray(e.data["inArray"]);
        console.log("REFRESH");
    }
    else {
        arr = ruleTableUpdate(e.data["inArray"], e.data["State0"], e.data["State1"], e.data["State2"], e.data["State3"], {});
    }
    self.postMessage(e.data["inArray"], [e.data["inArray"].buffer]);
});

function notOnEdge(x, y, z) {
    return x < 127 && x > 0 && y < 127 && y > 0 && z < 127 && z > 0;
}

function setValue(int8Array, x, y, z, value) {
    let zXOffset = z % 16;
    let zYOffset = Math.floor(z / 16);

    int8Array[(zYOffset * 128 + y) * 2048 + zXOffset * 128 + x] = value * 50;
}

function getValue(int8Array, x, y, z) {
    let zXOffset = z % 16;
    let zYOffset = Math.floor(z / 16);

    return (int8Array[(zYOffset * 128 + y) * 2048 + zXOffset * 128 + x] / 50);
}

function ruleTableCell() {
    this.state = 0;
}

function ruleTableUpdate(inArray, State0, State1, State2, State3, State4) {
    let checksX = [1, -1, 1, 0, 0, -1,  0,  0, 1, 0, 1, -1,  0, -1,  1,  0, -1, -1,  0,  1,  1,  1, -1, -1, -1,  1];
    let checksY = [1, -1, 0, 1, 0,  0, -1,  0, 1, 1, 0, -1, -1,  0, -1,  1,  0,  1, -1,  0,  1, -1,  1, -1,  1, -1];
    let checksZ = [1, -1, 0, 0, 1,  0,  0, -1, 0, 1, 1,  0, -1, -1,  0, -1,  1,  0,  1, -1, -1,  1,  1,  1, -1, -1];
    //console.log(State1);

    //let checksX = [1, 0, 0, -1, 0, 0];
    //let checksY = [0, 1, 0, 0, -1, 0];
    //let checksZ = [0, 0, 1, 0, 0, -1];

    let numNeighbors = 26;

    let buffer = new Uint8Array(128 * 128 * 128);
    
    for (var z = 0; z < 128; z++)
    {
        for (var y = 0; y < 128; y++)
        {
            for (var x = 0; x < 128; x++)
            {   
                if (notOnEdge(x, y, z) && minX - 2 <= x && x <= maxX + 2 && minY - 2 <= y && y <= maxY + 2 && minZ - 2 <= z && z <= maxZ + 2)
                {
                    if (x <= minX)
                    {
                        minX = x;
                    }
                    if (y <= minY)
                    {
                        minY = y;
                    }
                    if (z <= minZ)
                    {
                        minZ = z;
                    }
                    if (x >= maxX)
                    {
                        maxX = x;
                    }
                    if (y >= maxY)
                    {
                        maxY = y;
                    }
                    if (z >= maxZ)
                    {
                        maxZ = z;
                    }
                    if (getValue(inArray, x, y, z) == 0)
                    {
                        let count1 = 0;
                        for (var i = 0; i < numNeighbors; i++)
                        {
                            if (getValue(inArray, x + checksX[i], y + checksY[i], z + checksZ[i]) == 1)
                            {
                                count1++;
                            }
                        }
                        setValue(buffer, x, y, z, State0[count1]);
                    }
                    else if (getValue(inArray, x, y, z) == 1)
                    {
                        let count1 = 0;
                        for (var i = 0; i < numNeighbors; i++)
                        {
                            if (getValue(inArray, x + checksX[i], y + checksY[i], z + checksZ[i]) == 1)
                            {
                                count1++;
                            }
                        }
                        setValue(buffer, x, y, z, State1[count1]);
                    }
                    else if (getValue(inArray, x, y, z) == 2)
                    {
                        let count1 = 0;
                        for (var i = 0; i < numNeighbors; i++)
                        {
                            if (getValue(inArray, x + checksX[i], y + checksY[i], z + checksZ[i]) == 1)
                            {
                                count1++;
                            }
                        }
                        setValue(buffer, x, y, z, State2[count1]);
                    }
                    else if (getValue(inArray, x, y, z) == 3)
                    {
                        let count1 = 0;
                        for (var i = 0; i < numNeighbors; i++)
                        {
                            if (getValue(inArray, x + checksX[i], y + checksY[i], z + checksZ[i]) == 1)
                            {
                                count1++;
                            }
                        }
                        setValue(buffer, x, y, z, State3[count1]);
                    }
                    else
                    {
                        setValue(buffer, x, y, z, 0);
                    }
                }
                else
                {
                    setValue(buffer, x, y, z, 0);
                }
            }
        }
    }
    
    for (var i = 0; i < 128; i++)
    {
        for (var j = 0; j < 128; j++)
        {
            for (var k = 0; k < 128; k++)
            {
                setValue(inArray, i, j, k, getValue(buffer, i, j, k));
                if (getValue(buffer, i, j, k) != 0) {
                    //console.log(getValue(buffer, i, j, k));
                }
                

            }
        }
    }

    return inArray;
}

function resetArray(state) {
    //let state = new Uint8Array(128 * 128 * 128);
    for (var z = 1; z < 128; z++)
    {
        for (var y = 1; y < 128; y++)
        {
            for (var x = 1; x < 128; x++)
            {
               if (Math.abs(64 - x) < 4 && Math.abs(64 - y) < 4 && Math.abs(64 - z) < 4)
               {
                   if (Math.random() * 12 < 1)
                   {
                        setValue(state, x, y, z, 1.);
                   }
                   else
                   {
                       setValue(state, x, y, z, 0);
                   }
               } 
               else {
                   setValue(state, x, y, z, 0);
               }            
            }
        }
    }
    return state;
}