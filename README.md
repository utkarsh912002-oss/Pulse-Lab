# Pulse Lab — make a little noise

Pulse Lab is a browser-based step sequencer and synthesizer inspired by Project 19 in *20 New Frontend Projects, Volume 2*. Click the 16-step grid to create a beat, add a melody, adjust tempo and swing, then save, share, or export the loop as a WAV file. All sounds are synthesized in the browser; there are no audio samples or frameworks.

## Run it

Open `index.html` in a current browser, or open this folder in VS Code and use Live Server. Press **Play** to begin: browsers only allow audio after a user gesture. WAV export uses `OfflineAudioContext`; if a browser does not support it, playback and the other features still work.

## Learn by following the code

- **`index.html`**: Semantic sections, labeled sliders, toolbar controls, accessible step buttons, canvas label, and native dialogs.
- **`style.css`**: CSS grid for the 16-step sequencer, small-screen layout, visible focus states, track colors, and reduced-motion support.
- **`script.js`**: Start with `pattern` and `makePattern()` to understand the data. `buildGrid()` turns that data into buttons. The `playKick`, `playNoise`, and `playSynth` functions make sounds from Web Audio nodes. `scheduler()` looks ahead using the audio clock so playback stays steady. `drawVisualizer()` reads the live audio signal. The last section handles pattern storage, share links, and WAV export.

## Concepts to explore

- Web Audio oscillators, filters, gain nodes, and envelopes
- Look-ahead scheduling against `AudioContext.currentTime`
- Canvas visualisation with `AnalyserNode`
- Pattern data as arrays of boolean steps
- `localStorage`, URL hash sharing, and Blob downloads
- Offline audio rendering and PCM WAV encoding
- Accessible buttons with `aria-pressed` and native `<dialog>`

## Try changing it

1. Add a fifth track, such as a clap, to `TRACKS` and `scheduleTrackStep()`.
2. Change the notes in the `NOTES` array to write a different melody.
3. Add a preset object to `PRESETS`.
4. Adjust the oscillator type or filter frequency in `playSynth()` to change its character.

Patterns are saved only in the current browser. A shared link contains the step data in its URL, so it can be sent to another person without an account.

## Publish with GitHub Pages

1. Create a GitHub repository and upload the files from this folder.
2. In the repository, go to **Settings → Pages**.
3. Select **Deploy from a branch**, choose `main` and `/ (root)`, then save.
4. Open the published URL shown in the Pages settings. Test it there and press **Play** to allow audio.
