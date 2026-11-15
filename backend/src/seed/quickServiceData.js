/* Initial Quick Services content. Seed data is written to HomeSection.config.cards. */
module.exports = [
  {
    key: 'laptop-finder', icon: '💻', title: 'Laptop Finder', titleBn: 'ল্যাপটপ ফাইন্ডার',
    description: 'Three questions, honest picks — budget, use, done.', descriptionBn: 'তিনটি প্রশ্ন, সৎ সাজেশন — বাজেট, ব্যবহার, শেষ।',
    actionText: 'Start the wizard', actionTextBn: 'উইজার্ড শুরু করুন', action: 'finder', active: true,
  },
  {
    key: 'ac-calc', icon: '❄', title: 'AC Ton Calculator', titleBn: 'এসি টন ক্যালকুলেটর',
    description: 'Room size → the right ton. No oversold compressors.', descriptionBn: 'রুমের মাপ → সঠিক টন। অতিরিক্ত বড় কম্প্রেসার নয়।',
    actionText: 'Calculate now', actionTextBn: 'এখনই হিসাব করুন', action: 'calculator', active: true,
  },
  {
    key: 'complaint', icon: '✉', title: 'Raise a Complaint', titleBn: 'অভিযোগ করুন',
    description: 'Wrong item, delay, anything — it reaches a human in hours.', descriptionBn: 'ভুল পণ্য, বিলম্ব — কয়েক ঘণ্টায় মানুষ পাবেন।',
    actionText: 'Open the form', actionTextBn: 'ফর্ম খুলুন', action: 'link', href: '/contact?topic=Complaint', active: true,
  },
  {
    key: 'service-center', icon: '🔧', title: 'Servicing Center', titleBn: 'সার্ভিসিং সেন্টার',
    description: 'Warranty claims and repairs — coordinated, tracked, SMS-updated.', descriptionBn: 'ওয়ারেন্টি ক্লেইম ও রিপেয়ার — ট্র্যাকড, এসএমএস আপডেটসহ।',
    actionText: 'Request service', actionTextBn: 'সার্ভিস রিকোয়েস্ট', action: 'link', href: '/contact?topic=Service%20%26%20repair', active: true,
  },
];
