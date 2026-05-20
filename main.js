import Hydra from 'hydra-synth';

// Load all sketches dynamically from the /sketches folder
const rawSketches = import.meta.glob('./sketches/*.js', { query: '?raw', eager: true });

const sketches = Object.entries(rawSketches).map(([path, module]) => {
  const name = path.split('/').pop().replace('.js', '');
  
  // Sanitize: 
  // 1. Strip all comments
  // 2. Replace let/const with var
  const sanitizedCode = module.default
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '') // Strip comments
    .replace(/^(let|const)\s+/gm, 'var ')
    .replace(/\s(let|const)\s+/g, ' var ');
    
  return { name, code: sanitizedCode };
});

const canvas = document.getElementById('hydra-canvas');
const codeContent = document.getElementById('code-content');

// Hydra Initialization
const hydra = new Hydra({
  canvas: canvas,
  detectAudio: false,
  enableStreamCapture: false,
});

// Set resolution to match the window
hydra.setResolution(window.innerWidth, window.innerHeight);

// Keep resolution sharp if the window is resized
window.addEventListener('resize', () => {
  hydra.setResolution(window.innerWidth, window.innerHeight);
});

// Global State
let deck = [];
let discard = [];
let currentSketchIndex = 0;
let linesSwapped = 0;

// Fisher-Yates Shuffle
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Refill and shuffle the deck
function refillAndShuffleDeck() {
  const indices = Array.from({ length: sketches.length }, (_, i) => i);
  shuffle(indices);
  
  // Avoid consecutive duplicate with the current active card if sketches.length > 1
  if (sketches.length > 1 && indices[0] === currentSketchIndex) {
    [indices[0], indices[indices.length - 1]] = [indices[indices.length - 1], indices[0]];
  }
  deck = indices;
}

// Draw a card from the deck, refilling if empty
function drawCard() {
  if (deck.length === 0) {
    refillAndShuffleDeck();
  }
  return deck.shift();
}

// Peek at the next card in the deck (for pre-drawing)
function getNextIndex() {
  if (deck.length === 0) {
    refillAndShuffleDeck();
  }
  return deck[0];
}

// Initialize current sketch index by drawing our first card
currentSketchIndex = drawCard();

// Explicitly make hydra functions global
for (let key in hydra) {
  if (typeof hydra[key] === 'function') {
    window[key] = hydra[key].bind(hydra);
  }
}

const generators = ['osc', 'noise', 'voronoi', 'shape', 'gradient', 'src', 'solid', 'prev'];

function getAtoms(code) {
  const lines = code.split('\n').filter(l => l.trim() !== "");
  const snippets = [];
  const actions = [];
  let currentSnippet = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    const isPipe = trimmed.startsWith('.');
    const isGenerator = generators.some(g => trimmed.startsWith(g));

    if (isPipe || isGenerator) {
      if (currentSnippet.length > 0) {
        snippets.push(currentSnippet.join('\n'));
        currentSnippet = [];
      }
      actions.push(line);
    } else {
      currentSnippet.push(line);
    }
  });

  if (currentSnippet.length > 0) {
    snippets.push(currentSnippet.join('\n'));
  }

  return { snippets, actions };
}

function applyOrphanFilter(rawAtoms) {
  const result = [];
  
  for (let i = 0; i < rawAtoms.length; i++) {
    const atom = rawAtoms[i];
    const trimmed = atom.text.trim();
    
    if (trimmed.startsWith('.') && i > 0) {
      // Look back through the ACCEPTED result array
      let prevIdx = result.length - 1;
      while (prevIdx >= 0 && (result[prevIdx].text.trim() === "" || result[prevIdx].text.trim().startsWith('//'))) {
        prevIdx--;
      }

      if (prevIdx >= 0) {
        const prev = result[prevIdx].text.trim();
        const prevIsGenerator = generators.some(g => prev.startsWith(g));
        const prevIsPipe = prev.startsWith('.');
        const prevIsTerminal = prev.includes('.out(') || prev.endsWith('.out()');
        
        // Orphan if it follows something that isn't chainable OR if it follows a terminal pipe
        if ((!prevIsGenerator && !prevIsPipe) || prevIsTerminal) {
          result.push({ ...atom, isOrphan: true, text: atom.text.split('\n').map(l => `// (orphan) ${l}`).join('\n') });
          continue;
        }
      } else {
        result.push({ ...atom, isOrphan: true, text: atom.text.split('\n').map(l => `// (orphan) ${l}`).join('\n') });
        continue;
      }
    }
    result.push(atom);
  }
  return result;
}

function getBleedUnits(sketchA, sketchB) {
  const atomsA = getAtoms(sketchA.code);
  const atomsB = getAtoms(sketchB.code);
  
  const wrapA = (str, index, isAction) => {
    let removedAtStep;
    if (isAction) {
      removedAtStep = atomsB.snippets.length + index + 1;
    } else {
      const maxActions = Math.max(atomsA.actions.length, atomsB.actions.length);
      removedAtStep = atomsB.snippets.length + maxActions + index + 1;
    }
    return { text: str, source: 'A', removedAtStep };
  };
  
  const wrapB = (str, index, isAction) => {
    const stepOffset = isAction ? atomsB.snippets.length : 0;
    return { text: str, source: 'B', introducedAtStep: stepOffset + index + 1 };
  };

  const snippetsA = atomsA.snippets.map((str, idx) => wrapA(str, idx, false));
  const actionsA = atomsA.actions.map((str, idx) => wrapA(str, idx, true));
  const snippetsB = atomsB.snippets.map((str, idx) => wrapB(str, idx, false));
  const actionsB = atomsB.actions.map((str, idx) => wrapB(str, idx, true));

  const units = [];

  // Phase 1: Build Up (Introduce Target Variables)
  for (let i = 0; i <= snippetsB.length; i++) {
    const currentSnippetsB = snippetsB.slice(0, i);
    const rawAtoms = [...currentSnippetsB, ...snippetsA, ...actionsA];
    units.push(rawAtoms);
  }

  // Phase 2: Morph (Swap Actions)
  const maxActions = Math.max(actionsA.length, actionsB.length);
  for (let i = 1; i <= maxActions; i++) {
    const currentActions = [
      ...actionsB.slice(0, i),
      ...actionsA.slice(i)
    ];
    const rawAtoms = [...snippetsB, ...snippetsA, ...currentActions];
    units.push(rawAtoms);
  }

  // Phase 3: Tear Down (Remove Old Variables)
  for (let i = 1; i <= snippetsA.length; i++) {
    const currentSnippetsA = snippetsA.slice(i);
    const rawAtoms = [...snippetsB, ...currentSnippetsA, ...actionsB];
    units.push(rawAtoms);
  }

  return {
    logicSteps: units,
    masterAtoms: { snippetsA, actionsA, snippetsB, actionsB, maxActions }
  };
}

function flattenToLines(atoms) {
  const lines = [];
  for (const atom of atoms) {
    const atomLines = atom.text.split('\n');
    for (const l of atomLines) {
      lines.push({ text: l, source: atom.source, introducedAtStep: atom.introducedAtStep, removedAtStep: atom.removedAtStep });
    }
  }
  return lines;
}

function ensureOuts(atoms) {
  const lines = flattenToLines(atoms);
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    
    const isComment = lines[i].text.trim().startsWith('//');
    if (isComment) continue;
    
    let chainEndsHere = true;
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j].text.trim();
      if (nextLine.startsWith('//') || nextLine === "") continue;
      
      if (nextLine.startsWith('.')) {
        chainEndsHere = false;
      }
      break; 
    }
    
    if (chainEndsHere) {
      const curr = lines[i].text.trim();
      const isGenerator = generators.some(g => curr.startsWith(g));
      const isPipe = curr.startsWith('.');
      const hasOut = curr.includes('.out(') || curr.endsWith('.out()');
      
      if ((isGenerator || isPipe) && !hasOut) {
        result.push({ text: '.out()', source: lines[i].source, introducedAtStep: lines[i].introducedAtStep, removedAtStep: lines[i].removedAtStep, isForcedOut: true });
      }
    }
  }
  return result;
}

const bleedCache = {};
function getCachedBleedUnits(indexA, indexB) {
  const key = `${indexA}-${indexB}`;
  if (!bleedCache[key]) {
    bleedCache[key] = getBleedUnits(sketches[indexA], sketches[indexB]);
  }
  return bleedCache[key];
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

let continuousSwapped = 0;

function updateRender() {
  const sketchA = sketches[currentSketchIndex];
  const nextIndex = getNextIndex();
  const sketchB = sketches[nextIndex];

  const bleedData = getCachedBleedUnits(currentSketchIndex, nextIndex);
  const maxSteps = bleedData.logicSteps.length - 1;
  
  // Logical execution state (Hidden from user, highly sanitized)
  const logicalStep = Math.max(0, Math.min(linesSwapped, maxSteps));
  const activeCodeRaw = bleedData.logicSteps[logicalStep];
  const activeCodeOrphaned = applyOrphanFilter(activeCodeRaw);
  const activeCodeObjects = ensureOuts(activeCodeOrphaned);
  const activeCode = activeCodeObjects.map(o => o.text).join('\n');
  
  // Visual HTML state (Clean abstract representation with typing and deleting effect)
  const visualAtoms = [];
  const { snippetsA, actionsA, snippetsB, actionsB, maxActions } = bleedData.masterAtoms;
  
  for (const b of snippetsB) {
    if (continuousSwapped > b.introducedAtStep - 1) visualAtoms.push(b);
  }
  for (const a of snippetsA) {
    if (continuousSwapped < a.removedAtStep) visualAtoms.push(a);
  }
  for (let i = 0; i < maxActions; i++) {
    const a = actionsA[i];
    const b = actionsB[i];
    const K = snippetsB.length + i + 1;
    
    if (continuousSwapped < K - 1) {
      if (a) visualAtoms.push(a);
    } else if (continuousSwapped >= K) {
      if (b) visualAtoms.push(b);
    } else {
      if (a) visualAtoms.push(a);
      if (b) visualAtoms.push(b);
    }
  }
  // We run the visual buffer through the same filters to detect orphans and forced outs
  const visualAtomsOrphaned = applyOrphanFilter(visualAtoms);
  const visualCodeLines = ensureOuts(visualAtomsOrphaned);
  
  const caret = '█';
  
  const activeHTML = visualCodeLines.map(o => {
    let text = o.text;
    
    // Strip the internal engine hack text for visual display
    if (o.isOrphan) {
      text = text.replace(/^\/\/ \(orphan\) /gm, '');
    }
    
    const colorClass = o.source === 'A' ? 'code-old' : 'code-new';
    
    if (colorClass === 'code-new' && o.introducedAtStep !== undefined) {
      let localProgress = continuousSwapped - o.introducedAtStep + 1;
      localProgress = Math.max(0, Math.min(localProgress, 1));
      
      if (localProgress < 1) {
        const revealCount = Math.floor(text.length * localProgress);
        const cursor = localProgress > 0 ? caret : '';
        text = text.slice(0, revealCount) + cursor;
      }
    }
    
    if (colorClass === 'code-old' && o.removedAtStep !== undefined) {
      let localProgress = o.removedAtStep - continuousSwapped;
      localProgress = Math.max(0, Math.min(localProgress, 1));
      
      if (localProgress < 1) {
        const revealCount = Math.floor(text.length * localProgress);
        const cursor = localProgress > 0 ? caret : '';
        text = text.slice(0, revealCount) + cursor;
      }
    }
    
    let html = `<span class="${colorClass}">${escapeHTML(text)}</span>`;
    if (o.isOrphan) html = `<span class="orphan">${html}</span>`;
    if (o.isForcedOut) html = `<span class="forced-out">${html}</span>`;
    
    return html;
  }).filter(line => !line.includes('><')).join('\n'); // drop truly empty lines to avoid vertical jumps
  
  try {
    window.speed = 1;
    window.bpm = 30;
    render(o0);
    
    eval(activeCode);
    codeContent.innerHTML = activeHTML;
  } catch (e) {
    console.error("Bleed Error:", e);
    codeContent.style.color = '#ff4b4b';
  }
}

let transitionAnimationId = null;
let currentAnimationDirection = null;

function finishCurrentTransition() {
  if (!transitionAnimationId) return;
  cancelAnimationFrame(transitionAnimationId);
  transitionAnimationId = null;
  
  if (currentAnimationDirection === 'forward') {
    discard.push(currentSketchIndex);
    currentSketchIndex = drawCard();
  }
  
  linesSwapped = 0;
  continuousSwapped = 0;
  updateRender();
}

function animateTransition(direction) {
  if (transitionAnimationId) finishCurrentTransition();
  
  currentAnimationDirection = direction;
  const duration = 2000; // 2 seconds
  const startTime = performance.now();
  const startLines = linesSwapped;

  if (direction === 'forward') {
    const nextIndex = getNextIndex();
    const bleedData = getCachedBleedUnits(currentSketchIndex, nextIndex);
    const maxSteps = bleedData.logicSteps.length - 1;
    
    function step(time) {
      const elapsed = time - startTime;
      const progress = Math.max(0, Math.min(elapsed / duration, 1));
      
      continuousSwapped = startLines + (maxSteps - startLines) * progress;
      linesSwapped = Math.floor(continuousSwapped);
      updateRender();
      
      if (progress < 1) {
        transitionAnimationId = requestAnimationFrame(step);
      } else {
        discard.push(currentSketchIndex);
        currentSketchIndex = drawCard();
        linesSwapped = 0;
        continuousSwapped = 0;
        updateRender();
        transitionAnimationId = null;
        currentAnimationDirection = null;
      }
    }
    transitionAnimationId = requestAnimationFrame(step);
  } else {
    // Backward
    if (linesSwapped === 0) {
      if (discard.length === 0) {
        currentAnimationDirection = null;
        return; // Can't go backward, no discard pile
      }
      const prev = discard.pop();
      deck.unshift(currentSketchIndex);
      currentSketchIndex = prev;
      
      const nextIndex = getNextIndex();
      const bleedData = getCachedBleedUnits(currentSketchIndex, nextIndex);
      linesSwapped = bleedData.logicSteps.length - 1;
      continuousSwapped = linesSwapped;
    }
    const currentStartLines = linesSwapped;

    function step(time) {
      const elapsed = time - startTime;
      const progress = Math.max(0, Math.min(elapsed / duration, 1));
      
      continuousSwapped = Math.max(currentStartLines - currentStartLines * progress, 0);
      linesSwapped = Math.ceil(continuousSwapped); // Keep the logic step high until we fully cross
      updateRender();
      
      if (progress < 1) {
        transitionAnimationId = requestAnimationFrame(step);
      } else {
        linesSwapped = 0;
        continuousSwapped = 0;
        updateRender();
        transitionAnimationId = null;
        currentAnimationDirection = null;
      }
    }
    transitionAnimationId = requestAnimationFrame(step);
  }
}

function animateSingleStep(targetStep) {
  if (transitionAnimationId) {
    cancelAnimationFrame(transitionAnimationId);
    transitionAnimationId = null;
    currentAnimationDirection = null;
  }
  
  linesSwapped = targetStep;
  const duration = 150; // 150ms for a snappy manual step
  const startTime = performance.now();
  const startContinuous = continuousSwapped;
  
  function step(time) {
    const elapsed = time - startTime;
    const progress = Math.max(0, Math.min(elapsed / duration, 1));
    
    continuousSwapped = startContinuous + (targetStep - startContinuous) * progress;
    updateRender();
    
    if (progress < 1) {
      transitionAnimationId = requestAnimationFrame(step);
    } else {
      transitionAnimationId = null;
    }
  }
  transitionAnimationId = requestAnimationFrame(step);
}

// Key Controls
window.addEventListener('keydown', (e) => {
  const nextIndex = getNextIndex();
  const bleedData = getCachedBleedUnits(currentSketchIndex, nextIndex);
  const maxSteps = bleedData.logicSteps.length - 1;

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (e.shiftKey) {
      let target = linesSwapped + 1;
      if (target > maxSteps) {
        discard.push(currentSketchIndex);
        currentSketchIndex = drawCard();
        if (transitionAnimationId) { cancelAnimationFrame(transitionAnimationId); transitionAnimationId = null; currentAnimationDirection = null; }
        linesSwapped = 0;
        continuousSwapped = 0;
        updateRender();
      } else {
        animateSingleStep(target);
      }
    } else {
      animateTransition('forward');
    }
  }

  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (e.shiftKey) {
      let target = linesSwapped - 1;
      if (target < 0) {
        if (discard.length > 0) {
          const prev = discard.pop();
          deck.unshift(currentSketchIndex);
          currentSketchIndex = prev;
          
          const nextIndex = getNextIndex();
          const prevBleedData = getCachedBleedUnits(currentSketchIndex, nextIndex);
          target = prevBleedData.logicSteps.length - 1;
          
          if (transitionAnimationId) { cancelAnimationFrame(transitionAnimationId); transitionAnimationId = null; currentAnimationDirection = null; }
          linesSwapped = target;
          continuousSwapped = target;
          updateRender();
        }
      } else {
        animateSingleStep(target);
      }
    } else {
      if (discard.length > 0) {
        animateTransition('backward');
      }
    }
  }
});

// Initial Render
updateRender();

console.log("Hydra Site Initialized: Imperative Mode");
