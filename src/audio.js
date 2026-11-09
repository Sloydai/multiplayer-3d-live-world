const stored = JSON.parse(localStorage.getItem('gym-sound') || '{}');
export const volumes = { ambience: 0.5, effects: 0.7, ...stored };

let context = null;
let buses = null;

function noiseBuffer(seconds, brown) {
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = brown ? (last + 0.02 * white) / 1.02 : white;
    data[i] = brown ? last * 3.5 : white;
  }
  return buffer;
}

function startAmbience() {
  const hum = context.createBufferSource();
  hum.buffer = noiseBuffer(4, true);
  hum.loop = true;
  const humFilter = context.createBiquadFilter();
  humFilter.type = 'lowpass';
  humFilter.frequency.value = 380;
  const humGain = context.createGain();
  humGain.gain.value = 0.35;
  hum.connect(humFilter).connect(humGain).connect(buses.ambience);
  hum.start();

  const wind = context.createBufferSource();
  wind.buffer = noiseBuffer(6, false);
  wind.loop = true;
  const windFilter = context.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 700;
  windFilter.Q.value = 0.6;
  const windGain = context.createGain();
  windGain.gain.value = 0.04;
  const lfo = context.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = context.createGain();
  lfoGain.gain.value = 0.035;
  lfo.connect(lfoGain).connect(windGain.gain);
  wind.connect(windFilter).connect(windGain).connect(buses.ambience);
  wind.start();
  lfo.start();
}

export function soundOn() {
  return context?.state === 'running';
}

export async function toggleSound() {
  if (!context) {
    context = new AudioContext();
    buses = Object.fromEntries(['ambience', 'effects'].map((name) => {
      const gain = context.createGain();
      gain.gain.value = volumes[name];
      gain.connect(context.destination);
      return [name, gain];
    }));
    startAmbience();
  } else if (context.state === 'running') {
    await context.suspend();
    return false;
  }
  await context.resume();
  return true;
}

export function setVolume(name, value) {
  volumes[name] = value;
  localStorage.setItem('gym-sound', JSON.stringify(volumes));
  if (buses) buses[name].gain.setTargetAtTime(value, context.currentTime, 0.05);
}

function envelope(bus, attack, peak, decay) {
  const gain = context.createGain();
  const now = context.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  gain.connect(buses[bus]);
  return gain;
}

function tone(bus, frequency, endFrequency, peak, decay, wave = 'sine') {
  const oscillator = context.createOscillator();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, context.currentTime + decay);
  oscillator.connect(envelope(bus, 0.005, peak, decay));
  oscillator.start();
  oscillator.stop(context.currentTime + decay + 0.05);
}

function noise(bus, frequency, peak, attack, decay, filterKind = 'bandpass') {
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(attack + decay + 0.1, false);
  const filter = context.createBiquadFilter();
  filter.type = filterKind;
  filter.frequency.value = frequency;
  source.connect(filter).connect(envelope(bus, attack, peak, decay));
  source.start();
}

export const sounds = {
  chime: () => soundOn() && [660, 880, 1320].forEach((f, i) => setTimeout(() => tone('effects', f, f, 0.15, 0.9), i * 90)),
  clank: () => soundOn() && (tone('effects', 310, 290, 0.25, 0.5, 'triangle'), tone('effects', 470, 450, 0.12, 0.35, 'square'), noise('effects', 2500, 0.08, 0.002, 0.12)),
  pour: () => soundOn() && [0, 140, 280].forEach((delay) => setTimeout(() => tone('effects', 300 + Math.random() * 200, 700, 0.06, 0.12), delay)),
  pedal: () => soundOn() && noise('effects', 220, 0.12, 0.05, 0.3, 'lowpass'),
  rep: () => soundOn() && tone('effects', 520, 520, 0.12, 0.4, 'triangle'),
  steam: () => soundOn() && (noise('effects', 3000, 0.25, 0.08, 2.5, 'highpass'), tone('effects', 900, 300, 0.05, 0.3)),
};
