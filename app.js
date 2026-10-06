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

// Referencias para el Nord Synth Pad
const btnPadToggle = document.getElementById('btn-pad-toggle');
const padPresetSelect = document.getElementById('pad-preset');
const knobPadVol = document.getElementById('knob-pad-vol');
const valPadVol = document.getElementById('val-pad-vol');

const startNote = 36; // C2 (61 teclas)
const numKeys = 61;
const midiElements = {};
const activeOscillators = {};
const activePadOscillators = {};
const activeNotesSet = new Set();
let sustainActive = false;
const sustainedNotes = new Set();
let currentMidiAccess = null;
let activeMidiInput = null;
let activeMidiOutput = null;

const noteNames = ["Do ", "Do# ", "Re ", "Re# ", "Mi ", "Fa ", "Fa# ", "Sol ", "Sol# ", "La ", "La# ", "Si "];

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx, mainMasterGain, convolverNode, wetGain, dryGain;

// Nodos para efectos DSP avanzados (globales)
let chorusInputNode, chorusOutputNode, chorusLFO, chorusDelay, chorusWetGain;
let delayNode, delayFeedbackNode, delayWetGain;

// === Nodo de entrada del Splendid y cadenas de efectos por preset ===
let splendidInputNode = null; 
let presetChains = {};        
let currentSplendidChain = null; 

// Niveles iniciales (1 a 5)
let volumeLevel = 3;
let reverbLevel = 2;
let chorusLevel = 1;
let delayLevel = 1;

// Estado del Nord Synth Pad
let padEnabled = false;
let padVolumeLevel = 3;

let splendidPiano = null;
let splendidLoading = false;

// Variable para almacenar el archivo decodificado en memoria y no cargarlo cada vez
let u20AudioBuffer = null;

// Función para cargar el C4.mp3 la primera vez que se seleccione o se use
async function loadU20Sample() {
    if (u20AudioBuffer) return u20AudioBuffer;
    try {
        const response = await fetch('U20/C4.mp3');
        const arrayBuffer = await response.arrayBuffer();
        u20AudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        return u20AudioBuffer;
    } catch (e) {
        console.error("No se pudo cargar el archivo U20/C4.mp3:", e);
        return null;
    }
}

// Función para reproducir la nota usando tu C4.mp3 con pitch y sonido puro
function playU20Note(midiNote, velocity) {
    let stopFunction = null;
    let isStoppedBeforeLoad = false;

    loadU20Sample().then(buffer => {
        if (!buffer || isStoppedBeforeLoad) return;

        const source = audioCtx.createBufferSource();
        const gainNode = audioCtx.createGain();

        source.buffer = buffer;

        // Ajuste de afinación (pitch) basado en C4 (MIDI 60) para que cada tecla suene en su tono correcto
        const semitones = midiNote - 60;
        source.playbackRate.value = Math.pow(2, semitones / 12);

        // Control de volumen limpio basado en la velocidad MIDI
        const vol = (velocity / 127) * 0.9;
        gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);

        // Conexión directa y pura al master (sin filtros ni síntesis adicional)
        source.connect(gainNode);
        gainNode.connect(mainMasterGain); 

        source.start(0);

        stopFunction = () => {
            const stopNow = audioCtx.currentTime;
            const releaseTime = 0.08; // Ligero desvanecimiento al soltar para evitar chasquidos
            try {
                gainNode.gain.cancelScheduledValues(stopNow);
                gainNode.gain.setValueAtTime(gainNode.gain.value, stopNow);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, stopNow + releaseTime);
                
                setTimeout(() => {
                    try {
                        source.stop();
                        source.disconnect();
                        gainNode.disconnect();
                    } catch(e) {}
                }, releaseTime * 1000 + 50);
            } catch(e) {
                try { source.stop(); } catch(err) {}
            }
        };

        if (activeOscillators[midiNote] && activeOscillators[midiNote].pendingStop) {
            stopFunction();
            delete activeOscillators[midiNote];
        } else {
            activeOscillators[midiNote] = { stop: stopFunction, isU20: true };
        }
    });

    return {
        stop: () => {
            if (stopFunction) {
                stopFunction();
            } else {
                isStoppedBeforeLoad = true;
                activeOscillators[midiNote] = { pendingStop: true };
            }
        },
        isU20: true
    };
}

// Presets que procesan el Splendid Grand Piano
const SPLENDID_DERIVED_PRESETS = ['grand_acoustic', 'bright_piano', 'warm_piano', 'electric_piano', 'honky_tonk'];

// === Caché única para los samples locales de la trompeta y el trombón ===
const trumpetBuffers = {};
const tromboneBuffers = {};

function initAudioEngine() {
    if (audioCtx) return;
    audioCtx = new AudioContext();
    
    mainMasterGain = audioCtx.createGain();
    updateVolumeValue(volumeLevel);
    
    // Nodo de entrada del Splendid
    splendidInputNode = audioCtx.createGain();
    splendidInputNode.gain.value = 1.0;
    
    convolverNode = audioCtx.createConvolver();
    createReverbImpulse();
    wetGain = audioCtx.createGain();
    dryGain = audioCtx.createGain();
    updateReverbValue(reverbLevel);
    
    createPresetChains();
    switchSplendidChain('grand_acoustic');
    
    let lastNode = mainMasterGain;
    
    chorusInputNode = audioCtx.createGain();
    chorusOutputNode = audioCtx.createGain();
    setupChorusNodes();
    lastNode.connect(chorusInputNode);
    
    delayNode = audioCtx.createDelay();
    delayNode.delayTime.value = 0.35;
    delayFeedbackNode = audioCtx.createGain();
    delayWetGain = audioCtx.createGain();
    delayNode.connect(delayFeedbackNode);
    delayFeedbackNode.connect(delayNode);
    
    updateChorusValue(chorusLevel);
    updateDelayValue(delayLevel);
    
    chorusOutputNode.connect(dryGain);
    chorusOutputNode.connect(convolverNode);
    convolverNode.connect(wetGain);
    dryGain.connect(audioCtx.destination);
    wetGain.connect(audioCtx.destination);
}

function createPresetChains() {
    const grandAcoustic = {
        compressor: audioCtx.createDynamicsCompressor(),
        eq: audioCtx.createBiquadFilter(),
        output: audioCtx.createGain()
    };
    grandAcoustic.compressor.threshold.value = -18;
    grandAcoustic.compressor.ratio.value = 2.5;
    grandAcoustic.compressor.attack.value = 0.02;
    grandAcoustic.compressor.release.value = 0.25;
    grandAcoustic.eq.type = 'peaking';
    grandAcoustic.eq.frequency.value = 800;
    grandAcoustic.eq.Q.value = 1;
    grandAcoustic.eq.gain.value = 2;
    grandAcoustic.output.gain.value = 1.1;
    grandAcoustic.compressor.connect(grandAcoustic.eq);
    grandAcoustic.eq.connect(grandAcoustic.output);
    grandAcoustic.output.connect(mainMasterGain);
    presetChains['grand_acoustic'] = grandAcoustic;

    const brightPiano = {
        highShelf: audioCtx.createBiquadFilter(),
        peaking: audioCtx.createBiquadFilter(),
        saturation: audioCtx.createWaveShaper(),
        output: audioCtx.createGain()
    };
    brightPiano.highShelf.type = 'highshelf';
    brightPiano.highShelf.frequency.value = 3000;
    brightPiano.highShelf.gain.value = 6;
    brightPiano.peaking.type = 'peaking';
    brightPiano.peaking.frequency.value = 5000;
    brightPiano.peaking.Q.value = 1.5;
    brightPiano.peaking.gain.value = 4;
    brightPiano.saturation.curve = makeSoftClipCurve(50);
    brightPiano.output.gain.value = 0.9;
    brightPiano.highShelf.connect(brightPiano.peaking);
    brightPiano.peaking.connect(brightPiano.saturation);
    brightPiano.saturation.connect(brightPiano.output);
    brightPiano.output.connect(mainMasterGain);
    presetChains['bright_piano'] = brightPiano;

    const warmPiano = {
        lowpass: audioCtx.createBiquadFilter(),
        lowShelf: audioCtx.createBiquadFilter(),
        output: audioCtx.createGain()
    };
    warmPiano.lowpass.type = 'lowpass';
    warmPiano.lowpass.frequency.value = 2800;
    warmPiano.lowpass.Q.value = 0.7;
    warmPiano.lowShelf.type = 'lowshelf';
    warmPiano.lowShelf.frequency.value = 250;
    warmPiano.lowShelf.gain.value = 3;
    warmPiano.output.gain.value = 1.15;
    warmPiano.lowpass.connect(warmPiano.lowShelf);
    warmPiano.lowShelf.connect(warmPiano.output);
    warmPiano.output.connect(mainMasterGain);
    presetChains['warm_piano'] = warmPiano;

    const electricPiano = {
        bandpass: audioCtx.createBiquadFilter(),
        tremoloLFO: audioCtx.createOscillator(),
        tremoloGain: audioCtx.createGain(),
        chorusDelay: audioCtx.createDelay(),
        chorusLFO: audioCtx.createOscillator(),
        chorusLFOGain: audioCtx.createGain(),
        output: audioCtx.createGain()
    };
    electricPiano.bandpass.type = 'bandpass';
    electricPiano.bandpass.frequency.value = 1200;
    electricPiano.bandpass.Q.value = 1.5;
    electricPiano.tremoloLFO.type = 'sine';
    electricPiano.tremoloLFO.frequency.value = 5;
    electricPiano.tremoloGain.gain.value = 0.3;
    electricPiano.tremoloLFO.connect(electricPiano.tremoloGain);
    electricPiano.chorusDelay.delayTime.value = 0.02;
    electricPiano.chorusLFO.type = 'sine';
    electricPiano.chorusLFO.frequency.value = 0.8;
    electricPiano.chorusLFOGain.gain.value = 0.003;
    electricPiano.chorusLFO.connect(electricPiano.chorusLFOGain);
    electricPiano.chorusLFOGain.connect(electricPiano.chorusDelay.delayTime);
    electricPiano.output.gain.value = 0.95;
    electricPiano.bandpass.connect(electricPiano.chorusDelay);
    electricPiano.chorusDelay.connect(electricPiano.output);
    electricPiano.output.connect(mainMasterGain);
    electricPiano.tremoloLFO.start();
    electricPiano.chorusLFO.start();
    presetChains['electric_piano'] = electricPiano;

    const honkyTonk = {
        highpass: audioCtx.createBiquadFilter(),
        lowpass: audioCtx.createBiquadFilter(),
        midBoost: audioCtx.createBiquadFilter(),
        output: audioCtx.createGain()
    };
    honkyTonk.highpass.type = 'highpass';
    honkyTonk.highpass.frequency.value = 400;
    honkyTonk.lowpass.type = 'lowpass';
    honkyTonk.lowpass.frequency.value = 3200;
    honkyTonk.midBoost.type = 'peaking';
    honkyTonk.midBoost.frequency.value = 1500;
    honkyTonk.midBoost.Q.value = 2;
    honkyTonk.midBoost.gain.value = 6;
    honkyTonk.output.gain.value = 1.2;
    honkyTonk.highpass.connect(honkyTonk.lowpass);
    honkyTonk.lowpass.connect(honkyTonk.midBoost);
    honkyTonk.midBoost.connect(honkyTonk.output);
    honkyTonk.output.connect(mainMasterGain);
    presetChains['honky_tonk'] = honkyTonk;
}

function makeSoftClipCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const nSamples = 44100;
    const curve = new Float32Array(nSamples);
    const deg = Math.PI / 180;
    for (let i = 0; i < nSamples; ++i) {
        const x = (i * 2) / nSamples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

function switchSplendidChain(presetName) {
    if (!splendidInputNode) return;
    try { splendidInputNode.disconnect(); } catch (e) {}
    
    if (SPLENDID_DERIVED_PRESETS.includes(presetName) && presetChains[presetName]) {
        const chain = presetChains[presetName];
        let inputNode;
        switch (presetName) {
            case 'grand_acoustic': inputNode = chain.compressor; break;
            case 'bright_piano': inputNode = chain.highShelf; break;
            case 'warm_piano': inputNode = chain.lowpass; break;
            case 'electric_piano': inputNode = chain.bandpass; break;
            case 'honky_tonk': inputNode = chain.highpass; break;
        }
        splendidInputNode.connect(inputNode);
        currentSplendidChain = presetName;
    } else {
        splendidInputNode.connect(mainMasterGain);
        currentSplendidChain = null;
    }
}

function setupChorusNodes() {
    chorusDelay = audioCtx.createDelay();
    chorusDelay.delayTime.value = 0.025;
    chorusLFO = audioCtx.createOscillator();
    chorusLFO.frequency.value = 1.2;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.004;
    chorusLFO.connect(lfoGain);
    lfoGain.connect(chorusDelay.delayTime);
    chorusLFO.start();
    chorusWetGain = audioCtx.createGain();
    chorusWetGain.gain.value = 0.0;
    chorusInputNode.connect(chorusOutputNode);
    chorusInputNode.connect(chorusDelay);
    chorusDelay.connect(chorusWetGain);
    chorusWetGain.connect(chorusOutputNode);
}

function updateChorusValue(level) {
    chorusLevel = level;
    rotateKnobVisual(knobChorus, level);
    if (!audioCtx) return;
    const wetValues = [0.0, 0.2, 0.4, 0.6, 0.8];
    const targetWet = wetValues[level - 1];
    if (chorusWetGain) chorusWetGain.gain.setValueAtTime(targetWet, audioCtx.currentTime);
    valChorus.textContent = level === 1 ? "OFF" : `Nivel ${level - 1}`;
}

function updateDelayValue(level) {
    delayLevel = level;
    rotateKnobVisual(knobDelay, level);
    if (!audioCtx) return;
    const delaySettings = [
        { wet: 0.0, fb: 0.0 }, { wet: 0.2, fb: 0.25 },
        { wet: 0.4, fb: 0.35 }, { wet: 0.6, fb: 0.45 }, { wet: 0.8, fb: 0.55 }
    ];
    const settings = delaySettings[level - 1];
    if (delayWetGain && delayFeedbackNode && chorusOutputNode) {
        delayWetGain.gain.setValueAtTime(settings.wet, audioCtx.currentTime);
        delayFeedbackNode.gain.setValueAtTime(settings.fb, audioCtx.currentTime);
        try { chorusOutputNode.disconnect(delayNode); delayWetGain.disconnect(); } catch(e) {}
        if (level > 1) {
            chorusOutputNode.connect(delayNode);
            delayNode.connect(delayWetGain);
            delayWetGain.connect(audioCtx.destination);
        }
    }
    valDelay.textContent = level === 1 ? "OFF" : `Nivel ${level - 1}`;
}

function updateVolumeValue(level) {
    volumeLevel = level;
    const gainValues = [0.0, 0.25, 0.5, 0.75, 1.0];
    if (mainMasterGain && audioCtx) mainMasterGain.gain.setValueAtTime(gainValues[level - 1], audioCtx.currentTime);
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

function updatePadVolValue(level) {
    padVolumeLevel = level;
    rotateKnobVisual(knobPadVol, level);
    valPadVol.textContent = `Nivel ${level}`;
}

function rotateKnobVisual(knobElement, level) {
    const degrees = [-135, -67, 0, 67, 135];
    const indicator = knobElement.querySelector('.knob-indicator');
    if (indicator) indicator.style.transform = `rotate(${degrees[level - 1]}deg)`;
    knobElement.setAttribute('data-level', level);
}

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
knobPadVol.addEventListener('click', () => {
    initAudioEngine();
    let next = padVolumeLevel + 1; if (next > 5) next = 1;
    updatePadVolValue(next);
});

btnPadToggle.addEventListener('click', () => {
    padEnabled = !padEnabled;
    if (padEnabled) {
        btnPadToggle.textContent = "ON";
        btnPadToggle.className = "pad-btn-on";
        btnPadToggle.style.background = "#ff8c00";
        btnPadToggle.style.color = "#000";
    } else {
        btnPadToggle.textContent = "OFF";
        btnPadToggle.className = "pad-btn-off";
        btnPadToggle.style.background = "#555";
        btnPadToggle.style.color = "#fff";
        Object.keys(activePadOscillators).forEach(note => stopPadInstance(note));
    }
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

async function ensureSplendidLoaded() {
    if (splendidPiano) return splendidPiano;
    if (splendidLoading) {
        while (splendidLoading) await new Promise(r => setTimeout(r, 100));
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
        if (!window.SplendidGrandPiano) throw new Error("La librería smplr no se cargó.");
        
        splendidPiano = new window.SplendidGrandPiano(audioCtx, {
            destination: splendidInputNode,
            volume: 100,
            velocity: 100
        });
        await splendidPiano.load;
        statusDiv.textContent = "✅ Splendid Grand Piano listo (con procesamiento DSP)";
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

window.addEventListener('DOMContentLoaded', () => {
    if (presetSelect.value === 'splendid' || SPLENDID_DERIVED_PRESETS.includes(presetSelect.value)) {
        ensureSplendidLoaded().catch(() => {});
    }
});

presetSelect.addEventListener('change', async () => {
    const selected = presetSelect.value;
    initAudioEngine();
    
    if (selected === 'splendid' || SPLENDID_DERIVED_PRESETS.includes(selected)) {
        try {
            await ensureSplendidLoaded();
            const chainToUse = selected === 'splendid' ? null : selected;
            if (chainToUse) {
                switchSplendidChain(chainToUse);
                statusDiv.textContent = `✅ ${getPresetDisplayName(selected)} (Splendid procesado)`;
            } else {
                try { splendidInputNode.disconnect(); } catch(e) {}
                splendidInputNode.connect(mainMasterGain);
                currentSplendidChain = null;
                statusDiv.textContent = "✅ Splendid Grand Piano (puro)";
            }
        } catch (e) {
            console.error(e);
        }
    } else {
        statusDiv.textContent = `🎹 ${getPresetDisplayName(selected)}`;
    }
});

function getPresetDisplayName(value) {
    const names = {
        'splendid': 'Splendid Grand Piano',
        'grand_acoustic': 'Grand Acoustic',
        'bright_piano': 'Bright Piano',
        'warm_piano': 'Warm Piano',
        'electric_piano': 'Electric Piano (Rhodes)',
        'honky_tonk': 'Honky-Tonk',
        'u20': 'Piano U20',
        'grand': 'Grand Acoustic (Sintetizado)',
        'bright': 'Bright (Sintetizado)',
        'warm': 'Warm (Sintetizado)',
        'dx7': 'Yamaha DX7',
        'wurlitzer': 'Wurlitzer',
        'acordeon_vallenato': 'Acordeón Vallenato',
        'acordeon_cumbia': 'Acordeón Cumbia',
        'hammond': 'Órgano Hammond',
        'tubos': 'Órgano de Tubos',
        'string1': 'String 1',
        'string2': 'String 2',
        'trompeta': 'Trompeta',
        'saxofon': 'Saxofón',
        'trombon': 'Trombón'
    };
    return names[value] || value;
}

function releaseSustainedNotes() {
    sustainedNotes.forEach(note => {
        const keyElement = midiElements[note];
        if (keyElement) keyElement.classList.remove('active');
        if (keyElement && !keyElement.hasAttribute('data-pressed')) {
            stopNoteInstance(note, true);
            stopPadInstance(note);
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

// === Función para reproducir las muestras locales del trombón con Carga por Demanda ===
async function playTromboneSample(midiNote, velocity) {
    if (!audioCtx) return;

    const adjustedNote = midiNote - 24; 
    const targetNote = Math.max(0, Math.min(127, adjustedNote));

    if (!tromboneBuffers[targetNote]) {
        try {
            const response = await fetch(`./trombon/key_${targetNote}.mp3`);
            if (!response.ok) return; 
            
            const arrayBuffer = await response.arrayBuffer();
            tromboneBuffers[targetNote] = await audioCtx.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.error(`Error cargando key_${targetNote}.mp3 para trombón:`, e);
            return;
        }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = tromboneBuffers[targetNote];
    
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = velocity / 127;
    
    source.connect(gainNode);
    gainNode.connect(mainMasterGain);
    
    source.start(0);
    
    return {
        stop: () => {
            try { source.stop(); } catch(e) {}
        }
    };
}

// Función simulada para trompeta
async function playTrumpetSample(midiNote, velocity) {
    if (!audioCtx) return;

    if (!trumpetBuffers[midiNote]) {
        try {
            const response = await fetch(`./samples-trompetas/key_${midiNote}.mp3`);
            if (!response.ok) return;
            const arrayBuffer = await response.arrayBuffer();
            trumpetBuffers[midiNote] = await audioCtx.decodeAudioData(arrayBuffer);
        } catch (e) {
            return;
        }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = trumpetBuffers[midiNote];
  
    const gainNode = audioCtx.createGain();
    const now = audioCtx.currentTime;
    const velocityScale = velocity / 127;
    
    gainNode.gain.setValueAtTime(velocityScale, now);
    
    source.connect(gainNode);
    gainNode.connect(mainMasterGain);
    
    source.start(0);
    
    return { 
        stop: () => {
            const stopNow = audioCtx.currentTime;
            const releaseTime = .2;
            try {
                gainNode.gain.cancelScheduledValues(stopNow);
                gainNode.gain.setValueAtTime(gainNode.gain.value, stopNow);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, stopNow + releaseTime);
                
                setTimeout(() => {
                    try { 
                        source.stop(); 
                        source.disconnect(); 
                        gainNode.disconnect(); 
                    } catch(e) {}
                }, releaseTime * 1000 + 50);
            } catch(e) {
                try { source.stop(); } catch(err) {}
            }
        } 
    };
}

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
        stopPadInstance(oldestNote);
    }
    if (activeOscillators[note]) stopNoteInstance(note, false);
    if (activePadOscillators[note]) stopPadInstance(note);
    
    const currentPreset = presetSelect.value;
    
    if (currentPreset === 'u20') {
        activeOscillators[note] = playU20Note(note, velocity);
    }
    else if (currentPreset === 'trompeta') {
        playTrumpetSample(note, velocity).then(instance => {
            if (instance) activeOscillators[note] = instance;
        });
    } 
    else if (currentPreset === 'trombon' || currentPreset.includes('trombon')) {
        playTromboneSample(note, velocity).then(instance => {
            if (instance) activeOscillators[note] = instance;
        });
    } 
    else if (currentPreset === 'splendid' || SPLENDID_DERIVED_PRESETS.includes(currentPreset)) {
        ensureSplendidLoaded().then(() => {
            activeOscillators[note] = playPianoNote(note, velocity, currentPreset);
        }).catch(() => {
            activeOscillators[note] = playPianoNote(note, velocity, 'grand');
        });
    } else {
        activeOscillators[note] = playPianoNote(note, velocity, currentPreset);
    }
    
    if (padEnabled && currentPreset !== 'u20') activePadOscillators[note] = playPadNote(note, padPresetSelect.value);
    if (fromMouse && activeMidiOutput) activeMidiOutput.send([144, note, velocity]);
}

function noteOff(note, fromMouse = false) {
    const keyElement = midiElements[note];
    activeNotesSet.delete(note);
    updateChordRecognition();
    if (!sustainActive && keyElement) keyElement.classList.remove('active');
    if (sustainActive) sustainedNotes.add(note);
    else {
        stopNoteInstance(note, true);
        stopPadInstance(note);
    }
    if (fromMouse && activeMidiOutput) activeMidiOutput.send([128, note, 0]);
}

const chordDictionary = {
    "0,4,7": "Mayor", "0,3,7": "Menor", "0,4,8": "Aumentado (aug)", "0,3,6": "Disminuido (dim)",
    "0,2,7": "sus2", "0,5,7": "sus4", "0,5,10": "7sus4", "0,2,7,10": "9sus4",
    "0,4,7,10": "7 (Dominante)", "0,4,7,11": "Maj7", "0,3,7,10": "m7", "0,3,7,11": "mMaj7",
    "0,3,6,10": "m7(b5) / Semidisminuido", "0,3,6,9": "dim7", "0,4,8,10": "+7 / 7(#5)", "0,4,8,11": "Maj7(#5)",
    "0,4,7,9": "6", "0,3,7,9": "m6", "0,2,4,7": "add9", "0,2,3,7": "m(add9)",
    "0,4,7,10,14": "9", "0,4,7,11,14": "Maj9", "0,3,7,10,14": "m9",
    "0,4,7,10,13": "7(b9)", "0,4,7,10,15": "7(#9)", "0,3,6,10,13": "m9(b5)", "0,3,6,9,13": "dim9",
    "0,4,7,10,14,17": "11", "0,3,7,10,14,17": "m11", "0,4,7,10,14,21": "13",
    "0,4,7,11,14,21": "Maj13", "0,3,7,10,14,21": "m13", "0,4,7,10,14,18,21": "13(#11)"
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
        if (typeof instance.stop === 'function') {
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
                oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch (e) {} });
                try {
                    gainNode.disconnect();
                    if (filter) filter.disconnect();
                } catch (e) {}
            }, (releaseTime * 1000) + 20);
        }
        delete activeOscillators[note];
    }
}

function stopPadInstance(note) {
    if (activePadOscillators[note]) {
        const { oscs, gainNode, filter } = activePadOscillators[note];
        const now = audioCtx.currentTime;
        const releaseTime = 0.8;
        try {
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(gainNode.gain.value, now);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);
        } catch (e) {}
        setTimeout(() => {
            oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch (e) {} });
            try {
                gainNode.disconnect();
                if (filter) filter.disconnect();
            } catch (e) {}
        }, (releaseTime * 1000) + 20);
        delete activePadOscillators[note];
    }
}

function playPianoNote(midiNote, velocity, preset) {
    if (preset === 'u20') {
        return playU20Note(midiNote, velocity);
    }

    if ((preset === 'splendid' || SPLENDID_DERIVED_PRESETS.includes(preset)) && splendidPiano) {
        const stopFn = splendidPiano.start({
            note: midiNote,
            velocity: velocity
        });
        
        const padStopObj = padEnabled ? playPadNote(midiNote, padPresetSelect.value) : null;

        return { 
            stop: () => {
                if (stopFn) stopFn();
                if (padStopObj && padStopObj.stop) padStopObj.stop();
            }, 
            isSmplr: true 
        };
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

function playPadNote(midiNote, padType) {
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const now = audioCtx.currentTime;
    const padVolValues = [0.0, 0.05, 0.1, 0.15, 0.22];
    const targetGain = padVolValues[padVolumeLevel - 1];
    const gainNode = audioCtx.createGain();
    gainNode.connect(mainMasterGain);
    const filter = audioCtx.createBiquadFilter();
    let oscs = [];
    if (padType === 'warm_pad') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        osc1.type = 'sawtooth'; osc2.type = 'triangle';
        osc1.frequency.value = freq; osc2.frequency.value = freq * 1.005;
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 1.5, now);
        filter.frequency.linearRampToValueAtTime(freq * 3.5, now + 0.5);
        osc1.connect(filter); osc2.connect(filter); filter.connect(gainNode);
        oscs = [osc1, osc2];
    } else if (padType === 'soft_strings') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        osc1.type = 'sawtooth'; osc2.type = 'sawtooth';
        osc1.frequency.value = freq; osc2.frequency.value = freq * 2;
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 2, now);
        filter.frequency.linearRampToValueAtTime(freq * 4, now + 0.6);
        osc1.connect(filter); osc2.connect(filter); filter.connect(gainNode);
        oscs = [osc1, osc2];
    } else {
        const osc1 = audioCtx.createOscillator();
        osc1.type = 'sawtooth'; osc1.frequency.value = freq;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freq, now);
        filter.frequency.exponentialRampToValueAtTime(freq * 5, now + 0.8);
        osc1.connect(filter);
        oscs = [osc1];
    }
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(targetGain, now + 0.4);
    oscs.forEach(o => o.start(now));
    return { oscs, gainNode, filter };
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
    if (activeMidiInput) { activeMidiInput.onmidimessage = null; activeMidiInput = null; }
    const selectedId = midiInputSelect.value;
    if (selectedId && currentMidiAccess) {
        const input = currentMidiAccess.inputs.get(selectedId);
        if (input) { activeMidiInput = input; activeMidiInput.onmidimessage = handleIncomingMidiMessage; }
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

const themeSelector = document.getElementById('theme-selector');
if (themeSelector) {
    themeSelector.addEventListener('change', (e) => {
        const selectedTheme = e.target.value;
        document.body.classList.remove('theme-dark-black', 'theme-modern-gray', 'theme-red');
        if (selectedTheme === 'red') {
            document.body.classList.add('theme-red');
        } else if (selectedTheme === 'modern-gray') {
            document.body.classList.add('theme-modern-gray');
        } else {
            document.body.classList.add('theme-dark-black');
        }
    });
}
