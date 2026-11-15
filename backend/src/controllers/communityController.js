const Review = require('../models/Review');
const Order = require('../models/Order');

/* Public, moderation-safe homepage community feed. Review text is shown only
   after approval; order data is aggregated so no customer identity or address
   ever leaves the server. */
exports.list = async (_req, res, next) => {
  try {
    const [reviews, orderStats] = await Promise.all([
      Review.find({ approved: true, homepageFeatured: { $ne: false } })
        .sort({ createdAt: -1 })
        .limit(12)
        .populate('product', 'name nameBn slug images')
        .lean(),
      Order.aggregate([
        { $match: { status: 'delivered' } },
        { $facet: {
          orders: [{ $count: 'value' }],
          units: [
            { $unwind: '$items' },
            { $group: { _id: null, value: { $sum: '$items.qty' } } },
          ],
          customers: [
            { $group: { _id: '$customer.phone' } },
            { $count: 'value' },
          ],
        } },
      ]),
    ]);

    const stats = orderStats[0] || {};
    const deliveredOrders = stats.orders?.[0]?.value || 0;
    const deliveredUnits = stats.units?.[0]?.value || 0;
    const customers = stats.customers?.[0]?.value || 0;
    const verifiedReviews = reviews.filter((review) => review.verified).length;
    const avgRating = reviews.length
      ? Math.round((reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length) * 10) / 10
      : 0;

    const items = reviews.map((review) => {
      const product = review.product || {};
      const image = review.images?.find((item) => item?.url)?.url || product.images?.[0]?.url || '';
      return {
        img: image,
        alt: `${review.name} review`,
        role: review.verified ? 'Verified customer' : 'Customer review',
        name: review.name,
        quote: review.comment,
        quoteBn: '',
        wears: product.name ? [product.name] : [],
        wearsBn: product.nameBn ? [product.nameBn] : [],
        meta: product.name || '',
        stats: [[`${review.rating}/5`, 'Rating'], [review.verified ? '✓' : '—', 'Purchase verified']],
        statsBn: [],
        list: product.slug || '',
      };
    });

    res.json({
      items,
      comm: [
        [String(deliveredOrders), 'Orders delivered'],
        [String(deliveredUnits), 'Products delivered'],
        [String(customers), 'Customers served'],
        [String(avgRating), 'Average review rating'],
      ],
      summary: { deliveredOrders, deliveredUnits, customers, verifiedReviews, avgRating },
    });
  } catch (e) { next(e); }
};
