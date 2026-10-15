/** VLC-style 10-band equalizer center frequencies (Hz). */
export const EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

export interface EqPreset {
  name: string;
  preamp: number;
  bands: number[]; // dB per band
}

export const EQ_PRESETS: EqPreset[] = [
  { name: "Flat", preamp: 0, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Bass Boost", preamp: 0, bands: [8, 7, 6, 4, 2, 0, 0, 0, 0, 0] },
  { name: "Treble Boost", preamp: 0, bands: [0, 0, 0, 0, 0, 2, 4, 6, 7, 8] },
  { name: "Vocal", preamp: 0, bands: [-2, -1, 0, 3, 6, 5, 3, 1, 0, 0] },
  { name: "Rock", preamp: 0, bands: [5, 3, 1, -2, -3, 0, 3, 5, 6, 6] },
  { name: "Pop", preamp: 0, bands: [-1, 2, 4, 5, 3, 0, -1, -1, 0, 0] },
  { name: "Jazz", preamp: 0, bands: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { name: "Classical", preamp: 0, bands: [4, 3, 2, 1, 0, 0, 0, 2, 3, 4] },
  { name: "Club", preamp: 0, bands: [4, 5, 5, 4, 2, 1, 0, 0, 0, 0] },
  { name: "Dance", preamp: 0, bands: [6, 5, 3, 0, 0, 2, 4, 5, 4, 3] },
  { name: "Full Bass", preamp: 0, bands: [9, 9, 8, 5, 2, -2, -6, -8, -9, -9] },
  { name: "Full Treble", preamp: 0, bands: [-9, -9, -8, -5, -1, 2, 6, 8, 9, 9] },
  { name: "Loudness", preamp: 0, bands: [6, 4, 0, -2, -4, 0, 1, 3, 5, 6] },
  { name: "Headphones", preamp: 0, bands: [3, 5, 4, 2, -1, -2, -1, 1, 3, 5] },
  { name: "Large Hall", preamp: 0, bands: [7, 7, 4, 4, 0, -3, -3, -3, 0, 0] },
  { name: "Live", preamp: 0, bands: [-3, 0, 2, 3, 4, 4, 2, 1, 1, 1] },
  { name: "Party", preamp: 0, bands: [5, 5, 0, 0, 0, 0, 0, 0, 5, 5] },
  { name: "Soft", preamp: 0, bands: [3, 1, 0, -2, 0, 2, 5, 7, 8, 9] },
  { name: "Techno", preamp: 0, bands: [5, 4, 1, -2, -3, -1, 2, 4, 5, 5] },
];

export const RATE_STEPS = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4,
];

export const ASPECTS = ["auto", "16:9", "4:3", "2.35:1", "1:1", "fill"] as const;
