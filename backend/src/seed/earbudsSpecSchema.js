const field = (key, label, labelBn, type, options = [], unit = '', filterable = true) => ({
  key,
  label,
  labelBn,
  type,
  options,
  unit,
  filterable,
  showInDetails: true,
});

const multi = (key, label, labelBn, options) => field(key, label, labelBn, 'multiselect', options);
const numeric = (key, label, labelBn, unit) => field(key, label, labelBn, 'number', [], unit);
const boolean = (key, label, labelBn) => field(key, label, labelBn, 'boolean');

module.exports = [
  {
    key: 'audio',
    label: 'Audio',
    labelBn: 'অডিও',
    order: 0,
    fields: [
      numeric('driver-size', 'Driver Size', 'ড্রাইভার সাইজ', 'mm'),
      multi('audio-codec', 'Audio Codec', 'অডিও কোডেক', [
        'SBC',
        'AAC',
        'aptX',
        'aptX Adaptive',
        'aptX Lossless',
        'LDAC',
        'LHDC',
        'LC3',
      ]),
      field('frequency-response', 'Frequency Response', 'ফ্রিকোয়েন্সি রেসপন্স', 'text', [], '', false),
    ],
  },
  {
    key: 'connectivity',
    label: 'Connectivity',
    labelBn: 'কানেক্টিভিটি',
    order: 1,
    fields: [
      multi('bluetooth-version', 'Bluetooth Version', 'ব্লুটুথ ভার্সন', [
        'Bluetooth 5.0',
        'Bluetooth 5.1',
        'Bluetooth 5.2',
        'Bluetooth 5.3',
        'Bluetooth 5.4',
        'Bluetooth 6.0',
      ]),
      boolean('multipoint-connection', 'Multipoint Connection', 'মাল্টিপয়েন্ট কানেকশন'),
    ],
  },
  {
    key: 'noise-control',
    label: 'Noise Control',
    labelBn: 'নয়েজ কন্ট্রোল',
    order: 2,
    fields: [
      multi('noise-cancellation', 'Noise Cancellation', 'নয়েজ ক্যানসেলেশন', [
        'ANC',
        'Adaptive ANC',
        'Passive Noise Isolation',
        'No ANC',
      ]),
      boolean('transparency-mode', 'Transparency Mode', 'ট্রান্সপারেন্সি মোড'),
      multi('microphone-noise-reduction', 'Microphone Noise Reduction', 'মাইক্রোফোন নয়েজ রিডাকশন', [
        'ENC',
        'CVC',
        'AI Noise Reduction',
        'Beamforming',
      ]),
    ],
  },
  {
    key: 'battery',
    label: 'Battery & Charging',
    labelBn: 'ব্যাটারি ও চার্জিং',
    order: 3,
    fields: [
      numeric('earbud-playtime', 'Earbud Playtime', 'ইয়ারবাড প্লেটাইম', 'hours'),
      numeric('total-playtime', 'Total Playtime (with Case)', 'কেসসহ মোট প্লেটাইম', 'hours'),
      numeric('charging-time', 'Charging Time', 'চার্জিং সময়', 'hours'),
      boolean('wireless-charging', 'Wireless Charging', 'ওয়্যারলেস চার্জিং'),
    ],
  },
  {
    key: 'features',
    label: 'Features & Controls',
    labelBn: 'ফিচার ও কন্ট্রোল',
    order: 4,
    fields: [
      multi('controls', 'Controls', 'কন্ট্রোল', [
        'Touch',
        'Physical Button',
        'Voice Control',
      ]),
      boolean('low-latency-mode', 'Low Latency / Gaming Mode', 'লো-ল্যাটেন্সি / গেমিং মোড'),
      boolean('spatial-audio', 'Spatial Audio', 'স্পেশিয়াল অডিও'),
      multi('voice-assistant', 'Voice Assistant', 'ভয়েস অ্যাসিস্ট্যান্ট', [
        'Siri',
        'Google Assistant',
        'Alexa',
      ]),
    ],
  },
  {
    key: 'durability',
    label: 'Durability',
    labelBn: 'স্থায়িত্ব',
    order: 5,
    fields: [
      multi('water-resistance', 'Water Resistance', 'পানি প্রতিরোধ ক্ষমতা', [
        'IPX4',
        'IPX5',
        'IPX6',
        'IPX7',
        'IP54',
        'IP55',
        'IP57',
      ]),
    ],
  },
];
