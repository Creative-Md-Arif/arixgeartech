const {
  COMMON_SPEC_GROUPS: ACCESSORY_COMMON,
  CATEGORY_SPEC_GROUPS: ACCESSORY_CATEGORIES,
} = require('./accessoriesSpecSchema');
const laptopSpecGroups = require('./laptopSpecSchema');
const earbudsSpecGroups = require('./earbudsSpecSchema');

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
const select = (key, label, labelBn, options) => field(key, label, labelBn, 'select', options);
const multi = (key, label, labelBn, options) => field(key, label, labelBn, 'multiselect', options);
const group = (key, label, labelBn, fields, order = 0) => ({ key, label, labelBn, fields, order });

const GENERAL = [
  group('product-details', 'Product Details', 'পণ্যের বিবরণ', [
    field('model-number', 'Model Number', 'মডেল নম্বর', 'text', [], '', false),
    field('country-of-origin', 'Country of Origin', 'উৎপাদনকারী দেশ'),
    numeric('warranty-period', 'Warranty Period', 'ওয়ারেন্টির মেয়াদ', 'months'),
  ]),
];

const ROOT_SPEC_GROUPS = {
  accessories: ACCESSORY_COMMON,
  components: GENERAL,
  phones: GENERAL,
  networking: GENERAL,
  appliances: GENERAL,
  'kitchen-appliances': GENERAL,
  lifestyle: GENERAL,
  'health-beauty': GENERAL,
  power: GENERAL,
  laptops: laptopSpecGroups,
};

const CATEGORY_SPEC_GROUPS = {
  ...ACCESSORY_CATEGORIES,
  audio: [...ACCESSORY_CATEGORIES.audio, ...earbudsSpecGroups],
  'graphics-cards': [
    group('graphics-card', 'Graphics Card', 'গ্রাফিক্স কার্ড', [
      field('graphics-chipset', 'Graphics Chipset', 'গ্রাফিক্স চিপসেট'),
      numeric('graphics-memory', 'Graphics Memory', 'গ্রাফিক্স মেমোরি', 'GB'),
      field('memory-type', 'Memory Type', 'মেমোরির ধরন'),
      field('interface', 'Interface', 'ইন্টারফেস'),
      numeric('recommended-psu', 'Recommended PSU', 'প্রস্তাবিত পাওয়ার সাপ্লাই', 'W'),
      multi('video-outputs', 'Video Outputs', 'ভিডিও আউটপুট', ['HDMI', 'DisplayPort', 'USB-C', 'DVI']),
    ]),
  ],
  processors: [
    group('processor-details', 'Processor Details', 'প্রসেসরের বিবরণ', [
      field('processor-family', 'Processor Family', 'প্রসেসর পরিবার'),
      field('socket', 'Socket', 'সকেট'),
      numeric('cores', 'Cores', 'কোর', 'cores'),
      numeric('threads', 'Threads', 'থ্রেড', 'threads'),
      numeric('base-clock', 'Base Clock', 'বেস ক্লক', 'GHz'),
      numeric('max-clock', 'Maximum Clock', 'সর্বোচ্চ ক্লক', 'GHz'),
      numeric('tdp', 'TDP', 'টিডিপি', 'W'),
    ]),
  ],
  memory: [
    group('memory-details', 'Memory Details', 'মেমোরির বিবরণ', [
      field('memory-generation', 'Memory Generation', 'মেমোরি জেনারেশন'),
      select('module-type', 'Module Type', 'মডিউলের ধরন', ['DIMM', 'SO-DIMM']),
      numeric('capacity', 'Capacity', 'ধারণক্ষমতা', 'GB'),
      numeric('speed', 'Memory Speed', 'মেমোরি স্পিড', 'MT/s'),
      numeric('module-count', 'Module Count', 'মডিউল সংখ্যা', 'modules'),
    ]),
  ],
  storage: [
    group('drive-details', 'Drive Details', 'ড্রাইভের বিবরণ', [
      select('drive-type', 'Drive Type', 'ড্রাইভের ধরন', ['NVMe SSD', 'SATA SSD', 'Hard Drive']),
      field('form-factor', 'Form Factor', 'ফর্ম ফ্যাক্টর'),
      field('interface', 'Interface', 'ইন্টারফেস'),
      numeric('capacity', 'Capacity', 'ধারণক্ষমতা', 'GB'),
      numeric('read-speed', 'Maximum Read Speed', 'সর্বোচ্চ রিড স্পিড', 'MB/s'),
      numeric('write-speed', 'Maximum Write Speed', 'সর্বোচ্চ রাইট স্পিড', 'MB/s'),
    ]),
  ],
  monitors: [
    group('display-details', 'Display Details', 'ডিসপ্লের বিবরণ', [
      numeric('screen-size', 'Screen Size', 'স্ক্রিন সাইজ', 'inches'),
      field('resolution', 'Resolution', 'রেজোলিউশন'),
      field('panel-type', 'Panel Type', 'প্যানেলের ধরন'),
      numeric('refresh-rate', 'Refresh Rate', 'রিফ্রেশ রেট', 'Hz'),
      numeric('response-time', 'Response Time', 'রেসপন্স টাইম', 'ms'),
      multi('video-ports', 'Video Ports', 'ভিডিও পোর্ট', ['HDMI', 'DisplayPort', 'USB-C', 'VGA']),
    ]),
  ],
  smartphones: [
    group('phone-details', 'Phone Details', 'ফোনের বিবরণ', [
      field('operating-system', 'Operating System', 'অপারেটিং সিস্টেম'),
      multi('network-support', 'Network Support', 'নেটওয়ার্ক সাপোর্ট', ['2G', '3G', '4G LTE', '5G']),
      numeric('screen-size', 'Screen Size', 'স্ক্রিন সাইজ', 'inches'),
      field('display-resolution', 'Display Resolution', 'ডিসপ্লে রেজোলিউশন'),
      field('processor', 'Processor', 'প্রসেসর'),
      field('memory-storage', 'Memory & Storage', 'মেমোরি ও স্টোরেজ'),
      numeric('battery-capacity', 'Battery Capacity', 'ব্যাটারি ধারণক্ষমতা', 'mAh'),
    ]),
  ],
  wearables: [
    group('wearable-details', 'Wearable Details', 'ওয়্যারেবলের বিবরণ', [
      field('wearable-type', 'Wearable Type', 'ওয়্যারেবলের ধরন'),
      field('display-type', 'Display Type', 'ডিসপ্লের ধরন'),
      multi('sensors', 'Sensors', 'সেন্সর', ['Heart Rate', 'SpO2', 'GPS', 'Accelerometer', 'Sleep Tracking']),
      numeric('battery-life', 'Battery Life', 'ব্যাটারি ব্যাকআপ', 'days'),
      field('water-resistance', 'Water Resistance', 'পানি প্রতিরোধ ক্ষমতা'),
    ]),
  ],
  tablets: [
    group('tablet-details', 'Tablet Details', 'ট্যাবলেটের বিবরণ', [
      field('operating-system', 'Operating System', 'অপারেটিং সিস্টেম'),
      numeric('screen-size', 'Screen Size', 'স্ক্রিন সাইজ', 'inches'),
      field('display-resolution', 'Display Resolution', 'ডিসপ্লে রেজোলিউশন'),
      field('processor', 'Processor', 'প্রসেসর'),
      field('memory-storage', 'Memory & Storage', 'মেমোরি ও স্টোরেজ'),
      numeric('battery-capacity', 'Battery Capacity', 'ব্যাটারি ধারণক্ষমতা', 'mAh'),
    ]),
  ],
  routers: [
    group('router-details', 'Router Details', 'রাউটারের বিবরণ', [
      multi('router-type', 'Router Type', 'রাউটারের ধরন', ['Wi-Fi', 'SIM / LTE', 'Enterprise', 'Gaming']),
      field('wifi-standard', 'Wi-Fi Standard', 'ওয়াই-ফাই স্ট্যান্ডার্ড'),
      multi('wifi-bands', 'Wi-Fi Bands', 'ওয়াই-ফাই ব্যান্ড', ['2.4 GHz', '5 GHz', '6 GHz']),
      numeric('wireless-speed', 'Maximum Wireless Speed', 'সর্বোচ্চ ওয়্যারলেস স্পিড', 'Mbps'),
      numeric('ethernet-ports', 'Ethernet Ports', 'ইথারনেট পোর্ট', 'ports'),
      boolean('sim-slot', 'SIM Slot', 'সিম স্লট'),
    ]),
  ],
  mesh: [
    group('mesh-details', 'Mesh Wi-Fi Details', 'মেশ ওয়াই-ফাইয়ের বিবরণ', [
      numeric('node-count', 'Nodes in Package', 'প্যাকেজে নোড সংখ্যা', 'nodes'),
      numeric('coverage-area', 'Coverage Area', 'কভারেজ এলাকা', 'sq ft'),
      field('wifi-standard', 'Wi-Fi Standard', 'ওয়াই-ফাই স্ট্যান্ডার্ড'),
      multi('wifi-bands', 'Wi-Fi Bands', 'ওয়াই-ফাই ব্যান্ড', ['Dual-band', 'Tri-band']),
      boolean('wired-backhaul', 'Wired Backhaul', 'ওয়্যার্ড ব্যাকহল'),
    ]),
  ],
  security: [
    group('security-details', 'Security Device Details', 'নিরাপত্তা ডিভাইসের বিবরণ', [
      field('device-type', 'Device Type', 'ডিভাইসের ধরন'),
      field('resolution', 'Resolution', 'রেজোলিউশন'),
      boolean('night-vision', 'Night Vision', 'নাইট ভিশন'),
      multi('connectivity', 'Connectivity', 'কানেক্টিভিটি', ['Wi-Fi', 'Ethernet', '4G LTE', 'Wired']),
      field('storage-support', 'Storage Support', 'স্টোরেজ সাপোর্ট'),
    ]),
  ],
  'cctv-cameras': [
    group('camera-details', 'Camera Details', 'ক্যামেরার বিবরণ', [
      field('camera-type', 'Camera Type', 'ক্যামেরার ধরন'),
      field('lens-type', 'Lens Type', 'লেন্সের ধরন'),
      field('field-of-view', 'Field of View', 'দৃষ্টিক্ষেত্র'),
      boolean('two-way-audio', 'Two-Way Audio', 'টু-ওয়ে অডিও'),
    ]),
  ],
  'smart-security': [
    group('smart-security-details', 'Smart Security Features', 'স্মার্ট সিকিউরিটি বৈশিষ্ট্য', [
      field('device-type', 'Device Type', 'ডিভাইসের ধরন'),
      boolean('mobile-app-support', 'Mobile App Support', 'মোবাইল অ্যাপ সাপোর্ট'),
      boolean('voice-assistant-support', 'Voice Assistant Support', 'ভয়েস অ্যাসিস্ট্যান্ট সাপোর্ট'),
      field('power-source', 'Power Source', 'পাওয়ার সোর্স'),
    ]),
  ],
  'air-conditioners': [
    group('air-conditioner-details', 'Air Conditioner Details', 'এয়ার কন্ডিশনারের বিবরণ', [
      field('ac-type', 'AC Type', 'এসি-র ধরন'),
      numeric('cooling-capacity', 'Cooling Capacity', 'কুলিং ক্যাপাসিটি', 'BTU'),
      boolean('inverter', 'Inverter', 'ইনভার্টার'),
      field('refrigerant', 'Refrigerant', 'রেফ্রিজারেন্ট'),
      field('energy-rating', 'Energy Rating', 'এনার্জি রেটিং'),
    ]),
  ],
  refrigerators: [
    group('refrigerator-details', 'Refrigerator Details', 'রেফ্রিজারেটরের বিবরণ', [
      numeric('capacity', 'Total Capacity', 'মোট ধারণক্ষমতা', 'L'),
      field('door-type', 'Door Type', 'দরজার ধরন'),
      boolean('inverter', 'Inverter', 'ইনভার্টার'),
      field('defrost-type', 'Defrost Type', 'ডিফ্রস্টের ধরন'),
      field('energy-rating', 'Energy Rating', 'এনার্জি রেটিং'),
    ]),
  ],
  televisions: [
    group('television-details', 'Television Details', 'টেলিভিশনের বিবরণ', [
      numeric('screen-size', 'Screen Size', 'স্ক্রিন সাইজ', 'inches'),
      field('display-technology', 'Display Technology', 'ডিসপ্লে প্রযুক্তি'),
      field('resolution', 'Resolution', 'রেজোলিউশন'),
      field('operating-system', 'Operating System', 'অপারেটিং সিস্টেম'),
      numeric('hdmi-ports', 'HDMI Ports', 'এইচডিএমআই পোর্ট', 'ports'),
    ]),
  ],
  'rice-cookers': [
    group('rice-cooker-details', 'Rice Cooker Details', 'রাইস কুকারের বিবরণ', [
      numeric('capacity', 'Capacity', 'ধারণক্ষমতা', 'L'),
      numeric('power', 'Power', 'পাওয়ার', 'W'),
      field('cooking-functions', 'Cooking Functions', 'রান্নার ফাংশন', 'textarea', [], '', false),
      field('inner-pot-material', 'Inner Pot Material', 'ভেতরের পাত্রের উপাদান'),
    ]),
  ],
  'blenders-juicers': [
    group('food-preparation-details', 'Food Preparation Details', 'খাবার প্রস্তুতকারক যন্ত্রের বিবরণ', [
      field('appliance-type', 'Appliance Type', 'যন্ত্রের ধরন'),
      numeric('power', 'Power', 'পাওয়ার', 'W'),
      numeric('jar-capacity', 'Jar Capacity', 'জারের ধারণক্ষমতা', 'L'),
      numeric('speed-settings', 'Speed Settings', 'স্পিড সেটিংস', 'levels'),
      field('jar-material', 'Jar Material', 'জারের উপাদান'),
    ]),
  ],
  'electric-kettles': [
    group('kettle-details', 'Kettle Details', 'কেটলির বিবরণ', [
      numeric('capacity', 'Capacity', 'ধারণক্ষমতা', 'L'),
      numeric('power', 'Power', 'পাওয়ার', 'W'),
      boolean('temperature-control', 'Temperature Control', 'তাপমাত্রা নিয়ন্ত্রণ'),
      field('body-material', 'Body Material', 'বডির উপাদান'),
      boolean('keep-warm', 'Keep Warm', 'গরম রাখার সুবিধা'),
    ]),
  ],
  'microwave-ovens': [
    group('microwave-details', 'Microwave Oven Details', 'মাইক্রোওভেনের বিবরণ', [
      field('oven-type', 'Oven Type', 'ওভেনের ধরন'),
      numeric('capacity', 'Capacity', 'ধারণক্ষমতা', 'L'),
      numeric('microwave-power', 'Microwave Power', 'মাইক্রোওয়েভ পাওয়ার', 'W'),
      boolean('grill-function', 'Grill Function', 'গ্রিল ফাংশন'),
      boolean('convection-function', 'Convection Function', 'কনভেকশন ফাংশন'),
    ]),
  ],
  'bags-backpacks': [
    group('bag-details', 'Bag Details', 'ব্যাগের বিবরণ', [
      field('bag-type', 'Bag Type', 'ব্যাগের ধরন'),
      numeric('capacity', 'Capacity', 'ধারণক্ষমতা', 'L'),
      field('compatible-laptop-size', 'Compatible Laptop Size', 'সামঞ্জস্যপূর্ণ ল্যাপটপ সাইজ'),
      field('material', 'Material', 'উপাদান'),
      boolean('water-resistant', 'Water Resistant', 'পানি প্রতিরোধী'),
    ]),
  ],
  'travel-accessories': [
    group('travel-accessory-details', 'Travel Accessory Details', 'ভ্রমণ সামগ্রীর বিবরণ', [
      field('accessory-type', 'Accessory Type', 'সামগ্রীর ধরন'),
      field('material', 'Material', 'উপাদান'),
      field('dimensions', 'Dimensions', 'আকার'),
      field('power-source', 'Power Source', 'পাওয়ার সোর্স'),
    ]),
  ],
  'desk-accessories': [
    group('desk-accessory-details', 'Desk Accessory Details', 'ডেস্ক এক্সেসরিজের বিবরণ', [
      field('accessory-type', 'Accessory Type', 'এক্সেসরিজের ধরন'),
      field('material', 'Material', 'উপাদান'),
      numeric('weight-capacity', 'Weight Capacity', 'ওজন ধারণক্ষমতা', 'kg'),
      boolean('height-adjustable', 'Height Adjustable', 'উচ্চতা সমন্বয়যোগ্য'),
      numeric('supported-screen-size', 'Supported Screen Size', 'সমর্থিত স্ক্রিন সাইজ', 'inches'),
    ]),
  ],
  'health-devices': [
    group('health-device-details', 'Health Device Details', 'স্বাস্থ্য ডিভাইসের বিবরণ', [
      field('device-type', 'Device Type', 'ডিভাইসের ধরন'),
      field('measurement-range', 'Measurement Range', 'পরিমাপের সীমা'),
      field('measurement-unit', 'Measurement Unit', 'পরিমাপের একক'),
      boolean('memory-function', 'Memory Function', 'মেমোরি ফাংশন'),
      field('power-source', 'Power Source', 'পাওয়ার সোর্স'),
    ]),
  ],
  'personal-care': [
    group('personal-care-details', 'Personal Care Details', 'পার্সোনাল কেয়ার ডিভাইসের বিবরণ', [
      field('device-type', 'Device Type', 'ডিভাইসের ধরন'),
      numeric('power', 'Power', 'পাওয়ার', 'W'),
      boolean('cordless', 'Cordless', 'কর্ডলেস'),
      numeric('battery-runtime', 'Battery Runtime', 'ব্যাটারি ব্যাকআপ', 'minutes'),
      field('washable', 'Washable Parts', 'ধোয়া যায় এমন অংশ', 'boolean'),
    ]),
  ],
  'beauty-grooming': [
    group('beauty-device-details', 'Beauty Device Details', 'বিউটি ডিভাইসের বিবরণ', [
      field('device-type', 'Device Type', 'ডিভাইসের ধরন'),
      numeric('temperature-settings', 'Temperature Settings', 'তাপমাত্রা সেটিংস', 'levels'),
      boolean('cordless', 'Cordless', 'কর্ডলেস'),
      field('included-accessories', 'Included Accessories', 'সাথে থাকা এক্সেসরিজ', 'textarea', [], '', false),
    ]),
  ],
  'power-banks': [
    group('power-bank-details', 'Power Bank Details', 'পাওয়ার ব্যাংকের বিবরণ', [
      numeric('capacity', 'Capacity', 'ধারণক্ষমতা', 'mAh'),
      numeric('max-output', 'Maximum Output', 'সর্বোচ্চ আউটপুট', 'W'),
      numeric('output-ports', 'Output Ports', 'আউটপুট পোর্ট', 'ports'),
      multi('fast-charge-protocols', 'Fast Charge Protocols', 'ফাস্ট চার্জ প্রোটোকল', ['USB PD', 'Quick Charge', 'PPS']),
      boolean('wireless-charging', 'Wireless Charging', 'ওয়্যারলেস চার্জিং'),
    ]),
  ],
  'ups-ips': [
    group('backup-power-details', 'Backup Power Details', 'ব্যাকআপ পাওয়ারের বিবরণ', [
      field('topology', 'Topology', 'টপোলজি'),
      numeric('capacity', 'Capacity', 'ধারণক্ষমতা', 'VA'),
      numeric('rated-power', 'Rated Power', 'রেটেড পাওয়ার', 'W'),
      numeric('battery-count', 'Battery Count', 'ব্যাটারি সংখ্যা', 'batteries'),
      numeric('backup-time', 'Backup Time', 'ব্যাকআপ সময়', 'minutes'),
    ]),
  ],
  chargers: [
    group('charger-details', 'Charger Details', 'চার্জারের বিবরণ', [
      field('charger-type', 'Charger Type', 'চার্জারের ধরন'),
      numeric('max-output', 'Maximum Output', 'সর্বোচ্চ আউটপুট', 'W'),
      numeric('output-ports', 'Output Ports', 'আউটপুট পোর্ট', 'ports'),
      multi('charging-protocols', 'Charging Protocols', 'চার্জিং প্রোটোকল', ['USB PD', 'Quick Charge', 'PPS', 'Qi']),
      field('connector-type', 'Connector Type', 'কানেক্টরের ধরন'),
    ]),
  ],
  desktops: [
    group('desktop-details', 'Desktop Details', 'ডেস্কটপের বিবরণ', [
      field('desktop-type', 'Desktop Type', 'ডেস্কটপের ধরন'),
      field('processor', 'Processor', 'প্রসেসর'),
      field('graphics', 'Graphics', 'গ্রাফিক্স'),
      field('memory-storage', 'Memory & Storage', 'মেমোরি ও স্টোরেজ'),
      field('operating-system', 'Operating System', 'অপারেটিং সিস্টেম'),
    ]),
  ],
};

function specGroupsForPath(pathSlugs) {
  if (!Array.isArray(pathSlugs) || !pathSlugs.length) return [];
  const rootSlug = pathSlugs[0];
  const groups = [...(ROOT_SPEC_GROUPS[rootSlug] || GENERAL)];
  for (const slug of pathSlugs.slice(1)) {
    if (CATEGORY_SPEC_GROUPS[slug]) groups.push(...CATEGORY_SPEC_GROUPS[slug]);
  }
  return groups;
}

module.exports = { ROOT_SPEC_GROUPS, CATEGORY_SPEC_GROUPS, specGroupsForPath };
