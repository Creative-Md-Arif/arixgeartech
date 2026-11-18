const field = (key, label, labelBn, type = 'text', options = [], unit = '', filterable = true) => ({
  key,
  label,
  labelBn,
  type,
  options,
  unit,
  filterable,
  showInDetails: true,
});

const numeric = (key, label, labelBn, unit) => field(key, label, labelBn, 'number', [], unit);
const boolean = (key, label, labelBn) => field(key, label, labelBn, 'boolean');
const multi = (key, label, labelBn, options) => field(key, label, labelBn, 'multiselect', options);
const select = (key, label, labelBn, options) => field(key, label, labelBn, 'select', options);

const COMMON_SPEC_GROUPS = [
  {
    key: 'compatibility',
    label: 'Compatibility',
    labelBn: 'সামঞ্জস্য',
    order: 0,
    fields: [
      multi('compatible-devices', 'Compatible Devices', 'সামঞ্জস্যপূর্ণ ডিভাইস', [
        'Android',
        'iPhone / iPad',
        'Windows',
        'macOS',
        'Linux',
        'Universal',
      ]),
      field('compatible-models', 'Compatible Models', 'সামঞ্জস্যপূর্ণ মডেল', 'textarea', [], '', false),
    ],
  },
  {
    key: 'connectivity',
    label: 'Connectivity',
    labelBn: 'কানেক্টিভিটি',
    order: 1,
    fields: [
      multi('connection-type', 'Connection Type', 'কানেকশনের ধরন', [
        'USB-A',
        'USB-C',
        'Bluetooth',
        '2.4GHz Wireless',
        '3.5mm Audio',
        'HDMI',
        'Lightning',
        'Wi-Fi',
      ]),
      field('interface-version', 'Interface / Version', 'ইন্টারফেস / ভার্সন'),
    ],
  },
  {
    key: 'physical',
    label: 'Physical Details',
    labelBn: 'দৈহিক বিবরণ',
    order: 2,
    fields: [
      field('color', 'Color', 'রং'),
      field('material', 'Material', 'উপাদান'),
      field('dimensions', 'Dimensions', 'আকার'),
      numeric('weight', 'Weight', 'ওজন', 'g'),
    ],
  },
  {
    key: 'warranty',
    label: 'Warranty & In the Box',
    labelBn: 'ওয়ারেন্টি ও বক্সে যা থাকছে',
    order: 3,
    fields: [
      numeric('warranty-period', 'Warranty Period', 'ওয়ারেন্টির মেয়াদ', 'months'),
      field('package-contents', 'Package Contents', 'বক্সে যা থাকছে', 'textarea', [], '', false),
    ],
  },
];

const CATEGORY_SPEC_GROUPS = {
  'mobile-accessories': [
    {
      key: 'charging',
      label: 'Charging',
      labelBn: 'চার্জিং',
      order: 4,
      fields: [
        numeric('max-output', 'Maximum Output', 'সর্বোচ্চ আউটপুট', 'W'),
        multi('charging-standards', 'Charging Standards', 'চার্জিং স্ট্যান্ডার্ড', [
          'USB Power Delivery',
          'Quick Charge',
          'PPS',
          'Qi Wireless',
          'Proprietary Fast Charge',
        ]),
        field('connector-type', 'Connector Type', 'কানেক্টরের ধরন'),
        numeric('cable-length', 'Cable Length', 'কেবলের দৈর্ঘ্য', 'm'),
        boolean('wireless-charging', 'Wireless Charging', 'ওয়্যারলেস চার্জিং'),
      ],
    },
  ],
  'computer-accessories': [
    {
      key: 'computer-features',
      label: 'Computer Accessory Features',
      labelBn: 'কম্পিউটার এক্সেসরিজের বৈশিষ্ট্য',
      order: 4,
      fields: [
        select('accessory-type', 'Accessory Type', 'এক্সেসরিজের ধরন', [
          'Keyboard',
          'Mouse',
          'Webcam',
          'Laptop Stand',
          'Cooling Pad',
          'Docking Station',
          'USB Hub',
          'Other',
        ]),
        select('keyboard-layout', 'Keyboard Layout', 'কীবোর্ড লেআউট', ['US', 'UK', 'Bangla', 'Other']),
        field('keyboard-switch-type', 'Keyboard Switch Type', 'কীবোর্ড সুইচের ধরন'),
        numeric('mouse-dpi', 'Mouse DPI', 'মাউস ডিপিআই', 'DPI'),
        numeric('polling-rate', 'Polling Rate', 'পোলিং রেট', 'Hz'),
      ],
    },
  ],
  audio: [
    {
      key: 'audio-features',
      label: 'Audio Features',
      labelBn: 'অডিও বৈশিষ্ট্য',
      order: 4,
      fields: [
        numeric('driver-size', 'Driver Size', 'ড্রাইভার সাইজ', 'mm'),
        field('microphone', 'Microphone', 'মাইক্রোফোন', 'boolean'),
        select('noise-cancellation', 'Noise Cancellation', 'নয়েজ ক্যানসেলেশন', [
          'ANC',
          'ENC',
          'Passive',
          'None',
        ]),
        numeric('battery-life', 'Battery Life', 'ব্যাটারি ব্যাকআপ', 'hours'),
        field('water-resistance', 'Water Resistance', 'পানি প্রতিরোধ ক্ষমতা'),
      ],
    },
  ],
  gaming: [
    {
      key: 'gaming-features',
      label: 'Gaming Features',
      labelBn: 'গেমিং বৈশিষ্ট্য',
      order: 4,
      fields: [
        multi('gaming-platforms', 'Compatible Platforms', 'সামঞ্জস্যপূর্ণ প্ল্যাটফর্ম', [
          'PC',
          'PlayStation',
          'Xbox',
          'Nintendo Switch',
          'Mobile',
        ]),
        select('accessory-type', 'Accessory Type', 'এক্সেসরিজের ধরন', [
          'Controller',
          'Gaming Headset',
          'Keyboard',
          'Mouse',
          'Mouse Pad',
          'Other',
        ]),
        boolean('rgb-lighting', 'RGB Lighting', 'আরজিবি লাইটিং'),
        boolean('surround-sound', 'Surround Sound', 'সারাউন্ড সাউন্ড'),
      ],
    },
  ],
  'cables-adapters-hubs': [
    {
      key: 'cable-performance',
      label: 'Cable & Adapter Performance',
      labelBn: 'কেবল ও অ্যাডাপ্টারের পারফরম্যান্স',
      order: 4,
      fields: [
        field('input-connector', 'Input Connector', 'ইনপুট কানেক্টর'),
        field('output-connector', 'Output Connector', 'আউটপুট কানেক্টর'),
        numeric('cable-length', 'Cable Length', 'কেবলের দৈর্ঘ্য', 'm'),
        numeric('data-transfer-speed', 'Data Transfer Speed', 'ডেটা ট্রান্সফার স্পিড', 'Gbps'),
        numeric('max-power-delivery', 'Maximum Power Delivery', 'সর্বোচ্চ পাওয়ার ডেলিভারি', 'W'),
        select('max-display-resolution', 'Maximum Display Resolution', 'সর্বোচ্চ ডিসপ্লে রেজোলিউশন', [
          '1080p',
          '1440p',
          '4K',
          '8K',
          'Not Applicable',
        ]),
      ],
    },
  ],
  'storage-memory': [
    {
      key: 'storage-specifications',
      label: 'Storage Specifications',
      labelBn: 'স্টোরেজ স্পেসিফিকেশন',
      order: 4,
      fields: [
        select('capacity', 'Capacity', 'ধারণক্ষমতা', [
          '16 GB',
          '32 GB',
          '64 GB',
          '128 GB',
          '256 GB',
          '512 GB',
          '1 TB',
          '2 TB',
          '4 TB',
        ]),
        select('storage-interface', 'Storage Interface', 'স্টোরেজ ইন্টারফেস', [
          'USB-A',
          'USB-C',
          'USB 3.0',
          'USB 3.2',
          'UHS-I',
          'UHS-II',
          'SATA',
          'NVMe',
        ]),
        numeric('read-speed', 'Maximum Read Speed', 'সর্বোচ্চ রিড স্পিড', 'MB/s'),
        numeric('write-speed', 'Maximum Write Speed', 'সর্বোচ্চ রাইট স্পিড', 'MB/s'),
        select('form-factor', 'Form Factor', 'ফর্ম ফ্যাক্টর', [
          'USB Flash Drive',
          'SD Card',
          'microSD Card',
          'External SSD',
          'External HDD',
          'Card Reader',
        ]),
      ],
    },
  ],
  'smart-gadgets': [
    {
      key: 'smart-device-features',
      label: 'Smart Device Features',
      labelBn: 'স্মার্ট ডিভাইসের বৈশিষ্ট্য',
      order: 4,
      fields: [
        select('device-type', 'Device Type', 'ডিভাইসের ধরন', [
          'Smartwatch',
          'Fitness Band',
          'Tracker',
          'Smart Ring',
          'Other',
        ]),
        multi('sensors', 'Sensors', 'সেন্সর', [
          'Heart Rate',
          'SpO2',
          'GPS',
          'Accelerometer',
          'Gyroscope',
          'Sleep Tracking',
        ]),
        field('display-type', 'Display Type', 'ডিসপ্লের ধরন'),
        numeric('battery-life', 'Battery Life', 'ব্যাটারি ব্যাকআপ', 'days'),
        field('water-resistance', 'Water Resistance', 'পানি প্রতিরোধ ক্ষমতা'),
      ],
    },
  ],
  keyboards: [
    {
      key: 'keyboard-details',
      label: 'Keyboard Details',
      labelBn: 'কীবোর্ডের বিবরণ',
      order: 4,
      fields: [
        select('keyboard-layout', 'Keyboard Layout', 'কীবোর্ড লেআউট', ['US', 'UK', 'Bangla', 'Other']),
        field('keyboard-switch-type', 'Keyboard Switch Type', 'কীবোর্ড সুইচের ধরন'),
        boolean('backlighting', 'Backlighting', 'ব্যাকলাইটিং'),
      ],
    },
  ],
  mice: [
    {
      key: 'mouse-details',
      label: 'Mouse Details',
      labelBn: 'মাউসের বিবরণ',
      order: 4,
      fields: [
        numeric('mouse-dpi', 'Mouse DPI', 'মাউস ডিপিআই', 'DPI'),
        numeric('buttons', 'Number of Buttons', 'বাটনের সংখ্যা', 'buttons'),
        boolean('rgb-lighting', 'RGB Lighting', 'আরজিবি লাইটিং'),
      ],
    },
  ],
  controllers: [
    {
      key: 'controller-details',
      label: 'Controller Details',
      labelBn: 'কন্ট্রোলারের বিবরণ',
      order: 4,
      fields: [
        multi('gaming-platforms', 'Compatible Platforms', 'সামঞ্জস্যপূর্ণ প্ল্যাটফর্ম', [
          'PC',
          'PlayStation',
          'Xbox',
          'Nintendo Switch',
          'Mobile',
        ]),
        boolean('wireless', 'Wireless', 'ওয়্যারলেস'),
        boolean('vibration', 'Vibration', 'ভাইব্রেশন'),
      ],
    },
  ],
  'gaming-headsets': [
    {
      key: 'headset-details',
      label: 'Headset Details',
      labelBn: 'হেডসেটের বিবরণ',
      order: 4,
      fields: [
        numeric('driver-size', 'Driver Size', 'ড্রাইভার সাইজ', 'mm'),
        boolean('microphone', 'Microphone', 'মাইক্রোফোন'),
        boolean('surround-sound', 'Surround Sound', 'সারাউন্ড সাউন্ড'),
        field('connection-type', 'Connection Type', 'কানেকশনের ধরন'),
      ],
    },
  ],
};

module.exports = { COMMON_SPEC_GROUPS, CATEGORY_SPEC_GROUPS };
