async function upsertSeedCategory(Category, category, parent, slugMigrations) {
  const [bySlug, byName] = await Promise.all([
    Category.findOne({ slug: category.slug }),
    Category.findOne({ name: category.name }),
  ]);

  if (bySlug && byName && String(bySlug._id) !== String(byName._id)) {
    throw new Error(
      `Category seed conflict for "${category.name}": slug "${category.slug}" and name belong to different category records`,
    );
  }

  const existing = bySlug || byName;
  if (existing) {
    const previousSlug = existing.slug;
    existing.slug = category.slug;
    existing.name = category.name;
    existing.nameBn = category.nameBn || '';
    existing.parent = parent ? parent._id : null;
    existing.order = category.order || 0;
    await existing.save();

    if (previousSlug && previousSlug !== category.slug) {
      slugMigrations.set(category.slug, previousSlug);
    }
    return existing;
  }

  const setOnInsert = { slug: category.slug, active: true };
  if (category.image) setOnInsert.image = category.image;
  if (category.icon) setOnInsert.icon = category.icon;

  return Category.findOneAndUpdate(
    { slug: category.slug },
    {
      $set: {
        name: category.name,
        nameBn: category.nameBn || '',
        parent: parent ? parent._id : null,
        order: category.order || 0,
      },
      $setOnInsert: setOnInsert,
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
}

module.exports = { upsertSeedCategory };
