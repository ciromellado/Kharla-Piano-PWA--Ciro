const statusDiv = document.getElementById('status');
const keyboardDiv = document.getElementById('keyboard');
const presetSelect = document.getElementById('preset');
const midiInputSelect = document.getElementById('midi-input');
const midiOutputSelect = document.getElementById('midi-output');
const chordNameDisplay = document.getElementById('chord-name');
const notesDetectedDisplay = document.getElementById('notes-detected');

// Referencias a las perillas giratorias
const knobVolume = document.getElementById('knob-volume');
const valVolume = document.getElementById('val-volume');
const knobReverb = document.getElementById('knob-reverb');
const valReverb = document.getElementById('val-reverb');
const knobChorus = document.getElementById('knob-chorus');
const valChorus = document.getElementById('val-chorus');
const knobDelay = document.getElementById('knob-delay');
const valDelay = document.getElementById('val-delay');

const startNote = 36; // C2 (61 teclas)
const numKeys = 61;    
const midiElements = {};
const activeOscillators = {};
const activeNotesSet = new Set();

let sustainActive = false;
const sustainedNotes = new Set();

let currentMidiAccess = null;
let activeMidiInput = null;
let activeMidiOutput = null;

const noteNames = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx, mainMasterGain, convolverNode, wetGain, dryGain;

// Nodos para efectos DSP avanzados
let chorusInputNode, chorusOutputNode, chorusLFO, chorusDelay, chorusWetGain;
let delayNode, delayFeedbackNode, delayWetGain;

// Niveles iniciales (1 a 5)
let volumeLevel = 3; 
let reverbLevel = 2; 
let chorusLevel = 1; // 1 = Apagado
let delayLevel = 1;  // 1 = Apagado

let splendidPiano = null;
let splendidLoading = false;

function initAudioEngine() {
    if (audioCtx) return;
    audioCtx = new AudioContext();

    mainMasterGain = audioCtx.createGain();
    updateVolumeValue(volumeLevel);

    convolverNode = audioCtx.createConvolver();
    createReverbImpulse();

    wetGain = audioCtx.createGain();
    dryGain = audioCtx.createGain();
    updateReverbValue(reverbLevel);

    // Cadena base de audio: Master -> Chorus -> Delay -> Reverb/Dry -> Destino
    let lastNode = mainMasterGain;

    // Configuración de Chorus
    chorusInputNode = audioCtx.createGain();
    chorusOutputNode = audioCtx.createGain();
    setupChorusNodes();
    lastNode.connect(chorusInputNode);

    // Configuración de Delay
    delayNode = audioCtx.createDelay();
    delayNode.delayTime.value = 0.35; // 350 ms
    delayFeedbackNode = audioCtx.createGain();
    delayWetGain = audioCtx.createGain();
    
    // Bucle de delay
    delayNode.connect(delayFeedbackNode);
    delayFeedbackNode.connect(delayNode);

    // Aplicar valores iniciales de perillas de efectos
    updateChorusValue(chorusLevel);
    updateDelayValue(delayLevel);

    // Enrutamiento final de reverberación
    chorusOutputNode.connect(dryGain);
    chorusOutputNode.connect(convolverNode);
    convolverNode.connect(wetGain);

    dryGain.connect(audioCtx.destination);
    wetGain.connect(audioCtx.destination);
}

// --- CONFIGURACIÓN DE EFECTOS DSP ---

function setupChorusNodes() {
    chorusDelay = audioCtx.createDelay();
    chorusDelay.delayTime.value = 0.025; // 25ms

    chorusLFO = audioCtx.createOscillator();
    chorusLFO.frequency.value = 1.2; // 1.2 Hz
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.004;

    chorusLFO.connect(lfoGain);
    lfoGain.connect(chorusDelay.delayTime);
    chorusLFO.start();

    chorusWetGain = audioCtx.createGain();
    chorusWetGain.gain.value = 0.0;

    chorusInputNode.connect(chorusOutputNode); // Ruta seca
    chorusInputNode.connect(chorusDelay);      // Ruta húmeda modular
    chorusDelay.connect(chorusWetGain);
    chorusWetGain.connect(chorusOutputNode);
}

function updateChorusValue(level) {
    chorusLevel = level;
    rotateKnobVisual(knobChorus, level);

    if (!audioCtx) return;
    
    const wetValues = [0.0, 0.2, 0.4, 0.6, 0.8];
    const targetWet = wetValues[level - 1];

    if (chorusWetGain) {
        chorusWetGain.gain.setValueAtTime(targetWet, audioCtx.currentTime);
    }
    valChorus.textContent = level === 1 ? "OFF" : `Nivel ${level - 1}`;
}

function updateDelayValue(level) {
    delayLevel = level;
    rotateKnobVisual(knobDelay, level);

    if (!audioCtx) return;

    const delaySettings = [
        { wet: 0.0, fb: 0.0 },
        { wet: 0.2, fb: 0.25 },
        { wet: 0.4, fb: 0.35 },
        { wet: 0.6, fb: 0.45 },
        { wet: 0.8, fb: 0.55 }
    ];
    const settings = delaySettings[level - 1];

    if (delayWetGain && delayFeedbackNode && chorusOutputNode) {
        delayWetGain.gain.setValueAtTime(settings.wet, audioCtx.currentTime);
        delayFeedbackNode.gain.setValueAtTime(settings.fb, audioCtx.currentTime);

        try {
            chorusOutputNode.disconnect(delayNode);
            delayWetGain.disconnect();
        } catch(e) {}

        if (level > 1) {
            chorusOutputNode.connect(delayNode);
            delayNode.connect(delayWetGain);
            delayWetGain.connect(audioCtx.destination);
        }
    }
    valDelay.textContent = level === 1 ? "OFF" : `Nivel ${level - 1}`;
}

// --- CONTROL DE PERILLAS ---

function updateVolumeValue(level) {
    volumeLevel = level;
    const gainValues = [0.0, 0.25, 0.5, 0.75, 1.0];
    if (mainMasterGain && audioCtx) {
        mainMasterGain.gain.setValueAtTime(gainValues[level - 1], audioCtx.currentTime);
    }
    valVolume.textContent = `Nivel ${level}`;
    rotateKnobVisual(knobVolume, level);
}

function updateReverbValue(level) {
    reverbLevel = level;
    const reverbValues = [0.0, 0.2, 0.4, 0.6, 0.8];
    const actualMix = reverbValues[level - 1];
    if (wetGain && dryGain) {
        wetGain.gain.value = actualMix;
        dryGain.gain.value = 1.0 - (actualMix * 0.5);
    }
    valReverb.textContent = `Nivel ${level}`;
    rotateKnobVisual(knobReverb, level);
}

function rotateKnobVisual(knobElement, level) {
    const degrees = [-135, -67, 0, 67, 135];
    const indicator = knobElement.querySelector('.knob-indicator');
    if (indicator) {
        indicator.style.transform = `rotate(${degrees[level - 1]}deg)`;
    }
    knobElement.setAttribute('data-level', level);
}

// Eventos de clic para rotar perillas cíclicamente de 1 a 5
knobVolume.addEventListener('click', () => {
    let next = volumeLevel + 1; if (next > 5) next = 1;
    updateVolumeValue(next);
});

knobReverb.addEventListener('click', () => {
    let next = reverbLevel + 1; if (next > 5) next = 1;
    updateReverbValue(next);
});

knobChorus.addEventListener('click', () => {
    initAudioEngine();
    let next = chorusLevel + 1; if (next > 5) next = 1;
    updateChorusValue(next);
});

knobDelay.addEventListener('click', () => {
    initAudioEngine();
    let next = delayLevel + 1; if (next > 5) next = 1;
    updateDelayValue(next);
});

function createReverbImpulse() {
    if (!audioCtx) return;
    const rate = audioCtx.sampleRate;
    const length = rate * 2.5; 
    const impulse = audioCtx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
        const decay = Math.exp(-i / (rate * 0.5));
        left[i] = (Math.random() * 2 - 1) * decay;
        right[i] = (Math.random() * 2 - 1) * decay;
    }
    convolverNode.buffer = impulse;
}

// --- CARGA LAZY DE SPLENDID GRAND PIANO ---
async function ensureSplendidLoaded() {
    if (splendidPiano) return splendidPiano;
    if (splendidLoading) {
        while (splendidLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return splendidPiano;
    }
    
    splendidLoading = true;
    statusDiv.textContent = "⏳ Cargando Splendid Grand Piano...";
    
    try {
        initAudioEngine();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        
        let attempts = 0;
        while (!window.SplendidGrandPiano && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
        
        if (!window.SplendidGrandPiano) {
            throw new Error("La librería smplr no se cargó. Recarga la página.");
        }
        
        splendidPiano = new window.SplendidGrandPiano(audioCtx, {
            destination: mainMasterGain,
            volume: 100,
            velocity: 100
        });
        
        await splendidPiano.load;
        statusDiv.textContent = "✅ Splendid Grand Piano listo";
        splendidLoading = false;
        return splendidPiano;
        
    } catch (err) {
        console.error("Error cargando Splendid:", err);
        statusDiv.textContent = "❌ Error: " + err.message;
        splendidLoading = false;
        splendidPiano = null;
        throw err;
    }
}

presetSelect.addEventListener('change', async () => {
    if (presetSelect.value === 'splendid') {
        try {
            await ensureSplendidLoaded();
        } catch (e) {}
    }
});

function releaseSustainedNotes() {
    sustainedNotes.forEach(note => {
        const keyElement = midiElements[note];
        if (keyElement) {
            keyElement.classList.remove('active');
        }
        if (keyElement && !keyElement.hasAttribute('data-pressed')) {
            stopNoteInstance(note, true);
        }
    });
    sustainedNotes.clear();
}

function buildKeyboard() {
    const whiteKeyWidth = 36;
    let whiteIndex = 0;

    let totalWhiteKeys = 0;
    for (let i = 0; i < numKeys; i++) {
        const nInOct = (startNote + i) % 12;
        if (![1, 3, 6, 8, 10].includes(nInOct)) totalWhiteKeys++;
    }
    keyboardDiv.style.width = `${totalWhiteKeys * whiteKeyWidth}px`;

    for (let i = 0; i < numKeys; i++) {
        const noteNumber = startNote + i;
        const noteInOctave = noteNumber % 12;
        const octave = Math.floor(noteNumber / 12) - 1;
        const isBlack = [1, 3, 6, 8, 10].includes(noteInOctave);
        
        const key = document.createElement('div');
        key.className = `key ${isBlack ? 'black' : 'white'}`;
        key.dataset.note = noteNumber;
        
        key.innerHTML = `<span>${noteNames[noteInOctave]}</span><span style="font-size:0.5rem; opacity:0.6;">${octave}</span>`;

        const startNoteEvent = (e) => {
            if (e.cancelable) e.preventDefault();
            key.setAttribute('data-pressed', 'true');
            noteOn(noteNumber, 100, true);
        };
        const endNoteEvent = (e) => {
            if (e.cancelable) e.preventDefault();
            key.removeAttribute('data-pressed');
            noteOff(noteNumber, true);
        };

        key.addEventListener('mousedown', startNoteEvent);
        key.addEventListener('mouseup', endNoteEvent);
        key.addEventListener('mouseleave', () => {
            if (key.hasAttribute('data-pressed')) endNoteEvent(new Event('mouseup'));
        });
        key.addEventListener('touchstart', startNoteEvent, { passive: false });
        key.addEventListener('touchend', endNoteEvent, { passive: false });

        if (!isBlack) {
            key.style.left = `${whiteIndex * whiteKeyWidth}px`;
            keyboardDiv.appendChild(key);
            whiteIndex++;
        } else {
            key.style.left = `${(whiteIndex * whiteKeyWidth) - 11}px`;
            keyboardDiv.appendChild(key);
        }

        midiElements[noteNumber] = key;
    }
}
buildKeyboard();

function noteOn(note, velocity, fromMouse = false) {
    initAudioEngine();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const keyElement = midiElements[note];
    if (keyElement) keyElement.classList.add('active');

    activeNotesSet.add(note);
    updateChordRecognition();
    sustainedNotes.delete(note);
    
    const keysPlaying = Object.keys(activeOscillators);
    if (keysPlaying.length > 20) {
        const oldestNote = keysPlaying[0];
        stopNoteInstance(oldestNote, false);
    }

    if (activeOscillators[note]) stopNoteInstance(note, false);
    
    const currentPreset = presetSelect.value;
    if (currentPreset === 'splendid') {
        ensureSplendidLoaded().then(() => {
            activeOscillators[note] = playPianoNote(note, velocity, currentPreset);
        }).catch(() => {
            activeOscillators[note] = playPianoNote(note, velocity, 'grand');
        });
    } else {
        activeOscillators[note] = playPianoNote(note, velocity, currentPreset);
    }

    if (fromMouse && activeMidiOutput) {
        activeMidiOutput.send([144, note, velocity]);
    }
}

function noteOff(note, fromMouse = false) {
    const keyElement = midiElements[note];
    activeNotesSet.delete(note);
    updateChordRecognition();

    if (!sustainActive && keyElement) {
        keyElement.classList.remove('active');
    }

    if (sustainActive) {
        sustainedNotes.add(note);
    } else {
        stopNoteInstance(note, true);
    }

    if (fromMouse && activeMidiOutput) {
        activeMidiOutput.send([128, note, 0]);
    }
}

const chordDictionary = {
    "0,4,7": "Mayor", "0,3,7": "Menor", "0,4,8": "Aumentado (aug)", "0,3,6": "Disminuido (dim)",
    "0,2,7": "sus2", "0,5,7": "sus4", "0,5,10": "7sus4", "0,2,7,10": "9sus4",
    "0,4,7,10": "7 (Dominante)", "0,4,7,11": "Maj7", "0,3,7,10": "m7", "0,3,7,11": "mMaj7",
    "0,3,6,10": "m7(b5) / Semidisminuido", "0,3,6,9": "dim7", "0,4,8,10": "+7 / 7(#5)", "0,4,8,11": "Maj7(#5)",
    "0,4,7,9": "6", "0,3,7,9": "m6", "0,2,4,7": "add9", "0,2,3,7": "m(add9)",
    "0,4,7,10,14": "9", "0,4,7,11,14": "Maj9", "0,3,7,10,14": "m9", "0,4,7,10,13": "7(b9)", "0,4,7,10,15": "7(#9)",
    "0,3,6,10,13": "m9(b5)", "0,3,6,9,13": "dim9",
    "0,4,7,10,14,17": "11", "0,3,7,10,14,17": "m11", "0,4,7,10,14,21": "13", "0,4,7,11,14,21": "Maj13", "0,3,7,10,14,21": "m13", "0,4,7,10,14,18,21": "13(#11)"
};

function updateChordRecognition() {
    if (activeNotesSet.size === 0) {
        chordNameDisplay.textContent = "Esperando notas...";
        notesDetectedDisplay.textContent = "Ninguna";
        return;
    }

    const sortedNotes = Array.from(activeNotesSet).sort((a, b) => a - b);
    const noteNamesList = sortedNotes.map(n => `${noteNames[n % 12]}${Math.floor(n / 12) - 1}`);
    notesDetectedDisplay.textContent = noteNamesList.join(", ");

    if (activeNotesSet.size === 1) {
        chordNameDisplay.textContent = `${noteNames[sortedNotes[0] % 12]} (Nota Individual)`;
        return;
    }

    let bestMatch = null;
    for (let i = 0; i < sortedNotes.length; i++) {
        const root = sortedNotes[i];
        const intervals = sortedNotes.map(n => (n - root + 120) % 12).sort((a, b) => a - b);
        const uniqueIntervals = [];
        intervals.forEach(iv => { if (!uniqueIntervals.includes(iv)) uniqueIntervals.push(iv); });

        const keyPattern = uniqueIntervals.join(",");
        if (chordDictionary[keyPattern]) {
            const rootName = noteNames[root % 12];
            const chordQuality = chordDictionary[keyPattern];
            let inversionText = i > 0 ? ` / ${noteNames[sortedNotes[0] % 12]} (Inv)` : "";
            bestMatch = `${rootName} ${chordQuality}${inversionText}`;
            break;
        }
    }
    chordNameDisplay.textContent = bestMatch || "Acorde avanzado / Abierto";
}

function stopNoteInstance(note, gradualRelease = true) {
    if (activeOscillators[note]) {
        const instance = activeOscillators[note];
        
        if (instance.isSmplr && typeof instance.stop === 'function') {
            instance.stop();
        } else if (instance.oscs) {
            const { oscs, gainNode, filter } = instance;
            const now = audioCtx.currentTime;
            const releaseTime = gradualRelease ? 0.6 : 0.05; 

            try {
                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);
            } catch (e) {}

            setTimeout(() => {
                oscs.forEach(o => {
                    try { o.stop(); o.disconnect(); } catch (e) {}
                });
                try {
                    gainNode.disconnect();
                    if (filter) filter.disconnect();
                } catch (e) {}
            }, (releaseTime * 1000) + 20);
        }
        delete activeOscillators[note];
    }
}

function playPianoNote(midiNote, velocity, preset) {
    if (preset === 'splendid' && splendidPiano) {
        const stopFn = splendidPiano.start({ 
            note: midiNote, 
            velocity: velocity 
        });
        return { stop: stopFn, isSmplr: true };
    }
    
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const now = audioCtx.currentTime;
    const velocityScale = (velocity / 127);

    const gainNode = audioCtx.createGain();
    gainNode.connect(mainMasterGain);
    let oscs = [];

    if (preset === 'grand') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        osc1.type = 'triangle'; osc2.type = 'sine';
        osc1.frequency.value = freq; osc2.frequency.value = freq * 2;
        osc1.connect(gainNode); osc2.connect(gainNode);
        oscs = [osc1, osc2];

        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.linearRampToValueAtTime(0.4 * velocityScale, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.1, now + 1.0);
        osc1.start(now); osc2.start(now);
    } else if (preset === 'bright') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        osc1.type = 'sawtooth'; osc2.type = 'triangle';
        osc1.frequency.value = freq; osc2.frequency.value = freq;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 6, now);
        filter.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.8);

        osc1.connect(filter); osc2.connect(filter); filter.connect(gainNode);
        oscs = [osc1, osc2];

        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.linearRampToValueAtTime(0.3 * velocityScale, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.05, now + 1.2);
        osc1.start(now); osc2.start(now);
    } else if (preset === 'warm') {
        const osc1 = audioCtx.createOscillator();
        osc1.type = 'sine'; osc1.frequency.value = freq;
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = freq * 2.5;

        osc1.connect(filter); filter.connect(gainNode);
        oscs = [osc1];

        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.linearRampToValueAtTime(0.5 * velocityScale, now + 0.04);
        gainNode.gain.exponentialRampToValueAtTime(0.04, now + 1.8);
        osc1.start(now);
    } else {
        const osc1 = audioCtx.createOscillator();
        osc1.type = 'triangle';
        osc1.frequency.value = freq;
        osc1.connect(gainNode);
        oscs = [osc1];

        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.linearRampToValueAtTime(0.4 * velocityScale, now + 0.02);
        osc1.start(now);
    }

    return { oscs, gainNode, isSmplr: false };
}

if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
} else {
    statusDiv.textContent = "Web MIDI no soportado.";
}

function onMIDISuccess(midiAccess) {
    currentMidiAccess = midiAccess;
    updateMidiPorts();
    currentMidiAccess.onstatechange = () => updateMidiPorts();
}

function onMIDIFailure() {
    statusDiv.textContent = "Error al inicializar MIDI.";
}

function updateMidiPorts() {
    const inputs = Array.from(currentMidiAccess.inputs.values());
    const currentInId = midiInputSelect.value;
    midiInputSelect.innerHTML = '';

    if (inputs.length === 0) {
        midiInputSelect.add(new Option("Sin entradas USB", ""));
    } else {
        inputs.forEach(input => midiInputSelect.add(new Option(input.name, input.id)));
        if (inputs.some(i => i.id === currentInId)) midiInputSelect.value = currentInId;
    }
    connectInput();

    const outputs = Array.from(currentMidiAccess.outputs.values());
    const currentOutId = midiOutputSelect.value;
    midiOutputSelect.innerHTML = '<option value="">(Sin Salida)</option>';
    
    if (outputs.length > 0) {
        outputs.forEach(output => midiOutputSelect.add(new Option(output.name, output.id)));
        if (outputs.some(o => o.id === currentOutId)) midiOutputSelect.value = currentOutId;
    }
    connectOutput();
}

function connectInput() {
    if (activeMidiInput) {
        activeMidiInput.onmidimessage = null;
        activeMidiInput = null;
    }
    const selectedId = midiInputSelect.value;
    if (selectedId && currentMidiAccess) {
        const input = currentMidiAccess.inputs.get(selectedId);
        if (input) {
            activeMidiInput = input;
            activeMidiInput.onmidimessage = handleIncomingMidiMessage;
        }
    }
}

function connectOutput() {
    activeMidiOutput = null;
    const selectedId = midiOutputSelect.value;
    if (selectedId && currentMidiAccess) {
        const output = currentMidiAccess.outputs.get(selectedId);
        if (output) activeMidiOutput = output;
    }
}

midiInputSelect.addEventListener('change', connectInput);
midiOutputSelect.addEventListener('change', connectOutput);

function handleIncomingMidiMessage(message) {
    const statusByte = message.data[0];
    const data1 = message.data[1];
    const data2 = message.data[2];
    const command = statusByte & 0xF0; 

    if (command === 144) { 
        if (data2 > 0) noteOn(data1, data2, false);
        else noteOff(data1, false);
    } else if (command === 128) { 
        noteOff(data1, false);
    } else if (command === 176 && data1 === 64) { 
        sustainActive = data2 >= 64;
        if (!sustainActive) releaseSustainedNotes();
    }
}
