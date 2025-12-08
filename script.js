const CONFIG = {
    gridSize: 30,
    blockSize: 120,
    streetWidth: 40,
    numStops: 40,
    baseSize: 5000,
    transferPenalty: 15, // Costo algorítmico
    timePerBlock: 1,     // Minutos por cuadra (velocidad bus)
    timePerTransfer: 5   // Minutos por espera de transbordo
};

let seed = 12345;
function seededRandom() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

const BUS_LINES_CONFIG = [
    { id: 'L1', name: 'Línea Norte (Roja)', color: '#ef4444' },
    { id: 'L2', name: 'Línea Sur (Azul)', color: '#3b82f6' },
    { id: 'L3', name: 'Línea Oeste (Verde)', color: '#22c55e' },
    { id: 'L4', name: 'Línea Este (Naranja)', color: '#f97316' },
    { id: 'L5', name: 'Línea Transversal (Morada)', color: '#a855f7' }
];

const svg = document.getElementById('city-svg');
const mapContainer = document.getElementById('map-container');
const cityLayer = document.getElementById('city-layer');
const linesLayer = document.getElementById('lines-layer');
const stopsLayer = document.getElementById('stops-layer');
const markersLayer = document.getElementById('markers-layer');
const connectionsLayer = document.getElementById('connections-layer');
const busLayer = document.getElementById('bus-layer');

const startSelect = document.getElementById('start-select');
const endSelect = document.getElementById('end-select');
const calcBtn = document.getElementById('calc-btn');
const resetBtn = document.getElementById('reset-btn');
const statusMsg = document.getElementById('status-msg');
const linesLegend = document.getElementById('lines-legend');
const maintenanceToggle = document.getElementById('maintenance-mode'); // Nuevo

const controlPanel = document.getElementById('control-panel');
const collapseBtn = document.getElementById('collapse-btn');
const expandBtn = document.getElementById('expand-btn');

const instructionsPanel = document.getElementById('instructions-panel');
const routeSteps = document.getElementById('route-steps');
const routeSummary = document.getElementById('route-summary');
const closeInstructionsBtn = document.getElementById('close-instructions');

let nodes = [];
let stops = [];
let graph = {};
let busLines = [];
let currentBusAnim = null;
let zoomScale = 1;

class Node {
    constructor(id, x, y, col, row) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.col = col;
        this.row = row;
        this.isStop = false;
        this.isTransfer = false;
        this.isOutOfService = false; // Nuevo estado
        this.stopName = "";
        this.lines = [];
    }
}

function initCity() {
    const totalCellSize = CONFIG.blockSize + CONFIG.streetWidth;

    for (let row = 0; row <= CONFIG.gridSize; row++) {
        for (let col = 0; col <= CONFIG.gridSize; col++) {
            const x = col * totalCellSize + CONFIG.streetWidth / 2;
            const y = row * totalCellSize + CONFIG.streetWidth / 2;

            const nodeId = `${col}_${row}`;
            const node = new Node(nodeId, x, y, col, row);
            nodes.push(node);
            graph[nodeId] = {};

            if (row < CONFIG.gridSize && col < CONFIG.gridSize) {
                drawBlock(col, row, totalCellSize);
            }
        }
    }
    generateFixedBusNetwork();
    assignTransferStops();
    assignRandomStops();
    centerMap();
    drawLegend();
}

function getPathSegment(startCol, startRow, endCol, endRow) {
    const path = [];
    let c = startCol;
    let r = startRow;
    while (c !== endCol) {
        path.push(`${c}_${r}`);
        c += (c < endCol) ? 1 : -1;
    }
    path.push(`${c}_${r}`);
    while (r !== endRow) {
        r += (r < endRow) ? 1 : -1;
        path.push(`${c}_${r}`);
    }
    return path;
}

function generateFixedBusNetwork() {
    const pathL1 = getPathSegment(0, 5, 30, 5);
    const pathL2 = getPathSegment(0, 25, 30, 25);
    const pathL3 = getPathSegment(5, 0, 5, 30);
    const pathL4 = getPathSegment(25, 0, 25, 30);

    let pathL5 = [];
    pathL5 = pathL5.concat(getPathSegment(5, 25, 10, 25));
    pathL5.pop();
    pathL5 = pathL5.concat(getPathSegment(10, 25, 10, 15));
    pathL5.pop();
    pathL5 = pathL5.concat(getPathSegment(10, 15, 20, 15));
    pathL5.pop();
    pathL5 = pathL5.concat(getPathSegment(20, 15, 20, 5));
    pathL5.pop();
    pathL5 = pathL5.concat(getPathSegment(20, 5, 25, 5));

    const paths = [pathL1, pathL2, pathL3, pathL4, pathL5];

    BUS_LINES_CONFIG.forEach((config, index) => {
        const lineNodes = paths[index];
        busLines.push({ ...config, path: lineNodes });

        for (let i = 0; i < lineNodes.length - 1; i++) {
            const u = lineNodes[i];
            const v = lineNodes[i + 1];

            if (!graph[u][v]) graph[u][v] = [];
            if (!graph[v][u]) graph[v][u] = [];

            graph[u][v].push({ weight: 1, line: config.color });
            graph[v][u].push({ weight: 1, line: config.color });

            const nodeU = nodes.find(n => n.id === u);
            if (nodeU && !nodeU.lines.includes(config.color)) nodeU.lines.push(config.color);

            if (i === lineNodes.length - 2) {
                const nodeV = nodes.find(n => n.id === v);
                if (nodeV && !nodeV.lines.includes(config.color)) nodeV.lines.push(config.color);
            }
        }
        drawStaticLine(lineNodes, config.color);
    });
}

function drawStaticLine(nodeIds, color) {
    const points = nodeIds.map(id => {
        const n = nodes.find(node => node.id === id);
        return `${n.x},${n.y}`;
    }).join(" ");

    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", points);
    polyline.setAttribute("class", "static-bus-line");
    polyline.setAttribute("stroke", color);
    linesLayer.appendChild(polyline);
}

function drawBlock(col, row, size) {
    const x = col * size + CONFIG.streetWidth;
    const y = row * size + CONFIG.streetWidth;
    const w = CONFIG.blockSize;
    const h = CONFIG.blockSize;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", w);
    rect.setAttribute("height", h);
    rect.setAttribute("rx", 5);
    rect.setAttribute("class", "block-rect");

    if (seededRandom() > 0.8) {
        rect.setAttribute("fill", "url(#parkPattern)");
        rect.setAttribute("stroke", "#86efac");
    } else {
        rect.setAttribute("fill", "url(#buildingPattern)");
        rect.setAttribute("stroke", "#94a3b8");
    }
    cityLayer.appendChild(rect);
}

function assignTransferStops() {
    const intersections = nodes.filter(n => n.lines.length > 1);
    intersections.forEach((node, idx) => {
        if (!node.isStop) {
            const tooClose = stops.some(s => {
                if (!s.isTransfer) return false;
                const dist = Math.abs(s.col - node.col) + Math.abs(s.row - node.row);
                return dist < 6;
            });

            if (!tooClose) {
                node.isStop = true;
                node.isTransfer = true;
                const zone = getZoneName(node.col, node.row);
                node.stopName = `Intercambiador ${zone}`;
                const dupCount = stops.filter(s => s.stopName.startsWith(`Intercambiador ${zone}`)).length;
                if (dupCount > 0) node.stopName += ` ${dupCount + 1}`;
                stops.push(node);
                drawStop(node);
                addOptionToSelects(node);
            }
        }
    });
}

function getZoneName(col, row) {
    if (col < 10 && row < 10) return "Noroeste";
    if (col > 20 && row < 10) return "Noreste";
    if (col < 10 && row > 20) return "Suroeste";
    if (col > 20 && row > 20) return "Sureste";
    if (row < 10) return "Norte";
    if (row > 20) return "Sur";
    if (col < 10) return "Oeste";
    if (col > 20) return "Este";
    return "Central";
}

function assignRandomStops() {
    const eligibleNodes = nodes.filter(n => n.lines.length > 0 && !n.isStop);
    if (eligibleNodes.length === 0) return;
    const prefixes = ["Av. Norte", "Plaza", "Calle", "Parque", "Estación", "Mercado", "Centro", "Hospital"];
    const suffixes = ["Azul", "Central", "Mayor", "Sol", "Luna", "Real", "Sur", "Oeste"];
    const shuffledNodes = [...eligibleNodes].sort(() => 0.5 - seededRandom());
    const count = Math.min(CONFIG.numStops, shuffledNodes.length);

    for (let i = 0; i < count; i++) {
        const node = shuffledNodes[i];
        node.isStop = true;
        const pIndex = Math.floor(seededRandom() * prefixes.length);
        const sIndex = Math.floor(seededRandom() * suffixes.length);
        node.stopName = `${prefixes[pIndex]} ${suffixes[sIndex]} (${i + 1})`;
        stops.push(node);
        drawStop(node);
        addOptionToSelects(node);
    }
}

function drawStop(node) {
    // Eliminar si ya existe (para redibujar estados)
    const existingGroup = document.getElementById(`stop-group-${node.id}`);
    if (existingGroup) existingGroup.remove();

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("id", `stop-group-${node.id}`);
    g.setAttribute("class", "bus-stop-group");
    if (node.isOutOfService) {
        g.classList.add('out-of-service');
    }
    g.style.cursor = "pointer";

    if (node.isTransfer) {
        const size = 24;
        const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bgRect.setAttribute("x", node.x - size / 2);
        bgRect.setAttribute("y", node.y - size / 2);
        bgRect.setAttribute("width", size);
        bgRect.setAttribute("height", size);
        bgRect.setAttribute("fill", "white");
        bgRect.setAttribute("stroke", "#1e293b");
        bgRect.setAttribute("stroke-width", 3);
        bgRect.setAttribute("rx", 4);

        const innerRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const innerSize = 14;
        innerRect.setAttribute("x", node.x - innerSize / 2);
        innerRect.setAttribute("y", node.y - innerSize / 2);
        innerRect.setAttribute("width", innerSize);
        innerRect.setAttribute("height", innerSize);
        innerRect.setAttribute("fill", "#0f172a");
        innerRect.setAttribute("rx", 2);

        g.appendChild(bgRect);
        g.appendChild(innerRect);
    } else {
        const bgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        bgCircle.setAttribute("cx", node.x);
        bgCircle.setAttribute("cy", node.y);
        bgCircle.setAttribute("r", 9);
        bgCircle.setAttribute("fill", "white");
        bgCircle.setAttribute("stroke", "#1e293b");
        bgCircle.setAttribute("stroke-width", 2);

        const innerCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        innerCircle.setAttribute("cx", node.x);
        innerCircle.setAttribute("cy", node.y);
        innerCircle.setAttribute("r", 5);
        innerCircle.setAttribute("fill", node.lines[0] || "#3b82f6");

        g.appendChild(bgCircle);
        g.appendChild(innerCircle);
    }

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = node.isOutOfService ? `${node.stopName}\n(FUERA DE SERVICIO)` : `${node.stopName}\nLíneas: ${node.lines.length}`;
    g.appendChild(title);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", node.x + 16);
    text.setAttribute("y", node.y + 4);
    text.setAttribute("font-family", "sans-serif");
    text.setAttribute("font-size", node.isTransfer ? "16" : "14");
    text.setAttribute("fill", node.isTransfer ? "#0f172a" : "#1e293b");
    text.setAttribute("font-weight", "bold");
    text.style.pointerEvents = "none";
    text.style.textShadow = "0px 0px 4px white, 0px 0px 4px white";

    let displayName = node.stopName;
    if (!node.isTransfer) {
        const parts = node.stopName.split(' ');
        displayName = parts[0] + ' ' + parts[1];
    }
    text.textContent = displayName;

    g.appendChild(text);
    g.addEventListener('click', () => handleStopClick(node.id));
    stopsLayer.appendChild(g);
}

function drawLegend() {
    BUS_LINES_CONFIG.forEach(line => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
                    <div class="legend-line" style="background-color: ${line.color}"></div>
                    <span>${line.name}</span>
                `;
        linesLegend.appendChild(item);
    });
}

function addOptionToSelects(node) {
    const optionA = document.createElement("option");
    optionA.value = node.id;
    optionA.text = node.stopName;
    startSelect.appendChild(optionA);
    const optionB = document.createElement("option");
    optionB.value = node.id;
    optionB.text = node.stopName;
    endSelect.appendChild(optionB);
}

function updateMarkers() {
    markersLayer.innerHTML = '';
    const startVal = startSelect.value;
    const endVal = endSelect.value;

    if (startVal) {
        const node = nodes.find(n => n.id === startVal);
        if (node) drawMarker(node, 'green', 'A');
    }
    if (endVal) {
        const node = nodes.find(n => n.id === endVal);
        if (node) drawMarker(node, 'red', 'B');
    }
}

function drawMarker(node, color, label) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "map-marker");
    g.setAttribute("transform", `translate(${node.x - 12}, ${node.y - 20}) scale(1)`);

    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#pin-icon");
    use.setAttribute("fill", color === 'green' ? '#16a34a' : '#dc2626');

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", 12);
    text.setAttribute("y", 12);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", "white");
    text.setAttribute("font-size", "10");
    text.setAttribute("font-weight", "bold");
    text.textContent = label;

    g.appendChild(use);
    g.appendChild(text);
    markersLayer.appendChild(g);
}

function handleStopClick(nodeId) {
    if (controlPanel.classList.contains('collapsed')) togglePanel();

    const node = nodes.find(n => n.id === nodeId);

    // Lógica de Modo Mantenimiento
    if (maintenanceToggle.checked) {
        node.isOutOfService = !node.isOutOfService;
        drawStop(node); // Redibujar para mostrar estado
        statusMsg.textContent = node.isOutOfService ? `Estación deshabilitada: ${node.stopName}` : `Estación habilitada: ${node.stopName}`;

        // Si la estación estaba seleccionada, limpiar selección
        if (startSelect.value === nodeId || endSelect.value === nodeId) {
            startSelect.value = "";
            endSelect.value = "";
            clearRoute();
            updateMarkers();
        }
        return;
    }

    // Si está fuera de servicio, no permitir selección
    if (node.isOutOfService) {
        statusMsg.innerHTML = `<span class="text-red-600 font-bold">¡Estación Fuera de Servicio!</span>`;
        return;
    }

    if (startSelect.value === "") {
        startSelect.value = nodeId;
        statusMsg.textContent = "Selecciona el destino (B)";
    } else if (endSelect.value === "") {
        if (startSelect.value !== nodeId) {
            endSelect.value = nodeId;
            statusMsg.textContent = "¡Listo para buscar!";
        }
    } else {
        startSelect.value = nodeId;
        endSelect.value = "";
        statusMsg.textContent = "Selecciona el destino (B)";
        clearRoute();
    }
    updateMarkers();
}

startSelect.addEventListener('change', () => { updateMarkers(); clearRoute(); });
endSelect.addEventListener('change', () => { updateMarkers(); clearRoute(); });

resetBtn.addEventListener('click', () => {
    startSelect.value = "";
    endSelect.value = "";
    clearRoute();
    updateMarkers();
    statusMsg.textContent = "Selección limpiada";
    resetZoom();
});

maintenanceToggle.addEventListener('change', () => {
    if (maintenanceToggle.checked) {
        statusMsg.textContent = "Modo Mantenimiento: Haz clic en estaciones para deshabilitarlas.";
    } else {
        statusMsg.textContent = "Modo Normal";
    }
});

function centerMap() { resetZoom(); }

// --- ALGORITMO DIJKSTRA ---
function calculateRoute() {
    const startId = startSelect.value;
    const endId = endSelect.value;

    if (!startId || !endId) {
        statusMsg.textContent = "Selecciona ambas paradas.";
        return;
    }
    if (startId === endId) return;

    // Verificar si inicio o fin están deshabilitados
    const startNode = nodes.find(n => n.id === startId);
    const endNode = nodes.find(n => n.id === endId);
    if (startNode.isOutOfService || endNode.isOutOfService) {
        statusMsg.innerHTML = `<span class="text-red-600">Origen o Destino fuera de servicio.</span>`;
        return;
    }

    clearRoute();
    statusMsg.textContent = "Calculando ruta óptima...";
    calcBtn.disabled = true;

    const minCosts = new Map();
    const prev = new Map();
    const pq = [];

    const startStateKey = `${startId}_null`;
    minCosts.set(startStateKey, 0);
    pq.push({ u: startId, cost: 0, arrivalLine: null });

    let finalStateKey = null;
    let minFinalCost = Infinity;

    while (pq.length > 0) {
        pq.sort((a, b) => a.cost - b.cost);
        const { u, cost, arrivalLine } = pq.shift();

        if (u === endId) {
            if (cost < minFinalCost) {
                minFinalCost = cost;
                finalStateKey = `${u}_${arrivalLine}`;
            }
            continue;
        }

        const currentKey = `${u}_${arrivalLine}`;
        if (cost > minCosts.get(currentKey)) continue;

        const neighbors = graph[u];
        if (!neighbors) continue;

        for (const v in neighbors) {
            const options = neighbors[v];

            for (const option of options) {
                const edgeLine = option.line;
                const weight = option.weight;
                let nextNodeId = v;
                let totalWeight = weight;
                let intermediateNodes = [];

                const neighborNode = nodes.find(n => n.id === v);

                // Si el vecino está fuera de servicio
                if (neighborNode && neighborNode.isOutOfService) {
                    // Si es la MISMA línea actual, buscar el siguiente disponible
                    if (arrivalLine === edgeLine) {
                        const busLine = busLines.find(bl => bl.color === edgeLine);
                        if (busLine) {
                            const pathIndex = busLine.path.indexOf(v);
                            if (pathIndex !== -1) {
                                let foundNext = false;
                                // Guardar todos los nodos intermedios
                                for (let i = pathIndex; i < busLine.path.length; i++) {
                                    const candidateId = busLine.path[i];
                                    const candidateNode = nodes.find(n => n.id === candidateId);

                                    intermediateNodes.push(candidateId);

                                    if (!candidateNode.isOutOfService) {
                                        nextNodeId = candidateId;
                                        totalWeight = i - pathIndex;
                                        foundNext = true;
                                        break;
                                    }
                                }
                                if (!foundNext) continue;
                            }
                        }
                    } else {
                        continue;
                    }
                }

                let newCost = cost + totalWeight;

                if (arrivalLine !== null && arrivalLine !== edgeLine) {
                    newCost += CONFIG.transferPenalty;
                }

                const nextKey = `${nextNodeId}_${edgeLine}`;
                const knownCost = minCosts.has(nextKey) ? minCosts.get(nextKey) : Infinity;

                if (newCost < knownCost) {
                    minCosts.set(nextKey, newCost);
                    prev.set(nextKey, {
                        fromId: u,
                        fromLine: arrivalLine,
                        usedLine: edgeLine,
                        intermediates: intermediateNodes
                    });
                    pq.push({ u: nextNodeId, cost: newCost, arrivalLine: edgeLine });
                }
            }
        }
    }

    if (minFinalCost === Infinity) {
        statusMsg.innerHTML = `<span class="text-red-500 font-bold">Ruta bloqueada por mantenimiento.</span>`;
        calcBtn.disabled = false;
        return;
    }

    const detailedPath = [];
    let currKey = finalStateKey;

    while (currKey) {
        const lastSep = currKey.lastIndexOf('_');
        const currId = currKey.substring(0, lastSep);

        const parentInfo = prev.get(currKey);

        if (!parentInfo) {
            break;
        }

        // Si hay nodos intermedios, agregarlos primero
        if (parentInfo.intermediates && parentInfo.intermediates.length > 1) {
            for (let i = 0; i < parentInfo.intermediates.length - 1; i++) {
                detailedPath.unshift({
                    from: parentInfo.intermediates[i],
                    to: parentInfo.intermediates[i + 1],
                    line: parentInfo.usedLine
                });
            }
        }

        detailedPath.unshift({
            from: parentInfo.fromId,
            to: currId,
            line: parentInfo.usedLine
        });

        currKey = `${parentInfo.fromId}_${parentInfo.fromLine}`;
    }

    visualizeRoute(detailedPath);
}

function visualizeRoute(detailedPath) {
    detailedPath.forEach(segment => {
        const n1 = nodes.find(n => n.id === segment.from);
        const n2 = nodes.find(n => n.id === segment.to);

        if (n1 && n2) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", n1.x);
            line.setAttribute("y1", n1.y);
            line.setAttribute("x2", n2.x);
            line.setAttribute("y2", n2.y);
            line.setAttribute("stroke", segment.line);
            line.setAttribute("class", "route-path");
            connectionsLayer.appendChild(line);
        }
    });

    const pathIds = [detailedPath[0].from, ...detailedPath.map(s => s.to)];
    animateBus(pathIds);

    const transbordos = calculateTransfers(detailedPath);
    statusMsg.innerHTML = `<span class="text-green-700 font-bold">Ruta encontrada</span>`;

    generateRouteInstructions(detailedPath, transbordos);

    autoFitRoute(pathIds);

    calcBtn.disabled = false;
}

function autoFitRoute(pathIds) {
    if (!pathIds.length) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    pathIds.forEach(id => {
        const n = nodes.find(node => node.id === id);
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
    });

    const padding = 200;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    const centerX = minX + (maxX - minX) / 2;
    const centerY = minY + (maxY - minY) / 2;

    const containerRect = mapContainer.getBoundingClientRect();

    const scaleX = containerRect.width / width;
    const scaleY = containerRect.height / height;
    const newScale = Math.min(scaleX, scaleY, 2.5);

    zoomTo(newScale, centerX, centerY);
}

function zoomTo(newScale, centerX, centerY) {
    svg.classList.add('no-transition');

    zoomScale = newScale;

    const newSize = CONFIG.baseSize * newScale;
    svg.style.width = `${newSize}px`;
    svg.style.height = `${newSize}px`;

    const scrollLeft = (centerX * newScale) - mapContainer.clientWidth / 2;
    const scrollTop = (centerY * newScale) - mapContainer.clientHeight / 2;

    mapContainer.scrollTo({
        left: scrollLeft,
        top: scrollTop,
        behavior: 'smooth'
    });

    setTimeout(() => svg.classList.remove('no-transition'), 100);
}

function calculateTransfers(detailedPath) {
    let transfers = 0;
    let currentLine = detailedPath[0].line;
    for (let i = 1; i < detailedPath.length; i++) {
        if (detailedPath[i].line !== currentLine) {
            transfers++;
            currentLine = detailedPath[i].line;
        }
    }
    return transfers;
}

function generateRouteInstructions(detailedPath, transferCount) {
    routeSteps.innerHTML = '';

    // CÁLCULO DE TIEMPO
    const blocksTraveled = detailedPath.length; // Cada elemento en detailedPath es un tramo de 1 cuadra
    const totalTime = (blocksTraveled * CONFIG.timePerBlock) + (transferCount * CONFIG.timePerTransfer);

    routeSummary.innerHTML = `
                <div class="flex flex-col gap-1 items-center justify-center">
                    <div class="font-bold text-xl text-slate-800 flex items-center gap-2">
                        <i class="fas fa-stopwatch text-blue-600 text-2xl"></i> ${Math.ceil(totalTime)} min
                    </div>
                    <div class="text-xs text-slate-500 font-medium">
                        Estimación: ${Math.ceil(totalTime * 0.9)} - ${Math.ceil(totalTime * 1.1)} min
                    </div>
                    <div class="text-[10px] text-slate-400 mt-1 uppercase tracking-wide font-bold">
                        ${blocksTraveled} paradas • ${transferCount} transbordo(s)
                    </div>
                </div>
            `;

    instructionsPanel.classList.remove('hidden-panel');

    const segments = [];
    let currentSeg = {
        line: detailedPath[0].line,
        from: detailedPath[0].from,
        to: detailedPath[0].to,
        blocks: 1 // Contador de bloques para tiempo parcial
    };

    for (let i = 1; i < detailedPath.length; i++) {
        const step = detailedPath[i];
        if (step.line === currentSeg.line) {
            currentSeg.to = step.to;
            currentSeg.blocks++;
        } else {
            segments.push(currentSeg);
            currentSeg = {
                line: step.line,
                from: step.from,
                to: step.to,
                blocks: 1
            };
        }
    }
    segments.push(currentSeg);

    segments.forEach((seg, index) => {
        const lineConfig = BUS_LINES_CONFIG.find(l => l.color === seg.line);
        const fromNode = nodes.find(n => n.id === seg.from);
        const toNode = nodes.find(n => n.id === seg.to);

        const fromName = fromNode.isStop ? fromNode.stopName : `Cruce (${fromNode.col}, ${fromNode.row})`;
        const toName = toNode.isStop ? toNode.stopName : `Cruce (${toNode.col}, ${toNode.row})`;

        // Tiempo del segmento
        const segTime = seg.blocks * CONFIG.timePerBlock;

        const div = document.createElement('div');
        div.className = "bg-white p-3 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden";
        div.style.borderLeft = `4px solid ${lineConfig.color}`;

        div.innerHTML = `
                    <div class="flex justify-between items-start mb-2 border-b border-slate-100 pb-2">
                        <div class="font-bold text-slate-800 text-sm">
                            ${lineConfig.name}
                        </div>
                        <div class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            ${Math.ceil(segTime)} min
                        </div>
                    </div>
                    <div class="space-y-2">
                        <div class="flex items-start">
                            <div class="flex flex-col items-center mr-2 mt-1">
                                <div class="w-2 h-2 rounded-full bg-green-500"></div>
                                <div class="w-0.5 h-full bg-slate-200 min-h-[12px]"></div>
                            </div>
                            <div>
                                <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Sube en</span>
                                <div class="text-xs text-slate-700 font-medium">${fromName}</div>
                            </div>
                        </div>
                        <div class="flex items-start">
                            <div class="flex flex-col items-center mr-2 mt-1">
                                <div class="w-2 h-2 rounded-full bg-red-400"></div>
                            </div>
                            <div>
                                <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Baja en</span>
                                <div class="text-xs text-slate-700 font-medium">${toName}</div>
                            </div>
                        </div>
                        <div class="text-[10px] text-slate-400 italic pl-4">
                            Viajas ${seg.blocks} parada(s)
                        </div>
                    </div>
                `;
        routeSteps.appendChild(div);

        if (index < segments.length - 1) {
            const transfer = document.createElement('div');
            transfer.className = "text-center text-slate-400 my-1 flex items-center justify-center gap-2";
            transfer.innerHTML = `
                        <div class="h-px bg-slate-200 flex-1"></div>
                        <div class="bg-slate-100 rounded-full p-1 px-3 border border-slate-200 flex items-center gap-1">
                             <i class="fas fa-walking text-slate-400 text-xs"></i>
                             <span class="text-[10px] uppercase font-bold tracking-wider text-slate-500">Transbordo (+${CONFIG.timePerTransfer} min)</span>
                        </div>
                        <div class="h-px bg-slate-200 flex-1"></div>
                    `;
            routeSteps.appendChild(transfer);
        }
    });
}

function animateBus(pathIds) {
    busLayer.innerHTML = '';
    cancelAnimationFrame(currentBusAnim);

    const busGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const busRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    busRect.setAttribute("x", -14);
    busRect.setAttribute("y", -9);
    busRect.setAttribute("width", 28);
    busRect.setAttribute("height", 18);
    busRect.setAttribute("fill", "#fbbf24");
    busRect.setAttribute("rx", 4);
    busRect.setAttribute("stroke", "#78350f");
    busRect.setAttribute("stroke-width", 1.5);
    const busText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    busText.setAttribute("x", 0);
    busText.setAttribute("y", 4);
    busText.setAttribute("text-anchor", "middle");
    busText.setAttribute("font-size", "8");
    busText.setAttribute("fill", "#78350f");
    busText.setAttribute("font-weight", "bold");
    busText.textContent = "BUS";
    busGroup.appendChild(busRect);
    busGroup.appendChild(busText);
    busLayer.appendChild(busGroup);

    let pointIndex = 0;
    let progress = 0;
    const speed = 0.10;

    function step() {
        if (pointIndex >= pathIds.length - 1) return;
        const startNode = nodes.find(n => n.id === pathIds[pointIndex]);
        const endNode = nodes.find(n => n.id === pathIds[pointIndex + 1]);
        const currentX = startNode.x + (endNode.x - startNode.x) * progress;
        const currentY = startNode.y + (endNode.y - startNode.y) * progress;
        const dx = endNode.x - startNode.x;
        const dy = endNode.y - startNode.y;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        busGroup.setAttribute("transform", `translate(${currentX}, ${currentY}) rotate(${angle})`);
        progress += speed;
        if (progress >= 1) {
            progress = 0;
            pointIndex++;
        }
        currentBusAnim = requestAnimationFrame(step);
    }
    step();
}

function clearRoute() {
    connectionsLayer.innerHTML = '';
    busLayer.innerHTML = '';
    routeSteps.innerHTML = '';
    instructionsPanel.classList.add('hidden-panel');
}

function togglePanel() {
    controlPanel.classList.toggle('collapsed');
    expandBtn.classList.toggle('visible');
}

function hideInstructions() {
    instructionsPanel.classList.add('hidden-panel');
}

collapseBtn.addEventListener('click', togglePanel);
expandBtn.addEventListener('click', togglePanel);
closeInstructionsBtn.addEventListener('click', hideInstructions);

mapContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    applyZoom(e.deltaY > 0 ? -0.1 : 0.1, e.clientX, e.clientY);
});

function applyZoom(delta, mouseX, mouseY) {
    svg.classList.add('no-transition');

    const oldScale = zoomScale;
    let newScale = Math.max(0.5, Math.min(oldScale + delta, 3.0));
    if (newScale === oldScale) return;
    zoomScale = newScale;

    if (mouseX === undefined) {
        const r = mapContainer.getBoundingClientRect();
        mouseX = r.left + r.width / 2; mouseY = r.top + r.height / 2;
    }
    const rect = mapContainer.getBoundingClientRect();
    const scrollLeft = mapContainer.scrollLeft;
    const scrollTop = mapContainer.scrollTop;
    const mouseXInContent = scrollLeft + (mouseX - rect.left);
    const mouseYInContent = scrollTop + (mouseY - rect.top);
    const ratioX = mouseXInContent / (CONFIG.baseSize * oldScale);
    const ratioY = mouseYInContent / (CONFIG.baseSize * oldScale);

    const newSize = CONFIG.baseSize * newScale;
    svg.style.width = `${newSize}px`;
    svg.style.height = `${newSize}px`;
    mapContainer.scrollLeft = (ratioX * newSize) - (mouseX - rect.left);
    mapContainer.scrollTop = (ratioY * newSize) - (mouseY - rect.top);

    setTimeout(() => svg.classList.remove('no-transition'), 100);
}

function resetZoom() {
    svg.classList.remove('no-transition');
    zoomScale = 1;
    svg.style.width = `${CONFIG.baseSize}px`;
    svg.style.height = `${CONFIG.baseSize}px`;
    const centerX = (CONFIG.gridSize * (CONFIG.blockSize + CONFIG.streetWidth)) / 2;
    mapContainer.scrollLeft = centerX - mapContainer.clientWidth / 2;
    mapContainer.scrollTop = centerX - mapContainer.clientHeight / 2;
}

let isDown = false;
let startX, startY, scrollLeft, scrollTop;

mapContainer.addEventListener('mousedown', (e) => {
    isDown = true;
    svg.classList.add('no-transition');
    startX = e.pageX - mapContainer.offsetLeft;
    startY = e.pageY - mapContainer.offsetTop;
    scrollLeft = mapContainer.scrollLeft;
    scrollTop = mapContainer.scrollTop;
});
mapContainer.addEventListener('mouseleave', () => { isDown = false; svg.classList.remove('no-transition'); });
mapContainer.addEventListener('mouseup', () => { isDown = false; svg.classList.remove('no-transition'); });
mapContainer.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - mapContainer.offsetLeft;
    const y = e.pageY - mapContainer.offsetTop;
    mapContainer.scrollLeft = scrollLeft - (x - startX);
    mapContainer.scrollTop = scrollTop - (y - startY);
});

calcBtn.addEventListener('click', calculateRoute);
initCity();